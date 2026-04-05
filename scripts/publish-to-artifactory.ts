import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";

const DEMO_ROOT = "demo";
const DIST_DIR = "dist-demos";

if (!existsSync(DIST_DIR)) {
    mkdirSync(DIST_DIR);
}

const demoDirs = readdirSync(DEMO_ROOT)
    .map(name => join(DEMO_ROOT, name))
    .filter(path => statSync(path).isDirectory());

for (const demoDir of demoDirs) {
    const pkgPath = join(demoDir, "package.json");
    if (!existsSync(pkgPath)) continue;

    const demoName = basename(demoDir);
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const version = pkg.version;
    const tagName = `demo-${demoName}@${version}`;
    const tarName = `${demoName}-${version}.tar.gz`;
    const tarPath = join(DIST_DIR, tarName);

    console.log(`\n--- Processing: ${demoName} v${version} ---`);

    // 1. Check if release/tag already exists using GitHub CLI
    try {
        // 'gh release view' exits with 0 if release exists, non-zero otherwise
        execSync(`gh release view ${tagName}`, { stdio: "ignore" });
        console.log(`[Skip] Release ${tagName} already exists.`);
        continue;
    } catch {
        console.log(`[Action] New version detected. Preparing release...`);
    }

    // 2. Package the demo
    try {
        // Exclude node_modules, dist, etc.
        execSync(`tar -czf ${tarPath} -C ${demoDir} --exclude=node_modules --exclude=dist --exclude=package-lock.json .`);
        console.log(`[Package] Created: ${tarPath}`);
    } catch (err) {
        console.error(`[Error] Packaging failed for ${demoName}:`, err);
        continue;
    }

    // 3. Create Release and Upload Asset using GitHub CLI
    try {
        console.log(`[Release] Creating GitHub Release for ${tagName}...`);
        // --notes "..." for release notes, --title "..." for release title
        execSync(`gh release create ${tagName} ${tarPath} --title "Release ${tagName}" --notes "Automated demo release for ${demoName} version ${version}"`);
        console.log(`[Success] Released ${tagName}`);
    } catch (err) {
        console.error(`[Error] Release failed for ${tagName}:`, err);
    }
}
