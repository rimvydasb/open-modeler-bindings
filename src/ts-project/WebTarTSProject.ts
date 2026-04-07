import {ATSProjectInstance} from './ATSProjectInstance.js';
import {existsSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

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
        try {
            writeFileSync(tempArchive, Buffer.from(buffer));
            await this.loadFromArchive(tempArchive, 'om-web-extract');
        } finally {
            if (existsSync(tempArchive)) rmSync(tempArchive);
        }
    }
}
