export function getFromTrace(name: string): any {
    // external function
    return null;
}

export function trace<T>(name: string, value: T): T {
    // external function
    return value;
}

// Corrected Execution Lifecycle
export function node<T, P extends object>(
    invocation: (arg: P) => T,
    inputs?: { [K in keyof P]: P[K] | (() => P[K]) }
): () => T {
    const nodeName = invocation.name;

    // Return the thunk immediately. Do the work ONLY when invoked.
    return () => {
        const precalculated = getFromTrace(nodeName);
        if (precalculated !== undefined) return precalculated;

        let completeInputs = {} as P;
        if (inputs) {
            const inputNames = Object.keys(inputs) as Extract<keyof P, string>[];
            for (const key of inputNames) {
                const traceKey = `${nodeName}.input.${key}`;
                let candidate = getFromTrace(traceKey);
                if (candidate !== undefined) {
                    completeInputs[key] = candidate;
                } else {
                    const valueOrFn = inputs[key];
                    completeInputs[key] = typeof valueOrFn === 'function'
                        ? (valueOrFn as () => P[typeof key])()
                        : valueOrFn as P[typeof key];
                    trace(traceKey, completeInputs[key]);
                }
            }
        }
        return trace(nodeName, invocation(completeInputs));
    };
}

export function chartNode<T>(
    nodeName: string,
    inputs: { input: T }
): () => void {
    return () => {
        // Logic for chart_hook(inputs.input) goes here - this is external function that pushes chart data
    };
}

/**
 * @projectName Example Loan Return Application
 *
 * @description:
 * Configure the INPUT_VARIABLES below with your loan details.
 * The application generates a loan schedule which can be visualized
 * using the chart function (to plot remaining loan balance) or the
 * table function (to display payment lines).
 */

interface PaymentLine {
    paymentDate: Date;
    amount: number;
    principalPaid: number;
    interestPaid: number;
    remainingBalance: number;
}

const INPUT_VARIABLES = {
    loanAmount: 100000,
    annualInterestRate: 5.0, // in percentage
    termMonths: 360, // 30 years
    startDate: new Date('2026-04-01'),
};

/**
 * Calculates the fixed monthly payment for a loan based on the principal, annual interest rate, and loan term in months.
 *
 * @param principal
 * @param annualRate
 * @param months
 * @return monthlyPayment
 */
function calculateMonthlyPayment({principal, annualRate, months}: {
    principal: number;
    annualRate: number;
    months: number;
}): {
    monthlyPayment: number
} {
    const monthlyRate = annualRate / 100 / 12;
    if (monthlyRate === 0) return {
        monthlyPayment: principal / months
    };

    return {
        monthlyPayment: (principal * (monthlyRate * Math.pow(1 + monthlyRate, months))) / (Math.pow(1 + monthlyRate, months) - 1)
    }
}

/**
 *
 * @param monthlyPayment
 * @param annualInterestRate
 * @param termMonths
 * @param startDate
 * @return loanSchedule
 */
function generateLoanSchedule({loanAmount, monthlyPayment, annualInterestRate, termMonths, startDate}: {
                                  loanAmount: number,
                                  monthlyPayment: number,
                                  annualInterestRate: number,
                                  termMonths: number,
                                  startDate: Date
                              }
): { loanSchedule: PaymentLine[] } {
    const monthlyRate = annualInterestRate / 100 / 12;

    let currentBalance = loanAmount;
    let currentDate = new Date(startDate);
    const schedule: PaymentLine[] = [];

    for (let month = 1; month <= termMonths; month++) {
        const interestPaid = currentBalance * monthlyRate;
        let principalPaid = monthlyPayment - interestPaid;

        // Handle last month rounding
        if (month === termMonths) {
            principalPaid = currentBalance;
        }

        currentBalance -= principalPaid;

        schedule.push({
            paymentDate: new Date(currentDate),
            amount: principalPaid + interestPaid,
            principalPaid,
            interestPaid,
            remainingBalance: Math.max(0, currentBalance),
        });

        // Advance to next month
        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return {
        loanSchedule: schedule
    }
}

const workbook: any = {
    /**
     * @nodeType list
     * @displayName Input Variables
     */
    inputVariables: INPUT_VARIABLES,

    /**
     * @nodeType function
     * @displayName Monthly Payment
     */
    calculateMonthlyPayment: node(calculateMonthlyPayment, {
        principal: () => workbook.inputVariables.loanAmount,
        months: () => workbook.inputVariables.annualInterestRate,
        annualRate: () => workbook.inputVariables.termMonths,
    }),

    /**
     * @nodeType function
     * @displayName Loan Schedule
     */
    generateLoanSchedule: node(generateLoanSchedule, {
        loanAmount: () => workbook.inputVariables.loanAmount,
        monthlyPayment: () => workbook.calculateMonthlyPayment().monthlyPayment,
        annualInterestRate: () => workbook.inputVariables.annualInterestRate,
        termMonths: () => workbook.inputVariables.termMonths,
        startDate: () => workbook.inputVariables.startDate,
    }),

    renderLoanBalanceChart: chartNode("renderLoanBalanceChart", {
        input: () => workbook.generateLoanSchedule().loanSchedule,
    }),

    renderLoanScheduleTable: chartNode("renderLoanScheduleTable", {
        input: () => workbook.generateLoanSchedule().loanSchedule,
    }),
}

console.log(JSON.stringify(workbook, null, 2));

class MyWorkbook {

    get inputVariables() {
        return INPUT_VARIABLES
    }

    get calculateMonthlyPayment() {
        return node(calculateMonthlyPayment, {
            principal: () => workbook.inputVariables.loanAmount,
            months: () => workbook.inputVariables.annualInterestRate,
            annualRate: () => workbook.inputVariables.termMonths,
        })
    }

    get generateLoanSchedule() {
        return node(generateLoanSchedule, {
            loanAmount: () => workbook.inputVariables.loanAmount,
            monthlyPayment: () => this.calculateMonthlyPayment().monthlyPayment,
            annualInterestRate: () => workbook.inputVariables.annualInterestRate,
            termMonths: () => workbook.inputVariables.termMonths,
            startDate: () => workbook.inputVariables.startDate,
        })
    }
}



const defineWorkbook = (ctx: any) => ({
    inputVariables: INPUT_VARIABLES,

    calculateMonthlyPayment: node(calculateMonthlyPayment, {
        principal: () => ctx.inputVariables.loanAmount,
        months: () => ctx.inputVariables.termMonths,
        annualRate: () => ctx.inputVariables.annualInterestRate,
    }),

    generateLoanSchedule: node(generateLoanSchedule, {
        loanAmount: () => ctx.inputVariables.loanAmount,
        monthlyPayment: () => ctx.calculateMonthlyPayment().monthlyPayment,
        annualInterestRate: () => ctx.inputVariables.annualInterestRate,
        termMonths: () => ctx.inputVariables.termMonths,
        startDate: () => ctx.inputVariables.startDate,
    }),

    renderLoanBalanceChart: chartNode("renderLoanBalanceChart", {
        input: () => workbook.generateLoanSchedule().loanSchedule,
    }),

    renderLoanScheduleTable: chartNode("renderLoanScheduleTable", {
        input: () => workbook.generateLoanSchedule().loanSchedule,
    }),
});

// Bootstrap
const workbook2 = {} as any;
Object.assign(workbook2, defineWorkbook(workbook2));