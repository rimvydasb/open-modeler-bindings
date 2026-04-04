import {Project} from "ts-morph";
import {getQuickJS, QuickJSContext, type QuickJSHandle} from "quickjs-emscripten";

/**
 * Manages QuickJS handles for automatic cleanup.
 */
class Scope {
    private handles: QuickJSHandle[] = [];

    manage<T extends QuickJSHandle>(handle: T): T {
        this.handles.push(handle);
        return handle;
    }

    dispose() {
        for (const handle of this.handles) {
            if (handle.alive) handle.dispose();
        }
        this.handles = [];
    }
}

export interface EngineOptions {
    debug?: boolean;
}

/**
 * A reference to a variable that already exists in the VM's global scope.
 */
export interface VmRef {
    __vm_ref: string;
}

/**
 * Helper to create a VM reference.
 */
export const vmRef = (name: string): VmRef => ({__vm_ref: name});

export type NodeDataCallback = (data: any) => void;
export type NodeExecutionCallback = (payload: Record<string, any>) => void;

/**
 * OpenModel Engine for TypeScript projects.
 * Developed to be working on web browsers.
 */
export class OpenModelTSEngine {
    private project: Project;
    private jsCode: string = "";
    private vm: QuickJSContext | null = null;
    private options: EngineOptions;

    private beforeExecListeners = new Map<string, NodeExecutionCallback>();
    private afterExecListeners = new Map<string, NodeExecutionCallback>();
    private dataChangedListeners = new Map<string, NodeDataCallback>();

    constructor(options: EngineOptions = {}) {
        this.options = options;
        this.project = new Project({
            compilerOptions: {
                target: 7, // ESNext
                module: 0, // None
                lib: ["esnext"],
                alwaysStrict: false
            },
            useInMemoryFileSystem: true
        });
    }

    /**
     * Transpiles the provided TypeScript files and prepares the internal JavaScript bundle.
     */
    async loadProject(entryPoints: Record<string, string>): Promise<void> {
        for (const [path, content] of Object.entries(entryPoints)) {
            if (this.options.debug) console.log(`[OpenModelTSEngine] Adding virtual source file: ${path}`);
            this.project.createSourceFile(path, content, {overwrite: true});
        }

        const emitResult = this.project.emitToMemory();
        const files = emitResult.getFiles();
        if (this.options.debug) console.log(`[OpenModelTSEngine] Emitted ${files.length} files to memory.`);

        let frameworkJs = "";
        let otherJs = "";

        for (const file of files) {
            let text = file.text;
            if (this.options.debug) console.log(`[OpenModelTSEngine] Processing emitted file: ${file.filePath}`);
            text = this.sanitize(text);

            // Prioritize framework/bindings to ensure they are defined before use
            if (file.filePath.endsWith("bindings.js") || file.filePath.endsWith("reactive_graph.js")) {
                frameworkJs += `\n// --- ${file.filePath} ---\n` + text;
            } else {
                otherJs += `\n// --- ${file.filePath} ---\n` + text;
            }
        }

        this.jsCode = "const exports = {};\nvar global = globalThis;\n" + frameworkJs + otherJs;

        if (this.options.debug) {
            console.log("[OpenModelTSEngine] Project transpiled successfully. Total length:", this.jsCode.length);
        }
    }

    private sanitize(js: string): string {
        let code = js;
        code = code.replace(/^"use strict";/gm, "");

        // Replace 'export const', 'export let', 'export function', etc. with global declarations
        code = code.replace(/^export const /gm, "var ");
        code = code.replace(/^export let /gm, "var ");
        code = code.replace(/^export function /gm, "function ");
        code = code.replace(/^export class /gm, "var ");

        code = code.replace(/^const TRACE_STORE =/gm, "var TRACE_STORE =");
        code = code.replace(/^export /gm, "");
        code = code.replace(/^import .* from .*$/gm, "");
        code = code.replace(/^const .* = require\(.*\);$/gm, "");
        code = code.replace(/^Object\.defineProperty\(exports,.*$/gm, "");
        code = code.replace(/^exports\..* = void 0;.*$/gm, "");

        // Convert exports.foo = ... to globalThis.foo = ...
        code = code.replace(/exports\.(\w+) =/gm, "globalThis.$1 =");
        code = code.replace(/exports\./gm, "");

        code = code.replace(/\(\d+,\s*\w+\.([^)]+)\)/g, "$1");
        code = code.replace(/(\w+)\.(\w+)/g, (match, p1, p2) => {
            if (p1.includes("_ts_") || p1.startsWith("bindings")) return p2;
            return match;
        });

        code = code.replace(/if\s*\(import\.meta\.main\)\s*\{[\s\S]*?\n\}/g, "");

        return code;
    }

