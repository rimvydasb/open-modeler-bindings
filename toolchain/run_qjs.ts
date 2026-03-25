import { join } from "https://deno.land/std@0.220.1/path/mod.ts";
import { OpenModelTSEngine } from "../src/OpenModelTSEngine.ts";

/**
 * toolchain/run_qjs.ts
 * Refactored to use OpenModelTSEngine.
 */

const projectRoot = Deno.cwd();
const engine = new OpenModelTSEngine({ debug: true });

try {
    console.log(`[Toolchain] Loading project...`);
    
    // In a real scenario, we might glob these, but for the demo we'll be explicit
    await engine.loadProject([
        join(projectRoot, "src/bindings.ts"),
        join(projectRoot, "demo/loan-schedule/types.ts"),
        join(projectRoot, "demo/loan-schedule/library.ts"),
        join(projectRoot, "demo/loan-schedule/main.ts")
    ]);

    console.log(`[Toolchain] Booting engine...`);
    await engine.boot();

    console.log(`[Toolchain] Executing 'renderLoanScheduleTable'...`);
    const trace1 = engine.execute("eval_myWorkbook", "renderLoanScheduleTable");
    console.log("\n--- TRACE 1 ---");
    console.log(JSON.stringify(trace1, null, 4));

    console.log(`\n[Toolchain] Mutating input 'inputVariables'...`);
    engine.mutate("inputVariables", {
        loanAmount: 200000,
        interestRate: 0.04,
        loanTerm: 15
    });

    console.log(`\n[Toolchain] Executing 'renderLoanBalanceChart' (Incremental)...`);
    const trace2 = engine.execute("eval_myWorkbook", "renderLoanBalanceChart");
    console.log("\n--- TRACE 2 ---");
    console.log(JSON.stringify(trace2, null, 4));

} catch (err: any) {
    console.error(`[Toolchain Error]: ${err.message}`);
} finally {
    engine.dispose();
}
