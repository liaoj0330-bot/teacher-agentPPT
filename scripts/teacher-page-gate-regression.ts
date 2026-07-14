import assert from "node:assert/strict";
import { createTeacherDeckPlan, reduceTeacherDeckPlan } from "../lib/teacher-deck-plan-state.ts";
import type { RenderScene } from "../lib/visual-compiler/contracts.ts";
import { applyPageGatesToPlan, beginPageRetry, evaluatePageGates } from "../lib/visual-compiler/page-gate.ts";
import type { VisualQAReportV2 } from "../lib/visual-compiler/qa-v2.ts";

const pages = ["cover", "concept", "practice"].map((id) => ({ id, role: id, titleIntent: id, pagePurpose: `purpose-${id}`, mustProve: `proof-${id}` }));
let plan = createTeacherDeckPlan("plan-gate", pages);
plan = reduceTeacherDeckPlan(plan, { type: "confirm" });
plan = reduceTeacherDeckPlan(plan, { type: "start_compile" });
const canvas = { width: 13.3333, height: 7.5, unit: "in" as const };
const scenes: RenderScene[] = pages.map((page, index) => ({ schemaVersion: "teacher-render-scene/v1", sceneId: `scene-${page.id}`, slideId: page.id, page: index + 1, layoutId: page.id, canvas, evidenceSourceIds: [], elements: [] }));
const report: VisualQAReportV2 = {
  schemaVersion: "teacher-visual-qa/v2", status: "failed", sceneCount: 3, errorCount: 1, warningCount: 1,
  issues: [
    { issueId: "warn", sceneId: "scene-concept", slideId: "concept", severity: "warning", code: "EMPTY_REQUIRED_SLOT", message: "待复核", elementIds: [] },
    { issueId: "fail", sceneId: "scene-practice", slideId: "practice", severity: "error", code: "TEXT_OVERFLOW", message: "溢出", elementIds: ["body"] }
  ], density: scenes.map((scene) => ({ sceneId: scene.sceneId, occupiedAreaRatio: 0.4, textCapacityRatio: 0.6, score: 49 }))
};
const gates = evaluatePageGates(scenes, report);
plan = applyPageGatesToPlan(plan, gates);
assert.deepEqual(plan.progress?.completedPageIds?.sort(), ["concept", "cover"]);
assert.deepEqual(plan.progress?.failedPageIds, ["practice"]);
assert.equal(gates[2].action, "retry_current_page");
assert.equal(gates[2].retryFrom, "layout");
const retrying = beginPageRetry(plan, "practice");
assert.deepEqual(retrying.progress?.completedPageIds?.sort(), ["concept", "cover"]);
assert.deepEqual(retrying.progress?.failedPageIds, []);
assert.equal(retrying.progress?.activePageId, "practice");
console.log(JSON.stringify({ pass: true, gates: gates.map(({ pageId, status, action, retryFrom }) => ({ pageId, status, action, retryFrom })), progressAfterRetry: retrying.progress }, null, 2));
