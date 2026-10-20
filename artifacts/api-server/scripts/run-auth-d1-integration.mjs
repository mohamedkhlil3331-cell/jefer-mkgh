import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const apiDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(apiDirectory, ".test-tmp");
const outputFile = path.join(outputDirectory, "auth-d1.integration.mjs");

await mkdir(outputDirectory, { recursive: true });
try {
  await build({
    entryPoints: [path.join(apiDirectory, "src/routes/auth-d1.integration.test.ts")],
    outfile: outputFile,
    bundle: true,
    packages: "external",
    platform: "node",
    format: "esm",
    target: "node24",
    logLevel: "info",
  });
  await import(pathToFileURL(outputFile).href);
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}
