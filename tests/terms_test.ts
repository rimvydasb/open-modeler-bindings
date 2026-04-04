import { describe, it, expect } from "@jest/globals";
import { 
    Workbook, 
    TermsNode, 
    TermsSet, 
    FunctionNode, 
    evalWorkbook, 
    TRACE_STORE, 
    clearTrace,
    FrameworkEvent
} from "../src/bindings.ts";

@TermsSet
class SubTerm {
    constructor(public val: number) {}
    get value() { return { v: this.val }; }
}

@TermsSet
class MyTerms {
    constructor(public readonly val: 
 number) {}
    get double() {
        return { result: this.val * 2 };
    }
    get children() {
        return [new SubTerm(1), new SubTerm(2)];
    }
}

@Workbook
class MyWorkbook {
    @TermsNode
    get myTerms() {
        return new MyTerms(21);
    }

    @FunctionNode
    get useTerms() {
        const childSum = this.myTerms.children.reduce((acc, child) => acc + child.value.v, 0);
        return { val: this.myTerms.double.result + childSum };
    }
}

describe("TermsNode and TermsSet", () => {
    it("tracks granular terms in TRACE_STORE", () => {
        clearTrace();
        
        const results = evalWorkbook(MyWorkbook);
        
        // Assertions
        expect(results.useTerms.val).toBe(45); // 42 + 1 + 2
        
        // Check TRACE_STORE for the TermsNode
        expect(TRACE_STORE["myTerms"]).toBeDefined();
        
        // Check TRACE_STORE for the individual term
        expect(TRACE_STORE["myTerms.double"]).toBeDefined();
        expect(TRACE_STORE["myTerms.double"]?.output?.result).toBe(42);

        // Check TRACE_STORE for nested array terms
        expect(TRACE_STORE["myTerms.children"]).toBeDefined();
        expect(TRACE_STORE["myTerms.children[0].value"]).toBeDefined();
        expect(TRACE_STORE["myTerms.children[0].value"]?.output?.v).toBe(1);
        expect(TRACE_STORE["myTerms.children[1].value"]).toBeDefined();
        expect(TRACE_STORE["myTerms.children[1].value"]?.output?.v).toBe(2);
    });

    it("does not emit events for TermsNode but DOES for individual terms", () => {
        clearTrace();
        const events: string[] = [];
        
        (globalThis as any).__emitEvent = (type: string, payload: any) => {
            if (type === FrameworkEvent.BEFORE_NODE_EXECUTION || 
                type === FrameworkEvent.AFTER_NODE_EXECUTION ||
                type === FrameworkEvent.BEFORE_TERM_EXECUTION ||
                type === FrameworkEvent.AFTER_TERM_EXECUTION) {
                events.push(`${type}:${payload.nodeName}`);
            }
        };

        evalWorkbook(MyWorkbook);

        // myTerms is a TermsNode, it should NOT have events
        expect(events).not.toContain(`${FrameworkEvent.BEFORE_NODE_EXECUTION}:myTerms`);
        expect(events).not.toContain(`${FrameworkEvent.AFTER_NODE_EXECUTION}:myTerms`);

        // myTerms.double is a term, it SHOULD have term events
        expect(events).toContain(`${FrameworkEvent.BEFORE_TERM_EXECUTION}:myTerms.double`);
        expect(events).toContain(`${FrameworkEvent.AFTER_TERM_EXECUTION}:myTerms.double`);
        
        // useTerms is a FunctionNode, it SHOULD have node events
        expect(events).toContain(`${FrameworkEvent.BEFORE_NODE_EXECUTION}:useTerms`);
        expect(events).toContain(`${FrameworkEvent.AFTER_NODE_EXECUTION}:useTerms`);

        delete (globalThis as any).__emitEvent;
    });
});
