import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { inspectPptxWithAutomizer, clonePptxPreservingSource } from "../lib/pptx-automizer-adapter.ts";

const root = process.cwd();
const fixture = path.join(root, "artifacts", "template-parser-poc", "teacher-template-fixture.pptx");
assert.equal(fs.existsSync(fixture), true, `fixture missing: ${fixture}`);

const manifest = await inspectPptxWithAutomizer(fixture);
assert.equal(manifest.engine, "pptx-automizer");
assert.ok(manifest.slideCount >= 2, "template slides were not inspected");
assert.ok(manifest.namedElementCount > 0, "named elements were not discovered");
assert.ok(manifest.textElementCount > 0, "text elements were not discovered");

const source = await JSZip.loadAsync(fs.readFileSync(fixture));
const clonedBuffer = await clonePptxPreservingSource(fixture);
const cloned = await JSZip.loadAsync(clonedBuffer);
const slideNames = (zip) => Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort();
const masterNames = (zip) => Object.keys(zip.files).filter((name) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name)).sort();
assert.deepEqual(slideNames(cloned), slideNames(source), "source slide inventory changed during fidelity clone");
assert.deepEqual(masterNames(cloned), masterNames(source), "source master inventory changed during fidelity clone");
assert.equal(clonedBuffer.subarray(0, 4).toString("hex"), "504b0304", "clone is not a valid OOXML zip");

const output = path.join(os.tmpdir(), `teacher-beautify-clone-${process.pid}.pptx`);
fs.writeFileSync(output, clonedBuffer);
try {
  console.log(JSON.stringify({
    ok: true,
    engine: manifest.engine,
    slideCount: manifest.slideCount,
    namedElementCount: manifest.namedElementCount,
    textElementCount: manifest.textElementCount,
    pictureElementCount: manifest.pictureElementCount,
    cloneBytes: clonedBuffer.length,
  }, null, 2));
} finally {
  fs.rmSync(output, { force: true });
}
