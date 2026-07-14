import { createHash } from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import type { TemplateAssetManifest, TemplateColor, TemplateFontFace, TemplateLayoutManifest, TemplateManifest, TemplateMasterManifest, TemplatePlaceholderManifest, TemplateThemeManifest } from "./types.ts";

const EMU_PER_INCH = 914400;
type Relationship = { id: string; type: string; target: string; targetMode: string };

function sha256(value: Buffer | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function decodeXml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function attrs(fragment = "") {
  const output: Record<string, string> = {};
  const matcher = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of fragment.matchAll(matcher)) output[match[1].split(":").at(-1)!] = decodeXml(match[2] ?? match[3] ?? "");
  return output;
}

function firstTagAttrs(xml: string, localName: string) {
  const match = xml.match(new RegExp(`<(?:[\\w-]+:)?${localName}\\b([^>]*)>`, "i"));
  return match ? attrs(match[1]) : {};
}

function numericSuffix(value: string) { return Number(value.match(/(\d+)(?!.*\d)/)?.[1] || 0); }
function fileOrder(left: string, right: string) { return numericSuffix(left) - numericSuffix(right) || left.localeCompare(right); }
function normalizePartPath(value: string) { return path.posix.normalize(value.replace(/\\/g, "/")).replace(/^\.\//, "").replace(/^\//, ""); }

function sourcePartForRels(relsPath: string) {
  const normalized = normalizePartPath(relsPath);
  const marker = "/_rels/";
  const index = normalized.lastIndexOf(marker);
  if (index < 0 || !normalized.endsWith(".rels")) return null;
  return `${normalized.slice(0, index)}/${normalized.slice(index + marker.length, -5)}`;
}

function resolveRelationshipTarget(relsPath: string, target: string) {
  const source = sourcePartForRels(relsPath);
  if (!source || /^[a-z]+:/i.test(target)) return target;
  return normalizePartPath(path.posix.join(path.posix.dirname(source), target));
}

function parseRelationships(xml: string, relsPath: string): Relationship[] {
  return Array.from(xml.matchAll(/<(?:[\w-]+:)?Relationship\b([^>]*)\/?\s*>/gi), (match) => {
    const values = attrs(match[1]);
    return { id: values.Id || "", type: values.Type || "", target: resolveRelationshipTarget(relsPath, values.Target || ""), targetMode: values.TargetMode || "Internal" };
  }).filter((item) => item.id && item.target);
}

function parsePlaceholders(xml: string, ownerId: string): TemplatePlaceholderManifest[] {
  // A layout placeholder is usually a p:sp, while imported authoring tools may
  // retain picture/chart placeholders as p:pic or p:graphicFrame objects.
  const shapes = ["sp", "pic", "graphicFrame"].flatMap((objectName) =>
    Array.from(xml.matchAll(new RegExp(`<(?:[\\w-]+:)?${objectName}\\b[^>]*>[\\s\\S]*?<\\/(?:[\\w-]+:)?${objectName}>`, "gi")), (match) => match[0])
  );
  const placeholders: TemplatePlaceholderManifest[] = [];
  for (const shape of shapes) {
    const placeholderMatch = shape.match(/<(?:[\w-]+:)?ph\b([^>]*)\/?\s*>/i);
    if (!placeholderMatch) continue;
    const placeholderAttrs = attrs(placeholderMatch[1]);
    const nonVisualAttrs = attrs(shape.match(/<(?:[\w-]+:)?cNvPr\b([^>]*)\/?\s*>/i)?.[1] || "");
    const transform = shape.match(/<(?:[\w-]+:)?xfrm\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?xfrm>/i)?.[1] || "";
    const offset = firstTagAttrs(transform, "off");
    const extent = firstTagAttrs(transform, "ext");
    const hasGeometry = [offset.x, offset.y, extent.cx, extent.cy].every((item) => item !== undefined && Number.isFinite(Number(item)));
    const index = placeholderAttrs.idx === undefined ? null : Number(placeholderAttrs.idx);
    placeholders.push({
      id: `${ownerId}.placeholder.${placeholderAttrs.idx ?? nonVisualAttrs.id ?? placeholders.length + 1}`,
      name: nonVisualAttrs.name || placeholderAttrs.type || `Placeholder ${placeholders.length + 1}`,
      type: placeholderAttrs.type || "body",
      index: Number.isFinite(index) ? index : null,
      geometry: hasGeometry ? { xEmu: Number(offset.x), yEmu: Number(offset.y), widthEmu: Number(extent.cx), heightEmu: Number(extent.cy) } : null,
      inheritsGeometry: !hasGeometry
    });
  }
  return placeholders.sort((left, right) => (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id));
}

function colorValue(fragment: string): Omit<TemplateColor, "name"> {
  const srgb = fragment.match(/<(?:[\w-]+:)?srgbClr\b([^>]*)\/?\s*>/i);
  if (srgb) return { value: attrs(srgb[1]).val || "", source: "srgb" };
  const system = fragment.match(/<(?:[\w-]+:)?sysClr\b([^>]*)\/?\s*>/i);
  if (system) { const values = attrs(system[1]); return { value: values.lastClr || values.val || "", source: "system" }; }
  const scheme = fragment.match(/<(?:[\w-]+:)?schemeClr\b([^>]*)\/?\s*>/i);
  if (scheme) return { value: attrs(scheme[1]).val || "", source: "scheme" };
  const preset = fragment.match(/<(?:[\w-]+:)?prstClr\b([^>]*)\/?\s*>/i);
  if (preset) return { value: attrs(preset[1]).val || "", source: "preset" };
  return { value: "", source: "unknown" };
}

function parseFontSet(xml: string, kind: "major" | "minor") {
  const block = xml.match(new RegExp(`<(?:[\\w-]+:)?${kind}Font\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${kind}Font>`, "i"))?.[1] || "";
  const face = (name: string) => firstTagAttrs(block, name).typeface || "";
  const supplemental: TemplateFontFace[] = Array.from(block.matchAll(/<(?:[\w-]+:)?font\b([^>]*)\/?\s*>/gi), (match) => {
    const values = attrs(match[1]); return { script: values.script || "", typeface: values.typeface || "" };
  }).filter((item) => item.script && item.typeface);
  return { latin: face("latin"), eastAsian: face("ea"), complexScript: face("cs"), supplemental };
}

function parseTheme(xml: string, filePath: string): TemplateThemeManifest {
  const colorScheme = xml.match(/<(?:[\w-]+:)?clrScheme\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?clrScheme>/i)?.[1] || "";
  const colorNames = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
  const colors = colorNames.flatMap((name) => {
    const fragment = colorScheme.match(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}>`, "i"))?.[1];
    return fragment ? [{ name, ...colorValue(fragment) }] : [];
  });
  const major = parseFontSet(xml, "major");
  const minor = parseFontSet(xml, "minor");
  return {
    id: `theme.${numericSuffix(filePath) || 1}`, path: filePath, name: firstTagAttrs(xml, "theme").name || path.posix.basename(filePath, ".xml"), colors,
    fonts: {
      majorLatin: major.latin, majorEastAsian: major.eastAsian, majorComplexScript: major.complexScript,
      minorLatin: minor.latin, minorEastAsian: minor.eastAsian, minorComplexScript: minor.complexScript,
      supplemental: [...major.supplemental, ...minor.supplemental].sort((a, b) => a.script.localeCompare(b.script) || a.typeface.localeCompare(b.typeface))
    }
  };
}

function ratioPreset(width: number, height: number): TemplateManifest["slideSize"]["preset"] {
  const ratio = width / height;
  if (Math.abs(ratio - 4 / 3) < 0.012) return "standard_4_3";
  if (Math.abs(ratio - 16 / 9) < 0.012) return "wide_16_9";
  if (Math.abs(ratio - 16 / 10) < 0.012) return "wide_16_10";
  return "custom";
}

function contentTypes(xml: string) {
  const defaults = new Map<string, string>();
  const overrides = new Map<string, string>();
  for (const match of xml.matchAll(/<(?:[\w-]+:)?Default\b([^>]*)\/?\s*>/gi)) { const values = attrs(match[1]); if (values.Extension) defaults.set(values.Extension.toLowerCase(), values.ContentType || "application/octet-stream"); }
  for (const match of xml.matchAll(/<(?:[\w-]+:)?Override\b([^>]*)\/?\s*>/gi)) { const values = attrs(match[1]); if (values.PartName) overrides.set(normalizePartPath(values.PartName), values.ContentType || "application/octet-stream"); }
  return { defaults, overrides };
}

export async function parsePptxTemplateManifest(input: Buffer | Uint8Array | ArrayBuffer, options: { fileName?: string } = {}): Promise<TemplateManifest> {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input instanceof ArrayBuffer ? new Uint8Array(input) : input);
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch (error) { throw new Error(`Invalid PPTX ZIP package: ${error instanceof Error ? error.message : String(error)}`); }
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir).map(normalizePartPath).sort();
  if (!names.includes("[Content_Types].xml") || !names.includes("ppt/presentation.xml")) throw new Error("Invalid PPTX package: required OOXML presentation parts are missing");
  const xml = async (name: string) => zip.file(name)?.async("string") || "";
  const presentationXml = await xml("ppt/presentation.xml");
  const sizeAttrs = firstTagAttrs(presentationXml, "sldSz");
  const widthEmu = Number(sizeAttrs.cx || 0); const heightEmu = Number(sizeAttrs.cy || 0);
  if (!widthEmu || !heightEmu) throw new Error("Invalid PPTX package: slide size is missing");

  const relationshipFiles = names.filter((name) => name.endsWith(".rels"));
  const relationships = new Map<string, Relationship[]>();
  for (const relsPath of relationshipFiles) relationships.set(relsPath, parseRelationships(await xml(relsPath), relsPath));
  const themePaths = names.filter((name) => /^ppt\/theme\/theme\d+\.xml$/i.test(name)).sort(fileOrder);
  const themes: TemplateThemeManifest[] = []; for (const themePath of themePaths) themes.push(parseTheme(await xml(themePath), themePath));

  const masterPaths = names.filter((name) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/i.test(name)).sort(fileOrder);
  const masters: TemplateMasterManifest[] = [];
  for (const masterPath of masterPaths) {
    const masterXml = await xml(masterPath); const id = `master.${numericSuffix(masterPath) || masters.length + 1}`;
    const relsPath = `${path.posix.dirname(masterPath)}/_rels/${path.posix.basename(masterPath)}.rels`; const rels = relationships.get(relsPath) || [];
    masters.push({ id, path: masterPath, name: firstTagAttrs(masterXml, "cSld").name || path.posix.basename(masterPath, ".xml"), themePath: rels.find((item) => item.type.endsWith("/theme"))?.target || null, layoutPaths: rels.filter((item) => item.type.endsWith("/slideLayout")).map((item) => item.target).sort(fileOrder), placeholders: parsePlaceholders(masterXml, id) });
  }
  const masterByLayout = new Map<string, string>(); for (const master of masters) for (const layoutPath of master.layoutPaths) masterByLayout.set(layoutPath, master.path);
  const layoutPaths = names.filter((name) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i.test(name)).sort(fileOrder);
  const layouts: TemplateLayoutManifest[] = [];
  for (const layoutPath of layoutPaths) {
    const layoutXml = await xml(layoutPath); const root = firstTagAttrs(layoutXml, "sldLayout"); const id = `layout.${numericSuffix(layoutPath) || layouts.length + 1}`;
    const relsPath = `${path.posix.dirname(layoutPath)}/_rels/${path.posix.basename(layoutPath)}.rels`;
    const masterFromRels = (relationships.get(relsPath) || []).find((item) => item.type.endsWith("/slideMaster"))?.target;
    layouts.push({ id, path: layoutPath, name: firstTagAttrs(layoutXml, "cSld").name || path.posix.basename(layoutPath, ".xml"), type: root.type || "custom", masterPath: masterFromRels || masterByLayout.get(layoutPath) || null, preserve: root.preserve === "1" || root.preserve === "true", showMasterShapes: root.showMasterSp !== "0" && root.showMasterSp !== "false", placeholders: parsePlaceholders(layoutXml, id) });
  }

  const types = contentTypes(await xml("[Content_Types].xml")); const references = new Map<string, Set<string>>();
  for (const [relsPath, rels] of relationships) {
    const owner = sourcePartForRels(relsPath) || relsPath;
    for (const rel of rels.filter((item) => item.targetMode !== "External" && item.target.startsWith("ppt/media/"))) { const owners = references.get(rel.target) || new Set<string>(); owners.add(owner); references.set(rel.target, owners); }
  }
  const mediaPaths = names.filter((name) => name.startsWith("ppt/media/")).sort(fileOrder); const assets: TemplateAssetManifest[] = [];
  for (const mediaPath of mediaPaths) {
    const data = await zip.file(mediaPath)!.async("uint8array"); const extension = path.posix.extname(mediaPath).slice(1).toLowerCase(); const digest = sha256(data);
    assets.push({ id: `asset.${digest.slice(0, 16)}`, path: mediaPath, fileName: path.posix.basename(mediaPath), extension, contentType: types.overrides.get(mediaPath) || types.defaults.get(extension) || "application/octet-stream", sizeBytes: data.byteLength, sha256: digest, referencedBy: Array.from(references.get(mediaPath) || []).sort() });
  }

  const slideCount = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).length;
  const placeholderCount = [...masters, ...layouts].reduce((total, owner) => total + owner.placeholders.length, 0);
  const warnings: string[] = [];
  if (!themes.length) warnings.push("theme_part_missing"); if (!masters.length) warnings.push("slide_master_missing"); if (!layouts.length) warnings.push("slide_layout_missing");
  if (masters.some((master) => !master.themePath)) warnings.push("master_theme_relationship_missing"); if (layouts.some((layout) => !layout.masterPath)) warnings.push("layout_master_relationship_missing");
  const widthInches = widthEmu / EMU_PER_INCH; const heightInches = heightEmu / EMU_PER_INCH; const aspectRatio = widthEmu / heightEmu;
  return {
    schemaVersion: "teacher-pptx-template-manifest/v1", source: { fileName: options.fileName || null, sizeBytes: bytes.byteLength, sha256: sha256(bytes) },
    slideSize: { widthEmu, heightEmu, widthInches: Number(widthInches.toFixed(4)), heightInches: Number(heightInches.toFixed(4)), aspectRatio: Number(aspectRatio.toFixed(6)), orientation: widthEmu === heightEmu ? "square" : widthEmu > heightEmu ? "landscape" : "portrait", preset: ratioPreset(widthEmu, heightEmu) },
    counts: { slides: slideCount, masters: masters.length, layouts: layouts.length, themes: themes.length, placeholders: placeholderCount, assets: assets.length },
    themes, masters, layouts, assets, warnings: Array.from(new Set(warnings)).sort()
  };
}

export function stableTemplateManifestJson(manifest: TemplateManifest) { return `${JSON.stringify(manifest, null, 2)}\n`; }
