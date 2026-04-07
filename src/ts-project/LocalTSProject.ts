import {ATSProjectInstance} from './ATSProjectInstance.js';
import {existsSync, lstatSync} from 'node:fs';
import {join, dirname, isAbsolute} from 'node:path';

/**
 * A TypeScript project instance sourced from the local filesystem.
 * Supports directory paths, specific package.json files, and .tar.gz archives.
 */
export class LocalTSProject extends ATSProjectInstance {
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
}
