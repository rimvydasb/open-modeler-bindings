import {
    node,
    inputListNode,
    evalWorkbook,
    mutateInput,
    termsNode,
    outputTableNode, TRACE_STORE
} from "../../src/bindings.ts";
import { ApplicationTerms, validateApplication } from "./library.ts";
import type { Application } from "./types.ts";

export const INITIAL_APPLICATION: Application = {
    customer: {
        firstName: "John",
        lastName: "Doe",
        birthday: new Date("1990-01-01"),
    },
    requestedAmount: 15000,
    termMonths: 36,
};

export const originationsWorkbook = (context: Record<string, any>): Record<string, any> => ({
    applicationInput: inputListNode("applicationInput", INITIAL_APPLICATION),

    // Use termsNode to extend Application and derive age
    application: termsNode(ApplicationTerms, () => context.applicationInput().rows),

    // A standard node that uses the extended application
    eligibility: node(validateApplication, {
        age: () => context.application().applicantAge,
        requestedAmount: () => context.application().requestedAmount,
    }),

    renderEligibilityResult: outputTableNode("renderEligibilityResult", {
        rows: () => [context.eligibility()],
    }),
});

/**
 * For testing and demonstration purposes.
 */
function runDemo() {
    console.log("--- Initial Evaluation ---");
    const result = evalWorkbook(originationsWorkbook, "renderEligibilityResult");
    console.log("Eligibility Result:", JSON.stringify(result, null, 2));

    console.log("\n--- Mutating Birthday (Underage) ---");
    mutateInput("applicationInput", {
        ...INITIAL_APPLICATION,
        customer: {
            ...INITIAL_APPLICATION.customer,
            birthday: new Date("2015-01-01"), // 11 years old in 2026
        }
    });

    const result2 = evalWorkbook(originationsWorkbook, "renderEligibilityResult");
    console.log("Eligibility Result (Underage):", JSON.stringify(result2, null, 2));
    
    console.log("\n--- Mutating Amount (Too High) ---");
    mutateInput("applicationInput", {
        ...INITIAL_APPLICATION,
        requestedAmount: 60000,
    });

    const result3 = evalWorkbook(originationsWorkbook, "renderEligibilityResult");
    console.log("Eligibility Result (Too High):", JSON.stringify(result3, null, 2));
    console.log("TRACE_STORE:", JSON.stringify(TRACE_STORE, null, 2));
}

// Use import.meta.main for local execution; engine sanitization will strip this block.
if (import.meta.main) {
    runDemo();
}
