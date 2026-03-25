import { assertEquals, assertRejects, assertExists } from "https://deno.land/std@0.220.1/assert/mod.ts";
import { OpenModelTSEngine } from "../src/OpenModelTSEngine.ts";

const BINDINGS_CONTENT = await Deno.readTextFile("src/bindings.ts");

Deno.test("Engine: In-memory project loading and basic execution", async () => {
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
    assertEquals(result, 42);
    engine.dispose();
});

Deno.test("Engine: Reactive mutation and invalidation", async () => {
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
    assertEquals(engine.execute("run"), 20);
    assertEquals(engine.execute("getCalls"), 1);
    
    // Memoization check
    assertEquals(engine.execute("run"), 20);
    assertEquals(engine.execute("getCalls"), 1);
    
    // Mutation
    engine.mutate("myIn", 50);
    assertEquals(engine.execute("run"), 100);
    assertEquals(engine.execute("getCalls"), 2);
    
    engine.dispose();
});

Deno.test("Engine: Happy path with real loan-schedule demo", async () => {
    const engine = new OpenModelTSEngine({ debug: true });
    
    // Load real files from the file system
    await engine.loadProject([
        Deno.realPathSync("src/bindings.ts"),
        Deno.realPathSync("demo/loan-schedule/types.ts"),
        Deno.realPathSync("demo/loan-schedule/library.ts"),
        Deno.realPathSync("demo/loan-schedule/main.ts")
    ]);

    await engine.boot();

    try {
        // 1. Initial Pull
        const table = engine.execute("eval_myWorkbook", "renderLoanScheduleTable");
        assertExists(table);
        assertEquals(Array.isArray(table), true);
        assertEquals(table.length, 12); // Default is 12 months
        
        // 2. Mutate and Verify
        engine.mutate("inputVariables", {
            loanAmount: 100000,
            annualInterestRate: 5.0,
            termMonths: 24,
            startDate: new Date('2026-04-01')
        });
        
        const updatedTable = engine.execute("eval_myWorkbook", "renderLoanScheduleTable");
        assertEquals(updatedTable.length, 24);
    } catch (e) {
        console.log("Transpiled Code:\n", engine.getTranspiledCode());
        throw e;
    } finally {
        engine.dispose();
    }
});

Deno.test("Engine: Error handling for missing functions", async () => {
    const engine = new OpenModelTSEngine();
    await engine.loadProject({ "/main.ts": "export function ok() { return 1; }" });
    await engine.boot();
    
    assertRejects(async () => {
        engine.execute("nonExistent");
    }, Error, 'Method "nonExistent" not found in VM scope');
    
    engine.dispose();
});

Deno.test("Engine: VM Runtime Error reporting", async () => {
    const engine = new OpenModelTSEngine();
    await engine.loadProject({ "/main.ts": "export function fail() { throw new Error('Boom'); }" });
    await engine.boot();
    
    assertRejects(async () => {
        engine.execute("fail");
    }, Error, "VM Runtime Error in fail");
    
    engine.dispose();
});
