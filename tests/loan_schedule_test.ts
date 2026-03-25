import { assertEquals, assertExists } from "@std/assert";
import { 
    myWorkbook, 
    eval_myWorkbook 
} from "../demo/loan-schedule/main.ts";
import { 
    clearTrace, 
    getFromTrace, 
    validateWorkbook, 
    getTopologicalOrder 
} from "../src/bindings.ts";

Deno.test("Loan Schedule: basic execution triggers upstream chain", () => {
    clearTrace();
    const workbook = {} as any;
    const nodes = myWorkbook(workbook);
    Object.assign(workbook, nodes);

    // Trigger pull from leaf
    nodes.renderLoanBalanceChart();

    // Verify upstream nodes were executed and traced
    assertExists(getFromTrace("calculateMonthlyPayment.output"));
    assertExists(getFromTrace("generateLoanSchedule.output"));
});

Deno.test("Loan Schedule: topological sort returns correct order", () => {
    clearTrace();
    validateWorkbook(myWorkbook);
    const order = getTopologicalOrder();
    
    const idxInput = order.indexOf("inputVariables");
    const idxCalc = order.indexOf("calculateMonthlyPayment");
    const idxSchedule = order.indexOf("generateLoanSchedule");

    assertExists(idxInput !== -1);
    assertExists(idxCalc !== -1);
    assertExists(idxSchedule !== -1);
    
    assertEquals(idxInput < idxCalc, true, "Source must come before dependent");
    assertEquals(idxCalc < idxSchedule, true, "Source must come before dependent");
});
