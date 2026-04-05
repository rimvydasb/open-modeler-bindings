# GEMINI.md - Instructional Context for Open Modeler Bindings

## Project Overview

`open-modeler-bindings` is a robust, browser-ready TypeScript execution engine designed to sandbox pure domain logic
within a QuickJS WASM virtual machine. It implements a hybrid Pull/Push reactivity strategy, enabling efficient and
transparent updates to complex dependency graphs.

### Main Technologies

- **TypeScript:** Primary language for both the engine and the domain models.
- **ts-morph:** Facilitates in-memory transpilation and VFS management, allowing TypeScript to run without physical file
  system access.
- **quickjs-emscripten:** Provides the sandboxed QuickJS WASM VM for secure execution.
- **Node.js (v24+):** The development runtime (recently migrated from Deno).
- **tsx:** High-performance TypeScript loader for the Node.js test runner.

### Architecture & Key Components

- **`OpenModelTSEngine` (`src/OpenModelTSEngine.ts`):** The core orchestrator. It handles the full lifecycle: loading TS
  files into a virtual project, transpiling them to sanitized JS, booting the QuickJS VM, and executing functions or
  mutations.
- **Reactivity Framework (`src/bindings/v1alpha/bindings.ts`):** Implements a Directed Acyclic Graph (DAG) for reactive calculations.
    - **Discovery Pulls:** Automatically discovers dependencies during the first execution via `ACTIVE_EVALUATING_NODE`
      tracking.
    - **Invalidation Pushes:** When an input is mutated via `mutateInput`, it pushes invalidation signals downstream to
      mark dependent nodes as "stale."
    - **Memoization:** Results are cached in `TRACE_STORE` and only re-evaluated if a dependency has changed.
- **Sanitization Pipeline:** The engine strips ESM/CJS boilerplate (imports, exports, "use strict") from transpiled code
  to ensure compatibility with the VM's global scope.

## Building and Running

### Essential Commands

- **Run Tests:** `npm test` (Runs all `tests/*.ts` using the native Node.js test runner and `tsx`).
- **Build Project:** `npm run build` (Compiles TypeScript using `tsc`).
- **Dependency Management:** `npx ncu -u` (Updates dependencies to the latest stable versions).

### Project Configuration

- **Node.js Version:** Requires `>=24.0.0` (specified in `package.json`).
- **Entry Point:** `src/OpenModelTSEngine.ts` for the engine; `src/bindings/v1alpha/bindings.ts` for the framework.

## Development Conventions

### 1. In-Memory Purity

The engine is designed to be "browser-ready." Do not introduce physical file system dependencies (like `fs` or `tmp/`)
into the code that runs inside the VM. All source files must be loaded into the `OpenModelTSEngine` via `loadProject`.

### 2. Reactivity Logic

When defining domain models (e.g., in `demo/loan-schedule/`), use the decorators from `@open-modeler-bindings/v1alpha/bindings`. This ensures that the engine can correctly track and invalidate dependencies.

### 3. Testing Standards

- **Framework Testing:** Always test against the actual `src/bindings/v1alpha/bindings.ts` logic.
- **Engine Testing:** Use `loadProject` with both virtual (in-memory strings) and physical (using `readFileSync`) file
  inputs to verify robustness.
- **Sanitization Verification:** If adding new TS features, verify that the `sanitize` regex in `OpenModelTSEngine.ts`
  correctly handles the emitted JS.

### 4. Code Standards

- **Indentation:** 4 spaces (standard for this project).
- **Line Length:** Maximum 120 characters.
- **Naming:** Descriptive names for all variables and functions; no abbreviations.
