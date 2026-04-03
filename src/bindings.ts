/**
 * Trace entry for a single node in the dependency graph.
 */
export interface TraceEntry {
    /** The cached result of the node's calculation. Must be a named output (object). */
    output?: Record<string, any>;
    /** Whether the node needs to be re-evaluated due to an upstream change. */
    stale?: boolean;
    /** The resolved input arguments used for the last calculation (always an object). */
    input?: Record<string, any>;
}

/**
 * Global store for node execution traces and memoization.
 */
export let TRACE_STORE: Record<string, TraceEntry> = {};

/**
 * Tracks forward edges in the dependency graph (Source Node -> Set of Dependent Nodes).
 */
const FORWARD_EDGES: Record<string, Set<string>> = {};

/**
 * Pointer to the node currently being evaluated.
 */
let ACTIVE_EVALUATING_NODE: string | null = null;

/**
 * Stack used to detect circular dependencies during node evaluation.
 */
const EVALUATION_STACK: string[] = [];

/**
 * Internal event emitter to communicate with the Host Environment.
 */
function emitEvent(eventType: string, payload: any): void {
    if (typeof (globalThis as any).__emitEvent === 'function') {
        (globalThis as any).__emitEvent(eventType, payload);
    }
}

/**
 * Generic evaluator for workbook-style dependency graphs.
 * This is the primary entry point for the Pull strategy.
 */
export function evalWorkbook<T extends Record<string, any>>(
    workbookLoader: new () => T,
    nodeName?: keyof T
): Record<string, any> {
    const workbook = new workbookLoader();
    const results: Record<string, any> = {};

    const processNode = (key: string) => {
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(workbook), key) ||
            Object.getOwnPropertyDescriptor(workbook, key);

        if (descriptor && typeof descriptor.get === 'function') {
            const val = (workbook as any)[key];
            // If it's an accessor with a setter, it's an @Input. 
            // We wrap it in {rows: val} to match framework expectations for input nodes.
            if (typeof descriptor.set === 'function') {
                results[key] = {rows: val};
            } else {
                results[key] = val;
            }
        }
    };

    if (nodeName !== undefined) {
        processNode(String(nodeName));
    } else {
        // Iterate through all properties
        const allProps = new Set<string>(Object.getOwnPropertyNames(workbook));

        // Look at the prototype for decorators
        const proto = Object.getPrototypeOf(workbook);
        if (proto && proto !== Object.prototype) {
            Object.getOwnPropertyNames(proto).forEach(p => allProps.add(p));
        }

        for (const key of allProps) {
            if (key === 'constructor') continue;
            processNode(key);
        }
    }

    // Consolidated Return: Fill in other nodes from TRACE_STORE if they aren't already in results
    const allKnownNodes = new Set([...Object.keys(results), ...Object.keys(TRACE_STORE)]);
    for (const key of allKnownNodes) {
        if (results[key] === undefined) {
            const trace = TRACE_STORE[key];
            if (trace && trace.output !== undefined) {
                results[key] = trace.output;
            }
        }
    }

    return results;
}

/**
 * @Workbook Class Decorator
 */
export function Workbook<T extends { new (...args: any[]): {} }>(
    target: T,
    _context: ClassDecoratorContext<T>
) {
    return target;
}

/**
 * @Input Accessor Decorator
 */
export function Input<This, Value>(
    target: ClassAccessorDecoratorTarget<This, Value>,
    context: ClassAccessorDecoratorContext<This, Value>
) {
    const nodeName = String(context.name);

    return {
        get(this: This): Value {
            return executeWithTracking(nodeName, () => {
                const value = target.get.call(this);
                emitEvent('nodeDataChanged', {nodeName, data: value});
                return {rows: value};
            }).rows;
        },
        set(this: This, value: Value) {
            target.set.call(this, value);
            mutateInput(nodeName, value);
        },
        init(initialValue: Value) {
            return initialValue;
        }
    };
}

/**
 * @Node Getter Decorator
 */
export function Node<This, Return>(
    target: (this: This) => Return,
    context: ClassGetterDecoratorContext<This, Return>
) {
    const nodeName = String(context.name);
    return function (this: This): Return {
        return executeWithTracking(nodeName, () => {
            emitEvent('beforeNodeExecution', {nodeName, input: TRACE_STORE[nodeName]?.input || {}});
            const result = target.call(this);
            emitEvent('afterNodeExecution', {nodeName, output: result});
            return result;
        });
    };
}

/**
 * @Chart Getter Decorator
 */
export function Chart<This, Return>(
    target: (this: This) => Return,
    context: ClassGetterDecoratorContext<This, Return>
) {
    const nodeName = String(context.name);
    return function (this: This): Return {
        return executeWithTracking(nodeName, () => {
            const data = target.call(this);
            emitEvent('nodeDataChanged', {nodeName, data});
            return data;
        }, {skipCache: true});
    };
}

/**
 * @Table Getter Decorator
 */
