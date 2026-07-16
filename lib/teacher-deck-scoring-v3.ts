import type { TeacherCoursewareTask } from "@/lib/teacher-courseware-task";
import type { SourceDocument, SlideEvidenceMap } from "@/lib/ppt-agent/evidence-types";
import { scoreTeacherDeckV2, type TeacherDeckScoreInputV2 } from "@/lib/teacher-deck-scoring";

export type TeacherDeckScoreReportV3 = {
  version: "v3";
  scores: {
    textbookAlignment: number;
    pedagogy: number;
    subjectCorrectness: number;
    visual: number;
    engineering: number;
    teacherEfficiency: number;
    total: number;
  };
  evidence: {
    persistedAssets: number;
    traceableSources: number;
    experimentalSources: number;
    averageCoverage: number;
    unsupportedClaimCount: number;
  };
  p0: string[];
  p1: string[];
  p2: string[];
  reviewCopyAllowed: boolean;
  classroomReady: boolean;
  requiresTeacherConfirmation: boolean;
  commercialReady: false;
};

export type TeacherDeckScoreInputV3 = TeacherDeckScoreInputV2 & {
  task?: TeacherCoursewareTask | null;
  sources?: SourceDocument[];
  evidenceMaps?: SlideEvidenceMap[];
  subjectReview?: { completed?: boolean; issueCount?: number };
  imageSemanticReview?: { completed?: boolean; issueCount?: number };
};

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));

export function scoreTeacherDeckV3(input: TeacherDeckScoreInputV3): TeacherDeckScoreReportV3 {
  const v2 = scoreTeacherDeckV2(input);
  const task = input.task;
  const sources = input.sources || [];
  const maps = input.evidenceMaps || [];
  const p0: string[] = [];
  const p1: string[] = [];
  const p2: string[] = [...v2.p2];
  const persistedAssets = sources.filter((source) => source.sourceType === "uploaded_file" && source.storageStatus === "persisted" && source.assetId).length;
  const traceableSources = sources.filter((source) => source.parseStatus === "parsed" && (source.assetId || source.url) && source.sourceType !== "system_fallback" && source.sourceType !== "test_fixture").length;
  const experimentalSources = sources.filter((source) => source.providerTier === "experimental_fallback").length;
  const averageCoverage = maps.length ? maps.reduce((sum, map) => sum + map.evidenceCoverage, 0) / maps.length : 0;
  const unsupportedClaimCount = maps.reduce((sum, map) => sum + map.unsupportedClaims.length, 0);
  const chapterMode = task?.generationMode === "chapter_prep";
  const textbookStatus = task?.textbookIdentity?.verificationStatus || "unverified";
  const chapterStatus = task?.chapterIdentity?.verificationStatus || "unverified";
  const trustedTextbook = textbookStatus === "catalog_verified" || textbookStatus === "asset_verified";
  const trustedChapter = chapterStatus === "catalog_verified" || chapterStatus === "asset_verified";

  if (chapterMode && !task?.textbookIdentity?.displayName) p0.push("章节备课缺少结构化教材身份");
  if (chapterMode && !task?.chapterIdentity?.chapter) p0.push("章节备课缺少结构化章节身份");
  if (chapterMode && !trustedTextbook) p0.push("教材仅由教师文字确认，尚未绑定已解析原文件或可信目录");
  if (chapterMode && !trustedChapter) p0.push("章节尚未通过教材页码或可信目录核验");
  if (chapterMode && traceableSources === 0) p0.push("章节课件没有可追溯的教材或官方来源");
  if (maps.length && averageCoverage < 60) p0.push(`逐页证据平均覆盖率不足60%（当前${Math.round(averageCoverage)}%）`);
  if (unsupportedClaimCount > 0) p1.push(`仍有${unsupportedClaimCount}条页面主张缺少证据`);
  if (experimentalSources > 0 && traceableSources === experimentalSources) p0.push("当前仅有实验性搜索来源，不能证明教材事实");
  else if (experimentalSources > 0) p1.push(`${experimentalSources}条实验性搜索来源需要复核原文`);
  if (input.subjectReview?.completed !== true) p1.push("尚未完成学科正确性复核");
  if ((input.subjectReview?.issueCount || 0) > 0) p0.push(`学科正确性复核发现${input.subjectReview?.issueCount}个问题`);
  if (input.imageSemanticReview?.completed !== true) p1.push("尚未完成图片与题目语义一致性复核");
  if ((input.imageSemanticReview?.issueCount || 0) > 0) p0.push(`图片语义复核发现${input.imageSemanticReview?.issueCount}个问题`);
  p0.push(...v2.p0.filter((issue) => !/真实渲染截图|OOXML可编辑性/.test(issue)));
  p1.push(...v2.p1);

  let textbookAlignment = 0;
  if (task?.textbookIdentity?.displayName) textbookAlignment += 4;
  if (trustedTextbook) textbookAlignment += 7;
  else if (textbookStatus === "teacher_confirmed") textbookAlignment += 3;
  if (task?.chapterIdentity?.chapter) textbookAlignment += 3;
  if (trustedChapter) textbookAlignment += 5;
  else if (chapterStatus === "teacher_confirmed") textbookAlignment += 2;
  if (traceableSources > 0) textbookAlignment += 3;
  if (averageCoverage >= 80) textbookAlignment += 3;
  else if (averageCoverage >= 60) textbookAlignment += 1;

  const pedagogy = clamp((v2.scores.pedagogy / 30) * 25, 25);
  let subjectCorrectness = 6;
  if (traceableSources > 0) subjectCorrectness += 5;
  if (averageCoverage >= 80) subjectCorrectness += 4;
  if (input.subjectReview?.completed) subjectCorrectness += 5;
  subjectCorrectness -= (input.subjectReview?.issueCount || 0) * 5;
  const visual = clamp((v2.scores.visual / 25) * 15 - (input.imageSemanticReview?.completed ? 0 : 2), 15);
  const eng = input.engineering || {};
  const engineering = clamp(
    (eng.ooxmlEditable === true ? 3 : 0) +
    (eng.geometryPassed === true ? 2 : 0) +
    (eng.rendered === true ? 2 : 0) +
    (eng.screenshots === true ? 2 : 0) +
    ((eng.editableObjectCoverage ?? 0) >= 0.9 ? 1 : 0),
    10,
  );
  const teacherEfficiency = input.teacherTrial?.trialCompleted && input.teacherTrial?.reviewedByTeacher ? 5 : 0;
  const scores = {
    textbookAlignment: clamp(textbookAlignment, 25),
    pedagogy,
    subjectCorrectness: clamp(subjectCorrectness, 20),
    visual,
    engineering,
    teacherEfficiency,
    total: 0,
  };
  scores.total = scores.textbookAlignment + scores.pedagogy + scores.subjectCorrectness + scores.visual + scores.engineering + scores.teacherEfficiency;
  const requiresTeacherConfirmation = !(input.teacherTrial?.trialCompleted && input.teacherTrial?.reviewedByTeacher);
  return {
    version: "v3",
    scores,
    evidence: { persistedAssets, traceableSources, experimentalSources, averageCoverage: Math.round(averageCoverage), unsupportedClaimCount },
    p0: [...new Set(p0)],
    p1: [...new Set(p1)],
    p2: [...new Set(p2)],
    reviewCopyAllowed: !p0.some((issue) => /乱码|损坏文本|学科正确性复核发现/.test(issue)),
    classroomReady: p0.length === 0 && p1.length === 0 && !requiresTeacherConfirmation && eng.rendered === true && eng.screenshots === true,
    requiresTeacherConfirmation,
    commercialReady: false,
  };
}
