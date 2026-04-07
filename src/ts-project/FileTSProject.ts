import {ATSProjectInstance} from './ATSProjectInstance.js';
import {readFileSync, existsSync, lstatSync, mkdirSync, rmSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join, dirname, isAbsolute} from 'node:path';
import {glob} from 'node:fs/promises';
import {execSync} from 'node:child_process';
import {tmpdir} from 'node:os';

interface PackageJson {
    files?: string[];
    exports?: string | Record<string, string>;
}

/**
 * A TypeScript project instance sourced from the local filesystem.
 * Supports directory paths, specific package.json files, and .tar.gz archives.
 */
export class FileTSProject extends ATSProjectInstance {
    private readonly path: string;

    constructor(path: string) {
        super();
        this.path = isAbsolute(path) ? path : join(process.cwd(), path);
    }

    /**
     * Resolves the project structure and loads files into the virtual project.
     */
    public async load(): Promise<void> {
        if (!existsSync(this.path)) {
            throw new Error(`Path does not exist: ${this.path}`);
        }

        if (this.path.endsWith('.tar.gz')) {
            await this.loadFromArchive(this.path);
            return;
        }

        let packageJsonPath: string;
        let projectRoot: string;

        const stats = lstatSync(this.path);
        if (stats.isDirectory()) {
            packageJsonPath = join(this.path, 'package.json');
            projectRoot = this.path;
        } else if (this.path.endsWith('package.json')) {
            packageJsonPath = this.path;
            projectRoot = dirname(this.path);
        } else {
            throw new Error(`Unsupported file type or directory missing package.json: ${this.path}`);
        }

        await this.loadFromDirectory(projectRoot, packageJsonPath);
    }

    private async loadFromDirectory(projectRoot: string, packageJsonPath: string): Promise<void> {
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
     * Extracts .tar.gz into a temporary directory and processes it.
     */
    private async loadFromArchive(archivePath: string): Promise<void> {
        const tempDir = join(tmpdir(), `om-extract-${Date.now()}`);
        mkdirSync(tempDir, {recursive: true});

        try {
            execSync(`tar -xzf ${archivePath} -C ${tempDir}`);
            const packageJsonPath = join(tempDir, 'package.json');
            await this.loadFromDirectory(tempDir, packageJsonPath);
        } finally {
            rmSync(tempDir, {recursive: true, force: true});
        }
    }
}
