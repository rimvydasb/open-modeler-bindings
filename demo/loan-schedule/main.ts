import {
    Workbook,
    Input,
    Node,
    Chart,
    Table, evalWorkbook
} from "../../src/bindings.ts";
import { calculateMonthlyPayment, generateLoanSchedule } from "./library.ts";
import type { LoanInputs } from "./types.ts";

export const INPUT_VARIABLES: LoanInputs = {
    loanAmount: 100000,
    annualInterestRate: 5.0,
    termMonths: 12,
    startDate: new Date('2026-04-01'),
};

@Workbook
export class myWorkbook {
    @Input
    accessor inputVariables = INPUT_VARIABLES;

    @Node
    get calculateMonthlyPayment() {
        return calculateMonthlyPayment({
            principal: this.inputVariables.loanAmount,
            months: this.inputVariables.termMonths,
            annualRate: this.inputVariables.annualInterestRate,
        });
    }

    @Node
    get generateLoanSchedule() {
        return generateLoanSchedule({
            loanAmount: this.inputVariables.loanAmount,
            monthlyPayment: this.calculateMonthlyPayment.monthlyPayment,
            annualInterestRate: this.inputVariables.annualInterestRate,
            termMonths: this.inputVariables.termMonths,
            startDate: this.inputVariables.startDate,
        });
    }

    @Chart
    get renderLoanBalanceChart() {
        return this.generateLoanSchedule.loanSchedule;
    }

    @Table
    get renderLoanScheduleTable() {
        return this.generateLoanSchedule.loanSchedule;
    }
}

if (import.meta.main) {
    const workbook = evalWorkbook(myWorkbook);
    console.log(JSON.stringify(workbook, null, 2));
}