import assert from "node:assert/strict";
import { layoutContractFromDefinition, layoutContractsFromTemplate, visualDesignFromTemplate } from "../lib/visual-compiler/layout-contracts.ts";
import type { LayoutDefinition } from "../lib/ppt-agent/layout-library.ts";
import type { RuntimeTemplateProfile } from "../lib/pptx-template-poc/runtime-profile.ts";
import { validateRenderScenes } from "../lib/visual-compiler/qa.ts";

const profile: RuntimeTemplateProfile = {
  schemaVersion: "teacher-template-runtime-profile/v1",
  templateKey: "pptx-test",
  status: "ready_for_review",
  slideSize: { widthEmu: 12192000, heightEmu: 6858000, widthInches: 13.3333, heightInches: 7.5, aspectRatio: 1.777778, orientation: "landscape", preset: "wide_16_9" },
  theme: { name: "Teacher", headingFont: "Aptos Display", bodyFont: "Aptos", colors: { accent1: "4472C4" } },
  layoutCandidates: [{ layoutId: "layout-1", name: "Title and Content", type: "titleAndContent", masterId: "master-1", slots: [
    { slotId: "title", name: "Title", type: "title", index: 0, geometry: { xEmu: 658368, yEmu: 274320, widthEmu: 10820448, heightEmu: 1143000 }, inheritsGeometry: false },
    { slotId: "body", name: "Content", type: "body", index: 1, geometry: { xEmu: 658368, yEmu: 1600200, widthEmu: 10820448, heightEmu: 4572000 }, inheritsGeometry: false }
  ] }],
  assetCatalog: [], warnings: []
};

const workedExampleLayout: LayoutDefinition = {
  layoutId: "tm07_worked_example", layoutName: "分步例题", layoutFamily: "teacher_example",
  supportedVisualForms: ["worked_example_steps"], supportedRoles: ["例题分步讲解"], supportedPptTypes: ["courseware"], informationDensity: ["medium"],
  requiredSlots: ["title", "problem", "known", "steps", "conclusion"], optionalSlots: ["studentAction", "keyDecision"],
  maxTextLength: 320, maxItems: 5, maxTitleLength: 20, maxItemLength: 24,
  typographyScale: { title: 28, subtitle: 16, body: 18, caption: 11 }, bestFor: ["例题", "分步推导"], avoidFor: ["整段答案"],
  exportCompatibility: "editable-shapes", previewCompatibility: "section-preview"
};

const design = visualDesignFromTemplate(profile);
const templateContracts = layoutContractsFromTemplate(profile);
const teacherContract = layoutContractFromDefinition(workedExampleLayout);
assert.equal(design.canvas.width, 13.3333);
assert.equal(templateContracts.length, 1);
assert.equal(templateContracts[0].slots[0].kind, "title");
assert.equal(templateContracts[0].slots[1].kind, "body");
assert.equal(teacherContract.capabilities.editable, true);

const qa = validateRenderScenes([{ schemaVersion: "teacher-render-scene/v1", sceneId: "scene-1", slideId: "slide-1", page: 1, layoutId: "layout-1", canvas: design.canvas, evidenceSourceIds: [], elements: [
  { kind: "text", elementId: "title", bounds: { x: 0.72, y: 0.4, width: 11.8, height: 0.7 }, zIndex: 1, editable: true, text: "一次函数", role: "title", fontSizePt: 28 },
  { kind: "text", elementId: "body", bounds: { x: 0.72, y: 1.5, width: 11.8, height: 4.8 }, zIndex: 1, editable: true, text: "真实教学内容", role: "body", fontSizePt: 18 }
] }]);
assert.equal(qa.status, "passed");
console.log(JSON.stringify({ pass: true, templateLayoutCount: templateContracts.length, teacherLayout: teacherContract.layoutId, qa }, null, 2));
