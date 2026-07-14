import assert from "node:assert/strict";
import type { DeckSpec } from "../lib/canvas-data.ts";
import type { RuntimeTemplateProfile } from "../lib/pptx-template-poc/runtime-profile.ts";
import { selectTemplateLayoutsForDeck } from "../lib/visual-compiler/template-layout-selector.ts";

const emu = 914400;
const profile: RuntimeTemplateProfile = {
  schemaVersion: "teacher-template-runtime-profile/v1", templateKey: "template-score", status: "ready_for_review",
  slideSize: { widthEmu: 12192000, heightEmu: 6858000, widthInches: 13.3333, heightInches: 7.5, aspectRatio: 1.777778, orientation: "landscape", preset: "wide_16_9" },
  theme: { name: "Teacher", headingFont: "Aptos Display", bodyFont: "Aptos", colors: {} }, assetCatalog: [], warnings: [],
  layoutCandidates: [
    { layoutId: "cover-layout", name: "Title Slide", type: "title", masterId: "m1", slots: [
      { slotId: "cover-title", name: "Title", type: "title", index: 0, geometry: { xEmu: emu, yEmu: emu, widthEmu: emu * 6, heightEmu: emu }, inheritsGeometry: false },
      { slotId: "cover-body", name: "Content", type: "body", index: 1, geometry: { xEmu: emu, yEmu: emu * 2, widthEmu: emu * 6, heightEmu: emu * 2 }, inheritsGeometry: false }
    ] },
    { layoutId: "practice-layout", name: "Practice Content", type: "content", masterId: "m1", slots: [
      { slotId: "practice-title", name: "Title", type: "title", index: 0, geometry: { xEmu: emu, yEmu: emu / 2, widthEmu: emu * 10, heightEmu: emu }, inheritsGeometry: false },
      { slotId: "practice-body", name: "Body", type: "body", index: 1, geometry: { xEmu: emu, yEmu: emu * 1.6, widthEmu: emu * 7, heightEmu: emu * 4 }, inheritsGeometry: false },
      { slotId: "practice-feedback", name: "Practice Feedback", type: "interaction", index: 2, geometry: { xEmu: emu * 8.3, yEmu: emu * 1.6, widthEmu: emu * 3.5, heightEmu: emu * 4 }, inheritsGeometry: false }
    ] }
  ]
};
const deckSpec: DeckSpec = { id: "deck-template", version: "1", pptType: "courseware", pptTypeLabel: "教师课件", audience: "学生", goal: "教学", coreMessage: "函数", expectedDecision: "掌握", recommendedSlideCount: 2, requiredPages: [], forbiddenContent: [], evidenceNeeds: [], styleProfile: "grid", qualityBar: 82, createdAt: new Date(0).toISOString(), slideSpecs: [
  { id: "cover", page: 1, title: "函数", role: "课程封面", claim: "", mustProve: "", evidenceNeeds: [], evidenceSourceIds: [], layoutIntent: "cover", layoutReason: "", visualIntent: "", density: "airy", mustHave: [], avoid: [], scoreRules: [] },
  { id: "practice", page: 2, title: "练习", role: "课堂练习", pagePurpose: "练习反馈", claim: "", mustProve: "", evidenceNeeds: [], evidenceSourceIds: [], recommendedVisualForm: "practice_feedback", layoutIntent: "cards", layoutReason: "", visualIntent: "", density: "balanced", mustHave: [], avoid: [], scoreRules: [] }
] };
const selections = selectTemplateLayoutsForDeck(profile, deckSpec);
assert.equal(selections.length, 2);
assert.equal(selections[0].selectedLayoutId, "cover-layout");
assert.equal(selections[1].selectedLayoutId, "practice-layout");
assert.ok(selections.every((selection) => selection.accepted));
console.log(JSON.stringify({ pass: true, selections }, null, 2));
