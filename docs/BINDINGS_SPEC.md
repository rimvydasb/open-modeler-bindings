# UI Bindings & Eventing Model

The framework strictly distinguishes between pure calculation nodes and UI-bound visualization nodes to preserve the
purity of the domain model while offering a fast bridge to the Host Application.

### The "Sink Node" Concept

*Architectural Clarification:* `@ChartNode` and `@OutputNode` act as **Sink Nodes** (or Effect Nodes). Unlike pure
calculation `@FunctionNode` instances, they do not produce new data meant for downstream consumption within the VM's
Directed
Acyclic Graph (DAG).

Because inputs are visualized and they do not produce new domain data, **Sink Nodes bypass the `TRACE_STORE`**. Storing
their results in the VM trace is redundant and uses unnecessary memory. Instead, their sole responsibility is to
evaluate their upstream dependencies and push that data directly to the Host Environment by triggering the
`onNodeDataChanged` event.

| Node Type       | Architectural Role | VM Trace Behavior     | Associated Events                                                | Description                                                                                                        |
|-----------------|--------------------|-----------------------|------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| `@InputNode`    | Source Node        | Cached in Trace       | `onNodeDataChanged`                                              | Captures user inputs from GUI. Use `mutate` to trigger change and push invalidation.                               |
| `@FunctionNode` | Calculation Node   | Cached in Trace       | `onBeforeNodeExecution`,<br>`onAfterNodeExecution`               | Pure business logic computation. Memoizes results to prevent redundant calculation.                                |
| `@TermsNode`    | Container Node     | Bypasses Trace (Self) | `onBeforeTermExecution`,<br>`onAfterTermExecution` (Inner terms) | Instantiates a `TermsSet`. Skips self-events; inner terms are cached granularly.                                   |
| `@ChartNode`    | Sink / Effect Node | **Bypasses Trace**    | `onNodeDataChanged`                                              | Evaluates data specifically for Chart rendering. Pushes data directly to the Host.                                 |
| `@OutputNode`   | Sink / Effect Node | **Bypasses Trace**    | `onNodeDataChanged`                                              | Evaluates data specifically for various output renderings (scalar, list, table). Pushes data directly to the Host. |


