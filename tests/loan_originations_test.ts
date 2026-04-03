import { describe, it, expect } from "@jest/globals";
import { 
    originationsWorkbook
} from "../demo/loan-originations/main.ts";
import { 
    clearTrace, 
    getFromTrace, 
    mutateInput
} from "../src/bindings.ts";

describe("Loan Originations Demo", () => {

    it("correctly derives applicant age and eligibility", () => {
        clearTrace();
        const workbook = {} as any;
        const nodes = originationsWorkbook(workbook);
        Object.assign(workbook, nodes);

        // Trigger pull
        const result = (nodes.renderEligibilityResult as any)();

        // Verify age is derived correctly (1990-01-01 to 2026-04-02 is 36)
        const app = getFromTrace("ApplicationTerms.output");
        expect(app).toBeTruthy();
        expect(app.applicantAge).toBe(36);
        
        expect(result[0].eligible).toBe(true);
    });

    it("reacts to input mutations (age and amount limits)", () => {
        clearTrace();
        const workbook = {} as any;
        const nodes = originationsWorkbook(workbook);
        Object.assign(workbook, nodes);

        (nodes.renderEligibilityResult as any)();
        
        // Mutate to underage
        mutateInput("applicationInput", {
            customer: {
                firstName: "Baby",
                lastName: "Doe",
                birthday: new Date("2020-01-01"),
            },
            requestedAmount: 15000,
            termMonths: 36,
        });

        const result = (nodes.renderEligibilityResult as any)();
        expect(result[0].eligible).toBe(false);
        expect(result[0].reason).toBe("Applicant must be at least 18 years old.");
        
        // Mutate to too high amount
        mutateInput("applicationInput", {
            customer: {
                firstName: "Rich",
                lastName: "Doe",
                birthday: new Date("1990-01-01"),
            },
            requestedAmount: 100000,
            termMonths: 36,
        });
        
        const result2 = (nodes.renderEligibilityResult as any)();
        expect(result2[0].eligible).toBe(false);
        expect(result2[0].reason).toBe("Requested amount exceeds maximum limit of 50,000.");
    });

});
