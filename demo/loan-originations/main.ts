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

if (import.meta.main) {
    const workbook = evalWorkbook(originationsWorkbook);
    console.log(JSON.stringify(workbook, null, 2));
}