    /**
     * Initializes the QuickJS environment and evaluates the prepared JavaScript bundle.
     */
    async boot(): Promise<void> {
        const QuickJS = await getQuickJS();
        this.vm = QuickJS.newContext();

        const scope = new Scope();
        try {
            const logFn = scope.manage(this.vm.newFunction("log", (...args: QuickJSHandle[]) => {
                const nativeArgs = args.map(arg => this.vm!.dump(arg));
                if (this.options.debug) {
                    console.log("[VM Log]", ...nativeArgs);
                }
            }));
            const consoleObj = scope.manage(this.vm.newObject());
            this.vm.setProp(consoleObj, "log", logFn);
            this.vm.setProp(this.vm.global, "console", consoleObj);

            // Inject Event Emitter bridge
            const emitEventFn = scope.manage(this.vm.newFunction("__emitEvent", (typeHandle: QuickJSHandle, payloadHandle: QuickJSHandle) => {
                const type = this.vm!.dump(typeHandle);
                const payload = this.vm!.dump(payloadHandle);
                this.handleVmEvent(type, payload);
            }));
            this.vm.setProp(this.vm.global, "__emitEvent", emitEventFn);

        } finally {
            scope.dispose();
        }

        const evalResult = this.vm.evalCode(this.jsCode);
        if (evalResult.error) {
            const error = this.vm.dump(evalResult.error);
            evalResult.error.dispose();
            throw new Error(`VM Init Failed: ${JSON.stringify(error)}`);
        }
        evalResult.value.dispose();
    }

    private handleVmEvent(type: string, payload: any) {
        if (type === 'beforeNodeExecution') {
            const { nodeName, input } = payload;
            const listener = this.beforeExecListeners.get(nodeName);
            if (listener) listener(input);
        } else if (type === 'afterNodeExecution') {
            const { nodeName, output } = payload;
            const listener = this.afterExecListeners.get(nodeName);
            if (listener) listener(output);
        } else if (type === 'nodeDataChanged') {
            const { nodeName, data } = payload;
            const listener = this.dataChangedListeners.get(nodeName);
            if (listener) listener(data);
        }
    }

    onBeforeNodeExecution(_workbookName: string, nodeName: string, callback: NodeExecutionCallback): void {
        this.beforeExecListeners.set(nodeName, callback);
    }

    onAfterNodeExecution(_workbookName: string, nodeName: string, callback: NodeExecutionCallback): void {
        this.afterExecListeners.set(nodeName, callback);
    }

    onNodeDataChanged(_workbookName: string, nodeName: string, callback: NodeDataCallback): void {
        this.dataChangedListeners.set(nodeName, callback);
    }

    /**
     * Calls a global function defined in the loaded project.
     */
    execute<T = any>(functionName: string, ...args: any[]): T {
        if (!this.vm) throw new Error("Engine not booted. Call boot() first.");
        return this.callVm(functionName, ...args);
    }

    /**
     * Evaluates Workbook
     *
     * @param workbookName
     * @param nodeName
     */
    executeWorkbook(workbookName: string, nodeName?: string): Record<string, any> {
        return this.execute("evalWorkbook", vmRef(workbookName), nodeName);
    }

    /**
     * Host-side trigger to update input nodes.
     */
    mutate<T>(nodeName: string, value: T): void {
        if (!this.vm) throw new Error("Engine not booted. Call boot() first.");
        this.callVm("mutateInput", nodeName, value);
    }

    private callVm(methodName: string, ...args: any[]) {
        if (!this.vm) throw new Error("VM not initialized");

        const scope = new Scope();
        try {
            const fnHandle = scope.manage(this.vm.getProp(this.vm.global, methodName));

            if (this.vm.typeof(fnHandle) !== "function") {
                throw new Error(`Method "${methodName}" not found in VM scope`);
            }

            const vmArgs = args.map(arg => {
                if (arg && typeof arg === "object" && "__vm_ref" in arg) {
                    return scope.manage(this.vm!.getProp(this.vm!.global, (arg as VmRef).__vm_ref));
                }
                if (typeof arg === "string") return scope.manage(this.vm!.newString(arg));
                if (typeof arg === "number") return scope.manage(this.vm!.newNumber(arg));
                if (typeof arg === "boolean") return arg ? this.vm!.true : this.vm!.false;
                if (arg === undefined) return this.vm!.undefined;
                if (arg === null) return this.vm!.null;

                // Use parseJSON if available, fallback to eval if typing is problematic
                const jsonStr = JSON.stringify(arg);
                try {
                    return scope.manage((this.vm! as any).parseJSON(jsonStr));
                } catch {
                    const handle = this.vm!.evalCode(`JSON.parse(${JSON.stringify(jsonStr)})`);
                    if (handle.error) {
                        handle.error.dispose();
                        throw new Error(`Failed to parse JSON in VM: ${jsonStr}`);
                    }
                    return scope.manage(handle.value);
                }
            });

            const result = this.vm.callFunction(fnHandle, this.vm.undefined, ...vmArgs);

            if (result.error) {
                const errorHandle = scope.manage(result.error);
                throw new Error(`[VM Runtime Error in ${methodName}]: ${JSON.stringify(this.vm.dump(errorHandle))}`);
            }

            const out = this.vm.dump(result.value);
            result.value.dispose();
            return out;
        } finally {
            scope.dispose();
        }
    }

    dispose(): void {
        if (this.vm) {
            this.vm.dispose();
            this.vm = null;
        }
    }

    /**
     * Internal access to the transpiled JS for debugging/inspection.
     */
    getTranspiledCode(): string {
        return this.jsCode;
    }
}
