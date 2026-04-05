import { TermsSet } from "@open-modeler-bindings/v1alpha/bindings";
import { Applicant, CreditApplication, EligibilityResult } from "./types.ts";

@TermsSet
export class ApplicantTerms {
    constructor(public readonly data: Applicant) {}

    get age() { return this.data.age; }
    get creditScore() { return this.data.creditScore; }
    get annualIncome() { return this.data.annualIncome; }
    get fullName() { return `${this.data.firstName} ${this.data.lastName}`; }
}

@TermsSet
export class ApplicationTerms {
    constructor(public readonly data: CreditApplication) {}

    get id() { return this.data.id; }
    get requestedAmount() { return this.data.requestedAmount; }
    get termMonths() { return this.data.termMonths; }
    
    get applicants() {
        return this.data.applicants.map(a => new ApplicantTerms(a));
    }
}

/**
 * Validates general application constraints.
 */
export function validateApplicationEligibility(inputs: { app: ApplicationTerms }): EligibilityResult {
    const { app } = inputs;
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
export function validateApplicantEligibility(inputs: { applicant: ApplicantTerms }): EligibilityResult {
    const { applicant } = inputs;
    if (applicant.age < 18) {
        return { eligible: false, reason: `${applicant.fullName} must be at least 18 years old.` };
    }
    if (applicant.creditScore < 600) {
        return { eligible: false, reason: `${applicant.fullName} has an insufficient credit score.` };
    }
    if (applicant.annualIncome < 15000) {
        return { eligible: false, reason: `${applicant.fullName} has an insufficient annual income.` };
    }
    return { eligible: true };
}
