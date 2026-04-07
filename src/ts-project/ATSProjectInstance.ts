import {Project} from 'ts-morph';
import {readFileSync, existsSync, lstatSync, mkdirSync, rmSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {glob} from 'node:fs/promises';
import {execSync} from 'node:child_process';
import {tmpdir} from 'node:os';

interface PackageJson {
    files?: string[];
    exports?: string | Record<string, string>;
}

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
                    '@open-modeler-bindings/*': ['/src/bindings/v1alpha/*.ts'],
                    '@open-modeler-engine/*': ['/src/engine/*.ts'],
                    '@open-modeler-ts-project/*': ['/src/ts-project/*.ts'],
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
     * Manually inject a source file into the virtual project.
     */
    public addSourceFile(path: string, content: string): void {
        this.project.createSourceFile(path, content, {overwrite: true});
    }

    /**
     * Common method to load a project from a directory following package.json manifest.
     */
    protected async loadFromDirectory(projectRoot: string, packageJsonPath: string): Promise<void> {
        if (!existsSync(packageJsonPath)) {
            throw new Error(`package.json not found at: ${packageJsonPath}`);
        }

        const packageJson: PackageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const filePatterns = packageJson.files || ['**/*.ts'];

        for (const pattern of filePatterns) {
            for await (const entry of glob(pattern, {cwd: projectRoot})) {
                const fullPath = join(projectRoot, entry);
                const stat = lstatSync(fullPath);
                if (stat.isFile() && (entry.endsWith('.ts') || entry.endsWith('.json'))) {
                    const content = await readFile(fullPath, 'utf-8');
                    this.project.createSourceFile(`/${entry}`, content, {overwrite: true});
                }
            }
        }
    }

    /**
     * Common method to extract .tar.gz into a temporary directory and process it.
     */
    protected async loadFromArchive(archivePath: string, prefix: string = 'om-extract'): Promise<void> {
        const tempDir = join(tmpdir(), `${prefix}-${Date.now()}`);
        mkdirSync(tempDir, {recursive: true});

        try {
            execSync(`tar -xzf ${archivePath} -C ${tempDir}`);
            const packageJsonPath = join(tempDir, 'package.json');
            await this.loadFromDirectory(tempDir, packageJsonPath);
        } finally {
            rmSync(tempDir, {recursive: true, force: true});
        }
    }

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

        // Wrap import.meta and process in a proxy that returns itself for any property access or call
        const proxyPolyfill =
            'var __om_proxy = new Proxy(function(){}, { get: () => __om_proxy, apply: () => __om_proxy });\n';
        code = code.replace(/import\.meta/g, '__om_proxy');
        code = code.replace(/process/g, '__om_proxy');

        return proxyPolyfill + code;
    }
}
