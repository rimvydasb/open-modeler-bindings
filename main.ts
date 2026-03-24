const TRACE_STORE: Record<string, any> = {};

export function getFromTrace(name: string): any {
    return TRACE_STORE[name];
}

export function trace<T>(name: string, value: T): T {
    TRACE_STORE[name] = value;
    return value;
}

export function clearTrace(): void {
    for (const key in TRACE_STORE) {
        delete TRACE_STORE[key];
    }
}

// Standardized input resolver
function resolve<T>(input: T | (() => T)): T {
    return typeof input === 'function' ? (input as () => T)() : input;
}

export function node<T, P extends object>(
    invocation: (arg: P) => T,
    inputs?: { [K in keyof P]: P[K] | (() => P[K]) }
): () => T {
    const nodeName = invocation.name;
    return () => {
        const precalculated = getFromTrace(nodeName);
        if (precalculated !== undefined) return precalculated;

        let completeInputs = {} as P;
        if (inputs) {
            for (const key in inputs) {
                const traceKey = `${nodeName}.input.${key}`;
                let candidate = getFromTrace(traceKey);

                if (candidate !== undefined) {
                    completeInputs[key as keyof P] = candidate;
                } else {
                    // Resolve triggers the PULL
                    completeInputs[key as keyof P] = resolve(inputs[key] as any);
                    trace(traceKey, completeInputs[key as keyof P]);
                }
            }
        }
        return trace(nodeName, invocation(completeInputs));
    };
}

export function chartNode<T>(
    nodeName: string,
    inputs: { input: T | (() => T) }
): () => void {
    return () => {
        // This resolution triggers the upstream generateLoanSchedule()
        const data = resolve(inputs.input);
        console.log(`[Chart: ${nodeName}] processing ${Array.isArray(data) ? data.length : 1} items.`);
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
function calculateMonthlyPayment({ principal, annualRate, months }: {
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
function generateLoanSchedule({ loanAmount, monthlyPayment, annualInterestRate, termMonths, startDate }: {
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

export const defineWorkbook = (context: any) => ({
    inputVariables: INPUT_VARIABLES,

    calculateMonthlyPayment: node(calculateMonthlyPayment, {
        principal: () => context.inputVariables.loanAmount,
        months: () => context.inputVariables.termMonths,       // Fixed mapping
        annualRate: () => context.inputVariables.annualInterestRate, // Fixed mapping
    }),

    generateLoanSchedule: node(generateLoanSchedule, {
        loanAmount: () => context.inputVariables.loanAmount,
        monthlyPayment: () => context.calculateMonthlyPayment().monthlyPayment,
        annualInterestRate: () => context.inputVariables.annualInterestRate,
        termMonths: () => context.inputVariables.termMonths,
        startDate: () => context.inputVariables.startDate,
    }),

    renderLoanBalanceChart: chartNode("renderLoanBalanceChart", {
        input: () => context.generateLoanSchedule().loanSchedule,
    }),
});

if (import.meta.main) {
    const workbook = {} as any;

    // 1. Define nodes and bind them to the workbook context
    const nodes = defineWorkbook(workbook);

    // 2. Wire the context so nodes can find each other
    Object.assign(workbook, nodes);

    // 3. Trigger the Pull from the leaf node
    console.log("Starting pull execution...");
    workbook.renderLoanBalanceChart();

    // 4. Inspect the trace
    console.log("Execution Trace:");
    console.log(JSON.stringify(TRACE_STORE, null, 4));
}
