import { Project } from "https://esm.sh/ts-morph@21.0.1";
import { join } from "https://deno.land/std@0.220.1/path/mod.ts";
import { getQuickJS, QuickJSContext } from "https://esm.sh/quickjs-emscripten@0.23.0";

/**
 * toolchain/run_qjs.ts (Reusable WASM VM Version)
 */

const mainTsPath = join(Deno.cwd(), "main.ts");

console.log(`[Toolchain] Reading ${mainTsPath}...`);

const project = new Project({
    compilerOptions: {
        target: 7, // ESNext
        module: 0, // None
        lib: ["esnext"]
    }
});

project.addSourceFileAtPath(mainTsPath);

// Transpile to memory
const emitResult = project.emitToMemory();
let jsCode = emitResult.getFiles()[0].text;

// Clean up transpilation artifacts for VM compatibility
jsCode = jsCode.replace(/^"use strict";/gm, "");
jsCode = jsCode.replace(/^const TRACE_STORE =/gm, "var TRACE_STORE ="); 
jsCode = jsCode.replace(/^export /gm, "");
jsCode = jsCode.replace(/^Object\.defineProperty\(exports,.*$/gm, "");
jsCode = jsCode.replace(/^exports\..* = void 0;.*$/gm, "");
jsCode = jsCode.replace(/exports\.(\w+) = \1;/g, "");
jsCode = jsCode.replace(/exports\./gm, "");
jsCode = jsCode.replace(/if\s*\(import\.meta\.main\)\s*\{[\s\S]*?\n\}/g, "");
jsCode = "const exports = {};\n" + jsCode;

console.log(`[Toolchain] Initializing QuickJS WASM...`);
const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

// Setup console.log in VM
const logHandle = vm.newFunction("log", (...args) => {
    const nativeArgs = args.map(arg => vm.dump(arg));
    console.log("[VM Log]", ...nativeArgs);
});
const consoleHandle = vm.newObject();
vm.setProp(consoleHandle, "log", logHandle);
vm.setProp(vm.global, "console", consoleHandle);
consoleHandle.dispose();
logHandle.dispose();

/**
 * Executes a specific method within the VM context
 */
function executeVmMethod(vm: QuickJSContext, methodName: string, ...args: any[]) {
    const fnHandle = vm.getProp(vm.global, methodName);
    
    if (vm.typeof(fnHandle) !== "function") {
        fnHandle.dispose();
        throw new Error(`Method "${methodName}" not found or not a function in VM scope`);
    }

    const vmArgs = args.map(arg => {
        if (typeof arg === "string") return vm.newString(arg);
        if (typeof arg === "number") return vm.newNumber(arg);
        if (typeof arg === "boolean") return arg ? vm.true : vm.false;
        if (arg === undefined) return vm.undefined;
        if (arg === null) return vm.null;
        // For objects/arrays, use JSON parsing to bridge the gap
        return vm.parseJSONObject(JSON.stringify(arg));
    });

    try {
        const result = vm.callFunction(fnHandle, vm.undefined, ...vmArgs);
        
        if (result.error) {
            const error = vm.dump(result.error);
            result.error.dispose();
            throw new Error(`[VM Runtime Error in ${methodName}]: ${JSON.stringify(error)}`);
        }

        const out = vm.dump(result.value);
        result.value.dispose();
        return out;
    } finally {
        fnHandle.dispose();
        // Note: boolean/undefined/null handles from VM constants don't need disposal, 
        // but newString/newNumber/parseJSONObject handles DO.
        vmArgs.forEach(arg => {
            // Only dispose if it's not a shared constant
            if (arg !== vm.true && arg !== vm.false && arg !== vm.undefined && arg !== vm.null) {
                arg.dispose();
            }
        });
    }
}

try {
    console.log(`[Toolchain] Bootstrapping VM scope...`);
    const evalResult = vm.evalCode(jsCode);
    if (evalResult.error) {
        const error = vm.dump(evalResult.error);
        evalResult.error.dispose();
        throw new Error(`VM Init Failed: ${JSON.stringify(error)}`);
    }
    evalResult.value.dispose();

    // Reusable execution
    console.log(`[Toolchain] Executing first call...`);
    const trace1 = executeVmMethod(vm, "eval_myWorkbook", "renderLoanScheduleTable");
    console.log("\n--- TRACE 1 (renderLoanScheduleTable) ---");
    console.log(JSON.stringify(trace1, null, 4));

    console.log(`\n[Toolchain] Executing second call (Incremental)...`);
    // This call will benefit from memoization in the VM's TRACE_STORE
    const trace2 = executeVmMethod(vm, "eval_myWorkbook", "renderLoanBalanceChart");
    console.log("\n--- TRACE 2 (renderLoanBalanceChart) ---");
    console.log(JSON.stringify(trace2, null, 4));

} catch (err) {
    console.error(err.message);
} finally {
    vm.dispose();
}
