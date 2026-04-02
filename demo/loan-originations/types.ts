export interface Customer {
    firstName: string;
    lastName: string;
    birthday: Date;
}

export interface Application {
    customer: Customer;
    requestedAmount: number;
    termMonths: number;
}
