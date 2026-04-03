import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { 
    myWorkbook
} from "../demo/loan-schedule/main.ts";
import { 
    clearTrace, 
    getFromTrace, 
    validateWorkbook, 
    getTopologicalOrder,
    evalWorkbook
} from "../src/bindings.ts";

describe("Loan Schedule Demo", () => {

    beforeEach(() => {
        (globalThis as any).__emitEvent = jest.fn();
    });

    afterEach(() => {
        delete (globalThis as any).__emitEvent;
    });

    it("triggers upstream chain on execution", () => {
        clearTrace();
        // Use evalWorkbook to instantiate and evaluate
        const results = evalWorkbook(myWorkbook, "renderLoanBalanceChart");

        // Verify upstream nodes were executed and traced
        expect(getFromTrace("calculateMonthlyPayment.output")).toBeTruthy();
        expect(getFromTrace("generateLoanSchedule.output")).toBeTruthy();
        expect(results.renderLoanBalanceChart).toBeTruthy();
    });

    it("ensures sink nodes are independent during pull", () => {
        clearTrace();
        const emitSpy = (globalThis as any).__emitEvent;
        
        // 1. Evaluate ONLY renderLoanBalanceChart
        const resultsChart = evalWorkbook(myWorkbook, "renderLoanBalanceChart");

        // Verify chart is in results, but table is NOT
        expect(resultsChart.renderLoanBalanceChart).toBeTruthy();
        expect(resultsChart.renderLoanScheduleTable).toBeUndefined();

        // Verify event for Chart was emitted, but Table was NOT
        const emittedNodes = emitSpy.mock.calls
            .filter((call: any) => call[0] === 'nodeDataChanged')
            .map((call: any) => call[1].nodeName);
        
        expect(emittedNodes).toContain('renderLoanBalanceChart');
        expect(emittedNodes).not.toContain('renderLoanScheduleTable');
        
        // 2. Evaluate ONLY renderLoanScheduleTable
        emitSpy.mockClear();
        const resultsTable = evalWorkbook(myWorkbook, "renderLoanScheduleTable");
        
        expect(resultsTable.renderLoanScheduleTable).toBeTruthy();
        
        const emittedNodes2 = emitSpy.mock.calls
            .filter((call: any) => call[0] === 'nodeDataChanged')
            .map((call: any) => call[1].nodeName);
            
        expect(emittedNodes2).toContain('renderLoanScheduleTable');
    });

    it("returns correct topological order", () => {
        clearTrace();
        validateWorkbook(myWorkbook as any);
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
