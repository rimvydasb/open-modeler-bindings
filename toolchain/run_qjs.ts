import { Project } from "https://esm.sh/ts-morph@21.0.1";
import { join } from "https://deno.land/std@0.220.1/path/mod.ts";
import { getQuickJS, QuickJSHandle } from "https://esm.sh/quickjs-emscripten@0.23.0";

/**
 * toolchain/run_qjs.ts (Best Practice WASM VM Version)
 * Implements a robust Scope manager for handle cleanup.
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

    // Support for 'using' if the environment supports it
    [Symbol.dispose]() {
        this.dispose();
    }
}

const mainTsPath = join(Deno.cwd(), "demo/loan-schedule/main.ts");
const qjsOutputPath = join(Deno.cwd(), "tmp/main.qjs.js");

console.log(`[Toolchain] Reading ${mainTsPath}...`);

const project = new Project({
    compilerOptions: {
        target: 7, // ESNext
        module: 0, // None
        lib: ["esnext"]
    }
});

project.addSourceFilesAtPaths([
    "src/**/*.ts",
    "demo/loan-schedule/**/*.ts"
]);

// Transpile all to memory
const emitResult = project.emitToMemory();
const files = emitResult.getFiles();

// Concatenate files in order: framework, library, then main
let jsCode = "";
const order = ["reactive_graph.js", "types.js", "library.js", "main.js"];

for (const name of order) {
    const file = files.find(f => f.filePath.endsWith(name));
    if (file) {
        jsCode += `\n// --- ${name} ---\n` + file.text;
    }
}

// Clean up transpilation artifacts for VM compatibility
jsCode = jsCode.replace(/^"use strict";/gm, "");
jsCode = jsCode.replace(/^const TRACE_STORE =/gm, "var TRACE_STORE ="); 
jsCode = jsCode.replace(/^export /gm, "");
jsCode = jsCode.replace(/^import .* from .*$/gm, ""); // Remove imports
jsCode = jsCode.replace(/^const .* = require\(.*\);$/gm, ""); // Remove require
jsCode = jsCode.replace(/^Object\.defineProperty\(exports,.*$/gm, "");
jsCode = jsCode.replace(/^exports\..* = void 0;.*$/gm, "");
jsCode = jsCode.replace(/exports\.(\w+) = \1;/g, "");
jsCode = jsCode.replace(/exports\./gm, "");

// NEW: Strip module prefixes like (0, reactive_graph_ts_1.node) or library_ts_1.func
jsCode = jsCode.replace(/\(\d+,\s*\w+\.([^)]+)\)/g, "$1");
jsCode = jsCode.replace(/\w+\.(\w+)/g, (match, p1) => {
    // List of prefixes to ignore if needed, but for now, we strip everything before the dot 
    // IF it looks like a module prefix (ends with _ts_1 or similar)
    if (match.includes("_ts_")) return p1;
    return match;
});

jsCode = jsCode.replace(/if\s*\(import\.meta\.main\)\s*\{[\s\S]*?\n\}/g, "");
jsCode = "const exports = {};\n" + jsCode;

// NEW: Write transpiled JS to tmp/ for inspection
console.log(`[Toolchain] Writing transpiled JS to ${qjsOutputPath}...`);
await Deno.writeTextFile(qjsOutputPath, jsCode);

console.log(`[Toolchain] Initializing QuickJS WASM...`);
const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

// Setup console.log in VM
{
    const scope = new Scope();
    try {
        const logFn = scope.manage(vm.newFunction("log", (...args) => {
            const nativeArgs = args.map(arg => vm.dump(arg));
            console.log("[VM Log]", ...nativeArgs);
        }));
        const consoleObj = scope.manage(vm.newObject());
        vm.setProp(consoleObj, "log", logFn);
        vm.setProp(vm.global, "console", consoleObj);
    } finally {
        scope.dispose();
    }
}

/**
 * Executes a global function with auto-cleanup using a Scope.
 */
function callVm(methodName: string, ...args: any[]) {
    const scope = new Scope();
    try {
        const fnHandle = scope.manage(vm.getProp(vm.global, methodName));
        
        if (vm.typeof(fnHandle) !== "function") {
            throw new Error(`Method "${methodName}" not found in VM scope`);
        }

        const vmArgs = args.map(arg => {
            if (typeof arg === "string") return scope.manage(vm.newString(arg));
            if (typeof arg === "number") return scope.manage(vm.newNumber(arg));
            if (typeof arg === "boolean") return arg ? vm.true : vm.false;
            if (arg === undefined) return vm.undefined;
            if (arg === null) return vm.null;
            return scope.manage(vm.parseJSONObject(JSON.stringify(arg)));
        });

        const result = vm.callFunction(fnHandle, vm.undefined, ...vmArgs);
        
        if (result.error) {
            const errorHandle = scope.manage(result.error);
            throw new Error(`[VM Runtime Error in ${methodName}]: ${JSON.stringify(vm.dump(errorHandle))}`);
        }

        const out = vm.dump(result.value);
        result.value.dispose();
        return out;
    } finally {
        scope.dispose();
    }
}

try {
    console.log(`[Toolchain] Bootstrapping VM scope...`);
    const evalResult = vm.evalCode(jsCode);
    if (evalResult.error) {
        const errorHandle = evalResult.error;
        const error = vm.dump(errorHandle);
        errorHandle.dispose();
        throw new Error(`VM Init Failed: ${JSON.stringify(error)}`);
    }
    evalResult.value.dispose();

    // Reusable execution via best-practice callVm
    console.log(`[Toolchain] Executing 'renderLoanScheduleTable'...`);
    const trace1 = callVm("eval_myWorkbook", "renderLoanScheduleTable");
    console.log("\n--- TRACE 1 ---");
    console.log(JSON.stringify(trace1, null, 4));

    console.log(`\n[Toolchain] Executing 'renderLoanBalanceChart' (Incremental)...`);
    const trace2 = callVm("eval_myWorkbook", "renderLoanBalanceChart");
    console.log("\n--- TRACE 2 ---");
    console.log(JSON.stringify(trace2, null, 4));

} catch (err: any) {
    console.error(err.message);
} finally {
    vm.dispose();
}