export function Table<This, Return>(
    target: (this: This) => Return,
    context: ClassGetterDecoratorContext<This, Return>
) {
    const nodeName = String(context.name);
    return function (this: This): Return {
        return executeWithTracking(nodeName, () => {
            const data = target.call(this);
            emitEvent('nodeDataChanged', {nodeName, data});
            return data;
        }, {skipCache: true});
    };
}

/**
 * Retrieves a value from the trace store using a dot-notated path.
 */
export function getFromTrace(path: string): any {
    return path.split('.').reduce((acc, part) => acc?.[part], TRACE_STORE as any);
}

/**
 * Resets the trace store and forward edges.
 */
export function clearTrace(): void {
    TRACE_STORE = {};
    for (const key in FORWARD_EDGES) {
        delete FORWARD_EDGES[key];
    }
}

/**
 * Registers that the current ACTIVE_EVALUATING_NODE depends on sourceNode.
 */
function registerDependency(sourceNode: string): void {
    if (ACTIVE_EVALUATING_NODE && ACTIVE_EVALUATING_NODE !== sourceNode) {
        if (!FORWARD_EDGES[sourceNode]) {
            FORWARD_EDGES[sourceNode] = new Set();
        }
        FORWARD_EDGES[sourceNode].add(ACTIVE_EVALUATING_NODE);
    }
}

/**
 * Core evaluation engine that handles dependency tracking, memoization, and circular dependency detection.
 */
function executeWithTracking<T>(
    nodeName: string,
    evaluate: () => T,
    options: { skipCache?: boolean } = {}
): T {
    if (EVALUATION_STACK.includes(nodeName)) {
        throw new Error(`Circular dependency detected: ${EVALUATION_STACK.join(' -> ')} -> ${nodeName}`);
    }

    registerDependency(nodeName);

    let nodeTrace: TraceEntry = TRACE_STORE[nodeName];
    if (!options.skipCache && nodeTrace?.output !== undefined && !nodeTrace?.stale) {
        return nodeTrace.output as unknown as T;
    }

    if (!nodeTrace) {
        nodeTrace = TRACE_STORE[nodeName] = {stale: false};
    }

    const previousEvaluator = ACTIVE_EVALUATING_NODE;
    ACTIVE_EVALUATING_NODE = nodeName;
    EVALUATION_STACK.push(nodeName);

    try {
        const result = evaluate();

        // Enforce named outputs (objects)
        if (typeof result !== 'object' || result === null) {
            throw new Error(`Node "${nodeName}" must return a named output (object), but got ${typeof result}.`);
        }

        if (!options.skipCache) {
            nodeTrace.output = result as Record<string, any>;
        }
        nodeTrace.stale = false;
        return result;
    } finally {
        EVALUATION_STACK.pop();
        ACTIVE_EVALUATING_NODE = previousEvaluator;
    }
}

/**
 * Returns a topologically sorted list of node names.
 * Requires the graph to be fully discovered (e.g., after a full evaluation).
 */
export function getTopologicalOrder(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    const temp = new Set<string>();

    function visit(nodeName: string) {
        if (temp.has(nodeName)) throw new Error("Cycle detected during topological sort.");
        if (!visited.has(nodeName)) {
            temp.add(nodeName);
            const dependents = Array.from(FORWARD_EDGES[nodeName] || []);
            for (const dependent of dependents) {
                visit(dependent);
            }
            temp.delete(nodeName);
            visited.add(nodeName);
            result.unshift(nodeName);
        }
    }

    const allNodes = new Set([...Object.keys(FORWARD_EDGES), ...Object.keys(TRACE_STORE)]);
    for (const nodeName of allNodes) {
        visit(nodeName);
    }

    return result;
}

/**
 * Discovers all dependencies in a workbook by evaluating every node once.
 */
export function validateWorkbook<T extends Record<string, any>>(
    workbookLoader: new () => T
): void {
    evalWorkbook(workbookLoader);
}

/**
 * Framework method to mutate an input and invalidate downstream dependencies.
 */
export function mutateInput<T>(nodeName: string, newData: T): void {
    console.log(`[Mutate ${nodeName}] updated with new data.`);
    if (!TRACE_STORE[nodeName]) {
        TRACE_STORE[nodeName] = {};
    }
    TRACE_STORE[nodeName].output = {rows: newData};
    TRACE_STORE[nodeName].stale = false;

    emitEvent('nodeDataChanged', {nodeName, data: newData});

    invalidateDownstream(nodeName);
}

/**
 * Recursively marks downstream dependencies as stale.
 */
function invalidateDownstream(sourceNode: string): void {
    const dependents = FORWARD_EDGES[sourceNode];
    if (!dependents) return;

    for (const dependent of dependents) {
        const traceEntry = TRACE_STORE[dependent];
        if (traceEntry && traceEntry.stale !== true) {
            traceEntry.stale = true;
            invalidateDownstream(dependent);
        }
    }
}
