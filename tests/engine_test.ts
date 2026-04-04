import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { OpenModelTSEngine } from "../src/OpenModelTSEngine.ts";
import { loadFiles } from "./test-utils.ts";

const BINDINGS_CONTENT = readFileSync("src/bindings.ts", "utf-8");

describe("OpenModelTSEngine", () => {

    it("supports in-memory project loading and basic execution", async () => {
        const engine = new OpenModelTSEngine();
        
        await engine.loadProject({
            "/bindings.ts": BINDINGS_CONTENT,
            "/main.ts": `
                import { Workbook, Node, evalWorkbook } from "./bindings";
                @Workbook
                export class myWorkbook {
                    @Node get run() { return { result: 42 }; }
                }
                export function run() {
                    return evalWorkbook(myWorkbook, "run").run;
                }
            `
        });

        await engine.boot();
        const result = engine.execute("run");
        expect(result).toEqual({ result: 42 });
        engine.dispose();
    });

    it("handles reactive mutation and invalidation", async () => {
        const engine = new OpenModelTSEngine();
        
        await engine.loadProject({
            "/bindings.ts": BINDINGS_CONTENT,
            "/main.ts": `
                import { Workbook, Input, Node, evalWorkbook } from "./bindings";
                
                let callCount = 0;
                @Workbook
                export class myWorkbook {
                    @Input accessor myIn = 10;
                    @Node get double() { 
                        callCount++;
                        return { result: this.myIn * 2 }; 
                    }
                }

                export function run() { return evalWorkbook(myWorkbook, "double").double; }
                export function getCalls() { return callCount; }
            `
        });

        await engine.boot();
        
        // First run
        expect(engine.execute("run")).toEqual({ result: 20 });
        expect(engine.execute("getCalls")).toBe(1);
        
        // Memoization check
        expect(engine.execute("run")).toEqual({ result: 20 });
        expect(engine.execute("getCalls")).toBe(1);
        
        // Mutation
        engine.mutate("myIn", 50);
        expect(engine.execute("run")).toEqual({ result: 100 });
        expect(engine.execute("getCalls")).toBe(2);
        
        engine.dispose();
    });

    it("manages full reactive lifecycle with multi-node dependencies", async () => {
        const engine = new OpenModelTSEngine();
        
        await engine.loadProject({
            "/bindings.ts": BINDINGS_CONTENT,
            "/main.ts": `
                import { Workbook, Input, Node, evalWorkbook } from "./bindings";
                
                let calcACalls = 0;
                let calcBCalls = 0;

                @Workbook
                export class myWorkbook {
                    @Input accessor myIn = 10;
                    @Node get calcA() { 
                        calcACalls++;
                        return { result: this.myIn + 1 }; 
                    }
                    @Node get calcB() { 
                        calcBCalls++;
                        return { result: this.calcA.result * 2 }; 
                    }
                }

                export function runA() { return evalWorkbook(myWorkbook, "calcA").calcA; }
                export function runB() { return evalWorkbook(myWorkbook, "calcB").calcB; }
                export function getCalls() { return { a: calcACalls, b: calcBCalls }; }
            `
        });

        await engine.boot();
        
        // 1. Initial execution of B (triggers A)
        expect(engine.execute("runB")).toEqual({ result: 22 });
        let calls = engine.execute("getCalls") as any;
        expect(calls.a).toBe(1);
        expect(calls.b).toBe(1);
        
        // 2. Execution of A (should be memoized)
        expect(engine.execute("runA")).toEqual({ result: 11 });
        calls = engine.execute("getCalls");
        expect(calls.a).toBe(1);
        
        // 3. Mutate Input
        engine.mutate("myIn", 20);
        
        // 4. Execution of B again (triggers A again)
        expect(engine.execute("runB")).toEqual({ result: 42 });
        calls = engine.execute("getCalls");
        expect(calls.a).toBe(2);
        expect(calls.b).toBe(2);
        
        engine.dispose();
    });

    it("executes real loan-schedule demo with events (Happy path)", async () => {
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
            // In decorator-based models, input might be empty in beforeNodeExecution
            if (input && Object.keys(input).length > 0) {
                expect(input.principal).toBeTruthy();
            }
        });

        engine.onAfterNodeExecution("myWorkbook", "calculateMonthlyPayment", (output) => {
            afterCalled = true;
            expect(output.monthlyPayment).toBeTruthy();
        });

        engine.onNodeDataChanged("myWorkbook", "renderLoanScheduleTable", (data) => {
            dataChangedCalled = true;
            tableData = data;
        });

        try {
            // 1. Initial Pull
            const { renderLoanScheduleTable: table } = engine.executeWorkbook("myWorkbook", "renderLoanScheduleTable") as any;
            expect(table).toBeTruthy();
            expect(table.length).toBe(12);
            
            expect(beforeCalled).toBe(true);
            expect(afterCalled).toBe(true);
            expect(dataChangedCalled).toBe(true);
            expect(table).toEqual(tableData);

            // Reset flags for mutation test
            dataChangedCalled = false;
            let inputChangedCalled = false;
            engine.onNodeDataChanged("myWorkbook", "inputVariables", (data) => {
                inputChangedCalled = true;
                expect(data.loanAmount).toBe(200000);
            });

            // 2. Mutate and Verify
            engine.mutate("inputVariables", {
                loanAmount: 200000,
                annualInterestRate: 5.0,
                termMonths: 24,
                startDate: new Date('2026-04-01').toISOString()
            });
            
            expect(inputChangedCalled).toBe(true);

            const { renderLoanScheduleTable: updatedTable } = 
                engine.executeWorkbook("myWorkbook", "renderLoanScheduleTable") as any;
            expect(updatedTable.length).toBe(24);
            expect(dataChangedCalled).toBe(true);

        } catch (e) {
            console.log("Transpiled Code:\n", engine.getTranspiledCode());
            throw e;
        } finally {
            engine.dispose();
        }
    });

    it("executes Loan Originations demo", async () => {
        const engine = new OpenModelTSEngine({ debug: false });
        
        // Load real files from the file system
        await engine.loadProject(loadFiles([
            "src/bindings.ts",
            "demo/loan-originations/types.ts",
            "demo/loan-originations/library.ts",
            "demo/loan-originations/main.ts"
        ]));

        await engine.boot();

        try {
            const { renderEligibilityResult: result } = 
                engine.executeWorkbook("originationsWorkbook", "renderEligibilityResult") as any;
            expect(result).toBeTruthy();
            expect(result[0].eligible).toBe(true);

            // Mutate to underage
            engine.mutate("applicationInput", {
                customer: {
                    firstName: "Baby",
                    lastName: "Doe",
                    birthday: "2020-01-01",
                },
                requestedAmount: 15000,
                termMonths: 36,
            });

            const { renderEligibilityResult: result2 } = 
                engine.executeWorkbook("originationsWorkbook", "renderEligibilityResult") as any;
            expect(result2[0].eligible).toBe(false);
        } catch (e) {
            console.log("Transpiled Code:\n", engine.getTranspiledCode());
            throw e;
        } finally {
            engine.dispose();
        }
    });

    it("throws error for missing functions", async () => {
        const engine = new OpenModelTSEngine();
        await engine.loadProject({ "/main.ts": "export function ok() { return 1; }" });
        await engine.boot();
        
        await expect(async () => {
            engine.execute("nonExistent");
        }).rejects.toThrow(/Method "nonExistent" not found in VM scope/);
        
        engine.dispose();
    });

    it("reports VM Runtime Errors", async () => {
        const engine = new OpenModelTSEngine();
        await engine.loadProject({ "/main.ts": "export function fail() { throw new Error('Boom'); }" });
        await engine.boot();
        
        await expect(async () => {
            engine.execute("fail");
        }).rejects.toThrow(/VM Runtime Error in fail/);
        
        engine.dispose();
    });

});
