import { assertEquals, assertExists } from "@std/assert";
import { defineWorkbook, getFromTrace, clearTrace, trace } from "./main.ts";

Deno.test("Pull execution: leaf node triggers upstream chain", () => {
    clearTrace();
    const workbook = {} as any;
    const nodes = defineWorkbook(workbook);
    Object.assign(workbook, nodes);

    // Initial state: nothing in trace
    assertEquals(getFromTrace("calculateMonthlyPayment.output"), undefined);
    assertEquals(getFromTrace("generateLoanSchedule.output"), undefined);

    // Trigger pull
    workbook.renderLoanBalanceChart();

    // Verify upstream nodes were executed and traced
    const monthlyPaymentResult = getFromTrace("calculateMonthlyPayment.output");
    assertExists(monthlyPaymentResult);
    assertEquals(typeof monthlyPaymentResult.monthlyPayment, "number");

    const scheduleResult = getFromTrace("generateLoanSchedule.output");
    assertExists(scheduleResult);
    assertEquals(Array.isArray(scheduleResult.loanSchedule), true);
    assertEquals(scheduleResult.loanSchedule.length, 360);
});

Deno.test("Mapping: calculateMonthlyPayment uses correct inputs", () => {
    clearTrace();
    const workbook = {} as any;
    const nodes = defineWorkbook(workbook);
    Object.assign(workbook, nodes);

    workbook.renderLoanBalanceChart();

    // calculateMonthlyPayment({ principal, annualRate, months })
    // In INPUT_VARIABLES: loanAmount: 100000, annualInterestRate: 5.0, termMonths: 360
    
    // Check inputs recorded in trace using nested path
    assertEquals(getFromTrace("calculateMonthlyPayment.input.principal"), 100000);
    assertEquals(getFromTrace("calculateMonthlyPayment.input.months"), 360);
    assertEquals(getFromTrace("calculateMonthlyPayment.input.annualRate"), 5.0);

    const result = getFromTrace("calculateMonthlyPayment.output");
    // Monthly payment for 100k, 5%, 30y is approx 536.82
    assertEquals(Math.round(result.monthlyPayment * 100) / 100, 536.82);
});

Deno.test("Memoization: subsequent calls use trace", () => {
    clearTrace();
    const workbook = {} as any;
    const nodes = defineWorkbook(workbook);
    Object.assign(workbook, nodes);

    // First call
    workbook.renderLoanBalanceChart();
    
    // Manually modify trace to see if it's used
    const mockResult = { monthlyPayment: 999 };
    trace("calculateMonthlyPayment.output", mockResult);
    
    const secondCallResult = workbook.calculateMonthlyPayment();
    assertEquals(secondCallResult.monthlyPayment, 999);
});
