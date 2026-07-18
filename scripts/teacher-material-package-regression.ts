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
assert.equal(falseVerification.readiness.status, "blocked");
assert.ok(falseVerification.readiness.blockingIssues.includes("textbook_match_confirmation_required"));

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

const subjectFixtures = [
  { subject: "数学", schoolStage: "初中", grade: "七年级", textbook: "人教版七年级上册数学", chapter: "第一章 有理数" },
  { subject: "化学", schoolStage: "高中", grade: "高一", textbook: "人教版高中化学必修第一册", chapter: "第一章 物质及其变化" },
  { subject: "生物", schoolStage: "高中", grade: "高一", textbook: "人教版高中生物学必修1", chapter: "第二章 组成细胞的分子" },
  { subject: "历史", schoolStage: "初中", grade: "七年级", textbook: "统编版七年级上册历史", chapter: "第二单元 夏商周时期" },
  { subject: "地理", schoolStage: "初中", grade: "七年级", textbook: "人教版七年级上册地理", chapter: "第一章 地球和地图" },
  { subject: "英语", schoolStage: "初中", grade: "八年级", textbook: "外研版八年级上册英语", chapter: "Module 1 How to learn English" },
] as const;

const subjectCoverage = subjectFixtures.map((fixture, index) => {
  const assetId = `subject-textbook-${index + 1}`;
  const result = buildTeacherMaterialPackage({
    task: {
      generationMode: "chapter_prep",
      ...fixture,
      sourcePolicy: "uploaded_only",
      textbookIdentity: {
        displayName: fixture.textbook,
        sourceAssetId: assetId,
        verificationStatus: "asset_verified",
      },
      chapterIdentity: { chapter: fixture.chapter, pageStart: 1, pageEnd: 20 },
      uploadedFiles: [
        { name: `${fixture.textbook}.pdf`, assetId, analysis: { ...parsedAnalysis, metadata: { materialRole: "textbook" } } },
        { name: `${fixture.chapter}-教师教学用书.pdf`, assetId: `guide-${index}`, analysis: parsedAnalysis },
        { name: `${fixture.chapter}-教学设计.docx`, assetId: `plan-${index}`, analysis: parsedAnalysis },
        { name: `${fixture.chapter}-同步训练.docx`, assetId: `exercise-${index}`, analysis: parsedAnalysis },
        { name: `${fixture.chapter}-单元检测.pdf`, assetId: `assessment-${index}`, analysis: parsedAnalysis },
      ],
    },
  });
  assert.deepEqual(
    result.items.map((item) => item.role),
    ["textbook", "teacher_guide", "lesson_plan", "exercise", "assessment"],
    `${fixture.subject} material roles must remain separated`,
  );
  assert.equal(result.textbookMatch.status, "asset_verified", `${fixture.subject} textbook asset must be verified`);
  assert.equal(result.readiness.status, "ready", `${fixture.subject} fixture must be ready`);
  assert.equal(result.readiness.canPlan, true);
  assert.equal(result.readiness.canCite, true);
  return { subject: fixture.subject, status: result.readiness.status, roleCount: result.items.length };
});

const inferredTextbook = buildTeacherMaterialPackage({
  task: {
    generationMode: "chapter_prep",
    textbook: "人教版七年级上册数学",
    chapter: "第一章 有理数",
    sourcePolicy: "uploaded_only",
    textbookIdentity: {
      displayName: "人教版七年级上册数学",
      sourceAssetId: "inferred-textbook",
      verificationStatus: "asset_verified",
    },
    uploadedFiles: [
      { name: "人教版七年级上册数学.pdf", assetId: "inferred-textbook", analysis: parsedAnalysis },
    ],
  },
});
assert.equal(inferredTextbook.items[0]?.role, "textbook");
assert.equal(inferredTextbook.items[0]?.roleSource, "inferred");
assert.equal(inferredTextbook.readiness.status, "ready");

