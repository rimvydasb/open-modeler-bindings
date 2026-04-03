import { 
    node, 
    inputListNode, 
    chartNode, 
    outputTableNode, 
    evalWorkbook,
    mutateInput
} from "../../src/bindings.ts";
import { calculateMonthlyPayment, generateLoanSchedule } from "./library.ts";
import type { LoanInputs } from "./types.ts";

export const INPUT_VARIABLES: LoanInputs = {
    loanAmount: 100000,
    annualInterestRate: 5.0,
    termMonths: 12,
    startDate: new Date('2026-04-01'),
};

export const myWorkbook = (context: Record<string, any>): Record<string, any> => ({
    inputVariables: inputListNode("inputVariables", INPUT_VARIABLES),

    calculateMonthlyPayment: node(calculateMonthlyPayment, {
        principal: () => context.inputVariables().rows.loanAmount,
        months: () => context.inputVariables().rows.termMonths,
        annualRate: () => context.inputVariables().rows.annualInterestRate,
    }),

    generateLoanSchedule: node(generateLoanSchedule, {
        loanAmount: () => context.inputVariables().rows.loanAmount,
        monthlyPayment: () => context.calculateMonthlyPayment().monthlyPayment,
        annualInterestRate: () => context.inputVariables().rows.annualInterestRate,
        termMonths: () => context.inputVariables().rows.termMonths,
        startDate: () => context.inputVariables().rows.startDate,
    }),

    renderLoanBalanceChart: chartNode("renderLoanBalanceChart", {
        input: () => context.generateLoanSchedule().loanSchedule,
    }),

    renderLoanScheduleTable: outputTableNode("renderLoanScheduleTable", {
        rows: () => context.generateLoanSchedule().loanSchedule,
    }),
});

if (import.meta.main) {
    const workbook = evalWorkbook(myWorkbook);
    console.log(JSON.stringify(workbook, null, 2));
}
