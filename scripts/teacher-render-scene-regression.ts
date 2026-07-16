import assert from "node:assert/strict";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import type { DeckSpec, DesignSlide } from "../lib/canvas-data.ts";
import type { LayoutDefinition } from "../lib/ppt-agent/layout-library.ts";
import type { LayoutContract, RenderElement } from "../lib/visual-compiler/contracts.ts";
import { layoutContractFromDefinition } from "../lib/visual-compiler/layout-contracts.ts";
import { addRenderScenesToPptx } from "../lib/visual-compiler/pptx-scene-renderer.ts";
import { inspectPptxArtifact } from "../lib/visual-compiler/pptx-artifact-qa.ts";
import { validateRenderScenesV2 } from "../lib/visual-compiler/qa-v2.ts";
import { buildRenderScenes } from "../lib/visual-compiler/scene-builder.ts";
import { buildRenderScenesV2 } from "../lib/visual-compiler/scene-builder-v2.ts";
import { validateRenderScenes } from "../lib/visual-compiler/qa.ts";
import { validateVisualManifest } from "../lib/visual-compiler/visual-manifest.ts";

const slides: DesignSlide[] = [
  { id: "s1", title: "一次函数", subtitle: "从变化关系建立模型", tone: "教学", layout: "cover", bullets: ["认识变量关系"] },
  { id: "s2", title: "例题：确定解析式", subtitle: "先找已知量", tone: "讲解", layout: "process", bullets: ["设函数表达式", "代入已知点", "求出参数", "回代检查"] }
];

const layout: LayoutContract = {
  schemaVersion: "teacher-layout-contract/v1", layoutId: "tm07_worked_example", name: "分步例题", family: "teacher_example", source: "teacher_builtin", sourceKey: "test",
  canvas: { width: 13.3333, height: 7.5, unit: "in" }, pageRoles: ["例题分步讲解"], densities: ["medium"],
  slots: [
    { slotId: "title", name: "title", kind: "title", required: true, bounds: { x: 0.72, y: 0.48, width: 11.89, height: 0.72 } },
    { slotId: "subtitle", name: "subtitle", kind: "subtitle", required: false, bounds: { x: 0.78, y: 1.3, width: 11.77, height: 0.42 } },
    { slotId: "body", name: "steps", kind: "body", required: true, bounds: { x: 0.78, y: 1.92, width: 11.77, height: 4.9 } }
  ],
  constraints: { maxCharacters: 360, maxItems: 6, minBodyFontPt: 16, minCaptionFontPt: 10, safeMarginIn: 0.24 }, capabilities: { browser: true, pptx: true, editable: true }, warnings: []
};

const deckSpec: DeckSpec = {
  id: "deck-1", version: "1", pptType: "courseware", pptTypeLabel: "教师课件", audience: "初中生", goal: "掌握一次函数", coreMessage: "用变化关系建模", expectedDecision: "能独立求解析式", recommendedSlideCount: 2,
  requiredPages: [], forbiddenContent: [], evidenceNeeds: [], styleProfile: "teaching_grid", qualityBar: 82, createdAt: new Date(0).toISOString(),
  slideSpecs: slides.map((slide, index) => ({ id: `spec-${index + 1}`, page: index + 1, slideId: slide.id, title: slide.title, role: index ? "例题分步讲解" : "课程封面", claim: slide.subtitle, mustProve: slide.subtitle, evidenceNeeds: [], evidenceSourceIds: [], layoutIntent: slide.layout!, layoutReason: "真实页面角色", visualIntent: "教师课件", density: index ? "balanced" : "airy", selectedLayout: index ? "tm07_worked_example" : undefined, mustHave: [], avoid: [], scoreRules: [] }))
};

const scenes = buildRenderScenes({ deckSpec, slides, layouts: [layout] });
const qa = validateRenderScenes(scenes);
assert.equal(scenes.length, 2);
assert.equal(scenes[1].layoutId, "tm07_worked_example");
assert.match((scenes[1].elements.find((item) => item.elementId === "s2:body") as { text: string }).text, /回代检查/);
assert.equal(qa.status, "passed");

