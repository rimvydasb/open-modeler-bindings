import {describe, it, expect} from '@jest/globals';
import {originationsWorkbook} from '../demo/loan-originations/main.ts';
import {clearTrace, getFromTrace, mutateInput, evalWorkbook} from '@open-modeler-bindings/v1alpha/bindings';

describe('Loan Originations Demo', () => {
    it('correctly derives applicant age and eligibility', () => {
        clearTrace();
        // Use evalWorkbook to instantiate and evaluate
        const results = evalWorkbook(originationsWorkbook, 'renderEligibilityResult');

        // Verify age is derived correctly (1990-01-01 to 2026-04-02 is 36)
        const app = getFromTrace('application.output');
        expect(app).toBeTruthy();
        expect(app.applicantAge).toBe(36);

        expect(results.renderEligibilityResult[0].eligible).toBe(true);
    });

    it('reacts to input mutations (age and amount limits)', () => {
        clearTrace();

        // 1. Initial Pull
        evalWorkbook(originationsWorkbook, 'renderEligibilityResult');

        // 2. Mutate to underage
        mutateInput('applicationInput', {
            customer: {
                firstName: 'Baby',
                lastName: 'Doe',
                birthday: new Date('2020-01-01'),
            },
            requestedAmount: 15000,
            termMonths: 36,
        });

        const results = evalWorkbook(originationsWorkbook, 'renderEligibilityResult');
        expect(results.renderEligibilityResult[0].eligible).toBe(false);
        expect(results.renderEligibilityResult[0].reason).toBe('Applicant must be at least 18 years old.');

        // 3. Mutate to too high amount
        mutateInput('applicationInput', {
            customer: {
                firstName: 'Rich',
                lastName: 'Doe',
                birthday: new Date('1990-01-01'),
            },
            requestedAmount: 100000,
            termMonths: 36,
        });

        const results2 = evalWorkbook(originationsWorkbook, 'renderEligibilityResult');
        expect(results2.renderEligibilityResult[0].eligible).toBe(false);
        expect(results2.renderEligibilityResult[0].reason).toBe('Requested amount exceeds maximum limit of 50,000.');
    });
});
