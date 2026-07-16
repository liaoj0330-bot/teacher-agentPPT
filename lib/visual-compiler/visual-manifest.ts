import { imageSize } from "image-size";

export type VisualManifestIssue = {
  slideId: string;
  code: "missing" | "unsupported_type" | "invalid_base64" | "too_small" | "invalid_dimensions";
  message: string;
};

export type VisualManifestEntry = {
  slideId: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  aspectRatio: number;
};

export type VisualManifestReport = {
  ok: boolean;
  expectedCount: number;
  validCount: number;
  entries: VisualManifestEntry[];
  issues: VisualManifestIssue[];
};

const RASTER_DATA_URI = /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=\s]+)$/i;

export function validateVisualManifest(slideIds: string[], manifest: Record<string, string>): VisualManifestReport {
  const entries: VisualManifestEntry[] = [];
  const issues: VisualManifestIssue[] = [];

  for (const slideId of slideIds) {
    const source = String(manifest[slideId] || "").trim();
    if (!source) {
      issues.push({ slideId, code: "missing", message: "页面缺少已提交视觉" });
      continue;
    }
    const match = source.match(RASTER_DATA_URI);
    if (!match) {
      issues.push({ slideId, code: "unsupported_type", message: "视觉必须是 PNG、JPEG 或 WebP 位图，不能使用 SVG 或远程占位地址" });
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
    } catch {
      issues.push({ slideId, code: "invalid_base64", message: "视觉 Base64 无法解码" });
      continue;
    }
    if (bytes.length < 4096) {
      issues.push({ slideId, code: "too_small", message: "视觉文件过小，疑似空图或占位图" });
      continue;
    }
    try {
      const dimensions = imageSize(bytes);
      const width = Number(dimensions.width || 0);
      const height = Number(dimensions.height || 0);
      if (width < 512 || height < 512) {
        issues.push({ slideId, code: "invalid_dimensions", message: `视觉分辨率不足：${width}x${height}，至少需要 512x512` });
        continue;
      }
      entries.push({ slideId, mime: `image/${match[1].toLowerCase()}`, bytes: bytes.length, width, height, aspectRatio: Number((width / height).toFixed(3)) });
    } catch {
      issues.push({ slideId, code: "invalid_dimensions", message: "视觉文件头损坏或尺寸不可读" });
    }
  }

  return { ok: issues.length === 0, expectedCount: slideIds.length, validCount: entries.length, entries, issues };
}
