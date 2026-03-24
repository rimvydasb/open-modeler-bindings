import { PaymentLine } from "./types.ts";

export function calculateMonthlyPayment({principal, annualRate, months}: {
    principal: number;
    annualRate: number;
    months: number;
}): {
    monthlyPayment: number
} {
    console.log("[user defined] calculateMonthlyPayment...");

    const monthlyRate = annualRate / 100 / 12;
    if (monthlyRate === 0) return {
        monthlyPayment: principal / months
    };

    return {
        monthlyPayment: (principal * (monthlyRate * Math.pow(1 + monthlyRate, months))) / (Math.pow(1 + monthlyRate, months) - 1)
    }
}

export function generateLoanSchedule({loanAmount, monthlyPayment, annualInterestRate, termMonths, startDate}: {
    loanAmount: number,
    monthlyPayment: number,
    annualInterestRate: number,
    termMonths: number,
    startDate: Date
}): { loanSchedule: PaymentLine[] } {

    console.log("[user defined] generateLoanSchedule...");

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
