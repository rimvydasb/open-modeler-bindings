import { test } from "node:test";
import { strictEqual, throws, deepStrictEqual } from "node:assert/strict";
import { 
    node, 
    inputListNode, 
    mutateInput,
    clearTrace,
    getFromTrace,
    validateWorkbook,
    evalWorkbook
} from "../src/bindings.ts";

test("Framework: evalWorkbook without nodeName evaluates all nodes", () => {
    clearTrace();
    const testWorkbookLoader = (context: any) => ({
        nodeA: node(function nodeA() { return { result: 1 }; }),
        nodeB: node(function nodeB() { return { result: 2 }; }),
        someStaticValue: "not a function"
    });

    const results = evalWorkbook(testWorkbookLoader);

    deepStrictEqual(results, {
        nodeA: { result: 1 },
        nodeB: { result: 2 }
    });
});

test("Framework: Targeted Pull (Pull Isolation)", () => {
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
    deepStrictEqual(resultsA, {
        nodeA: { result: 'A' },
        nodeB: undefined
    });
    strictEqual(callCountA, 1, "nodeA should be called once");
    strictEqual(callCountB, 0, "nodeB should NOT be called");

    // 2. Evaluate only nodeB
    const resultsB = evalWorkbook(testWorkbookLoader, "nodeB");
    deepStrictEqual(resultsB, {
        nodeA: { result: 'A' },
        nodeB: { result: 'B' }
    });
    strictEqual(callCountA, 1, "nodeA should NOT be called again");
    strictEqual(callCountB, 1, "nodeB should now be called once");
});

test("Framework: Full Pull Efficiency (only re-evaluates stale nodes)", () => {
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
    strictEqual(countA, 1);
    strictEqual(countB, 1);

    // 2. Mutate input for nodeA
    mutateInput("input", { value: 20 });

    // 3. Second full pull
    const results = evalWorkbook(testWorkbookLoader);
    strictEqual(countA, 2, "nodeA should be re-evaluated (it depends on mutated input)");
    strictEqual(countB, 1, "nodeB should NOT be re-evaluated (it was already cached and is NOT stale)");
    deepStrictEqual(results.nodeA, { result: 21 });
    deepStrictEqual(results.nodeB, { result: 100 });
    // results should also contain input node
    strictEqual(results.input !== undefined, true);
});

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
