import { assertEquals, assertExists, assertThrows } from "@std/assert";
import { 
    node, 
    inputListNode, 
    mutateInput,
    clearTrace,
    getFromTrace,
    validateWorkbook,
    getTopologicalOrder
} from "../src/bindings.ts";

Deno.test("Framework: memoization avoids redundant execution", () => {
    clearTrace();
    let callCount = 0;
    const testWorkbookLoader = (context: any) => ({
        nodeA: node(function nodeA() {
            callCount++;
            return 42;
        })
    });
    
    const workbook = {} as any;
    Object.assign(workbook, testWorkbookLoader(workbook));

    workbook.nodeA();
    workbook.nodeA();
    
    assertEquals(callCount, 1, "Business logic should only be called once due to memoization");
});

Deno.test("Framework: mutateInput invalidates downstream nodes", () => {
    clearTrace();
    let callCount = 0;
    const testWorkbookLoader = (context: any) => ({
        input: inputListNode("input", { val: 1 }),
        calc: node(function calc({v}: {v: number}) {
            callCount++;
            return v + 10;
        }, { v: () => context.input().rows.val })
    });
    
    const workbook = {} as any;
    Object.assign(workbook, testWorkbookLoader(workbook));

    // 1. Initial Pull
    const res1 = workbook.calc();
    assertEquals(res1, 11);
    assertEquals(callCount, 1);

    // 2. Push (Mutation)
    mutateInput("input", { val: 5 });
    assertEquals(getFromTrace("calc.stale"), true, "Downstream node should be marked stale");

    // 3. Second Pull (Targeted)
    const res2 = workbook.calc();
    assertEquals(res2, 15);
    assertEquals(callCount, 2);
});

Deno.test("Framework: unrelated mutations do not invalidate siblings", () => {
    clearTrace();
    let calcACount = 0;
    let calcBCount = 0;

    const testWorkbookLoader = (context: any) => ({
        inputA: inputListNode("inputA", { val: 1 }),
        inputB: inputListNode("inputB", { val: 1 }),
        calcA: node(function calcA({v}: {v: number}) {
            calcACount++;
            return v + 1;
        }, { v: () => context.inputA().rows.val }),
        calcB: node(function calcB({v}: {v: number}) {
            calcBCount++;
            return v + 1;
        }, { v: () => context.inputB().rows.val })
    });

    const workbook = {} as any;
    Object.assign(workbook, testWorkbookLoader(workbook));

    workbook.calcA();
    workbook.calcB();
    
    mutateInput("inputA", { val: 10 });
    
    assertEquals(getFromTrace("calcA.stale"), true);
    assertEquals(getFromTrace("calcB.stale"), false);

    workbook.calcB();
    assertEquals(calcBCount, 1);
});

Deno.test("Framework: detect circular dependencies", () => {
    clearTrace();
    const circularWorkbook = (context: any) => ({
        nodeA: node(function nodeA() { return (context.nodeB?.() || 0) + 1; }, {
            b: () => context.nodeB()
        }),
        nodeB: node(function nodeB() { return (context.nodeA?.() || 0) + 1; }, {
            a: () => context.nodeA()
        })
    });

    assertThrows(
        () => validateWorkbook(circularWorkbook),
        Error,
        "Circular dependency detected"
    );
});
