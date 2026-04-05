import { describe, it, expect } from "@jest/globals";
import { 
    Workbook,
    InputNode,
    FunctionNode,
    OutputNode,
    mutateInput,
    clearTrace,
    getFromTrace,
    validateWorkbook,
    evalWorkbook
} from "@open-modeler-bindings/v1alpha/bindings";

describe("Framework Reactivity (bindings.ts)", () => {

    it("evalWorkbook without nodeName evaluates all nodes", () => {
        clearTrace();
        
        @Workbook
        class TestWorkbook {
            @FunctionNode get nodeA() { return { result: 1 }; }
            @FunctionNode get nodeB() { return { result: 2 }; }
        }

        const results = evalWorkbook(TestWorkbook);

        expect(results).toEqual({
            nodeA: { result: 1 },
            nodeB: { result: 2 }
        });
    });

    it("Targeted Pull (Pull Isolation)", () => {
        clearTrace();
        let callCountA = 0;
        let callCountB = 0;

        @Workbook
        class TestWorkbook {
            @FunctionNode get nodeA() {
                callCountA++;
                return { result: 'A' };
            }
            @FunctionNode get nodeB() {
                callCountB++;
                return { result: 'B' };
            }
        }

        // 1. Evaluate only nodeA
        const resultsA = evalWorkbook(TestWorkbook, "nodeA");
        expect(resultsA).toEqual({
            nodeA: { result: 'A' },
            nodeB: undefined
        });
        expect(callCountA).toBe(1);
        expect(callCountB).toBe(0);

        // 2. Evaluate only nodeB
        const resultsB = evalWorkbook(TestWorkbook, "nodeB");
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

        @Workbook
        class TestWorkbook {
            @InputNode accessor input = { value: 10 };
            @FunctionNode get nodeA() {
                countA++;
                return { result: this.input.value + 1 };
            }
            @FunctionNode get nodeB() {
                countB++;
                return { result: 100 };
            }
        }

        // 1. Initial full pull
        evalWorkbook(TestWorkbook);
        expect(countA).toBe(1);
        expect(countB).toBe(1);

        // 2. Mutate input for nodeA
        mutateInput("input", { value: 20 });

        // 3. Second full pull
        const results = evalWorkbook(TestWorkbook);
        expect(countA).toBe(2);
        expect(countB).toBe(1);
        expect(results.nodeA).toEqual({ result: 21 });
        expect(results.nodeB).toEqual({ result: 100 });
        // results should also contain input node
        expect(results.input).toEqual({ rows: { value: 20 } });
    });

    it("memoization avoids redundant execution", () => {
        clearTrace();
        let callCount = 0;
        
        @Workbook
        class TestWorkbook {
            @FunctionNode get nodeA() {
                callCount++;
                return { result: 42 };
            }
        }
        
        const workbook = new TestWorkbook();

        workbook.nodeA;
        workbook.nodeA;
        
        expect(callCount).toBe(1);
    });

    it("mutateInput invalidates downstream nodes", () => {
        clearTrace();
        let callCount = 0;

        @Workbook
        class TestWorkbook {
            @InputNode accessor input = { val: 1 };
            @FunctionNode get calc() {
                callCount++;
                return { result: this.input.val + 10 };
            }
        }
        
        const workbook = new TestWorkbook();

        // 1. Initial Pull
        const res1 = workbook.calc;
        expect(res1.result).toBe(11);
        expect(callCount).toBe(1);

        // 2. Push (Mutation)
        mutateInput("input", { val: 5 });
        expect(getFromTrace("calc.stale")).toBe(true);

        // 3. Second Pull (Targeted)
        const res2 = workbook.calc;
        expect(res2.result).toBe(15);
        expect(callCount).toBe(2);
    });

    it("unrelated mutations do not invalidate siblings", () => {
        clearTrace();
        let calcACount = 0;
        let calcBCount = 0;

        @Workbook
        class TestWorkbook {
            @InputNode accessor inputA = { val: 1 };
            @InputNode accessor inputB = { val: 1 };
            @FunctionNode get calcA() {
                calcACount++;
                return { result: this.inputA.val + 1 };
            }
            @FunctionNode get calcB() {
                calcBCount++;
                return { result: this.inputB.val + 1 };
            }
        }

        const workbook = new TestWorkbook();

        workbook.calcA;
        workbook.calcB;
        
        mutateInput("inputA", { val: 10 });
        
        expect(getFromTrace("calcA.stale")).toBe(true);
        expect(getFromTrace("calcB.stale")).toBe(false);

        workbook.calcB;
        expect(calcBCount).toBe(1);
    });

    it("detect circular dependencies", () => {
        clearTrace();
        
        @Workbook
        class CircularWorkbook {
            @FunctionNode get nodeA(): any { return { result: (this.nodeB.result || 0) + 1 }; }
            @FunctionNode get nodeB(): any { return { result: (this.nodeA.result || 0) + 1 }; }
        }

        expect(
            () => validateWorkbook(CircularWorkbook)
        ).toThrow(/Circular dependency detected/);
    });

    it("enforce named outputs", () => {
        clearTrace();
        
        @Workbook
        class InvalidWorkbook {
            @FunctionNode get badNode(): any {
                return 42; // Invalid: scalar output
            }
        }

        const workbook = new InvalidWorkbook();

        expect(
            () => workbook.badNode
        ).toThrow(/must return a named output \(object\)/);
    });

});
