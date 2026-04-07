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

The `ProjectAST` is organized around the concept of **Workbooks** (containers) and **Nodes** (reactive units), serving
as a semantic bridge between TypeScript source and the Flow Editor.

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
        +enums: EnumDeclaration[]
        +functions: FunctionDeclaration[]
    }

    class WorkbookDeclaration {
        +nodes: NodeDeclaration[]
    }

    WorkbookDeclaration --|> DeclarationBase

    class TermsSetDeclaration {
        +members: TermsMemberDeclaration[]
    }

    TermsSetDeclaration --|> DeclarationBase

    class TermsMemberDeclaration {
        +returnType: TypeReference
        +isGetter: boolean
    }

    TermsMemberDeclaration --|> DeclarationBase

    class FunctionDeclaration {
        +returnType: TypeReference
        +parameters: ParameterInfo[]
        +isAsync: boolean
        +expression: string
    }

    FunctionDeclaration --|> DeclarationBase

    class TypeDeclaration {
        +kind: TypeKind
        +properties: PropertyInfo[]
    }

    TypeDeclaration --|> DeclarationBase

    class EnumDeclaration {
        +members: EnumMember[]
    }

    EnumDeclaration --|> DeclarationBase

    class EnumMember {
        +name: string
        +value: string | number
    }

    class NodeDeclaration {
        +nodeType: NodeType
        +nodeKind: NodeKind
        +returnType: TypeReference
        +dependencies: string[]
        +expression: string
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

    class NodeKind {
        <<enumeration>>
        PROPERTY
        GETTER
        ACCESSOR
    }

    class TypeKind {
        <<enumeration>>
        INTERFACE
        ALIAS
    }

    class ParameterInfo {
        +name: string
        +type: TypeReference
        +isOptional: boolean
        +defaultValue: string | undefined
    }

    class PropertyInfo {
        +name: string
        +type: TypeReference
        +isOptional: boolean
        +documentation: string | undefined
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
    ProjectAST *-- EnumDeclaration
    ProjectAST *-- FunctionDeclaration

    WorkbookDeclaration *-- NodeDeclaration
    TermsSetDeclaration *-- TermsMemberDeclaration

    NodeDeclaration o-- NodeType
    NodeDeclaration o-- NodeKind
    NodeDeclaration *-- TypeReference

    TypeDeclaration o-- TypeKind
    TypeDeclaration *-- PropertyInfo

    EnumDeclaration *-- EnumMember

    FunctionDeclaration *-- ParameterInfo
    FunctionDeclaration *-- TypeReference

    PropertyInfo *-- TypeReference
    ParameterInfo *-- TypeReference
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
