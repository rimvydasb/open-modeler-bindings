import { test } from "node:test";
import { strictEqual, throws, deepStrictEqual } from "node:assert/strict";
import { 
    node, 
    inputListNode, 
    mutateInput,
    clearTrace,
    getFromTrace,
    validateWorkbook
} from "../src/bindings.ts";

test("Framework: memoization avoids redundant execution", () => {
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
    
    strictEqual(callCount, 1, "Business logic should only be called once due to memoization");
});

test("Framework: mutateInput invalidates downstream nodes", () => {
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
    strictEqual(res1.result, 11);
    strictEqual(callCount, 1);

    // 2. Push (Mutation)
    mutateInput("input", { val: 5 });
    strictEqual(getFromTrace("calc.stale"), true, "Downstream node should be marked stale");

    // 3. Second Pull (Targeted)
    const res2 = workbook.calc();
    strictEqual(res2.result, 15);
    strictEqual(callCount, 2);
});

test("Framework: unrelated mutations do not invalidate siblings", () => {
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
    
    strictEqual(getFromTrace("calcA.stale"), true);
    strictEqual(getFromTrace("calcB.stale"), false);

    workbook.calcB();
    strictEqual(calcBCount, 1);
});

test("Framework: detect circular dependencies", () => {
    clearTrace();
    const circularWorkbook = (context: any) => ({
        nodeA: node(function nodeA() { return { result: (context.nodeB?.().result || 0) + 1 }; }, {
            b: () => context.nodeB()
        }),
        nodeB: node(function nodeB() { return { result: (context.nodeA?.().result || 0) + 1 }; }, {
            a: () => context.nodeA()
        })
    });

    throws(
        () => validateWorkbook(circularWorkbook),
        { message: /Circular dependency detected/ }
    );
});

test("Framework: enforce named outputs", () => {
    clearTrace();
    const invalidWorkbook = (context: any) => ({
        // @ts-ignore
        badNode: node(function badNode() {
            return 42; // Invalid: scalar output
        })
    });

    const workbook = {} as any;
    Object.assign(workbook, invalidWorkbook(workbook));

    throws(
        () => workbook.badNode(),
        { message: /must return a named output \(object\)/ }
    );
});
