/**
 * Trace entry for a single node in the dependency graph.
 */
export interface TraceEntry {
    stale?: boolean;
    output?: Record<string, any>;
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
 * Generic evaluator for workbook-style dependency graphs.
 * This is a pull strategy evaluation.
 * Clears the trace before execution and returns the final trace store.
 */
export function evalWorkbook<T extends Record<string, any>>(
    workbookLoader: (context: any) => T,
    nodeName: keyof T
): any {
    const context: any = {};
    const workbook = workbookLoader(context);
    Object.assign(context, workbook);

    if (typeof workbook[nodeName] === 'function') {
        return (workbook[nodeName] as any)();
    }
    throw new Error(`Node "${String(nodeName)}" not found in workbook.`);
}

/**
 * Retrieves a value from the trace store using a dot-notated path.
 */
export function getFromTrace(path: string): any {
    return path.split('.').reduce((acc, part) => acc?.[part], TRACE_STORE as any);
}

/**
 * Records a value in the trace store using a dot-notated path.
 */
export function trace(path: string, value: any): any {
    const parts = path.split('.');
    let current = TRACE_STORE as any;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (current[part] === undefined) {
            current[part] = {};
        }
        current = current[part];
    }
    current[parts[parts.length - 1]] = value;
    return value;
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
 * Standardized resolver for input values (handles both direct values and getter functions).
 */
function resolveValue<T>(input: T | (() => T)): T {
    return typeof input === 'function' ? (input as () => T)() : input;
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
    evaluate: () => T
): T {
    if (EVALUATION_STACK.includes(nodeName)) {
        throw new Error(`Circular dependency detected: ${EVALUATION_STACK.join(' -> ')} -> ${nodeName}`);
    }

    registerDependency(nodeName);

    let nodeTrace: TraceEntry = TRACE_STORE[nodeName];
    if (nodeTrace?.output !== undefined && !nodeTrace?.stale) {
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

        nodeTrace.output = result as Record<string, any>;
        nodeTrace.stale = false;
        return result;
    } finally {
        EVALUATION_STACK.pop();
        ACTIVE_EVALUATING_NODE = previousEvaluator;
    }
}

/**
 * Defines a standard calculation node.
 */
export function node<T extends Record<string, any>, P extends object>(
    invocation: (arg: P) => T,
    inputs?: { [K in keyof P]: P[K] | (() => P[K]) }
): () => T {
    const nodeName = invocation.name;
    if (!nodeName) {
        throw new Error("Node function must have a name.");
    }

    return () => executeWithTracking(nodeName, () => {
        const completeInputs = {} as P;
        if (inputs) {
            const nodeTrace = TRACE_STORE[nodeName];
            if (!nodeTrace.input) {
                nodeTrace.input = {};
            }
            const inputTrace = nodeTrace.input;

            for (const key in inputs) {
                const value = resolveValue(inputs[key] as any);
                completeInputs[key as keyof P] = value;
                inputTrace[key] = value;
            }
        }
        return invocation(completeInputs);
    });
}

/**
 * Defines a visualization node for charts.
 */
export function chartNode<T extends Record<string, any>>(
    nodeName: string,
    inputs: { input: T | (() => T) }
): () => T {
    return () => executeWithTracking(nodeName, () => {
        const data = resolveValue(inputs.input);
        console.log(`[Chart: ${nodeName}] processing ${Array.isArray(data) ? data.length : 1} items.`);
        return data;
    });
}

/**
 * Defines a visualization node for tables.
 */
export function outputTableNode<T extends Record<string, any>>(
    tableName: string,
    inputs: { rows: T[] | (() => T[]) }
): () => T[] {
    return () => executeWithTracking(tableName, () => {
        const data = resolveValue(inputs.rows);
        console.log(`[Table: ${tableName}] processing ${Array.isArray(data) ? data.length : 1} items.`);
        return data as unknown as T[];
    }) as unknown as T[];
}

/**
 * Defines an input node that holds data.
 */
export function inputListNode<T>(
    listName: string,
    inputs: T
): () => { rows: T } {
    return () => executeWithTracking(listName, () => {
        console.log(`[Input List: ${listName}] initialized.`);
        return { rows: inputs };
    });
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
export function validateWorkbook(workbookLoader: (context: any) => any): void {
    const context: any = {};
    const workbook = workbookLoader(context);
    Object.assign(context, workbook);

    for (const nodeName in workbook) {
        if (typeof workbook[nodeName] === "function") {
            workbook[nodeName]();
        }
    }
}

/**
 * Framework method to mutate an input and invalidate downstream dependencies.
 */
export function mutateInput<T>(nodeName: string, newData: T): void {
    console.log(`[Mutate ${nodeName}] updated with new data.`);
    if (!TRACE_STORE[nodeName]) {
        TRACE_STORE[nodeName] = {};
    }
    TRACE_STORE[nodeName].output = { rows: newData };
    TRACE_STORE[nodeName].stale = false;

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
