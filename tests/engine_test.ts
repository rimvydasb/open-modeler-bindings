import { test } from "node:test";
import { strictEqual, rejects, ok } from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { OpenModelTSEngine } from "../src/OpenModelTSEngine.ts";

const BINDINGS_CONTENT = readFileSync("src/bindings.ts", "utf-8");

test("Engine: In-memory project loading and basic execution", async () => {
    const engine = new OpenModelTSEngine();
    
    await engine.loadProject({
        "/bindings.ts": BINDINGS_CONTENT,
        "/main.ts": `
            import { node, evalWorkbook } from "./bindings";
            const myCalc = () => 42;
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
    strictEqual(result, 42);
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
                return getIn().rows * 2; 
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
    strictEqual(engine.execute("run"), 20);
    strictEqual(engine.execute("getCalls"), 1);
    
    // Memoization check
    strictEqual(engine.execute("run"), 20);
    strictEqual(engine.execute("getCalls"), 1);
    
    // Mutation
    engine.mutate("myIn", 50);
    strictEqual(engine.execute("run"), 100);
    strictEqual(engine.execute("getCalls"), 2);
    
    engine.dispose();
});

test("Engine: Happy path with real loan-schedule demo", async () => {
    const engine = new OpenModelTSEngine({ debug: true });
    
    // Load real files from the file system
    await engine.loadProject([
        realpathSync("src/bindings.ts"),
        realpathSync("demo/loan-schedule/types.ts"),
        realpathSync("demo/loan-schedule/library.ts"),
        realpathSync("demo/loan-schedule/main.ts")
    ]);

    await engine.boot();

    try {
        // 1. Initial Pull
        const table = engine.execute("eval_myWorkbook", "renderLoanScheduleTable");
        ok(table);
        strictEqual(Array.isArray(table), true);
        strictEqual(table.length, 12); // Default is 12 months
        
        // 2. Mutate and Verify
        engine.mutate("inputVariables", {
            loanAmount: 100000,
            annualInterestRate: 5.0,
            termMonths: 24,
            startDate: new Date('2026-04-01').toISOString() // QuickJS needs ISO or similar
        });
        
        const updatedTable = engine.execute("eval_myWorkbook", "renderLoanScheduleTable");
        strictEqual(updatedTable.length, 24);
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
