import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { IMAGE_USAGE_BOUNDARY } from "../lib/brain-ppt/image/ImageProvider.mjs";
import { createImageProvider } from "../lib/brain-ppt/image/imageProviderFactory.mjs";
import { buildImagePlan } from "../lib/brain-ppt/image/imagePromptBuilder.mjs";
import { buildImageMetadata, ensureImageAssetDirs, writeJson, writePromptRecord } from "../lib/brain-ppt/image/imageAssetWriter.mjs";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sandun-image-provider-"));
const dirs = ensureImageAssetDirs(tmpRoot);
const provider = createImageProvider();
const safeConfig = provider.safeConfig();

assert.equal(safeConfig.provider, "pinchuan");
assert.equal(safeConfig.base_url, "https://pinchuanapi.tech");
assert(!safeConfig.key_mask || !safeConfig.key_mask.includes(process.env.PINCHUAN_API_KEY || "__missing__"), "safe config must not expose key");
assert.equal(IMAGE_USAGE_BOUNDARY.asset_type, "ai_generated_image");
assert.equal(IMAGE_USAGE_BOUNDARY.is_factual_evidence, false);
assert.equal(IMAGE_USAGE_BOUNDARY.source_status, "ai_generated_unverified_visual");

const pagePlan = {
  pages: [
    { page: 1, title: "赣州一日游", visual_direction: "封面氛围图", core_content: ["轻松认识赣州"], required_evidence: [] },
    { page: 7, title: "注意事项", visual_direction: "轻量图标", core_content: ["出行前核验"], required_evidence: ["天气", "开放时间"] }
  ]
};
const imagePlan = buildImagePlan({ deckId: "test_deck", runId: "test_run", pagePlan });
assert.equal(imagePlan.slides.length, 2);
assert.equal(imagePlan.slides[0].should_generate, true);
assert.equal(imagePlan.slides[1].should_generate, false);
assert.equal(imagePlan.image_policy.required_metadata.is_factual_evidence, false);

const metadata = buildImageMetadata({
  imageId: "generated_image_001",
  provider: "pinchuan",
  model: "gpt-image-1",
  prompt: imagePlan.slides[0].image_prompt,
  size: "1536x1024",
  slide: imagePlan.slides[0],
  generationStatus: "placeholder_only",
  localPath: ""
});
assert.equal(metadata.asset_type, "ai_generated_image");
assert.equal(metadata.is_factual_evidence, false);
assert.equal(metadata.usage_boundary, "atmosphere_or_concept_only");
assert(metadata.forbidden_usage.includes("real_scenic_photo"));

const metadataPath = path.join(dirs.metadata, "generated_image_001.meta.json");
const promptPath = path.join(dirs.prompts, "generated_image_001.prompt.md");
writeJson(metadataPath, metadata);
writePromptRecord(promptPath, {
  imageId: "generated_image_001",
  slide: imagePlan.slides[0],
  prompt: imagePlan.slides[0].image_prompt
});
assert(fs.existsSync(metadataPath), "metadata should be written");
assert(fs.existsSync(promptPath), "prompt should be written");

let probeSummary = { attempted: false };
if (provider.configured) {
  const probe = await provider.probe();
  probeSummary = {
    attempted: true,
    healthOk: Boolean(probe.health?.ok),
    modelsOk: Boolean(probe.models?.available),
    modelCount: Array.isArray(probe.models?.model_ids) ? probe.models.model_ids.length : 0,
    keyPrinted: false
  };
}

console.log(JSON.stringify({
  passed: true,
  checkedAt: new Date().toISOString(),
  tmpRoot,
  provider: safeConfig.provider,
  baseUrl: safeConfig.base_url,
  keyPresent: safeConfig.key_present,
  keyPrinted: false,
  metadataPath,
  promptPath,
  probe: probeSummary
}, null, 2));

