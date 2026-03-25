import { test } from "node:test";
import { strictEqual, ok } from "node:assert/strict";
import { 
    myWorkbook
} from "../demo/loan-schedule/main.ts";
import { 
    clearTrace, 
    getFromTrace, 
    validateWorkbook, 
    getTopologicalOrder 
} from "../src/bindings.ts";

test("Loan Schedule: basic execution triggers upstream chain", () => {
    clearTrace();
    const workbook = {} as any;
    const nodes = myWorkbook(workbook);
    Object.assign(workbook, nodes);

    // Trigger pull from leaf
    nodes.renderLoanBalanceChart();

    // Verify upstream nodes were executed and traced
    ok(getFromTrace("calculateMonthlyPayment.output"));
    ok(getFromTrace("generateLoanSchedule.output"));
});

test("Loan Schedule: topological sort returns correct order", () => {
    clearTrace();
    validateWorkbook(myWorkbook);
    const order = getTopologicalOrder();
    
    const idxInput = order.indexOf("inputVariables");
    const idxCalc = order.indexOf("calculateMonthlyPayment");
    const idxSchedule = order.indexOf("generateLoanSchedule");

    ok(idxInput !== -1);
    ok(idxCalc !== -1);
    ok(idxSchedule !== -1);
    
    strictEqual(idxInput < idxCalc, true, "Source must come before dependent");
    strictEqual(idxCalc < idxSchedule, true, "Source must come before dependent");
});
