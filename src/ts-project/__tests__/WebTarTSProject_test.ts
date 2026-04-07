import {WebTarTSProject} from '@open-modeler-ts-project/index.js';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

describe('WebTarTSProject', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('should fetch and load project from a .tar.gz archive', async () => {
        const archivePath = join(process.cwd(), 'tmp/demo-loan-schedule.tar.gz');
        if (!existsSync(archivePath)) {
            throw new Error(`Archive not found at: ${archivePath}. Run tar -czf first.`);
        }

        const archiveBuffer = readFileSync(archivePath);

        // Mock global fetch manually
        (global as any).fetch = async (url: string) => ({
            ok: true,
            arrayBuffer: async () => archiveBuffer,
            status: 200,
            statusText: 'OK',
        });

        const url = 'https://example.com/project.tar.gz';
        const project = new WebTarTSProject(url);
        await project.load();

        const js = project.emitJs();
        expect(js).toContain('var myWorkbook =');
        expect(js).toContain('globalThis.generateLoanSchedule =');
    });

    it('should throw error if fetch fails', async () => {
        (global as any).fetch = async () => ({
            ok: false,
            status: 404,
            statusText: 'Not Found',
        });

        const project = new WebTarTSProject('https://example.com/fail.tar.gz');
        await expect(project.load()).rejects.toThrow('Failed to fetch remote project: Not Found');
    });
});
