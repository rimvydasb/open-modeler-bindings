import { TermsSet } from "../../src/bindings.ts";
import type { Application } from "./types.ts";

@TermsSet
export class ApplicationTerms {
    constructor(public readonly data: Application) {}

    get applicantAge(): number {
        const today = new Date();
        const birthDate = new Date(this.data.customer.birthday);
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }

    get requestedAmount(): number {
        return this.data.requestedAmount;
    }

    get termMonths(): number {
        return this.data.termMonths;
    }
}

export function validateApplication({age, requestedAmount}: {age: number, requestedAmount: number}): {
    eligible: boolean,
    reason?: string
} {
    if (age < 18) {
        return { eligible: false, reason: "Applicant must be at least 18 years old." };
    }
    if (requestedAmount > 50000) {
        return { eligible: false, reason: "Requested amount exceeds maximum limit of 50,000." };
    }
    return { eligible: true };
}
