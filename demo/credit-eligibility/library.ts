import { Applicant, CreditApplication, EligibilityResult } from "./types.ts";

/**
 * Validates general application constraints.
 */
export function applicationEligibility(app: CreditApplication): EligibilityResult {
    if (app.requestedAmount > 1000000) {
        return { eligible: false, reason: "Requested amount exceeds the maximum limit of 1,000,000." };
    }
    if (app.termMonths > 360) {
        return { eligible: false, reason: "Term months exceed the maximum limit of 360." };
    }
    return { eligible: true };
}

/**
 * Validates individual applicant constraints.
 */
export function applicantEligibility(applicant: Applicant): EligibilityResult {
    if (applicant.age < 18) {
        return { eligible: false, reason: `${applicant.firstName} ${applicant.lastName} must be at least 18 years old.` };
    }
    if (applicant.creditScore < 600) {
        return { eligible: false, reason: `${applicant.firstName} ${applicant.lastName} has an insufficient credit score.` };
    }
    if (applicant.annualIncome < 15000) {
        return { eligible: false, reason: `${applicant.firstName} ${applicant.lastName} has an insufficient annual income.` };
    }
    return { eligible: true };
}
