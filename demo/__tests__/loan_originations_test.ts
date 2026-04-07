import {describe, it, expect} from '@jest/globals';
import {setupEngine} from './test_utils.js';

describe('Loan Originations Integration Test', () => {
    async function setupDefaultEngine() {
        return setupEngine('demo/loan-originations');
    }

    it('correctly derives applicant age and eligibility via Engine', async () => {
        const engine = await setupDefaultEngine();
        const results = engine.executeWorkbook('originationsWorkbook', 'renderEligibilityResult');

        expect(results.renderEligibilityResult[0].eligible).toBe(true);
    });

    it('reacts to input mutations (age and amount limits) in the VM', async () => {
        const engine = await setupDefaultEngine();

        // 1. Initial check
        const results1 = engine.executeWorkbook('originationsWorkbook', 'renderEligibilityResult');
        expect(results1.renderEligibilityResult[0].eligible).toBe(true);

        // 2. Mutate to underage
        engine.mutate('applicationInput', {
            customer: {
                firstName: 'Baby',
                lastName: 'Doe',
                birthday: '2020-01-01', // Using string for JSON serialization compatibility
            },
            requestedAmount: 15000,
            termMonths: 36,
        });

        const results2 = engine.executeWorkbook('originationsWorkbook', 'renderEligibilityResult');
        expect(results2.renderEligibilityResult[0].eligible).toBe(false);
        expect(results2.renderEligibilityResult[0].reason).toBe('Applicant must be at least 18 years old.');

        // 3. Mutate to too high amount
        engine.mutate('applicationInput', {
            customer: {
                firstName: 'Rich',
                lastName: 'Doe',
                birthday: '1990-01-01',
            },
            requestedAmount: 100000,
            termMonths: 36,
        });

        const results3 = engine.executeWorkbook('originationsWorkbook', 'renderEligibilityResult');
        expect(results3.renderEligibilityResult[0].eligible).toBe(false);
        expect(results3.renderEligibilityResult[0].reason).toBe('Requested amount exceeds maximum limit of 50,000.');
    });
});