const nestedMetadataRole = buildTeacherMaterialPackage({
  task: {
    generationMode: "lesson_plan",
    uploadedFiles: [
      {
        name: "source.pdf",
        assetId: "nested-metadata-role",
        analysis: { ...parsedAnalysis, metadata: { materialRole: "teacher_guide" } },
      },
    ],
  },
});
assert.equal(nestedMetadataRole.items[0]?.role, "teacher_guide");
assert.equal(nestedMetadataRole.items[0]?.roleSource, "metadata");

const needsConfirmationBySubject = subjectFixtures.map((fixture) => {
  const result = buildTeacherMaterialPackage({
    task: {
      generationMode: "chapter_prep",
      ...fixture,
      sourcePolicy: "web_supplement",
      textbookIdentity: { displayName: fixture.textbook },
      uploadedFiles: [
        { name: `${fixture.chapter}-教师用书.pdf`, assetId: `guide-only-${fixture.subject}`, analysis: parsedAnalysis },
        { name: `${fixture.chapter}-教案.docx`, assetId: `plan-only-${fixture.subject}`, analysis: parsedAnalysis },
      ],
    },
  });
  assert.equal(result.readiness.status, "needs_confirmation", `${fixture.subject} must not treat guide/plan as textbook`);
  assert.equal(result.textbookMatch.status, "catalog_verified");
  assert.ok(result.readiness.warnings.includes("no_citable_textbook_source"));
  return fixture.subject;
});

const blockedByMissingChapter = subjectFixtures.map((fixture) => {
  const result = buildTeacherMaterialPackage({
    task: {
      generationMode: "chapter_prep",
      schoolStage: fixture.schoolStage,
      grade: fixture.grade,
      subject: fixture.subject,
      textbook: fixture.textbook,
      sourcePolicy: "uploaded_only",
      textbookIdentity: {
        displayName: fixture.textbook,
        verificationStatus: "teacher_confirmed",
      },
      uploadedFiles: [],
    },
  });
  assert.equal(result.readiness.status, "blocked", `${fixture.subject} without chapter/upload must be blocked`);
  assert.ok(result.readiness.blockingIssues.includes("chapter_identity_required"));
  assert.ok(result.readiness.blockingIssues.includes("uploaded_source_required_by_policy"));
  return fixture.subject;
});

const formatPackage = buildTeacherMaterialPackage({
  task: {
    generationMode: "lesson_plan",
    uploadedFiles: [
      { name: "教材.pdf", assetId: "format-pdf", content: "pdf text" },
      { name: "教案.docx", assetId: "format-docx", content: "docx text" },
      { name: "原课件.pptx", assetId: "format-pptx", content: "pptx text" },
      { name: "课堂记录.txt", assetId: "format-txt", content: "txt text" },
      { name: "备课笔记.md", assetId: "format-md", content: "md text" },
      { name: "板书照片.png", assetId: "format-image", content: "ocr text" },
      { name: "网页材料.html", assetId: "format-html", content: "html text" },
    ],
  },
});
assert.deepEqual(formatPackage.items.map((item) => item.fileType), ["pdf", "docx", "pptx", "txt", "md", "image", "unknown"]);
assert.equal(formatPackage.items.find((item) => item.fileType === "unknown")?.parseStatus, "parsed");
assert.equal(formatPackage.items.find((item) => item.fileType === "unknown")?.usableForPlanning, true);

console.log(JSON.stringify({
  ok: true,
  schemaVersion: packageResult.schemaVersion,
  roles: packageResult.items.map((item) => item.role),
  textbookMatch: packageResult.textbookMatch,
  readiness: packageResult.readiness,
  subjectCoverage,
  needsConfirmationSubjects: needsConfirmationBySubject,
  blockedSubjects: blockedByMissingChapter,
  formats: formatPackage.items.map((item) => ({ fileType: item.fileType, parseStatus: item.parseStatus, usableForPlanning: item.usableForPlanning })),
}, null, 2));