// Versioned export uses the V2 scene builder with semantic slot names from the
// layout library. Those slots must compile into editable body text, not title-only pages.
const legacyLayoutIds = ["bullet_insight", "metric_dashboard", "matrix", "process_flow", "quote_highlight", "card_grid"];
const semanticSlots: Record<string, string[]> = {
  bullet_insight: ["title", "primaryClaim", "supportingPoints"],
  metric_dashboard: ["title", "metrics"],
  matrix: ["title", "matrixRows"],
  process_flow: ["title", "steps"],
  quote_highlight: ["title", "primaryClaim"],
  card_grid: ["title", "cards"]
};
const legacyContracts = legacyLayoutIds.map((layoutId) => layoutContractFromDefinition({
  layoutId,
  layoutName: layoutId,
  layoutFamily: "insight",
  supportedVisualForms: ["bullet_list"],
  supportedRoles: ["课程内容"],
  supportedPptTypes: ["courseware"],
  informationDensity: ["medium"],
  requiredSlots: semanticSlots[layoutId],
  optionalSlots: [],
  maxTextLength: 420,
  maxItems: 6,
  bestFor: [],
  avoidFor: [],
  exportCompatibility: "editable-shapes",
  previewCompatibility: "section-preview"
} as LayoutDefinition));
const exportSlides: DesignSlide[] = legacyContracts.map((contract, index) => ({
  id: `export-${index + 1}`,
  title: `导出页 ${index + 1}`,
  subtitle: "可编辑导出验证",
  tone: "教学",
  bullets: [`正文内容 ${index + 1}`, "第二条正文"]
}));
const exportRoles = ["课程封面", "学习目标", "情境导入", "概念讲解", "例题分步讲解", "课堂练习"];
const exportDeckSpec: DeckSpec = {
  ...deckSpec,
  id: "deck-export",
  recommendedSlideCount: exportSlides.length,
  slideSpecs: exportSlides.map((slide, index) => ({
    ...deckSpec.slideSpecs[1],
    id: `export-spec-${index + 1}`,
    page: index + 1,
    slideId: slide.id,
    title: slide.title,
    finalTitle: slide.title,
    role: exportRoles[index],
    pagePurpose: exportRoles[index],
    selectedLayout: legacyContracts[index].layoutId,
    visibleBlocks: [
      { type: "point", title: "知识点", body: `必须出现在导出正文 ${index + 1}`, priority: "must" }
    ]
  }))
};
const pixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgAH/XPqvWQAAAABJRU5ErkJggg==";
const exportVisuals = Object.fromEntries(exportSlides.map((slide) => [slide.id, pixelPng]));
const exportScenes = buildRenderScenesV2({ deckSpec: exportDeckSpec, slides: exportSlides, layouts: legacyContracts, visuals: exportVisuals });
exportScenes.forEach((scene) => {
  const bodyElements = scene.elements.filter((element): element is Extract<RenderElement, { kind: "text" }> => element.kind === "text" && element.role === "body");
  const imageElements = scene.elements.filter((element) => element.kind === "image");
  assert.ok(bodyElements.length > 0, `${scene.layoutId} must emit editable body text`);
  assert.ok(bodyElements.every((element) => element.editable), `${scene.layoutId} body text must remain editable`);
  assert.match(bodyElements.map((element) => element.text).join("\n"), /必须出现在导出正文/);
  assert.equal(imageElements.length, 1, `${scene.layoutId} must bind exactly one visual into the scene`);
  assert.ok(imageElements[0].slotId, `${scene.layoutId} visual must have an anchor`);
});
const exportQA = validateRenderScenesV2(exportScenes, legacyContracts);
assert.equal(exportQA.errorCount, 0, JSON.stringify(exportQA.issues));
assert.ok(!exportQA.issues.some((issue) => issue.code === "OVERLAP"), "anchored visuals must not overlap editable text");
assert.ok(new Set(exportScenes.map((scene) => scene.composition?.family)).size >= 5, "teacher roles must produce varied composition families");

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
addRenderScenesToPptx(pptx, exportScenes);
const pptxBuffer = await pptx.write({ outputType: "nodebuffer" }) as Buffer;
const archive = await JSZip.loadAsync(pptxBuffer);
const artifactQA = await inspectPptxArtifact(pptxBuffer, exportScenes);
assert.equal(artifactQA.ok, true, JSON.stringify(artifactQA.issues));
assert.equal(artifactQA.ooxmlEditable, true);
assert.equal(artifactQA.nativePictureObjects, exportScenes.length);
const slideXml = (await Promise.all(
  Object.entries(archive.files)
    .filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .map(([, file]) => file.async("string"))
)).join("\n");
assert.match(slideXml, /必须出现在导出正文 1/);
assert.match(slideXml, /必须出现在导出正文 6/);
assert.equal((slideXml.match(/<p:pic>/g) || []).length, exportScenes.length, "visuals must not be duplicated after scene binding");

const pngHeader = Buffer.alloc(5000);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(pngHeader);
pngHeader.writeUInt32BE(13, 8);
pngHeader.write("IHDR", 12, "ascii");
pngHeader.writeUInt32BE(512, 16);
pngHeader.writeUInt32BE(512, 20);
pngHeader[24] = 8;
pngHeader[25] = 6;
const validRaster = `data:image/png;base64,${pngHeader.toString("base64")}`;
const manifestQA = validateVisualManifest(["valid", "missing", "placeholder"], {
  valid: validRaster,
  placeholder: "data:image/svg+xml;base64,PHN2Zy8+"
});
assert.equal(manifestQA.validCount, 1);
assert.deepEqual(manifestQA.issues.map((issue) => issue.code).sort(), ["missing", "unsupported_type"]);

console.log(JSON.stringify({ pass: true, pages: scenes.map((scene) => ({ page: scene.page, slideId: scene.slideId, layoutId: scene.layoutId, elements: scene.elements.length })), exportPages: exportScenes.map((scene) => ({ layoutId: scene.layoutId, editableBodyElements: scene.elements.filter((element) => element.kind === "text" && element.role === "body" && element.editable).length, anchoredVisuals: scene.elements.filter((element) => element.kind === "image" && element.slotId).length })), exportQA, artifactQA, manifestQA, qa }, null, 2));
