import { describe, it, expect } from "@jest/globals";
import { 
    evalWorkbook,
    clearTrace,
    mutateInput
} from "@open-modeler-bindings/v1alpha/bindings";
import { 
    CreditEligibilityModel,
    INITIAL_APPLICATION
} from "../demo/credit-eligibility/main.ts";

describe("Credit Eligibility Demo", () => {

    it("evaluates a complex credit application correctly", () => {
        clearTrace();
        
        const results = evalWorkbook(CreditEligibilityModel);

        expect(results.applicationInput.rows.requestedAmount).toBe(50000);
        expect(results.appEligibility.eligible).toBe(true);
        
        // Alice is eligible
        expect(results.applicantsEligibility.results[0].eligible).toBe(true);
        // Bob is NOT eligible
        expect(results.applicantsEligibility.results[1].eligible).toBe(false);
        expect(results.applicantsEligibility.results[1].reason).toContain("Bob Johnson has an insufficient credit score");

        expect(results.summaryReport.isApplicationEligible).toBe(true);
        expect(results.summaryReport.applicantResults[1].isEligible).toBe(false);
    });

    it("reacts to changes in individual applicants", () => {
        clearTrace();
        evalWorkbook(CreditEligibilityModel);

        // Update Bob's score to be eligible
        const updatedApp = JSON.parse(JSON.stringify(INITIAL_APPLICATION));
        updatedApp.applicants[1].creditScore = 700;
        updatedApp.applicants[1].annualIncome = 30000;

        mutateInput("applicationInput", updatedApp);

        const results = evalWorkbook(CreditEligibilityModel);
        
        // Bob should now be eligible
        expect(results.applicantsEligibility.results[1].eligible).toBe(true);
        expect(results.summaryReport.applicantResults[1].isEligible).toBe(true);
    });

    it("fails application when amount exceeds limit", () => {
        clearTrace();
        evalWorkbook(CreditEligibilityModel);

        const updatedApp = JSON.parse(JSON.stringify(INITIAL_APPLICATION));
        updatedApp.requestedAmount = 2000000; // Limit is 1M

        mutateInput("applicationInput", updatedApp);

        const results = evalWorkbook(CreditEligibilityModel);
        expect(results.appEligibility.eligible).toBe(false);
        expect(results.appEligibility.reason).toContain("Requested amount exceeds the maximum limit");
    });

});
