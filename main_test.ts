import { assertEquals, assertExists, assertThrows } from "@std/assert";
import { 
    myWorkbook, 
    getFromTrace, 
    clearTrace, 
    trace, 
    node, 
    validateWorkbook, 
    getTopologicalOrder,
    mutateInput,
    inputListNode
} from "./main.ts";

Deno.test("Pull: basic execution triggers upstream chain", () => {
    clearTrace();
    const workbook = {} as any;
    const nodes = myWorkbook(workbook);
    Object.assign(workbook, nodes);

    // Trigger pull from leaf
    nodes.renderLoanBalanceChart();

    // Verify upstream nodes were executed and traced
    assertExists(getFromTrace("calculateMonthlyPayment.output"));
    assertExists(getFromTrace("generateLoanSchedule.output"));
});

Deno.test("Pull: memoization avoids redundant execution", () => {
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

Deno.test("Push: mutateInput invalidates downstream nodes", () => {
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
    assertEquals(callCount, 2, "Business logic should be re-executed after mutation");

    // 4. Third Pull (Memoized again)
    workbook.calc();
    assertEquals(callCount, 2, "Business logic should be memoized after re-calculation");
});

Deno.test("Push/Pull: unrelated mutations do not invalidate siblings", () => {
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

    // Build graph
    workbook.calcA();
    workbook.calcB();
    assertEquals(calcACount, 1);
    assertEquals(calcBCount, 1);

    // Mutate only Input A
    mutateInput("inputA", { val: 10 });
    
    // Check states
    assertEquals(getFromTrace("calcA.stale"), true);
    assertEquals(getFromTrace("calcB.stale"), false, "Unrelated node should NOT be stale");

    // Pull B (should be cached)
    workbook.calcB();
    assertEquals(calcBCount, 1, "Unrelated node should not re-execute");

    // Pull A (should re-execute)
    workbook.calcA();
    assertEquals(calcACount, 2);
});

Deno.test("Validation: detect circular dependencies", () => {
    clearTrace();
    const circularWorkbook = (context: any) => ({
        nodeA: node(function nodeA() { return context.nodeB() + 1; }, {
            b: () => context.nodeB()
        }),
        nodeB: node(function nodeB() { return context.nodeA() + 1; }, {
            a: () => context.nodeA()
        })
    });

    assertThrows(
        () => validateWorkbook(circularWorkbook),
        Error,
        "Circular dependency detected"
    );
});

Deno.test("Topological Sort: returns correct order", () => {
    clearTrace();
    validateWorkbook(myWorkbook);
    const order = getTopologicalOrder();
    
    const idxInput = order.indexOf("inputVariables");
    const idxCalc = order.indexOf("calculateMonthlyPayment");
    const idxSchedule = order.indexOf("generateLoanSchedule");

    assertExists(idxInput !== -1);
    assertExists(idxCalc !== -1);
    assertExists(idxSchedule !== -1);
    
    assertEquals(idxInput < idxCalc, true, "Source must come before dependent");
    assertEquals(idxCalc < idxSchedule, true, "Source must come before dependent");
});
