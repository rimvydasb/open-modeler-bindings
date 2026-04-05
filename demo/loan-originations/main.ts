import {
    Workbook,
    InputNode,
    TermsNode,
    FunctionNode,
    OutputNode, evalWorkbook, TRACE_STORE,
} from "@open-modeler-bindings/v1alpha/bindings";
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

@Workbook
export class originationsWorkbook {
    @InputNode
    accessor applicationInput = INITIAL_APPLICATION;

    // Use a TermsNode to instantiate ApplicationTerms
    @TermsNode
    get application() {
        return new ApplicationTerms(this.applicationInput);
    }

    // A standard node that uses the extended application
    @FunctionNode
    get eligibility() {
        return validateApplication({
            age: this.application.applicantAge,
            requestedAmount: this.application.requestedAmount,
        });
    }

    @OutputNode
    get renderEligibilityResult() {
        return [this.eligibility];
    }
}

if (import.meta.main) {
    const workbook = evalWorkbook(originationsWorkbook);
    console.log(JSON.stringify(workbook, null, 2));
    //console.log("TRACE_STORE:\n", JSON.stringify(TRACE_STORE, null, 2));
}
