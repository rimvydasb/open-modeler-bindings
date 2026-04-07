import {describe, it, expect} from '@jest/globals';
import {OpenModelTSEngine} from '@open-modeler-engine/index.js';
import {InlineTSProject} from '@open-modeler-ts-project/index.js';

describe('OpenModelTSEngine', () => {
    it('evaluates a basic workbook correctly', async () => {
        const engine = new OpenModelTSEngine();
        const project = new InlineTSProject({
            '/bindings.ts': `
                export function Workbook(target) { return target; }
                export function FunctionNode(target, context) { return target; }
                export function evalWorkbook(loader) {
                    const w = new loader();
                    return { run: { result: w.run.result } };
                }
            `,
            '/main.ts': `
                import { Workbook, FunctionNode } from "./bindings";
                @Workbook
                export class myWorkbook {
                    @FunctionNode get run() { return { result: 42 }; }
                }
            `,
        });
        await engine.loadProject(project);
        await engine.boot();

        const results = engine.executeWorkbook('myWorkbook', 'run');
        expect(results.run.result).toBe(42);
    });

    it('supports reactivity via mutate()', async () => {
        const engine = new OpenModelTSEngine();
        const project = new InlineTSProject({
            '/bindings.ts': `
                export function Workbook(target) { return target; }
                export function InputNode(target, context) {
                    const { name } = context;
                    return {
                        get() { 
                            if (globalThis.TRACE_STORE && globalThis.TRACE_STORE[name]) return globalThis.TRACE_STORE[name];
                            return target.get.call(this); 
                        },
                        set(v) { if (!globalThis.TRACE_STORE) globalThis.TRACE_STORE = {}; globalThis.TRACE_STORE[name] = v; },
                        init(v) { return v; }
                    };
                }
                export function FunctionNode(target, context) { return target; }
                export function evalWorkbook(loader) {
                    if (!globalThis.workbookInstance) globalThis.workbookInstance = new loader();
                    const w = globalThis.workbookInstance;
                    return { double: w.double };
                }
                export function mutateInput(nodeName, value) {
                    if (!globalThis.TRACE_STORE) globalThis.TRACE_STORE = {};
                    globalThis.TRACE_STORE[nodeName] = value;
                }
            `,
            '/main.ts': `
                import { Workbook, InputNode, FunctionNode } from "./bindings";
                @Workbook
                export class myWorkbook {
                    @InputNode accessor myIn = 10;
                    @FunctionNode get double() {
                        return { val: this.myIn * 2 };
                    }
                }
            `,
        });
        await engine.loadProject(project);
        await engine.boot();

        // 1. Initial execution
        const res1 = engine.executeWorkbook('myWorkbook', 'double');
        expect(res1.double.val).toBe(20);

        // 2. Mutate
        engine.mutate('myIn', 50);

        // 3. Re-execute
        const res2 = engine.executeWorkbook('myWorkbook', 'double');
        expect(res2.double.val).toBe(100);
    });

    it('isolated execution across multiple workbooks', async () => {
        const engine = new OpenModelTSEngine();
        const project = new InlineTSProject({
            '/bindings.ts': `
                export function Workbook(target) { return target; }
                export function FunctionNode(target, context) { return target; }
                export function evalWorkbook(loader) {
                    const w = new loader();
                    const results = {};
                    if (w.calcA) results.calcA = w.calcA;
                    if (w.calcB) results.calcB = w.calcB;
                    return results;
                }
            `,
            '/main.ts': `
                import { Workbook, FunctionNode } from "./bindings";
                @Workbook
                export class workbookA {
                    @FunctionNode get calcA() {
                        return { val: "A" };
                    }
                }
                @Workbook
                export class workbookB {
                    @FunctionNode get calcB() {
                        return { val: "B" };
                    }
                }
            `,
        });
        await engine.loadProject(project);
        await engine.boot();

        const resA = engine.executeWorkbook('workbookA', 'calcA');
        const resB = engine.executeWorkbook('workbookB', 'calcB');

        expect(resA.calcA.val).toBe('A');
        expect(resB.calcB.val).toBe('B');
        expect(resA.calcB).toBeUndefined();
    });

    it('emits lifecycle events correctly', async () => {
        const engine = new OpenModelTSEngine();
        const project = new InlineTSProject({
            '/bindings.ts': `
                export function Workbook(target) { return target; }
                export function InputNode(target, context) { return target; }
                export function FunctionNode(target, context) { return target; }
                export function evalWorkbook(loader) {
                    const w = new loader();
                    __emitEvent('beforeNodeExecution', { nodeName: 'calculateMonthlyPayment', input: { principal: 1000 } });
                    const res = w.calculateMonthlyPayment;
                    __emitEvent('afterNodeExecution', { nodeName: 'calculateMonthlyPayment', output: res });
                    return { calculateMonthlyPayment: res };
                }
            `,
            '/main.ts': `
                import { Workbook, FunctionNode } from "./bindings";
                function calculateMonthlyPayment(args) {
                    return { monthlyPayment: 100 };
                }
                @Workbook
                export class myWorkbook {
                    @FunctionNode
                    get calculateMonthlyPayment() {
                        return calculateMonthlyPayment({
                            principal: 1000,
                            months: 12,
                            annualRate: 5.0,
                        });
                    }
                }
            `,
        });
        await engine.loadProject(project);
        await engine.boot();

        let beforeCalled = false;
        let afterCalled = false;

        engine.onBeforeNodeExecution('myWorkbook', 'calculateMonthlyPayment', (input: any) => {
            beforeCalled = true;
            expect(input.principal).toBe(1000);
        });

        engine.onAfterNodeExecution('myWorkbook', 'calculateMonthlyPayment', (output: any) => {
            afterCalled = true;
            expect(output.monthlyPayment).toBe(100);
        });

        engine.executeWorkbook('myWorkbook', 'calculateMonthlyPayment');

        expect(beforeCalled).toBe(true);
        expect(afterCalled).toBe(true);
    });

    it('emits term execution events correctly', async () => {
        const engine = new OpenModelTSEngine();
        const project = new InlineTSProject({
            '/bindings.ts': `
                export function Workbook(target) { return target; }
                export function TermsSet(target) { target.__isTermsSet = true; return target; }
                export function TermsNode(target, context) { return target; }
                export function evalWorkbook(loader) {
                    const w = new loader();
                    __emitEvent('beforeTermExecution', { nodeName: 'application.age', input: {} });
                    const res = w.application.age;
                    __emitEvent('afterTermExecution', { nodeName: 'application.age', output: res });
                    return { age: res };
                }
            `,
            '/main.ts': `
                import { Workbook, TermsSet, TermsNode } from "./bindings";
                @TermsSet
                class AppTerms {
                    get age() { return 30; }
                }
                @Workbook
                export class myWorkbook {
                    @TermsNode get application() { return new AppTerms(); }
                }
            `,
        });
        await engine.loadProject(project);
        await engine.boot();

        let beforeCalled = false;
        let afterCalled = false;

        engine.onBeforeTermExecution('myWorkbook', 'application.age', (input: any) => {
            beforeCalled = true;
        });

        engine.onAfterTermExecution('myWorkbook', 'application.age', (output: any) => {
            afterCalled = true;
            expect(output).toBe(30);
        });

        engine.executeWorkbook('myWorkbook', 'application');

        expect(beforeCalled).toBe(true);
        expect(afterCalled).toBe(true);
    });

    it('supports OutputNodes with event emission', async () => {
        const engine = new OpenModelTSEngine();
        const project = new InlineTSProject({
            '/bindings.ts': `
                export function Workbook(target) { return target; }
                export function OutputNode(target, context) {
                    return function() {
                        const data = target.call(this);
                        __emitEvent('nodeDataChanged', { nodeName: context.name, data });
                        return data;
                    };
                }
                export function evalWorkbook(loader, nodeName) {
                    const w = new loader();
                    if (nodeName) return { [nodeName]: w[nodeName] };
                    return {};
                }
            `,
            '/main.ts': `
                import { Workbook, OutputNode } from "./bindings";
                @Workbook
                export class myWorkbook {
                    @OutputNode
                    get renderLoanScheduleTable() {
                        return [{ month: 1, balance: 100 }];
                    }
                }
            `,
        });
        await engine.loadProject(project);
        await engine.boot();

        let tableData: any = null;
        engine.onNodeDataChanged('myWorkbook', 'renderLoanScheduleTable', (data: any) => {
            tableData = data;
        });

        engine.executeWorkbook('myWorkbook', 'renderLoanScheduleTable');

        expect(tableData).toEqual([{month: 1, balance: 100}]);
    });
});
