export interface PaymentLine {
    paymentDate: Date;
    amount: number;
    principalPaid: number;
    interestPaid: number;
    remainingBalance: number;
}

export interface LoanInputs {
    loanAmount: number;
    annualInterestRate: number;
    termMonths: number;
    startDate: Date;
}
