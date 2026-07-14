import assert from "node:assert/strict";
import type { DeckSpec, DesignSlide } from "../lib/canvas-data.ts";
import type { LayoutContract } from "../lib/visual-compiler/contracts.ts";
import { buildRenderScenes } from "../lib/visual-compiler/scene-builder.ts";
import { validateRenderScenes } from "../lib/visual-compiler/qa.ts";

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
console.log(JSON.stringify({ pass: true, pages: scenes.map((scene) => ({ page: scene.page, slideId: scene.slideId, layoutId: scene.layoutId, elements: scene.elements.length })), qa }, null, 2));
