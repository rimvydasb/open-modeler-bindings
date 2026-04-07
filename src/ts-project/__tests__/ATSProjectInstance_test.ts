import {ATSProjectInstance} from '@open-modeler-ts-project/ATSProjectInstance.js';

class TestProject extends ATSProjectInstance {
    public async load(): Promise<void> {
        this.project.createSourceFile('/test.ts', 'export const a = 1;');
    }
}

describe('ATSProjectInstance', () => {
    it('should transpile and sanitize TypeScript code', async () => {
        const project = new TestProject();
        await project.load();
        const js = project.emitJs();

        expect(js).toContain('globalThis.a = 1;');
        expect(js).toContain('const exports = {};');
        expect(js).toContain('var global = globalThis;');
    });
});
