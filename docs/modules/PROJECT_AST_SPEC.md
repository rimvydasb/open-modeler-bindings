# AST Parsing Specification

[project-ast](../../src/project-ast)

## Overview

The AST Parsing service defines the intermediate representation (`ProjectAST`) used to bridge TypeScript source code and
all downstream consumers. The AST is produced by **ts-morph** during the Analysis Phase and serves as the single source
of truth for the project's reactive structure.

In Open Modeler, the AST is not just a generic code tree; it is a **Semantic Model** that understands our `@Workbook`
and `@Node` decorators. It translates raw TypeScript class members into a structured graph representation suitable for
ReactFlow and the Execution Engine.

## Main Concepts

- **Types Editor** and **Flow Editor** are external components (consumers) that are developed using React and ReactFlow.

## Architectural Views

### 1. Analysis & Transformation Pipeline

The AST Parsing layer acts as the **Domain Parser**. It consumes raw source from the Infrastructure layer (Service 2)
and produces a structured `ProjectAST` that the Flow Modeling layer (Service 5) uses to generate the visual graph.

```mermaid
graph TB
    subgraph InfrastructureLayer["Infrastructure Layer"]
        VFS["LocalTSProject / VFS<br/>(Service 2)"]
    end

    subgraph AnalysisLayer["AST Parsing Layer (Service 3)"]
        TSM["ts-morph<br/>Source Parser"]
        SEM["Semantic Analyzer<br/>(Decorator Aware)"]
        AST["OpenModel<br/>Project AST"]
    end

    subgraph ConsumerLayer["Consumer Layer"]
        TE["Types Editor<br/>(Service 4)"]
        FGB["FlowGraph Builder<br/>(Service 5)"]
        EE["Execution Engine<br/>(Service 6)"]
    end

    VFS -- " TypeScript Source " --> TSM
    TSM -- " raw AST " --> SEM
    SEM -- " produces " --> AST
    AST -- " Type Info " --> TE
    AST -- " Port Signatures " --> FGB
    AST -- " Input Metadata " --> EE
    style InfrastructureLayer fill: #f3e5f5, stroke: #6a1b9a
    style AnalysisLayer fill: #fff3e0, stroke: #e65100
    style ConsumerLayer fill: #e3f2fd, stroke: #1565c0
```

## AST Structural Diagram

The `ProjectAST` is organized around the concept of **Workbooks** (containers) and **Nodes** (reactive units).

```mermaid
classDiagram
    direction TB

    class DeclarationLocation {
        +filePath: string
        +line: number
        +column: number
    }

    class DeclarationBase {
        +name: string
        +documentation: string | undefined
        +location: DeclarationLocation
    }

    class ProjectAST {
        +workbooks: WorkbookDeclaration[]
        +termsSets: TermsSetDeclaration[]
        +types: TypeDeclaration[]
        +functions: FunctionDeclarations[]
    }

    class WorkbookDeclaration {
        +nodes: NodeDeclaration[]
    }

    WorkbookDeclaration --|> DeclarationBase

    class TermsSetDeclaration {
    }

    TermsSetDeclaration --|> DeclarationBase

    class FunctionDeclaration {
        +returnType: TypeReference
        +parameters: ParameterInfo[]
        +isAsync: boolean
    }

    FunctionDeclaration --|> DeclarationBase

    class TypeDeclaration {
        +properties: PropertyInfo[]
    }

    TypeDeclaration --|> DeclarationBase

    class NodeDeclaration {
        +nodeType: NodeType
        +returnType: TypeReference
        +parameters: ParameterInfo[]
        +isAsync: boolean
        +metadata: Record~string, any~
    }

    NodeDeclaration --|> DeclarationBase

    class NodeType {
        <<enumeration>>
        INPUT
        FUNCTION
        TERMS
        CHART
        OUTPUT
    }

    class ParameterInfo {
        +name: string
        +type: TypeReference
        +isOptional: boolean
        +defaultValue: string | undefined
    }

    class TypeReference {
        +name: string
        +isArray: boolean
        +isNullable: boolean
        +typeArguments: TypeReference[]
    }

    ProjectAST *-- WorkbookDeclaration
    ProjectAST *-- TermsSetDeclaration
    ProjectAST *-- TypeDeclaration
    WorkbookDeclaration *-- NodeDeclaration
    TermsSetDeclaration *-- NodeDeclaration
    NodeDeclaration o-- NodeType
    NodeDeclaration *-- ParameterInfo
    NodeDeclaration *-- TypeReference
    TypeDeclaration *-- PropertyInfo
```

## Node Mapping Rules

The AST Parser identifies nodes by inspecting TypeScript decorators.

| Decorator       | AST `nodeType` | Description                                                               |
| :-------------- | :------------- | :------------------------------------------------------------------------ |
| `@InputNode`    | `INPUT`        | Source nodes. Maps to `Input` ports in ReactFlow.                         |
| `@FunctionNode` | `FUNCTION`     | Calculation nodes. Maps to standard `Processing` nodes.                   |
| `@TermsNode`    | `TERMS`        | Container nodes. Maps to `Sub-graph` or `Group` anchors.                  |
| `@ChartNode`    | `CHART`        | Sink nodes. Contains additional `metadata` for chart config (type, axes). |
| `@OutputNode`   | `OUTPUT`       | Sink nodes. Used for final results and UI table rendering.                |

## Round-Trip Requirements

The AST Parsing service must support **Surgical Updates**:

- When a user changes a node name in the Flow Editor, the service must update the corresponding property name in the
  `.ts` file using `ts-morph` without destroying formatting.
- When a new node is added to the graph, a new decorated property must be injected into the `Workbook` class.
