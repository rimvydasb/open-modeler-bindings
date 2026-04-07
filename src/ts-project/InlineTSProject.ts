import {ATSProjectInstance} from './ATSProjectInstance.js';

/**
 * An in-memory TypeScript project instance created from a source map.
 * Ideal for browser-based editors or dynamically generated models.
 */
export class InlineTSProject extends ATSProjectInstance {
    private readonly sources: Record<string, string>;

    constructor(sources: Record<string, string>) {
        super();
        this.sources = sources;
    }

    /**
     * Loads the provided source files into the virtual project.
     */
    public async load(): Promise<void> {
        for (const [path, content] of Object.entries(this.sources)) {
            // Ensure path starts with a slash for the virtual filesystem
            const virtualPath = path.startsWith('/') ? path : `/${path}`;
            this.project.createSourceFile(virtualPath, content, {overwrite: true});
        }
    }
}
