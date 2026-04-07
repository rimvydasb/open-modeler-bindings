import {ATSProjectInstance} from './ATSProjectInstance.js';
import {readFileSync, existsSync, lstatSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
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
 * A TypeScript project instance fetched from a remote archive (e.g., GitHub release).
 * Fetches, extracts, and processes .tar.gz based on manifest logic.
 */
export class WebTarTSProject extends ATSProjectInstance {
    private readonly url: string;

    constructor(url: string) {
        super();
        this.url = url;
    }

    /**
     * Fetches and unpacks the remote project.
     */
    public async load(): Promise<void> {
        const response = await fetch(this.url);
        if (!response.ok) {
            throw new Error(`Failed to fetch remote project: ${response.statusText}`);
        }

        const archiveBuffer = await response.arrayBuffer();
        await this.loadFromArchiveBuffer(archiveBuffer);
    }

    /**
     * Extracts archive from buffer and processes it.
     */
    private async loadFromArchiveBuffer(buffer: ArrayBuffer): Promise<void> {
        const tempArchive = join(tmpdir(), `om-fetch-${Date.now()}.tar.gz`);
        const tempDir = join(tmpdir(), `om-web-extract-${Date.now()}`);
        mkdirSync(tempDir, {recursive: true});

        try {
            writeFileSync(tempArchive, Buffer.from(buffer));
            execSync(`tar -xzf ${tempArchive} -C ${tempDir}`);

            const packageJsonPath = join(tempDir, 'package.json');
            await this.loadFromDirectory(tempDir, packageJsonPath);
        } finally {
            rmSync(tempDir, {recursive: true, force: true});
            if (existsSync(tempArchive)) rmSync(tempArchive);
        }
    }

    private async loadFromDirectory(projectRoot: string, packageJsonPath: string): Promise<void> {
        if (!existsSync(packageJsonPath)) {
            throw new Error(`package.json not found in archive from: ${this.url}`);
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
}
