const TRACE_STORE: Record<string, any> = {};

/**
 * Generic evaluator for workbook-style dependency graphs.
 * This is a pull strategy evaluation.
 * Clears the trace before execution and returns the final trace store.
 */
export function evalWorkbook<T extends Record<string, any>>(
    workbookLoader: (context: any) => T,
    nodeName: keyof T
): any {
    clearTrace();

    const context: any = {};
    const workbook = workbookLoader(context);
    Object.assign(context, workbook);

    if (typeof workbook[nodeName] === 'function') {
        workbook[nodeName]();
        return TRACE_STORE;
    }
    throw new Error(`Node "${String(nodeName)}" not found in workbook.`);
}

/**
 * Retrieves a value from the trace store using a dot-notated path.
 * e.g., getFromTrace("nodeName.input.param")
 */
export function getFromTrace(path: string): any {
    const parts = path.split('.');
    let current = TRACE_STORE;
    for (const part of parts) {
        if (current === undefined || current === null) return undefined;
        current = current[part];
    }
    return current;
}

/**
 * Records a value in the trace store using a dot-notated path.
 * e.g., trace("nodeName.output", value)
 */
export function trace(path: string, value: any): any {
    const parts = path.split('.');
    let current = TRACE_STORE;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (current[part] === undefined) {
            current[part] = {};
        }
        current = current[part];
    }
    current[parts[parts.length - 1]] = value;
    return value;
}

export function clearTrace(): void {
    for (const key in TRACE_STORE) {
        delete TRACE_STORE[key];
    }
}

// Standardized input resolver
function resolveValue<T>(input: T | (() => T)): T {
    return typeof input === 'function' ? (input as () => T)() : input;
}

export function node<T, P extends object>(
    invocation: (arg: P) => T,
    inputs?: { [K in keyof P]: P[K] | (() => P[K]) }
): () => T {
    const nodeName = invocation.name;
    return () => {
        // PERFORMANCE: Direct access to TRACE_STORE without path parsing
        let nodeTrace = TRACE_STORE[nodeName];
        if (nodeTrace?.output !== undefined) return nodeTrace.output;

        let completeInputs = {} as P;
        if (inputs) {
            if (!nodeTrace) {
                nodeTrace = TRACE_STORE[nodeName] = {};
            }
            if (!nodeTrace.input) {
                nodeTrace.input = {};
            }
            const inputTrace = nodeTrace.input;

            for (const key in inputs) {
                const candidate = inputTrace[key];
                if (candidate !== undefined) {
                    completeInputs[key as keyof P] = candidate;
                } else {
                    const value = resolveValue(inputs[key] as any);
                    completeInputs[key as keyof P] = value;
                    inputTrace[key] = value;
                }
            }
        }

        const result = invocation(completeInputs);

        // Ensure nodeTrace exists if it wasn't created in the inputs block
        if (!TRACE_STORE[nodeName]) {
            TRACE_STORE[nodeName] = {};
        }
        TRACE_STORE[nodeName].output = result;

        return result;
    };
}

export function chartNode<T>(
    nodeName: string,
    inputs: { input: T | (() => T) }
): () => void {
    return () => {
        const data = resolveValue(inputs.input);
        console.log(`[Chart: ${nodeName}] processing ${Array.isArray(data) ? data.length : 1} items.`);
    };
}

export function outputTableNode<T>(
    tableName: string,
    inputs: { rows: T[] | (() => T[]) }
): () => void {
    return () => {
        const data = resolveValue(inputs.rows);
        console.log(`[Table: ${tableName}] processing ${Array.isArray(data) ? data.length : 1} items.`);
    };
}

/**
 * T is an array or object of already resolved values.
 * Initial values will be taken as default, but can be edited.
 *
 * @param listName
 * @param inputs
 */
export function inputListNode<T>(
    listName: string,
    inputs: T
): () => { rows: T } {
    return () => {
        console.log(`[Input List: ${listName}]`);
        return {
            rows: inputs,
        }
    };
}

/**
 * @projectName Example Loan Return Application
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
    annualInterestRate: 5.0,
    termMonths: 12,
    startDate: new Date('2026-04-01'),
};

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

        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return {
        loanSchedule: schedule
    }
}

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
    console.log("Starting pull execution via evaluator...");
    eval_myWorkbook("renderLoanBalanceChart");
    eval_myWorkbook("renderLoanScheduleTable");

    console.log("Execution Trace:");
    console.log(JSON.stringify(TRACE_STORE, null, 4));
}
