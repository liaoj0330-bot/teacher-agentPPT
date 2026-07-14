import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parsePptxTemplateManifest, stableTemplateManifestJson } from "../lib/pptx-template-poc/parser.ts";

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) {
  console.error("Usage: node --experimental-strip-types scripts/pptx-template-manifest-poc.ts input.pptx output.json");
  process.exitCode = 2;
} else {
  const bytes = await readFile(inputPath);
  const manifest = await parsePptxTemplateManifest(bytes, { fileName: path.basename(inputPath) });
  await writeFile(outputPath, stableTemplateManifestJson(manifest), "utf8");
  console.log(JSON.stringify({ outputPath: path.resolve(outputPath), schemaVersion: manifest.schemaVersion, counts: manifest.counts, slideSize: manifest.slideSize, warnings: manifest.warnings }, null, 2));
}
