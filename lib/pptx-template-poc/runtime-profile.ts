import type { TemplateManifest, TemplatePlaceholderManifest } from "./types.ts";

export type RuntimeTemplateProfile = {
  schemaVersion: "teacher-template-runtime-profile/v1";
  templateKey: string;
  status: "ready_for_review" | "partial";
  slideSize: TemplateManifest["slideSize"];
  theme: {
    name: string;
    headingFont: string;
    bodyFont: string;
    colors: Record<string, string>;
  };
  layoutCandidates: Array<{
    layoutId: string;
    name: string;
    type: string;
    masterId: string | null;
    slots: Array<{
      slotId: string;
      name: string;
      type: string;
      index: number | null;
      geometry: TemplatePlaceholderManifest["geometry"];
      inheritsGeometry: boolean;
    }>;
  }>;
  assetCatalog: Array<{
    assetId: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    sha256: string;
  }>;
  warnings: string[];
};

/**
 * Converts an extracted manifest into a read-only runtime contract. This does
 * not select a teacher template, write Prisma state, or mutate the registry.
 */
export function toRuntimeTemplateProfile(manifest: TemplateManifest): RuntimeTemplateProfile {
  const primaryTheme = manifest.themes[0];
  const masterIdByPath = new Map(manifest.masters.map((master) => [master.path, master.id]));
  const colors = Object.fromEntries((primaryTheme?.colors || []).filter((color) => color.name && color.value).map((color) => [color.name, color.value]));
  const complete = manifest.counts.masters > 0 && manifest.counts.layouts > 0 && manifest.counts.themes > 0 && manifest.warnings.length === 0;
  return {
    schemaVersion: "teacher-template-runtime-profile/v1",
    templateKey: `pptx-${manifest.source.sha256.slice(0, 16)}`,
    status: complete ? "ready_for_review" : "partial",
    slideSize: manifest.slideSize,
    theme: {
      name: primaryTheme?.name || "Unresolved theme",
      headingFont: primaryTheme?.fonts.majorLatin || primaryTheme?.fonts.minorLatin || "",
      bodyFont: primaryTheme?.fonts.minorLatin || primaryTheme?.fonts.majorLatin || "",
      colors
    },
    layoutCandidates: manifest.layouts.map((layout) => ({
      layoutId: layout.id,
      name: layout.name,
      type: layout.type,
      masterId: layout.masterPath ? masterIdByPath.get(layout.masterPath) || null : null,
      slots: layout.placeholders.map((slot) => ({ slotId: slot.id, name: slot.name, type: slot.type, index: slot.index, geometry: slot.geometry, inheritsGeometry: slot.inheritsGeometry }))
    })),
    assetCatalog: manifest.assets.map((asset) => ({ assetId: asset.id, fileName: asset.fileName, contentType: asset.contentType, sizeBytes: asset.sizeBytes, sha256: asset.sha256 })),
    warnings: manifest.warnings
  };
}
