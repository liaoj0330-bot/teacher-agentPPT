import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { parsePptxTemplateManifest, stableTemplateManifestJson } from "../lib/pptx-template-poc/parser.ts";
import { toRuntimeTemplateProfile } from "../lib/pptx-template-poc/runtime-profile.ts";

const outputDir = path.join(process.cwd(), "artifacts", "template-parser-poc");
const fixturePath = path.join(outputDir, "teacher-template-fixture.pptx");
const manifestPath = path.join(outputDir, "teacher-template-manifest.json");
const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAZC+uS8AAAAASUVORK5CYII=";
await mkdir(outputDir, { recursive: true });

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Teacher template parser POC";
pptx.subject = "Real OOXML master/layout/placeholder fixture";
pptx.title = "Teacher Template Fixture";
pptx.theme = { headFontFace: "Aptos Display", bodyFontFace: "Aptos" };
pptx.defineSlideMaster({
  title: "TEACHER_HERO",
  background: { color: "F4F8FC" },
  objects: [
    { rect: { x: 0, y: 0, w: 13.333, h: 0.16, fill: { color: "176B87" }, line: { color: "176B87" } } },
    { image: { data: pixel, x: 12.55, y: 0.25, w: 0.4, h: 0.4, altText: "school mark" } },
    { placeholder: { text: "Lesson title", options: { name: "lesson-title", type: "title", x: 0.8, y: 0.75, w: 7.5, h: 0.8 } } },
    { placeholder: { text: "Learning evidence", options: { name: "lesson-body", type: "body", x: 0.8, y: 1.85, w: 7.5, h: 4.6 } } },
    // PptxGenJS's runtime enum maps the public `image` value to OOXML `pic`.
    { placeholder: { text: "", options: { name: "lesson-visual", type: "image" as "pic", x: 8.7, y: 1.3, w: 3.8, h: 4.8 } } }
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.6, h: 0.25, fontFace: "Aptos", fontSize: 9, color: "176B87" }
});
const first = pptx.addSlide({ masterName: "TEACHER_HERO" });
first.addText("函数的单调性", { placeholder: "lesson-title" });
first.addText("观察、描述、论证", { placeholder: "lesson-body", breakLine: false });
first.addImage({ data: pixel, x: 9.25, y: 2.0, w: 1.1, h: 1.1, altText: "lesson visual" });
const second = pptx.addSlide({ masterName: "TEACHER_HERO" });
second.addText("形成性评价", { placeholder: "lesson-title" });
second.addText("用教材例题验证概念理解。", { placeholder: "lesson-body" });
await pptx.writeFile({ fileName: fixturePath, compression: true });

// PptxGenJS 4.0.1 currently omits the OOXML type attribute for a picture
// placeholder. Patch only the generated fixture package so the parser is
// tested against the standard `<p:ph type="pic">` representation.
const fixtureZip = await JSZip.loadAsync(await readFile(fixturePath));
for (const name of Object.keys(fixtureZip.files).filter((item) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(item))) {
  const layoutXml = await fixtureZip.file(name)!.async("string");
  if (!layoutXml.includes('idx="104"')) continue;
  fixtureZip.file(name, layoutXml.replace(/(<p:ph\s+idx="104")([\s\S]*?\/>)/, '$1 type="pic"$2'));
}
await writeFile(fixturePath, await fixtureZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));

const bytes = await readFile(fixturePath);
const firstManifest = await parsePptxTemplateManifest(bytes, { fileName: path.basename(fixturePath) });
const secondManifest = await parsePptxTemplateManifest(bytes, { fileName: path.basename(fixturePath) });
assert.deepEqual(secondManifest, firstManifest, "manifest must be deterministic for identical bytes");
assert.equal(firstManifest.schemaVersion, "teacher-pptx-template-manifest/v1");
assert.equal(firstManifest.counts.slides, 2);
assert.equal(firstManifest.slideSize.preset, "wide_16_9");
assert.ok(Math.abs(firstManifest.slideSize.widthInches - 13.333) < 0.01);
assert.ok(Math.abs(firstManifest.slideSize.heightInches - 7.5) < 0.01);
assert.ok(firstManifest.counts.masters >= 1, "a real master must be discovered");
assert.ok(firstManifest.counts.layouts >= 1, "a real layout must be discovered");
assert.ok(firstManifest.counts.themes >= 1, "a real theme must be discovered");
assert.ok(firstManifest.themes.some((theme) => theme.fonts.majorLatin === "Aptos Display"));
assert.ok(firstManifest.themes.some((theme) => theme.fonts.minorLatin === "Aptos"));
const placeholderTypes = new Set([...firstManifest.masters.flatMap((owner) => owner.placeholders.map((item) => item.type)), ...firstManifest.layouts.flatMap((owner) => owner.placeholders.map((item) => item.type))]);
assert.ok(placeholderTypes.has("title"));
assert.ok(placeholderTypes.has("body"));
assert.ok(placeholderTypes.has("pic"));
assert.ok(firstManifest.layouts.every((layout) => layout.masterPath));
assert.ok(firstManifest.masters.every((master) => master.themePath));
assert.ok(firstManifest.assets.some((asset) => asset.extension === "png" && asset.contentType === "image/png"));
assert.ok(firstManifest.assets.every((asset) => /^[a-f0-9]{64}$/.test(asset.sha256)));
assert.ok(firstManifest.assets.some((asset) => asset.referencedBy.length > 0));
assert.deepEqual(firstManifest.warnings, []);
const runtimeProfile = toRuntimeTemplateProfile(firstManifest);
assert.equal(runtimeProfile.status, "ready_for_review");
assert.equal(runtimeProfile.templateKey, `pptx-${firstManifest.source.sha256.slice(0, 16)}`);
assert.ok(runtimeProfile.layoutCandidates.some((layout) => layout.slots.some((slot) => slot.type === "pic")));
assert.ok(runtimeProfile.layoutCandidates.every((layout) => layout.masterId));
assert.equal(runtimeProfile.theme.headingFont, "Aptos Display");
assert.equal(runtimeProfile.theme.bodyFont, "Aptos");
await assert.rejects(() => parsePptxTemplateManifest(Buffer.from("not a pptx")), /Invalid PPTX ZIP package/);
await writeFile(manifestPath, stableTemplateManifestJson(firstManifest), "utf8");

console.log(JSON.stringify({ ok: true, fixturePath, fixtureBytes: bytes.byteLength, manifestPath, counts: firstManifest.counts, slideSize: firstManifest.slideSize, runtimeProfile: { schemaVersion: runtimeProfile.schemaVersion, templateKey: runtimeProfile.templateKey, status: runtimeProfile.status, layoutCandidates: runtimeProfile.layoutCandidates.length }, themeFonts: firstManifest.themes.map((theme) => ({ name: theme.name, major: theme.fonts.majorLatin, minor: theme.fonts.minorLatin })), placeholderTypes: Array.from(placeholderTypes).sort(), assetReferences: firstManifest.assets.map((asset) => ({ fileName: asset.fileName, referencedBy: asset.referencedBy })) }, null, 2));
