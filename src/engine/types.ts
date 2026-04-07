import {QuickJSHandle} from 'quickjs-emscripten';

/**
 * Interface representing a TypeScript project instance.
 * (Inversion of Control: The Engine defines the contract it needs).
 */
export interface IProjectInstance {
    /**
     * Resolves the project structure and loads files into the virtual project.
     */
    load(): Promise<void>;

    /**
     * Transpiles the virtual project and returns a sanitized, bundled JavaScript string.
     */
    emitJs(): string;

    /**
     * Manually inject a source file into the virtual project.
     */
    addSourceFile(path: string, content: string): void;
}

export interface EngineOptions {
    debug?: boolean;
}

/**
 * A reference to a variable that already exists in the VM's global scope.
 */
export interface VmRef {
    __vm_ref: string;
}

export type NodeDataCallback = (data: any) => void;
export type NodeExecutionCallback = (payload: Record<string, any>) => void;

/**
 * Internal Scope helper for QuickJS handle management.
 */
export interface IScope {
    manage<T extends QuickJSHandle>(handle: T): T;
    dispose(): void;
}
