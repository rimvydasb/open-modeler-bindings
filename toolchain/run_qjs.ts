import { Project } from "https://esm.sh/ts-morph@21.0.1";
import { join } from "https://deno.land/std@0.220.1/path/mod.ts";
import { getQuickJS } from "https://esm.sh/quickjs-emscripten@0.23.0";

/**
 * toolchain/run_qjs.ts (WASM Version)
 * 
 * 1. Reads main.ts using ts-morph.
 * 2. Transpiles to plain JavaScript (stripping ESM exports for simple VM execution).
 * 3. Executes the result using QuickJS WASM.
 * 4. Extracts and prints TRACE_STORE from the VM state.
 */

const mainTsPath = join(Deno.cwd(), "main.ts");

console.log(`[Toolchain] Reading ${mainTsPath}...`);

const project = new Project({
    compilerOptions: {
        target: 7, // ESNext
        module: 0, // None (produce a script, not a module)
        lib: ["esnext"]
    }
});

const sourceFile = project.addSourceFileAtPath(mainTsPath);

// Transpile to memory
const result = project.emitToMemory();
const emittedFiles = result.getFiles();
let jsCode = emittedFiles[0].text;

// Clean up: Remove ESM and CommonJS artifacts so it runs as a plain script in the VM
jsCode = jsCode.replace(/^"use strict";/gm, "");
jsCode = jsCode.replace(/^const TRACE_STORE =/gm, "var TRACE_STORE ="); // Ensure it's on global
jsCode = jsCode.replace(/^export /gm, ""); // Remove 'export ' at start of lines

jsCode = jsCode.replace(/^Object\.defineProperty\(exports,.*$/gm, ""); // Remove exports definition
jsCode = jsCode.replace(/^exports\..* = void 0;.*$/gm, ""); // Remove initial void 0 assignments
jsCode = jsCode.replace(/exports\.(\w+) = \1;/g, ""); // Remove 'exports.Name = Name;'
jsCode = jsCode.replace(/exports\./gm, ""); // Replace any remaining 'exports.'


// Remove the Deno-specific main block
jsCode = jsCode.replace(/if\s*\(import\.meta\.main\)\s*\{[\s\S]*?\n\}/g, "");

// Add a mock 'exports' if anything still tries to use it
jsCode = "const exports = {};\n" + jsCode;


// Add the workbook runner logic
jsCode += `
// Auto-run workbook
const workbook = {};
const nodes = myWorkbook(workbook);
Object.assign(workbook, nodes);
workbook.renderLoanBalanceChart();
workbook.renderLoanScheduleTable();
`;

console.log(`[Toolchain] Initializing QuickJS WASM...`);
const QuickJS = await getQuickJS();
const vm = QuickJS.newContext();

// Expose console.log to the VM
const logHandle = vm.newFunction("log", (...args: any[]) => {
    const nativeArgs = args.map(arg => vm.dump(arg));
    console.log("[VM Log]", ...nativeArgs);
});
const consoleHandle = vm.newObject();
vm.setProp(consoleHandle, "log", logHandle);
vm.setProp(vm.global, "console", consoleHandle);
consoleHandle.dispose();
logHandle.dispose();


try {
    console.log(`[Toolchain] Executing in QuickJS VM...`);
    const evalResult = vm.evalCode(jsCode);

    if (evalResult.error) {
        const error = vm.dump(evalResult.error);
        evalResult.error.dispose();
        console.error("[QuickJS Error]:", error);
        Deno.exit(1);
    }
    evalResult.value.dispose();

    // Extract TRACE_STORE
    const traceStoreHandle = vm.getProp(vm.global, "TRACE_STORE");
    if (vm.dump(traceStoreHandle) !== undefined) {
        console.log("\n--- TRACE_STORE RESULT (from WASM VM) ---");
        console.log(JSON.stringify(vm.dump(traceStoreHandle), null, 4));
    } else {
        console.log("TRACE_STORE not found in VM.");
    }
    traceStoreHandle.dispose();

} finally {
    vm.dispose();
}
