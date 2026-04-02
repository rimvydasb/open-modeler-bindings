import { test } from "node:test";
import { strictEqual, ok } from "node:assert/strict";
import { 
    originationsWorkbook
} from "../demo/loan-originations/main.ts";
import { 
    clearTrace, 
    getFromTrace, 
    mutateInput
} from "../src/bindings.ts";

test("Loan Originations: basic execution and age derivation", () => {
    clearTrace();
    const workbook = {} as any;
    const nodes = originationsWorkbook(workbook);
    Object.assign(workbook, nodes);

    // Trigger pull
    const result = nodes.renderEligibilityResult();

    // Verify age is derived correctly (1990-01-01 to 2026-04-02 is 36)
    const app = getFromTrace("ApplicationTerms.output");
    ok(app, "ApplicationTerms should be traced");
    strictEqual(app.applicantAge, 36, `Age should be 36, got ${app.applicantAge}`);
    
    strictEqual(result[0].eligible, true, "John Doe should be eligible");
});

test("Loan Originations: reactivity after mutation", () => {
    clearTrace();
    const workbook = {} as any;
    const nodes = originationsWorkbook(workbook);
    Object.assign(workbook, nodes);

    nodes.renderEligibilityResult();
    
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

    const result = nodes.renderEligibilityResult();
    strictEqual(result[0].eligible, false, "Baby Doe should not be eligible");
    strictEqual(result[0].reason, "Applicant must be at least 18 years old.");
    
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
    
    const result2 = nodes.renderEligibilityResult();
    strictEqual(result2[0].eligible, false, "Rich Doe should not be eligible due to amount");
    strictEqual(result2[0].reason, "Requested amount exceeds maximum limit of 50,000.");
});
