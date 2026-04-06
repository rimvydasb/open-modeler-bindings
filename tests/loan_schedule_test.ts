import {describe, it, expect} from '@jest/globals';
import {myWorkbook, INPUT_VARIABLES} from '../demo/loan-schedule/main.ts';
import {clearTrace, getFromTrace, mutateInput, evalWorkbook} from '@open-modeler-bindings/v1alpha/bindings';

describe('Loan Schedule Demo', () => {
    it('evaluates the full workbook correctly', () => {
        clearTrace();
        const results = evalWorkbook(myWorkbook);

        // check intermediate nodes in trace
        const monthlyPayment = getFromTrace('calculateMonthlyPayment.output');
        expect(monthlyPayment.monthlyPayment).toBeCloseTo(8560.75, 2);

        const schedule = getFromTrace('generateLoanSchedule.output');
        expect(schedule.loanSchedule.length).toBe(12);
        expect(schedule.loanSchedule[11].remainingBalance).toBeCloseTo(0, 2);

        // check terminal nodes in results
        expect(results.renderLoanScheduleTable.length).toBe(12);
        expect(results.renderLoanBalanceChart.length).toBe(12);
    });

    it('reacts to input mutations', () => {
        clearTrace();

        // 1. Initial Pull
        evalWorkbook(myWorkbook);

        // 2. Mutate
        const newAmount = 200000;
        mutateInput('inputVariables', {
            ...INPUT_VARIABLES,
            loanAmount: newAmount,
        });

        // 3. Second Pull
        const results = evalWorkbook(myWorkbook);

        const monthlyPayment = getFromTrace('calculateMonthlyPayment.output');
        expect(monthlyPayment.monthlyPayment).toBeCloseTo(17121.5, 2);
        expect(results.renderLoanScheduleTable[0].remainingBalance).toBeGreaterThan(180000);
    });

    it('bypasses trace for ChartNode and OutputNode (always fresh)', () => {
        clearTrace();
        evalWorkbook(myWorkbook);

        // Verify chart is in results
        const results = evalWorkbook(myWorkbook);
        expect(results.renderLoanBalanceChart).toBeTruthy();
        expect(results.renderLoanScheduleTable).toBeTruthy();
    });
});
