import {OpenModelTSEngine} from '@open-modeler-engine/index.js';
import {LocalTSProject} from '@open-modeler-ts-project/index.js';
import {readFileSync} from 'node:fs';

/**
 * Common setup for demo integration tests.
 * Loads the project, injects bindings, and boots the engine.
 */
export async function setupEngine(demoPath: string): Promise<OpenModelTSEngine> {
    const engine = new OpenModelTSEngine();
    const project = new LocalTSProject(demoPath);

    // Bindings must be manually injected because ts-morph in ATSProjectInstance
    // expects them at /src/bindings/ but doesn't have access to the real filesystem.
    const bindingsContent = readFileSync('src/bindings/v1alpha/bindings.ts', 'utf-8');

    await project.load();
    project.addSourceFile('/src/bindings/bindings.ts', bindingsContent);

    await engine.loadProject(project);
    await engine.boot();
    return engine;
}
