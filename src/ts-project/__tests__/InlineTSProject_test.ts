import {InlineTSProject} from '@open-modeler-ts-project/index.js';

describe('InlineTSProject', () => {
    it('should load project from a source map', async () => {
        const sources = {
            'main.ts': 'export const x = 1;',
            'lib.ts': 'export const y = 2;',
        };

        const project = new InlineTSProject(sources);
        await project.load();
        const js = project.emitJs();

        expect(js).toContain('globalThis.x = 1;');
        expect(js).toContain('globalThis.y = 2;');
    });
});
