import {describe, it, expect} from '@jest/globals';
import {setupEngine} from './test_utils.js';

describe('Credit Eligibility Integration Test', () => {
    async function setupDefaultEngine() {
        return setupEngine('demo/credit-eligibility');
    }

    it('evaluates complex credit application correctly via Engine', async () => {
        const engine = await setupDefaultEngine();
        const results = engine.executeWorkbook('CreditEligibilityModel');

        expect(results.applicationInput.rows.requestedAmount).toBe(50000);
        expect(results.appEligibility.eligible).toBe(true);

        // Alice is eligible
        expect(results.applicantsEligibility.results[0].eligible).toBe(true);
        // Bob is NOT eligible
        expect(results.applicantsEligibility.results[1].eligible).toBe(false);
        expect(results.applicantsEligibility.results[1].reason).toContain(
            'Bob Johnson has an insufficient credit score',
        );

        expect(results.summaryReport.isApplicationEligible).toBe(true);
        expect(results.summaryReport.applicantResults[1].isEligible).toBe(false);
    });

    it('reacts to changes in individual applicants in the VM', async () => {
        const engine = await setupDefaultEngine();

        // Update Bob's score to be eligible
        const INITIAL_APPLICATION = engine.execute('INITIAL_APPLICATION');
        const updatedApp = JSON.parse(JSON.stringify(INITIAL_APPLICATION));
        updatedApp.applicants[1].creditScore = 700;
        updatedApp.applicants[1].annualIncome = 30000;

        engine.mutate('applicationInput', updatedApp);

        const results = engine.executeWorkbook('CreditEligibilityModel');

        // Bob should now be eligible
        expect(results.applicantsEligibility.results[1].eligible).toBe(true);
        expect(results.summaryReport.applicantResults[1].isEligible).toBe(true);
    });

    it('fails application when amount exceeds limit in the VM', async () => {
        const engine = await setupDefaultEngine();

        const INITIAL_APPLICATION = engine.execute('INITIAL_APPLICATION');
        const updatedApp = JSON.parse(JSON.stringify(INITIAL_APPLICATION));
        updatedApp.requestedAmount = 2000000; // Limit is 1M

        engine.mutate('applicationInput', updatedApp);

        const results = engine.executeWorkbook('CreditEligibilityModel');
        expect(results.appEligibility.eligible).toBe(false);
        expect(results.appEligibility.reason).toContain('Requested amount exceeds the maximum limit');
    });
});
