import {describe, it, expect} from '@jest/globals';
import {OpenModelTSEngine} from '../../src/engine/OpenModelTSEngine.js';
import {LocalTSProject} from '../../src/ts-project/LocalTSProject.js';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

describe('Loan Schedule Integration Test', () => {
    it('evaluates the full workbook correctly via Engine', async () => {
        const engine = new OpenModelTSEngine();
        const project = new LocalTSProject('demo/loan-schedule');

        // We need to provide the bindings manually since LocalTSProject only loads demo files
        // and ts-morph expects them at /src/bindings/
        const bindingsContent = readFileSync('src/bindings/v1alpha/bindings.ts', 'utf-8');

        await project.load();
        // Manually inject bindings into the virtual project
        (project as any).project.createSourceFile('/src/bindings/bindings.ts', bindingsContent);

        await engine.loadProject(project);
        await engine.boot();

        const results = engine.executeWorkbook('myWorkbook');

        // Check terminal nodes in results
        expect(results.renderLoanScheduleTable.length).toBe(12);
        expect(results.renderLoanBalanceChart.length).toBe(12);

        // Check specific values
        expect(results.calculateMonthlyPayment.monthlyPayment).toBeCloseTo(8560.75, 2);
    });

    it('reacts to input mutations in the VM', async () => {
        const engine = new OpenModelTSEngine();
        const project = new LocalTSProject('demo/loan-schedule');
        const bindingsContent = readFileSync('src/bindings/v1alpha/bindings.ts', 'utf-8');

        await project.load();
        (project as any).project.createSourceFile('/src/bindings/bindings.ts', bindingsContent);

        await engine.loadProject(project);
        await engine.boot();

        // 1. Initial check
        const res1 = engine.executeWorkbook('myWorkbook');
        expect(res1.calculateMonthlyPayment.monthlyPayment).toBeCloseTo(8560.75, 2);

        // 2. Mutate input node in VM
        const INPUT_VARIABLES = engine.execute('INPUT_VARIABLES');
        engine.mutate('inputVariables', {
            ...INPUT_VARIABLES,
            loanAmount: 200000,
        });

        // 3. Re-execute
        const res2 = engine.executeWorkbook('myWorkbook');
        expect(res2.calculateMonthlyPayment.monthlyPayment).toBeCloseTo(17121.5, 2);
    });
});
