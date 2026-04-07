import {describe, it, expect} from '@jest/globals';
import {setupEngine} from './test_utils.js';

describe('Loan Schedule Integration Test', () => {
    it('evaluates the full workbook correctly via Engine', async () => {
        const engine = await setupEngine('demo/loan-schedule');

        const results = engine.executeWorkbook('myWorkbook');

        // Check terminal nodes in results
        expect(results.renderLoanScheduleTable.length).toBe(12);
        expect(results.renderLoanBalanceChart.length).toBe(12);

        // Check specific values
        expect(results.calculateMonthlyPayment.monthlyPayment).toBeCloseTo(8560.75, 2);
    });

    it('reacts to input mutations in the VM', async () => {
        const engine = await setupEngine('demo/loan-schedule');

        // 1. Initial check
        const res1 = engine.executeWorkbook('myWorkbook');
        expect(res1.calculateMonthlyPayment.monthlyPayment).toBeCloseTo(8560.75, 2);

        // 2. Mutate input node in VM
        const INPUT_VARIABLES = engine.execute('INPUT_VARIABLES');
        engine.mutate('inputVariables', {
            ...INPUT_VARIABLES,
            loanAmount: 200000,
        });

        // 3. Re-execute
        const res2 = engine.executeWorkbook('myWorkbook');
        expect(res2.calculateMonthlyPayment.monthlyPayment).toBeCloseTo(17121.5, 2);
    });
});
