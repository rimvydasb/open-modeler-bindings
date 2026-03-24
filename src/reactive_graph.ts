let TRACE_STORE: Record<string, any> = {};

// Tracks forward edges (Source Node -> Set of Dependent Nodes)
const FORWARD_EDGES: Record<string, Set<string>> = {};

// The currently evaluating node pointer
let ACTIVE_EVALUATING_NODE: string | null = null;

// Stack to detect circular dependencies during evaluation
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
        workbook[nodeName]();
        return TRACE_STORE;
    }
    throw new Error(`Node "${String(nodeName)}" not found in workbook.`);
}

/**
 * Retrieves a value from the trace store using a dot-notated path.
 */
export function getFromTrace(path: string): any {
    const parts = path.split('.');
    let current = TRACE_STORE;
    for (const part of parts) {
        if (current === undefined || current === null) return undefined;
        current = current[part];
    }
    return current;
}

/**
 * Records a value in the trace store using a dot-notated path.
 */
export function trace(path: string, value: any): any {
    const parts = path.split('.');
    let current = TRACE_STORE;
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

export function clearTrace(): void {
    TRACE_STORE = {};
    for (const key in FORWARD_EDGES) {
        delete FORWARD_EDGES[key];
    }
}

// Standardized input resolver
function resolveValue<T>(input: T | (() => T)): T {
    return typeof input === 'function' ? (input as () => T)() : input;
}

/**
 * Registers that the current ACTIVE_EVALUATING_NODE depends on sourceNode.
 */
function registerDependency(sourceNode: string) {
    if (ACTIVE_EVALUATING_NODE && ACTIVE_EVALUATING_NODE !== sourceNode) {
        if (!FORWARD_EDGES[sourceNode]) {
            FORWARD_EDGES[sourceNode] = new Set();
        }
        FORWARD_EDGES[sourceNode].add(ACTIVE_EVALUATING_NODE);
    }
}

export function node<T, P extends object>(
    invocation: (arg: P) => T,
    inputs?: { [K in keyof P]: P[K] | (() => P[K]) }
): () => T {
    const nodeName = invocation.name;
    return () => {
        if (EVALUATION_STACK.includes(nodeName)) {
            throw new Error(`Circular dependency detected: ${EVALUATION_STACK.join(' -> ')} -> ${nodeName}`);
        }

        registerDependency(nodeName);

        let nodeTrace = TRACE_STORE[nodeName];
        
        // Return cached output if we have it AND it's not marked stale
        if (nodeTrace?.output !== undefined && !nodeTrace?.stale) {
            return nodeTrace.output;
        }

        const previousEvaluator = ACTIVE_EVALUATING_NODE;
        ACTIVE_EVALUATING_NODE = nodeName;
        EVALUATION_STACK.push(nodeName);

        let completeInputs = {} as P;
        if (inputs) {
            if (!nodeTrace) {
                nodeTrace = TRACE_STORE[nodeName] = { stale: false };
            }
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

        const result = invocation(completeInputs);

        EVALUATION_STACK.pop();
        ACTIVE_EVALUATING_NODE = previousEvaluator;

        if (!TRACE_STORE[nodeName]) {
            TRACE_STORE[nodeName] = {};
        }
        TRACE_STORE[nodeName].output = result;
        TRACE_STORE[nodeName].stale = false;

        return result;
    };
}

export function chartNode<T>(
    nodeName: string,
    inputs: { input: T | (() => T) }
): () => void {
    return () => {
        registerDependency(nodeName);
        
        const nodeTrace = TRACE_STORE[nodeName];
        if (nodeTrace?.output !== undefined && !nodeTrace?.stale) {
            return;
        }

        const previousEvaluator = ACTIVE_EVALUATING_NODE;
        ACTIVE_EVALUATING_NODE = nodeName;

        const data = resolveValue(inputs.input);

        ACTIVE_EVALUATING_NODE = previousEvaluator;
        
        if (!TRACE_STORE[nodeName]) TRACE_STORE[nodeName] = {};
        TRACE_STORE[nodeName].output = null;
        TRACE_STORE[nodeName].stale = false;

        console.log(`[Chart: ${nodeName}] processing ${Array.isArray(data) ? data.length : 1} items.`);
    };
}

export function outputTableNode<T>(
    tableName: string,
    inputs: { rows: T[] | (() => T[]) }
): () => void {
    return () => {
        registerDependency(tableName);

        const nodeTrace = TRACE_STORE[tableName];
        if (nodeTrace?.output !== undefined && !nodeTrace?.stale) {
            return;
        }

        const previousEvaluator = ACTIVE_EVALUATING_NODE;
        ACTIVE_EVALUATING_NODE = tableName;

        const data = resolveValue(inputs.rows);

        ACTIVE_EVALUATING_NODE = previousEvaluator;

        if (!TRACE_STORE[tableName]) TRACE_STORE[tableName] = {};
        TRACE_STORE[tableName].output = null;
        TRACE_STORE[tableName].stale = false;

        console.log(`[Table: ${tableName}] processing ${Array.isArray(data) ? data.length : 1} items.`);
    };
}

export function inputListNode<T>(
    listName: string,
    inputs: T
): () => { rows: T } {
    return () => {
        if (EVALUATION_STACK.includes(listName)) {
            throw new Error(`Circular dependency detected: ${EVALUATION_STACK.join(' -> ')} -> ${listName}`);
        }
        registerDependency(listName);

        let nodeTrace = TRACE_STORE[listName];
        if (nodeTrace?.output !== undefined && !nodeTrace?.stale) {
            return nodeTrace.output;
        }

        console.log(`[Input List: ${listName}]`);
        const result = { rows: inputs };
        
        if (!TRACE_STORE[listName]) TRACE_STORE[listName] = {};
        TRACE_STORE[listName].output = result;
        TRACE_STORE[listName].stale = false;

        return result;
    };
}

/**
 * Returns a topologically sorted list of node names.
 * Requires the graph to be fully discovered (e.g., after a full evaluation).
 */
export function getTopologicalOrder(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    const temp = new Set<string>();

    function visit(node: string) {
        if (temp.has(node)) throw new Error("Cycle detected during topological sort.");
        if (!visited.has(node)) {
            temp.add(node);
            const dependents = Array.from(FORWARD_EDGES[node] || []);
            for (const dependent of dependents) {
                visit(dependent);
            }
            temp.delete(node);
            visited.add(node);
            result.unshift(node);
        }
    }

    const allNodes = new Set([...Object.keys(FORWARD_EDGES), ...Object.keys(TRACE_STORE)]);
    for (const node of allNodes) {
        visit(node);
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
    if (!TRACE_STORE[nodeName]) TRACE_STORE[nodeName] = {};
    TRACE_STORE[nodeName].output = { rows: newData };
    TRACE_STORE[nodeName].stale = false;

    invalidateDownstream(nodeName);
}

function invalidateDownstream(sourceNode: string): void {
    const dependents = FORWARD_EDGES[sourceNode];
    if (!dependents) return;

    for (const dependent of dependents) {
        const trace = TRACE_STORE[dependent];
        if (trace && trace.stale !== true) {
            trace.stale = true;
            invalidateDownstream(dependent);
        }
    }
}
