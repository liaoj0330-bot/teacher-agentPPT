import assert from "node:assert/strict";
import { GET, POST } from "../app/api/textbook-catalog/match/route.ts";
import { buildTeacherMaterialPackage } from "../lib/ppt-agent/teacher-material-package.ts";
import {
  resolveTextbookCatalog,
  TEXTBOOK_CATALOG_COVERAGE,
  TEXTBOOK_CATALOG_ENTRIES,
  type TextbookCatalogInput,
  type TextbookCatalogResolution,
} from "../lib/ppt-agent/textbook-catalog.ts";

type MatchCase = {
  id: string;
  input: TextbookCatalogInput;
  expected: TextbookCatalogResolution["status"];
  conflict?: string;
};

const cases: MatchCase[] = [
  { id: "pep-middle-math", input: { displayName: "人教版八年级数学上册" }, expected: "exact" },
  { id: "pep-numeric-grade", input: { displayName: "人教版2年级数学上册" }, expected: "exact" },
  { id: "unified-primary-chinese", input: { displayName: "统编版语文三年级上册" }, expected: "exact" },
  { id: "unified-alias-history", input: { displayName: "部编版八年级历史上册" }, expected: "exact" },
  { id: "bnu-short-alias", input: { displayName: "北师版七年级数学上册" }, expected: "exact" },
  { id: "sujiao-common-typo", input: { displayName: "苏教本五年级数学下册" }, expected: "exact" },
  { id: "fltrp-publisher-alias", input: { displayName: "外研社版初二英语上册" }, expected: "exact" },
  { id: "pep-high-physics", input: { displayName: "人教版高中物理选择性必修第二册" }, expected: "exact" },
  { id: "pep-high-chemistry-number", input: { displayName: "人教高中化学必修1" }, expected: "exact" },
  { id: "pep-full-publisher", input: { displayName: "人民教育出版社七年级地理上册" }, expected: "exact" },
  { id: "unified-common-typo", input: { displayName: "统遍版九年级语文下册" }, expected: "exact" },
  { id: "pep-publisher-typo", input: { displayName: "人名教育出版社七年级英语上册" }, expected: "exact" },
  { id: "yilin-english", input: { displayName: "译林版六年级英语下册" }, expected: "exact" },
  { id: "education-science-typo", input: { displayName: "教课版五年级科学上册" }, expected: "exact" },
  { id: "reordered-unified", input: { displayName: "九上语文统编", grade: "九年级", volume: "上册" }, expected: "exact" },
  { id: "missing-volume", input: { displayName: "人教版八年级数学" }, expected: "ambiguous" },
  { id: "missing-grade", input: { displayName: "人教版数学上册" }, expected: "ambiguous" },
  { id: "missing-edition", input: { displayName: "八年级数学上册" }, expected: "ambiguous" },
  { id: "missing-subject", input: { displayName: "外研版八年级上册" }, expected: "ambiguous" },
  { id: "edition-only", input: { displayName: "人教版" }, expected: "ambiguous" },
  { id: "publisher-conflict", input: { displayName: "外研版八年级英语上册", publisher: "人民教育出版社" }, expected: "ambiguous", conflict: "publisher_conflict" },
  { id: "subject-conflict", input: { displayName: "人教版八年级数学上册", subject: "英语" }, expected: "ambiguous", conflict: "subject_conflict" },
  { id: "grade-conflict", input: { displayName: "人教版八年级数学上册", grade: "七年级" }, expected: "ambiguous", conflict: "grade_conflict" },
  { id: "stage-conflict", input: { displayName: "人教版八年级数学上册", schoolStage: "小学" }, expected: "ambiguous", conflict: "school_stage_conflict" },
  { id: "unsupported-edition-subject", input: { displayName: "外研版八年级数学上册" }, expected: "ambiguous", conflict: "edition_subject_conflict" },
  { id: "isbn-only", input: { displayName: "9787100000000" }, expected: "unmatched" },
  { id: "preschool-no-directory", input: { displayName: "幼儿园小班数学活动册" }, expected: "ambiguous" },
  { id: "unknown-family", input: { displayName: "星河版机器人课程" }, expected: "unmatched" },
  { id: "empty", input: {}, expected: "unmatched" },
];

const results = cases.map((testCase) => {
  const result = resolveTextbookCatalog(testCase.input);
  assert.equal(result.status, testCase.expected, `${testCase.id}: unexpected status`);
  if (testCase.expected === "exact") {
    assert.ok(result.catalogId, `${testCase.id}: exact match needs catalogId`);
    assert.equal(result.requiresTeacherConfirmation, false, `${testCase.id}: exact match must be immediately usable`);
  } else {
    assert.equal(result.requiresTeacherConfirmation, true, `${testCase.id}: non-exact match needs confirmation`);
  }
  if (testCase.conflict) assert.ok(result.conflicts.includes(testCase.conflict), `${testCase.id}: missing ${testCase.conflict}`);
  return { id: testCase.id, status: result.status, confidence: result.confidence, catalogId: result.catalogId, candidateCount: result.candidateIds.length, conflicts: result.conflicts };
});

