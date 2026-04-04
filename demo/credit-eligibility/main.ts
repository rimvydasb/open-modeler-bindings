import {
    Workbook,
    InputNode,
    FunctionNode,
    OutputNode,
    evalWorkbook
} from "../../src/bindings.ts";
import { CreditApplication, EligibilityResult } from "./types.ts";
import { applicationEligibility, applicantEligibility } from "./library.ts";

export const INITIAL_APPLICATION: CreditApplication = {
    id: "APP-1001",
    requestedAmount: 50000,
    termMonths: 48,
    applicants: [
        {
            id: "APL-001",
            firstName: "Alice",
            lastName: "Smith",
            age: 30,
            annualIncome: 65000,
            creditScore: 720,
        },
        {
            id: "APL-002",
            firstName: "Bob",
            lastName: "Johnson",
            age: 25,
            annualIncome: 12000, // Insufficient income
            creditScore: 580,    // Insufficient score
        }
    ]
};

@Workbook
export class CreditEligibilityModel {
    @InputNode
    accessor application = INITIAL_APPLICATION;

    @FunctionNode
    get appEligibility() {
        return applicationEligibility(this.application);
    }

    @FunctionNode
    get applicantsEligibility() {
        return {
            results: this.application.applicants.map(app => applicantEligibility(app))
        };
    }

    @OutputNode
    get summaryReport() {
        return {
            applicationId: this.application.id,
            isApplicationEligible: this.appEligibility.eligible,
            applicationReason: this.appEligibility.reason,
            applicantResults: this.applicantsEligibility.results.map((res, i) => ({
                name: `${this.application.applicants[i].firstName} ${this.application.applicants[i].lastName}`,
                isEligible: res.eligible,
                reason: res.reason
            }))
        };
    }
}

if (import.meta.url.endsWith(process.argv[1])) {
    const results = evalWorkbook(CreditEligibilityModel);
    console.log("Evaluation Results:");
    console.log(JSON.stringify(results, null, 2));
}
