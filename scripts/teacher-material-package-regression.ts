import assert from "node:assert/strict";
import { buildTeacherMaterialPackage } from "../lib/ppt-agent/teacher-material-package.ts";

const parsedAnalysis = {
  parseStatus: "parsed",
  blockCount: 18,
  pageCount: 12,
  summary: "高中物理 选择性必修第二册 电磁感应",
  metadata: { publisher: "人民教育出版社", volume: "选择性必修第二册" },
};

const packageResult = buildTeacherMaterialPackage({
  packageId: "fixture-package",
  task: {
    generationMode: "chapter_prep",
    schoolStage: "高中",
    grade: "高二",
    subject: "物理",
    textbook: "人教版高中物理选择性必修第二册",
    chapter: "第二章 电磁感应",
    sourcePolicy: "uploaded_only",
    textbookIdentity: {
      displayName: "人教版高中物理选择性必修第二册",
      publisher: "人民教育出版社",
      volume: "选择性必修第二册",
      sourceAssetId: "asset-textbook",
      verificationStatus: "asset_verified",
    },
    chapterIdentity: { chapter: "第二章 电磁感应", pageStart: 20, pageEnd: 41 },
    uploadedFiles: [
      { name: "高中物理教材-选择性必修第二册.pdf", assetId: "asset-textbook", status: "uploaded", materialRole: "textbook", analysis: parsedAnalysis },
      { name: "楞次定律教案.docx", assetId: "asset-plan", status: "uploaded", analysis: { ...parsedAnalysis, pageCount: 4 } },
      { name: "楞次定律练习册.pdf", assetId: "asset-exercise", status: "uploaded", analysis: { ...parsedAnalysis, pageCount: 6 } },
    ],
  },
});

assert.equal(packageResult.schemaVersion, "teacher-material-package/v1");
assert.equal(packageResult.items.length, 3);
assert.deepEqual(packageResult.items.map((item) => item.role), ["textbook", "lesson_plan", "exercise"]);
assert.equal(packageResult.textbookMatch.status, "asset_verified");
assert.equal(packageResult.textbookMatch.matchedMaterialId, "asset-textbook");
assert.equal(packageResult.readiness.status, "ready");
assert.equal(packageResult.readiness.canPlan, true);
assert.equal(packageResult.readiness.canCite, true);
assert.equal(packageResult.readiness.hasMultipleSources, true);

const falseVerification = buildTeacherMaterialPackage({
  task: {
    generationMode: "chapter_prep",
    textbook: "人教版八年级上册语文",
    chapter: "第五单元 背影",
    textbookIdentity: {
      displayName: "人教版八年级上册语文",
      sourceAssetId: "asset-plan-only",
      verificationStatus: "asset_verified",
    },
    uploadedFiles: [
      { name: "背影教案.docx", assetId: "asset-plan-only", status: "uploaded", materialRole: "lesson_plan", analysis: parsedAnalysis },
    ],
  },
});
assert.equal(falseVerification.textbookMatch.status, "unmatched");
assert.ok(falseVerification.textbookMatch.conflicts.includes("source_asset_is_not_a_textbook"));
assert.equal(falseVerification.readiness.status, "needs_confirmation");

const failedMaterials = buildTeacherMaterialPackage({
  task: {
    generationMode: "lesson_plan",
    uploadedFiles: [
      { name: "扫描教案.pdf", status: "error", analysis: { parseStatus: "failed", blockCount: 0 } },
    ],
  },
});
assert.equal(failedMaterials.readiness.status, "blocked");
assert.ok(failedMaterials.readiness.blockingIssues.includes("no_parseable_material"));
assert.ok(failedMaterials.readiness.blockingIssues.includes("lesson_material_required"));

const deduplicated = buildTeacherMaterialPackage({
  task: {
    generationMode: "lesson_plan",
    uploadedFiles: [{ name: "lesson-plan.docx", sha256: "same", status: "uploaded", analysis: parsedAnalysis }],
  },
  uploadedFiles: [{ name: "lesson-plan-copy.docx", sha256: "same", status: "uploaded", analysis: parsedAnalysis }],
});
assert.equal(deduplicated.items.length, 1);

const uploadPolicyWithoutUpload = buildTeacherMaterialPackage({
  task: {
    generationMode: "chapter_prep",
    textbook: "人教版高中物理选择性必修第二册",
    chapter: "第二章 电磁感应",
    sourcePolicy: "uploaded_only",
    textbookIdentity: {
      displayName: "人教版高中物理选择性必修第二册",
      verificationStatus: "teacher_confirmed",
    },
    uploadedFiles: [],
  },
});
assert.equal(uploadPolicyWithoutUpload.readiness.status, "blocked");
assert.ok(uploadPolicyWithoutUpload.readiness.blockingIssues.includes("uploaded_source_required_by_policy"));

const catalogPolicyWithoutCatalogMatch = buildTeacherMaterialPackage({
  task: {
    generationMode: "chapter_prep",
    textbook: "人教版八年级上册语文",
    chapter: "第五单元 背影",
    sourcePolicy: "trusted_catalog",
    textbookIdentity: {
      displayName: "人教版八年级上册语文",
      verificationStatus: "teacher_confirmed",
    },
    uploadedFiles: [],
  },
});
assert.equal(catalogPolicyWithoutCatalogMatch.readiness.status, "blocked");
assert.ok(catalogPolicyWithoutCatalogMatch.readiness.blockingIssues.includes("trusted_catalog_match_required"));

console.log(JSON.stringify({
  ok: true,
  schemaVersion: packageResult.schemaVersion,
  roles: packageResult.items.map((item) => item.role),
  textbookMatch: packageResult.textbookMatch,
  readiness: packageResult.readiness,
}, null, 2));
