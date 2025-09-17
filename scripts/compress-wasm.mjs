#!/usr/bin/env node
import { brotliCompress, constants } from "zlib";
import { promisify } from "util";
import { readdir, stat, readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const compress = promisify(brotliCompress);
const QUALITY = 11;

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");

async function listFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const results = [];

    for (const entry of entries) {
        const entryPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            const nested = await listFiles(entryPath);
            results.push(...nested);
            continue;
        }
        results.push(entryPath);
    }

    return results;
}

async function ensureParentDirectory(filePath) {
    const dirPath = dirname(filePath);
    await mkdir(dirPath, { recursive: true });
}

async function main() {
    const distStats = await stat(distDir).catch(() => null);
    if (!distStats?.isDirectory()) {
        console.warn(`[compress-wasm] Skipping: dist directory not found at ${distDir}`);
        return;
    }

    const files = await listFiles(distDir);
    const wasmFiles = files.filter((file) => file.endsWith(".wasm"));

    if (wasmFiles.length === 0) {
        console.warn("[compress-wasm] No .wasm files found under dist; nothing to compress.");
        return;
    }

    for (const file of wasmFiles) {
        const brotliTarget = `${file}.br`;
        const sourceBuffer = await readFile(file);
        const compressed = await compress(sourceBuffer, {
            params: {
                [constants.BROTLI_PARAM_QUALITY]: QUALITY,
            },
        });

        await ensureParentDirectory(brotliTarget);
        await writeFile(brotliTarget, compressed);
        console.log(`[compress-wasm] Wrote ${brotliTarget}`);
    }
}

main().catch((error) => {
    console.error("[compress-wasm] Failed to compress wasm assets", error);
    process.exitCode = 1;
});
