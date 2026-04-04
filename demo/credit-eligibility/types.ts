export interface Applicant {
    id: string;
    firstName: string;
    lastName: string;
    age: number;
    annualIncome: number;
    creditScore: number;
}

export interface CreditApplication {
    id: string;
    requestedAmount: number;
    termMonths: number;
    applicants: Applicant[];
}

export interface EligibilityResult {
    eligible: boolean;
    reason?: string;
}
