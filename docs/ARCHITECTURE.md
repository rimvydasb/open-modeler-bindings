# System Architecture

## Overview

Open Modeler TypeScript is a high-performance, browser-ready execution engine designed to sandbox pure domain logic
within a QuickJS WebAssembly (WASM) virtual machine. It provides a reactive environment where business models
(Workbooks) are defined using standard TypeScript decorators, enabling transparent dependency tracking and efficient
updates through a Directed Acyclic Graph (DAG).

## Modules Dependency Diagram

The system is organized into decoupled modules, utilizing path aliases for clear architectural boundaries.

```mermaid
graph TD
    subgraph Engine_Module [Execution Engine: @open-modeler-engine]
        Engine[OpenModelTSEngine]
    end

    subgraph Project_Module [TS Project: @open-modeler-ts-project]
        ATS[ATSProjectInstance]
        Local[LocalTSProject]
        Web[WebTarTSProject]
        Inline[InlineTSProject]
    end

    subgraph Bindings_Module [Reactivity Bindings: @open-modeler-bindings]
        Decorators["Decorators (@Workbook, @TermsSet, ...)"]
        Core["Core Framework (evalWorkbook, mutateInput)"]
    end

    subgraph External_Deps [External Components]
        TSMorph["ts-morph (VFS & Transpilation)"]
        QuickJS["quickjs-emscripten (WASM VM)"]
    end

    subgraph Demo_Projects [Demo Projects]
        Demos["loan-schedule, credit-eligibility, etc."]
    end

    %% Dependencies
    Engine -->|Consumes| ATS
    Engine -->|Orchestrates| QuickJS

    ATS --> TSMorph
    Local -->|Extends| ATS
    Web -->|Extends| ATS
    Inline -->|Extends| ATS

    Project_Module -.->|Bundles into VM| Bindings_Module

    Demo_Projects -->|Uses| Decorators
    Demo_Projects -.->|Loaded by| Engine
```

### Module Aliases

To maintain a clean separation of concerns and simplify imports, the following path aliases are used throughout the
project:

- **`@open-modeler-bindings/*`**: Points to the reactivity framework core (`src/bindings/v1alpha/`).
- **`@open-modeler-engine/*`**: Points to the host-side execution engine (`src/engine/`).
- **`@open-modeler-ts-project/*`**: Points to the project sourcing and bundling logic (`src/ts-project/`).

## Business Terminology & Mental Model

- **Host Environment:** The outer runtime (Node.js, Browser) managing the UI and the lifecycle of the engine.
- **Engine (OpenModelTSEngine):** The core orchestrator. It consumes bundled code from **TSProjectInstance**, manages
  the Host-VM bridge, and handles reactive execution.
- **TSProjectInstance:** An abstraction layer for sourcing, transpiling (via `ts-morph`), and bundling TypeScript
  models. It supports local file systems (via `package.json` or archives), remote URLs (via GitHub releases), and inline
  memory maps.

- **VM (Sandboxed Environment):** The QuickJS WASM instance where domain logic executes securely.
- **Workbook:** A TypeScript class decorated with `@Workbook` that defines the reactive model.
- **Node:** A discrete unit of execution (Input, Function, or Sink).
- **TermsSet:** A specialized collection of lazily-evaluated terms for granular tracking.
- **Pull Phase:** The discovery and evaluation process that builds the DAG and memoizes results.
- **Push Phase:** The invalidation process that marks downstream nodes as "stale" when an input changes.
- **Transparent Reactivity:** The framework's ability to intercept property access to track dependencies automatically.

## High-Level Architecture

The system is divided into three primary layers: the **Host Application**, the **Engine Orchestrator**, and the
**Sandboxed VM**.

```mermaid
graph TB
    subgraph Host_Environment [Host Environment]
        App[Host Application]
        Engine[OpenModelTSEngine]
    end

    subgraph WASM_Sandbox [WebAssembly Sandbox]
        subgraph QuickJS_VM [QuickJS VM]
            Framework[Reactivity Framework]
            Model[Domain Model / Workbook]
        end
    end

    App <--> Engine
    Engine -- "Transpiles & Boots" --> VM
    Engine -- "JSON RPC / Events" --> Framework
    Framework <--> Model
```

## Communication Flow

The interaction between the Host and the VM follows a strict bridge pattern for security and predictability.

```mermaid
sequenceDiagram
    participant Host as Host Application
    participant Engine as OpenModelTSEngine
    participant Project as TSProjectInstance
    participant VM as QuickJS VM / Framework

    Note over Host, VM: 1. Preparation
    Host ->> Engine: loadProject(Project)
    Engine ->> Project: load() & emitJs()
    Project -->> Engine: Bundled & Sanitized JS

    Note over Host, VM: 2. Initialization
    Host ->> Engine: boot()
    Engine ->> VM: Create Context & Inject Bridges
    Engine ->> VM: Evaluate JS Bundle

    Note over Host, VM: 3. Execution (Pull)
    Host ->> Engine: executeWorkbook("MyWorkbook")
    Engine ->> VM: callVm("evalWorkbook")
    VM -->> Engine: Serialized Results
    Engine -->> Host: Typed Data

    Note over Host, VM: 4. Interaction (Push)
    Host ->> Engine: mutate("inputA", value)
    Engine ->> VM: callVm("mutateInput")
    VM -->> VM: Invalidate DAG
    VM ->> Engine: emitEvent("nodeDataChanged")
    Engine ->> Host: Trigger Callback
```

## Detailed Specifications

The architecture is further detailed in the following specialized documents:

| Document                                                   | Description                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [**OpenModelTSEngine Spec**](./ENGINE_SPEC.md)             | Details on transpilation, sanitization, VM bridging, and Host-side API.                          |
| [**Bindings & Reactivity Spec**](./BINDINGS_SPEC.md)       | In-depth look at the DAG, Trace Store, Pull/Push mechanics, and Decorators.                      |
| [**TS Project Spec**](./TS_PROJECT_SPEC.md)                | Specification for managing and bundling TypeScript projects through various sourcing strategies. |
| [**OpenModelTS Spec**](./OPEN_MODEL_TS_SPEC.md)            | Developer-facing guide on modeling patterns, decorators, and type safety.                        |
| [**Project Structure Spec**](./OPEN_MODEL_PROJECT_SPEC.md) | Requirements for `package.json` and file organization in an Open Model project.                  |
