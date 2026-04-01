import { test } from "node:test";
import { strictEqual, rejects, ok, deepStrictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OpenModelTSEngine } from "../src/OpenModelTSEngine.ts";
import { loadFiles } from "../src/node-utils.ts";

const BINDINGS_CONTENT = readFileSync("src/bindings.ts", "utf-8");

test("Engine: In-memory project loading and basic execution", async () => {
    const engine = new OpenModelTSEngine();
    
    await engine.loadProject({
        "/bindings.ts": BINDINGS_CONTENT,
        "/main.ts": `
            import { node, evalWorkbook } from "./bindings";
            const myCalc = () => ({ result: 42 });
            const calcNode = node(myCalc);
            const workbook = (context: any) => ({
                run: calcNode
            });
            export function run() {
                return evalWorkbook(workbook, "run");
            }
        `
    });

    await engine.boot();
    const result = engine.execute("run");
    deepStrictEqual(result, { result: 42 });
    engine.dispose();
});

test("Engine: Reactive mutation and invalidation", async () => {
    const engine = new OpenModelTSEngine();
    
    await engine.loadProject({
        "/bindings.ts": BINDINGS_CONTENT,
        "/main.ts": `
            import { node, inputListNode, evalWorkbook, getFromTrace } from "./bindings";
            
            const getIn = inputListNode("myIn", 10);
            let callCount = 0;
            function double() { 
                callCount++;
                return { result: getIn().rows * 2 }; 
            }
            const doubleNode = node(double);
            
            const workbook = (context) => ({
                myIn: getIn,
                double: doubleNode
            });

            export function run() { return evalWorkbook(workbook, "double"); }
            export function getCalls() { return callCount; }
        `
    });

    await engine.boot();
    
    // First run
    deepStrictEqual(engine.execute("run"), { result: 20 });
    strictEqual(engine.execute("getCalls"), 1);
    
    // Memoization check
    deepStrictEqual(engine.execute("run"), { result: 20 });
    strictEqual(engine.execute("getCalls"), 1);
    
    // Mutation
    engine.mutate("myIn", 50);
    deepStrictEqual(engine.execute("run"), { result: 100 });
    strictEqual(engine.execute("getCalls"), 2);
    
    engine.dispose();
});

test("Engine: Full Reactive Lifecycle with multi-node dependencies", async () => {
    const engine = new OpenModelTSEngine();
    
    await engine.loadProject({
        "/bindings.ts": BINDINGS_CONTENT,
        "/main.ts": `
            import { node, inputListNode, evalWorkbook } from "./bindings";
            
            const getIn = inputListNode("myIn", 10);
            
            let calcACalls = 0;
            const calcA = node(function calcA() { 
                calcACalls++;
                return { result: getIn().rows + 1 }; 
            });
            
            let calcBCalls = 0;
            const calcB = node(function calcB() { 
                calcBCalls++;
                return { result: calcA().result * 2 }; 
            });
            
            const workbook = (context) => ({
                myIn: getIn,
                calcA: calcA,
                calcB: calcB
            });

            export function runA() { return evalWorkbook(workbook, "calcA"); }
            export function runB() { return evalWorkbook(workbook, "calcB"); }
            export function getCalls() { return { a: calcACalls, b: calcBCalls }; }
        `
    });

    await engine.boot();
    
    // 1. Initial execution of B (triggers A)
    deepStrictEqual(engine.execute("runB"), { result: 22 });
    let calls = engine.execute("getCalls");
    strictEqual(calls.a, 1);
    strictEqual(calls.b, 1);
    
    // 2. Execution of A (should be memoized)
    deepStrictEqual(engine.execute("runA"), { result: 11 });
    calls = engine.execute("getCalls");
    strictEqual(calls.a, 1);
    
    // 3. Mutate Input
    engine.mutate("myIn", 20);
    
    // 4. Execution of B again (triggers A again)
    deepStrictEqual(engine.execute("runB"), { result: 42 });
    calls = engine.execute("getCalls");
    strictEqual(calls.a, 2);
    strictEqual(calls.b, 2);
    
    engine.dispose();
});

test("Engine: Happy path with real loan-schedule demo and events", async () => {
    const engine = new OpenModelTSEngine({ debug: false });
    
    // Load real files from the file system
    await engine.loadProject(loadFiles([
        "src/bindings.ts",
        "demo/loan-schedule/types.ts",
        "demo/loan-schedule/library.ts",
        "demo/loan-schedule/main.ts"
    ]));

    await engine.boot();

    let beforeCalled = false;
    let afterCalled = false;
    let dataChangedCalled = false;
    let tableData: any = null;

    engine.onBeforeNodeExecution("myWorkbook", "calculateMonthlyPayment", (input) => {
        beforeCalled = true;
        ok(input.principal, "Input should contain principal");
    });

    engine.onAfterNodeExecution("myWorkbook", "calculateMonthlyPayment", (output) => {
        afterCalled = true;
        ok(output.monthlyPayment, "Output should contain monthlyPayment");
    });

    engine.onNodeDataChanged("myWorkbook", "renderLoanScheduleTable", (data) => {
        dataChangedCalled = true;
        tableData = data;
    });

    try {
        // 1. Initial Pull
        const table = engine.executeWorkbook("myWorkbook", "renderLoanScheduleTable");
        ok(table);
        strictEqual(table.length, 12);
        
        ok(beforeCalled, "onBeforeNodeExecution should have been called");
        ok(afterCalled, "onAfterNodeExecution should have been called");
        ok(dataChangedCalled, "onNodeDataChanged should have been called");
        deepStrictEqual(table, tableData, "Event data should match returned data");

        // Reset flags for mutation test
        dataChangedCalled = false;
        let inputChangedCalled = false;
        engine.onNodeDataChanged("myWorkbook", "inputVariables", (data) => {
            inputChangedCalled = true;
            strictEqual(data.loanAmount, 200000);
        });

        // 2. Mutate and Verify
        engine.mutate("inputVariables", {
            loanAmount: 200000,
            annualInterestRate: 5.0,
            termMonths: 24,
            startDate: new Date('2026-04-01').toISOString()
        });
        
        ok(inputChangedCalled, "onNodeDataChanged should be called for input mutation");

        const updatedTable = engine.executeWorkbook("myWorkbook", "renderLoanScheduleTable");
        strictEqual(updatedTable.length, 24);
        ok(dataChangedCalled, "onNodeDataChanged should be called after mutation pull");

    } catch (e) {
        console.log("Transpiled Code:\n", engine.getTranspiledCode());
        throw e;
    } finally {
        engine.dispose();
    }
});

test("Engine: Error handling for missing functions", async () => {
    const engine = new OpenModelTSEngine();
    await engine.loadProject({ "/main.ts": "export function ok() { return 1; }" });
    await engine.boot();
    
    await rejects(async () => {
        engine.execute("nonExistent");
    }, { message: /Method "nonExistent" not found in VM scope/ });
    
    engine.dispose();
});

test("Engine: VM Runtime Error reporting", async () => {
    const engine = new OpenModelTSEngine();
    await engine.loadProject({ "/main.ts": "export function fail() { throw new Error('Boom'); }" });
    await engine.boot();
    
    await rejects(async () => {
        engine.execute("fail");
    }, { message: /VM Runtime Error in fail/ });
    
    engine.dispose();
});
