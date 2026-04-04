# Open Model TypeScript (OpenModelTS) Specification

## 1. Introduction

OpenModelTS is a declarative, reactive execution engine designed to sandbox pure domain logic within a QuickJS WASM
virtual machine. It employs a hybrid Pull/Push reactivity strategy based on a Directed Acyclic Graph (DAG).

To maximize developer experience, readability, and type safety, OpenModelTS leverages **Modern TypeScript (Stage 3)
Class Decorators**. This specification outlines the declarative modeling approach, allowing developers to define complex
dependency graphs using standard class properties, getters, and methods without manual wiring.

---

## 2. Core Concepts & Decorators

The declarative model is defined as a standard TypeScript `class`. The engine automatically discovers dependencies and
orchestrates execution based on the decorators applied to the class members.

### 2.1 `@Workbook` (Class Decorator)

Marks a class as an OpenModelTS Workbook. This acts as the container for the reactive graph.

* **Purpose:** Registers the class with the engine and prepares it for execution.
* **Usage:** Applied to the class declaration.

### 2.2 `@Input` (Accessor Decorator)

Defines a reactive input node. Inputs are the root sources of data in the DAG.

* **Purpose:** Intercepts property reads (to register as a dependency for downstream nodes) and property writes (to
  trigger push-invalidation of the DAG).
* **Usage:** Must be applied to an `accessor` property (a TS 5.0+ feature that automatically generates a backing field,
  getter, and setter).

### 2.3 `@Node` (Getter Decorator)

Defines a derived, computed node in the DAG.

* **Purpose:** Intercepts getter access to provide **memoization** and **automatic dependency tracking**. When a `@Node`
  getter is accessed, the engine checks if it is stale. If not, it returns the cached result. If stale, it executes the
  getter body. Any other `@Node` or `@Input` accessed during this execution is automatically registered as a dependency.
* **Usage:** Applied to `get` accessors.

### 2.4 `@Chart` and `@Table` (Getter Decorators)

Defines terminal (leaf) nodes specifically for data visualization or output.

* **Purpose:** Similar to `@Node`, but these decorators specifically emit host-environment events (`nodeDataChanged`)
  when evaluated and may opt out of strict caching to ensure fresh data is always provided to the UI.
* **Usage:** Applied to `get` accessors.

---

## 3. Model Declaration

OpenModelTS utilizes class getters and decorators. Dependencies are auto-discovered through standard `this.` property
access.

```typescript
import {Workbook, Input, Node, Chart, Table} from "@open-modeler/bindings";
import {calculateMonthlyPayment, generateLoanSchedule} from "./library";
import {INPUT_VARIABLES} from "./types";

@Workbook
export class LoanScheduleModel {

    // 1. Reactive Input
    @Input
    accessor variables = INPUT_VARIABLES;

    // 2. Computed Node (Auto-tracked & Memoized)
    @Node
    get monthlyPayment() {
        return calculateMonthlyPayment({
            principal: this.variables.loanAmount,
            months: this.variables.termMonths,
            annualRate: this.variables.annualInterestRate,
        });
    }

    // 3. Dependent Node (Reads from other @Nodes)
    @Node
    get schedule() {
        return generateLoanSchedule({
            loanAmount: this.variables.loanAmount,
            monthlyPayment: this.monthlyPayment.monthlyPayment, // 100% Type-Safe property access
            annualInterestRate: this.variables.annualInterestRate,
            termMonths: this.variables.termMonths,
            startDate: this.variables.startDate,
        });
    }

    // 4. Visualization Output
    @Table
    get scheduleTable() {
        return this.schedule.loanSchedule;
    }
}
```

---

## 4. Execution Mechanics & Reactivity

### 4.1 Dependency Discovery (Pull)

When `this.scheduleTable` is requested for the first time:

1. The `@Table` decorator intercepts the call and marks `scheduleTable` as the `ACTIVE_EVALUATING_NODE`.
2. It reads `this.schedule`.
3. The `@Node` decorator for `schedule` intercepts the call, marks `schedule` as active, and executes its body.
4. Because `scheduleTable` was active when `schedule` was called, a dependency edge (`schedule -> scheduleTable`) is
   recorded.
5. This process recurses up the chain until inputs are reached, building the DAG entirely through native JavaScript
   property access.

### 4.2 Invalidation (Push)

When an input is mutated from the host environment (e.g., `model.variables = newData`):

1. The `@Input` setter intercepts the assignment.
2. It updates the internal `TRACE_STORE` with the new data.
3. It triggers the `invalidateDownstream` algorithm, recursively marking all dependent nodes (e.g., `monthlyPayment`,
   `schedule`, `scheduleTable`) as `stale: true`.

### 4.3 Memoization

When a node is accessed:

1. The `@Node` decorator checks the `TRACE_STORE`.
2. If `stale` is `false` and an `output` exists, it returns the cached output immediately without executing the getter
   body.
3. If `stale` is `true`, it executes the getter body, updates the cache, sets `stale` to `false`, and returns the new
   result.

---

## 5. Type Safety & Editor Support

Because this specification relies on standard TypeScript classes:

* **IntelliSense:** IDEs will provide perfect autocompletion for `this.monthlyPayment.monthlyPayment`.
* **Refactoring:** Renaming a property in the library function will immediately flag type errors in the Workbook class
  if the property no longer exists.
* **No Magic Strings:** Dependency wiring no longer relies on matching string keys in an `inputs` object.

## 6. Implementation Notes for `bindings.ts` Refactoring

To support this specification, `src/bindings.ts` provides:

1. Exported decorator functions (`@Workbook`, `@Input`, `@Node`, `@Chart`, `@Table`) utilizing TS 5.0
   `ClassGetterDecoratorContext` and `ClassAccessorDecoratorContext`.
2. `executeWithTracking` function that handles class instance contexts and property-based identification.
3. `evalWorkbook` and `mutateInput` host-bridge functions that interact seamlessly with Workbook classes.

---

## 7. Implementation Plan

The transition to the modern declarative approach has been executed in three distinct phases.

### Phase 1: Framework Enhancement (`src/bindings.ts`) [DONE]

- [x] **Core Decorators:** Implement and export `@Workbook`, `@Node`, `@Chart`, `@Table`, and `@Input`.
- [x] **Context Awareness:** Update `executeWithTracking` to handle class instance contexts and property-based
  identification.
- [x] **Class Lifecycle:** Update `evalWorkbook` to support modern class constructors.
- [x] **Mutation Bridge:** Update `mutateInput` to correctly target class `accessor` properties.

### Phase 2: Engine & Tooling Verification [DONE]

- [x] **Transpilation Audit:** Verify that `OpenModelTSEngine` correctly sanitizes and bundles the new `__esDecorate`
  and `__runInitializers` helpers generated by TypeScript.
- [x] **Unit Testing:** Refactor core tests to verify the new syntax in isolation.
- [x] **Regression Testing:** Run existing tests to ensure zero regressions in the core reactivity engine.

### Phase 3: Demo Migration & Validation [DONE]

- [x] **Loan Schedule Demo:** Refactor `demo/loan-schedule/main.ts` to use the new class-based decorator syntax.
- [x] **Loan Originations Demo:** Refactor `demo/loan-originations/main.ts` to use the new class-based decorator syntax.
- [ ] **GUI Integration:** Verify that the `loan-schedule-gui` correctly visualizes the graph and reacts to changes when
  using the new model definition.



