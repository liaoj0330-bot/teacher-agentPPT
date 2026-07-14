import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { IMAGE_USAGE_BOUNDARY } from "./ImageProvider.mjs";

export function ensureImageAssetDirs(runDir) {
  const dirs = {
    assets: join(runDir, "assets"),
    images: join(runDir, "assets", "images"),
    generated: join(runDir, "assets", "images", "generated"),
    metadata: join(runDir, "assets", "images", "metadata"),
    prompts: join(runDir, "assets", "prompts")
  };
  Object.values(dirs).forEach(dir => mkdirSync(dir, { recursive: true }));
  return dirs;
}

export function imageAssetId(index) {
  return `generated_image_${String(index + 1).padStart(3, "0")}`;
}

export function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeText(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

export async function materializeProviderImage(image, targetPath) {
  if (image.b64_json) {
    const buffer = Buffer.from(String(image.b64_json), "base64");
    writeFileSync(targetPath, buffer);
    return { local_path: targetPath, bytes: buffer.length };
  }
  if (image.url) {
    const response = await fetch(image.url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`image download failed ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(targetPath, buffer);
    return { local_path: targetPath, bytes: buffer.length };
  }
  throw new Error("provider image has neither b64_json nor url");
}

export function buildImageMetadata({ imageId, provider, model, prompt, negativePrompt = "", size, slide, generationStatus, error = "", localPath = "" }) {
  return {
    image_id: imageId,
    provider,
    model,
    prompt,
    negative_prompt: negativePrompt,
    size,
    created_at: new Date().toISOString(),
    source_status: IMAGE_USAGE_BOUNDARY.source_status,
    asset_type: IMAGE_USAGE_BOUNDARY.asset_type,
    is_factual_evidence: false,
    usage_boundary: IMAGE_USAGE_BOUNDARY.usage_boundary,
    allowed_usage: IMAGE_USAGE_BOUNDARY.allowed_usage,
    forbidden_usage: IMAGE_USAGE_BOUNDARY.forbidden_usage,
    target_slide_id: slide.slide_id,
    target_slide_type: slide.slide_type,
    target_visual_slot: slide.visual_need,
    generation_status: generationStatus,
    error,
    local_path: localPath
  };
}

export function writePromptRecord(filePath, { imageId, slide, prompt, negativePrompt = "" }) {
  writeText(filePath, [
    `# ${imageId} Prompt`,
    "",
    `- target_slide_id: ${slide.slide_id}`,
    `- target_slide_type: ${slide.slide_type}`,
    `- target_visual_slot: ${slide.visual_need}`,
    "",
    "## Prompt",
    "",
    prompt,
    "",
    "## Negative Prompt",
    "",
    negativePrompt || "Do not include text, watermark, official map labels, real-data claims, or documentary evidence cues."
  ].join("\n"));
}

export function manifestMarkdown(manifest) {
  return [
    "# Generated Images Manifest",
    "",
    `- provider: ${manifest.provider}`,
    `- model: ${manifest.model || ""}`,
    `- generated_count: ${manifest.generated_count}`,
    `- failed_count: ${manifest.failed_count}`,
    `- source_status: ${IMAGE_USAGE_BOUNDARY.source_status}`,
    `- is_factual_evidence: false`,
    "",
    "## Assets",
    "",
    ...(manifest.images.length ? manifest.images.flatMap(item => [
      `### ${item.image_id}`,
      "",
      `- status: ${item.generation_status}`,
      `- slide: ${item.target_slide_id}`,
      `- local_path: ${item.local_path || ""}`,
      `- metadata_path: ${item.metadata_path}`,
      `- prompt_path: ${item.prompt_path}`,
      `- error: ${item.error || ""}`,
      ""
    ]) : ["- none"])
  ].join("\n");
}

export function fileExists(path) {
  return Boolean(path && existsSync(path));
}

