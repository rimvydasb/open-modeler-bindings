import {FileTSProject} from '../FileTSProject.js';
import {writeFileSync, mkdirSync, rmSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

describe('FileTSProject', () => {
    let testDir: string;

    beforeEach(() => {
        testDir = join(tmpdir(), `om-test-${Date.now()}`);
        mkdirSync(testDir, {recursive: true});
    });

    afterEach(() => {
        rmSync(testDir, {recursive: true, force: true});
    });

    it('should load project from a directory with package.json', async () => {
        const pkg = {
            files: ['src/**/*.ts'],
        };
        mkdirSync(join(testDir, 'src'), {recursive: true});
        writeFileSync(join(testDir, 'package.json'), JSON.stringify(pkg));
        writeFileSync(join(testDir, 'src/main.ts'), 'export const x = 1;');

        const project = new FileTSProject(testDir);
        await project.load();
        const js = project.emitJs();

        expect(js).toContain('globalThis.x = 1;');
    });

    it('should load project from a specific package.json path', async () => {
        const pkg = {
            files: ['lib/*.ts'],
        };
        mkdirSync(join(testDir, 'lib'), {recursive: true});
        const pkgPath = join(testDir, 'package.json');
        writeFileSync(pkgPath, JSON.stringify(pkg));
        writeFileSync(join(testDir, 'lib/core.ts'), 'export const core = true;');

        const project = new FileTSProject(pkgPath);
        await project.load();
        const js = project.emitJs();

        expect(js).toContain('globalThis.core = true;');
    });

    it('should load project from a .tar.gz archive', async () => {
        const archivePath = join(process.cwd(), 'demo-loan-schedule.tar.gz');
        if (!existsSync(archivePath)) {
            throw new Error(`Archive not found at: ${archivePath}. Run tar -czf first.`);
        }

        const project = new FileTSProject(archivePath);
        await project.load();
        const js = project.emitJs();

        expect(js).toContain('var myWorkbook =');
        expect(js).toContain('globalThis.generateLoanSchedule =');
    });
});
