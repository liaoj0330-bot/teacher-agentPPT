import assert from "node:assert/strict";
import type { LayoutContract, RenderScene } from "../lib/visual-compiler/contracts.ts";
import { validateRenderScenesV2 } from "../lib/visual-compiler/qa-v2.ts";

const layout: LayoutContract = {
  schemaVersion: "teacher-layout-contract/v1", layoutId: "teacher-concept", name: "概念讲解", family: "teacher_concept", source: "teacher_builtin", sourceKey: "test",
  canvas: { width: 13.3333, height: 7.5, unit: "in" }, pageRoles: ["概念讲解"], densities: ["medium"],
  slots: [{ slotId: "title", name: "标题", kind: "title", required: true }, { slotId: "body", name: "正文", kind: "body", required: true }],
  constraints: { maxCharacters: 120, maxItems: 5, minBodyFontPt: 16, minCaptionFontPt: 10, safeMarginIn: 0.24 }, capabilities: { browser: true, pptx: true, editable: true }, warnings: []
};
const scene: RenderScene = {
  schemaVersion: "teacher-render-scene/v1", sceneId: "scene-v2", slideId: "slide-v2", page: 1, layoutId: layout.layoutId, canvas: layout.canvas, evidenceSourceIds: [],
  elements: [
    { kind: "text", elementId: "title", slotId: "title", bounds: { x: 0.8, y: 0.5, width: 11.7, height: 0.75 }, zIndex: 1, editable: true, text: "一次函数的概念", role: "title", fontSizePt: 28 },
    { kind: "text", elementId: "body", slotId: "body", bounds: { x: 0.8, y: 1.7, width: 5.5, height: 0.36 }, zIndex: 1, editable: true, text: "在一个变化过程中，如果给定一个变量的值，相应地就确定另一个变量的唯一值，那么我们称这两个变量之间具有函数关系。", role: "body", fontSizePt: 18 }
  ]
};
const report = validateRenderScenesV2([scene], [layout]);
assert.equal(report.schemaVersion, "teacher-visual-qa/v2");
assert.equal(report.errorCount, 1);
assert.ok(report.issues.some((issue) => issue.code === "TEXT_OVERFLOW"));
assert.equal(report.density.length, 1);
console.log(JSON.stringify({ pass: true, report }, null, 2));
