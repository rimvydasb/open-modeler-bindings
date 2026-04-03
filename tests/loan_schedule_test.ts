import { describe, it, expect } from "@jest/globals";
import { 
    myWorkbook
} from "../demo/loan-schedule/main.ts";
import { 
    clearTrace, 
    getFromTrace, 
    validateWorkbook, 
    getTopologicalOrder 
} from "../src/bindings.ts";

describe("Loan Schedule Demo", () => {

    it("triggers upstream chain on execution", () => {
        clearTrace();
        const workbook = {} as any;
        const nodes = (myWorkbook as any)(workbook);
        Object.assign(workbook, nodes);

        // Trigger pull from leaf
        nodes.renderLoanBalanceChart();

        // Verify upstream nodes were executed and traced
        expect(getFromTrace("calculateMonthlyPayment.output")).toBeTruthy();
        expect(getFromTrace("generateLoanSchedule.output")).toBeTruthy();
    });

    it("returns correct topological order", () => {
        clearTrace();
        validateWorkbook(myWorkbook);
        const order = getTopologicalOrder();
        
        const idxInput = order.indexOf("inputVariables");
        const idxCalc = order.indexOf("calculateMonthlyPayment");
        const idxSchedule = order.indexOf("generateLoanSchedule");

        expect(idxInput).not.toBe(-1);
        expect(idxCalc).not.toBe(-1);
        expect(idxSchedule).not.toBe(-1);
        
        expect(idxInput < idxCalc).toBe(true);
        expect(idxCalc < idxSchedule).toBe(true);
    });

});