const exactPackage = buildTeacherMaterialPackage({
  task: { generationMode: "chapter_prep", textbook: "人教版八年级数学上册", chapter: "第十四章 一次函数", uploadedFiles: [] },
});
assert.equal(exactPackage.textbookMatch.status, "catalog_verified");
assert.equal(exactPackage.textbookMatch.requiresTeacherConfirmation, false);

const teacherConfirmed = buildTeacherMaterialPackage({
  task: {
    generationMode: "chapter_prep",
    textbook: "人教版八年级数学上册",
    chapter: "第十四章 一次函数",
    textbookIdentity: { displayName: "人教版八年级数学上册", verificationStatus: "teacher_confirmed" },
    uploadedFiles: [],
  },
});
assert.equal(teacherConfirmed.textbookMatch.status, "teacher_confirmed", "teacher confirmation must retain its weaker provenance");

const forgedCatalogVerification = buildTeacherMaterialPackage({
  task: {
    generationMode: "chapter_prep",
    textbook: "星河版机器人课程",
    chapter: "第一章",
    textbookIdentity: { displayName: "星河版机器人课程", verificationStatus: "catalog_verified" },
    uploadedFiles: [],
  },
});
assert.equal(forgedCatalogVerification.textbookMatch.status, "ambiguous");
assert.ok(forgedCatalogVerification.textbookMatch.conflicts.includes("invalid_catalog_verification"));

const forgedCatalogWithAsset = buildTeacherMaterialPackage({
  task: {
    generationMode: "chapter_prep",
    textbook: "人教版八年级数学上册",
    chapter: "第十四章",
    textbookIdentity: { displayName: "人教版八年级数学上册", sourceAssetId: "lesson-plan-only", verificationStatus: "catalog_verified" },
    uploadedFiles: [{ name: "数学教案.docx", assetId: "lesson-plan-only", materialRole: "lesson_plan", content: "parsed" }],
  },
});
assert.equal(forgedCatalogWithAsset.textbookMatch.status, "unmatched", "catalog status cannot override a non-textbook source asset");
assert.ok(forgedCatalogWithAsset.textbookMatch.conflicts.includes("source_asset_is_not_a_textbook"));

const filenameOnly = buildTeacherMaterialPackage({
  task: {
    generationMode: "chapter_prep",
    textbook: "人教版八年级数学上册",
    chapter: "第十四章 一次函数",
    uploadedFiles: [{ name: "人教版八年级数学上册.pdf", assetId: "file-name-only", content: "parsed text" }],
  },
});
assert.notEqual(filenameOnly.textbookMatch.status, "catalog_verified", "file-name similarity alone must not become catalog truth");

const exactApiResponse = await POST(new Request("http://localhost/api/textbook-catalog/match", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ displayName: "外研版八年级英语上册" }),
}));
assert.equal(exactApiResponse.status, 200);
const exactApi = await exactApiResponse.json() as { match: TextbookCatalogResolution; verificationStatus: string };
assert.equal(exactApi.match.status, "exact");
assert.equal(exactApi.verificationStatus, "catalog_verified");

const ambiguousApiResponse = await GET(new Request("http://localhost/api/textbook-catalog/match?displayName=%E5%85%AB%E5%B9%B4%E7%BA%A7%E6%95%B0%E5%AD%A6%E4%B8%8A%E5%86%8C"));
assert.equal(ambiguousApiResponse.status, 200);
const ambiguousApi = await ambiguousApiResponse.json() as { match: TextbookCatalogResolution; verificationStatus: string; candidates: unknown[] };
assert.equal(ambiguousApi.match.status, "ambiguous");
assert.equal(ambiguousApi.verificationStatus, "unverified");
assert.ok(ambiguousApi.candidates.length > 1);

const invalidApiResponse = await POST(new Request("http://localhost/api/textbook-catalog/match", { method: "POST", body: "{" }));
assert.equal(invalidApiResponse.status, 400);

const counts = results.reduce<Record<string, number>>((summary, result) => {
  summary[result.status] = (summary[result.status] || 0) + 1;
  return summary;
}, {});

console.log(JSON.stringify({
  ok: true,
  cases: cases.length,
  counts,
  catalogEntries: TEXTBOOK_CATALOG_ENTRIES.length,
  coverage: TEXTBOOK_CATALOG_COVERAGE,
  provenance: {
    exactDirectory: exactPackage.textbookMatch.status,
    teacherConfirmed: teacherConfirmed.textbookMatch.status,
    forgedCatalogVerification: forgedCatalogVerification.textbookMatch.status,
    filenameOnly: filenameOnly.textbookMatch.status,
  },
  results,
}, null, 2));
