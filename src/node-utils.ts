import { readFileSync } from "node:fs";

/**
 * Utility to load multiple files from the file system into a record of strings.
 * This is intended for use in Node.js environments (like tests).
 * 
 * @param filePaths - Array of file paths to load
 * @returns A record where keys are file paths and values are their content
 */
export function loadFiles(filePaths: string[]): Record<string, string> {
    const project: Record<string, string> = {};
    for (const path of filePaths) {
        project[path] = readFileSync(path, "utf-8");
    }
    return project;
}
