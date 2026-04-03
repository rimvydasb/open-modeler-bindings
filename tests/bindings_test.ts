import { describe, it, expect } from "@jest/globals";
import { 
    node, 
    inputListNode, 
    mutateInput,
    clearTrace,
    getFromTrace,
    validateWorkbook,
    evalWorkbook
} from "../src/bindings.ts";

describe("Framework Reactivity (bindings.ts)", () => {

    it("evalWorkbook without nodeName evaluates all nodes", () => {
        clearTrace();
        const testWorkbookLoader = (context: any) => ({
            nodeA: node(function nodeA() { return { result: 1 }; }),
            nodeB: node(function nodeB() { return { result: 2 }; }),
            someStaticValue: "not a function"
        });

        const results = evalWorkbook(testWorkbookLoader);

        expect(results).toEqual({
            nodeA: { result: 1 },
            nodeB: { result: 2 }
        });
    });

    it("Targeted Pull (Pull Isolation)", () => {
        clearTrace();
        let callCountA = 0;
        let callCountB = 0;

        const testWorkbookLoader = (context: any) => ({
            nodeA: node(function nodeA() {
                callCountA++;
                return { result: 'A' };
            }),
            nodeB: node(function nodeB() {
                callCountB++;
                return { result: 'B' };
            })
        });

        // 1. Evaluate only nodeA
        const resultsA = evalWorkbook(testWorkbookLoader, "nodeA");
        expect(resultsA).toEqual({
            nodeA: { result: 'A' },
            nodeB: undefined
        });
        expect(callCountA).toBe(1);
        expect(callCountB).toBe(0);

        // 2. Evaluate only nodeB
        const resultsB = evalWorkbook(testWorkbookLoader, "nodeB");
        expect(resultsB).toEqual({
            nodeA: { result: 'A' },
            nodeB: { result: 'B' }
        });
        expect(callCountA).toBe(1);
        expect(callCountB).toBe(1);
    });

    it("Full Pull Efficiency (only re-evaluates stale nodes)", () => {
        clearTrace();
        let countA = 0;
        let countB = 0;

        const testWorkbookLoader = (context: any) => ({
            input: inputListNode("input", { value: 10 }),
            nodeA: node(function nodeA() {
                countA++;
                return { result: context.input().rows.value + 1 };
            }),
            nodeB: node(function nodeB() {
                countB++;
                return { result: 100 };
            })
        });

        // 1. Initial full pull
        evalWorkbook(testWorkbookLoader);
        expect(countA).toBe(1);
        expect(countB).toBe(1);

        // 2. Mutate input for nodeA
        mutateInput("input", { value: 20 });

        // 3. Second full pull
        const results = evalWorkbook(testWorkbookLoader);
        expect(countA).toBe(2);
        expect(countB).toBe(1);
        expect(results.nodeA).toEqual({ result: 21 });
        expect(results.nodeB).toEqual({ result: 100 });
        // results should also contain input node
        expect(results.input !== undefined).toBe(true);
    });

    it("memoization avoids redundant execution", () => {
        clearTrace();
        let callCount = 0;
        const testWorkbookLoader = (context: any) => ({
            nodeA: node(function nodeA() {
                callCount++;
                return { result: 42 };
            })
        });
        
        const workbook = {} as any;
        Object.assign(workbook, testWorkbookLoader(workbook));

        workbook.nodeA();
        workbook.nodeA();
        
        expect(callCount).toBe(1);
    });

    it("mutateInput invalidates downstream nodes", () => {
        clearTrace();
        let callCount = 0;
        const testWorkbookLoader = (context: any) => ({
            input: inputListNode("input", { val: 1 }),
            calc: node(function calc({v}: {v: number}) {
                callCount++;
                return { result: v + 10 };
            }, { v: () => context.input().rows.val })
        });
        
        const workbook = {} as any;
        Object.assign(workbook, testWorkbookLoader(workbook));

        // 1. Initial Pull
        const res1 = workbook.calc();
        expect(res1.result).toBe(11);
        expect(callCount).toBe(1);

        // 2. Push (Mutation)
        mutateInput("input", { val: 5 });
        expect(getFromTrace("calc.stale")).toBe(true);

        // 3. Second Pull (Targeted)
        const res2 = workbook.calc();
        expect(res2.result).toBe(15);
        expect(callCount).toBe(2);
    });

    it("unrelated mutations do not invalidate siblings", () => {
        clearTrace();
        let calcACount = 0;
        let calcBCount = 0;

        const testWorkbookLoader = (context: any) => ({
            inputA: inputListNode("inputA", { val: 1 }),
            inputB: inputListNode("inputB", { val: 1 }),
            calcA: node(function calcA({v}: {v: number}) {
                calcACount++;
                return { result: v + 1 };
            }, { v: () => context.inputA().rows.val }),
            calcB: node(function calcB({v}: {v: number}) {
                calcBCount++;
                return { result: v + 1 };
            }, { v: () => context.inputB().rows.val })
        });

        const workbook = {} as any;
        Object.assign(workbook, testWorkbookLoader(workbook));

        workbook.calcA();
        workbook.calcB();
        
        mutateInput("inputA", { val: 10 });
        
        expect(getFromTrace("calcA.stale")).toBe(true);
        expect(getFromTrace("calcB.stale")).toBe(false);

        workbook.calcB();
        expect(calcBCount).toBe(1);
    });

    it("detect circular dependencies", () => {
        clearTrace();
        const circularWorkbook = (context: any) => ({
            nodeA: node(function nodeA() { return { result: (context.nodeB?.().result || 0) + 1 }; }, {
                b: () => context.nodeB()
            }),
            nodeB: node(function nodeB() { return { result: (context.nodeA?.().result || 0) + 1 }; }, {
                a: () => context.nodeA()
            })
        });

        expect(
            () => validateWorkbook(circularWorkbook)
        ).toThrow(/Circular dependency detected/);
    });

    it("enforce named outputs", () => {
        clearTrace();
        const invalidWorkbook = (context: any) => ({
            // @ts-ignore
            badNode: node(function badNode() {
                return 42; // Invalid: scalar output
            })
        });

        const workbook = {} as any;
        Object.assign(workbook, invalidWorkbook(workbook));

        expect(
            () => workbook.badNode()
        ).toThrow(/must return a named output \(object\)/);
    });

});
