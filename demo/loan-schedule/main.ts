import { 
    node, 
    inputListNode, 
    chartNode, 
    outputTableNode, 
    evalWorkbook,
    mutateInput
} from "../../src/reactive_graph.ts";
import { calculateMonthlyPayment, generateLoanSchedule } from "./library.ts";
import { LoanInputs } from "./types.ts";

export const INPUT_VARIABLES: LoanInputs = {
    loanAmount: 100000,
    annualInterestRate: 5.0,
    termMonths: 12,
    startDate: new Date('2026-04-01'),
};

export const myWorkbook = (context: any) => ({
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

/**
 * Specifically evaluates a node in myWorkbook and returns the execution trace.
 */
export function eval_myWorkbook(nodeName: string): any {
    return evalWorkbook(myWorkbook, nodeName as any);
}

if (import.meta.main) {
    console.log("--- Initial Evaluation ---");
    eval_myWorkbook("renderLoanScheduleTable");

    console.log("\n--- Mutating Input (Push) ---");
    mutateInput("inputVariables", {
        ...INPUT_VARIABLES,
        loanAmount: 200000,
    });

    console.log("\n--- Second Evaluation (Targeted Pull) ---");
    eval_myWorkbook("renderLoanScheduleTable");
}
