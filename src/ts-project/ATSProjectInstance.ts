import {Project} from 'ts-morph';

/**
 * Base class for all TypeScript project instances.
 * Manages the internal ts-morph project and handles the transpilation/sanitization pipeline.
 */
export abstract class ATSProjectInstance {
    protected project: Project;

    constructor() {
        this.project = new Project({
            compilerOptions: {
                target: 7, // ESNext
                module: 0, // None
                lib: ['esnext'],
                alwaysStrict: false,
                baseUrl: '/',
                paths: {
                    '@open-modeler-bindings/*': ['/src/bindings/*.ts'],
                },
            },
            useInMemoryFileSystem: true,
        });
    }

    /**
     * Abstract method for loading project-specific sources.
     */
    public abstract load(): Promise<void>;

    /**
     * Transpiles the virtual project and returns a sanitized, bundled JavaScript string.
     */
    public emitJs(): string {
        const emitResult = this.project.emitToMemory();
        const files = emitResult.getFiles();

        let frameworkJs = '';
        let otherJs = '';

        for (const file of files) {
            let text = file.text;
            text = this.sanitize(text);

            // Prioritize framework/bindings to ensure they are defined before use
            if (file.filePath.endsWith('bindings.js') || file.filePath.endsWith('reactive_graph.js')) {
                frameworkJs += `\n// --- ${file.filePath} ---\n` + text;
            } else {
                otherJs += `\n// --- ${file.filePath} ---\n` + text;
            }
        }

        return 'const exports = {};\nvar global = globalThis;\n' + frameworkJs + otherJs;
    }

    /**
     * Sanitizes the emitted JavaScript for the QuickJS VM's flat global scope.
     */
    protected sanitize(js: string): string {
        let code = js;
        code = code.replace(/^"use strict";/gm, '');

        // Replace 'export const', 'export let', 'export function', etc. with global declarations
        code = code.replace(/^export const /gm, 'var ');
        code = code.replace(/^export let /gm, 'var ');
        code = code.replace(/^export function /gm, 'function ');
        code = code.replace(/^export class /gm, 'var ');

        code = code.replace(/^const TRACE_STORE =/gm, 'var TRACE_STORE =');
        code = code.replace(/^export /gm, '');
        code = code.replace(/^import .* from .*$/gm, '');
        code = code.replace(/^const .* = require\(.*\);$/gm, '');
        code = code.replace(/^Object\.defineProperty\(exports,.*$/gm, '');
        code = code.replace(/^exports\..* = void 0;.*$/gm, '');

        // Convert exports.foo = ... to globalThis.foo = ...
        code = code.replace(/exports\.(\w+) =/gm, 'globalThis.$1 =');
        code = code.replace(/exports\./gm, '');

        code = code.replace(/\(\d+,\s*\w+\.([^)]+)\)/g, '$1');
        code = code.replace(/(\w+)\.(\w+)/g, (match, p1, p2) => {
            if (p1.includes('_ts_') || p1.startsWith('bindings')) return p2;
            return match;
        });

        code = code.replace(/if\s*\(import\.meta\.main\)\s*\{[\s\S]*?\n\}/g, '');

        return code;
    }
}
