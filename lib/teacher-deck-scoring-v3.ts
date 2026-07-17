import type { TeacherCoursewareTask } from "@/lib/teacher-courseware-task";
import type { LessonPlan, TeacherDeliveryPack } from "@/lib/ppt-agent/content-plan";
import type { SourceDocument, SlideEvidenceMap } from "@/lib/ppt-agent/evidence-types";
import { scoreTeacherDeckV2, type TeacherDeckScoreInputV2 } from "@/lib/teacher-deck-scoring";

const scoreThresholds = {
  reviewCopyTotal: 75,
  classroomReadyTotal: 85,
  reviewCopyDimensions: { textbookAlignment: 18, pedagogy: 18, subjectCorrectness: 15, visual: 9, engineering: 6, teacherEfficiency: 0 },
  classroomReadyDimensions: { textbookAlignment: 20, pedagogy: 20, subjectCorrectness: 16, visual: 10, engineering: 8, teacherEfficiency: 5 },
} as const;

const subjectSignals = {
  math: { aliases: ["数学", "math", "mathematics"], foreign: ["化学方程式", "反应物", "生成物", "试剂", "史料出处", "经纬度", "信息差对话"] },
  chemistry: { aliases: ["化学", "chemistry"], foreign: ["函数图像", "几何证明", "史料互证", "经纬度", "语篇主旨", "细胞器"] },
  biology: { aliases: ["生物", "biology"], foreign: ["化学方程式", "函数解析式", "史料互证", "经纬度", "语法操练"] },
  history: { aliases: ["历史", "history"], foreign: ["化学方程式", "函数解析式", "细胞结构", "经纬度", "语法操练"] },
  geography: { aliases: ["地理", "geography"], foreign: ["化学方程式", "函数解析式", "细胞器", "史料互证", "语法操练"] },
  english: { aliases: ["英语", "英文", "english"], foreign: ["化学方程式", "函数解析式", "细胞器", "史料互证", "经纬度判读"] },
} as const;

type ScoreDimension = Exclude<keyof TeacherDeckScoreReportV3["scores"], "total">;

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
  contract: {
    version: "teacher-subject-scoring/v1";
    subjectId: keyof typeof subjectSignals | "unclassified";
    thresholds: typeof scoreThresholds;
    reviewCopyDimensionPass: Record<ScoreDimension, boolean>;
    classroomDimensionPass: Record<ScoreDimension, boolean>;
    decision: "blocked" | "review_copy" | "classroom_ready";
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
  lessonPlan?: LessonPlan | null;
  deliveryPack?: TeacherDeliveryPack | null;
  subjectAudit?: { expectedSubject?: string; detectedSubject?: string; leakageTerms?: string[] };
};

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));

function subjectIdOf(subject: string | undefined): keyof typeof subjectSignals | "unclassified" {
  const normalized = String(subject || "").trim().toLowerCase();
  const matched = Object.entries(subjectSignals).find(([, contract]) => contract.aliases.some((alias) => alias.toLowerCase() === normalized));
  return (matched?.[0] as keyof typeof subjectSignals | undefined) || "unclassified";
}

function repeatedComposition(slides: NonNullable<TeacherDeckScoreInputV3["slides"]>) {
  let run = 0;
  let longestRun = 0;
  let previous = "";
  for (const slide of slides) {
    const layout = String(slide.layout || "").trim();
    run = layout && layout === previous ? run + 1 : layout ? 1 : 0;
    longestRun = Math.max(longestRun, run);
    previous = layout;
  }
  const layouts = slides.map((slide) => String(slide.layout || "").trim()).filter(Boolean);
  const counts = new Map<string, number>();
  layouts.forEach((layout) => counts.set(layout, (counts.get(layout) || 0) + 1));
  const dominantCount = Math.max(0, ...counts.values());
  return longestRun >= 4 || (layouts.length >= 8 && dominantCount / layouts.length >= 0.7);
}

function dimensionPass(
  scores: TeacherDeckScoreReportV3["scores"],
  thresholds: typeof scoreThresholds.reviewCopyDimensions | typeof scoreThresholds.classroomReadyDimensions,
) {
  return Object.fromEntries(Object.entries(thresholds).map(([dimension, minimum]) => [dimension, scores[dimension as ScoreDimension] >= minimum])) as Record<ScoreDimension, boolean>;
}

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
  const materialMatch = task?.materialPackage?.textbookMatch;
  const lessonPlan = input.lessonPlan || task?.deckPlan?.lessonPlan || task?.deckPlan?.lessonBlueprint?.lessonPlan;
  const deliveryPack = input.deliveryPack;
  const expectedSubject = input.subjectAudit?.expectedSubject || task?.subject;
  const expectedSubjectId = subjectIdOf(expectedSubject);

  if (chapterMode && !task?.textbookIdentity?.displayName) p0.push("章节备课缺少结构化教材身份");
  if (chapterMode && !task?.chapterIdentity?.chapter) p0.push("章节备课缺少结构化章节身份");
  if (chapterMode && !trustedTextbook) p0.push("教材仅由教师文字确认，尚未绑定已解析原文件或可信目录");
  if (chapterMode && !trustedChapter) p0.push("章节尚未通过教材页码或可信目录核验");
  if (traceableSources === 0) p0.push(chapterMode ? "章节课件没有可追溯的教材或官方来源" : "课件没有可追溯的教材或官方来源");
  if (materialMatch && (materialMatch.status === "ambiguous" || materialMatch.status === "unmatched" || materialMatch.requiresTeacherConfirmation)) {
    p0.push("教材来源存在歧义或尚未完成身份确认");
  }
  if (maps.length && averageCoverage < 60) p0.push(`逐页证据平均覆盖率不足60%（当前${Math.round(averageCoverage)}%）`);
  if (unsupportedClaimCount > 0) p1.push(`仍有${unsupportedClaimCount}条页面主张缺少证据`);
  if (experimentalSources > 0 && traceableSources === experimentalSources) p0.push("当前仅有实验性搜索来源，不能证明教材事实");
  else if (experimentalSources > 0) p1.push(`${experimentalSources}条实验性搜索来源需要复核原文`);
  if (input.subjectReview?.completed !== true) p1.push("尚未完成学科正确性复核");
  if ((input.subjectReview?.issueCount || 0) > 0) p0.push(`学科正确性复核发现${input.subjectReview?.issueCount}个问题`);
  if (input.imageSemanticReview?.completed !== true) p1.push("尚未完成图片与题目语义一致性复核");
  if ((input.imageSemanticReview?.issueCount || 0) > 0) p0.push(`图片语义复核发现${input.imageSemanticReview?.issueCount}个问题`);
  const events = lessonPlan?.events || [];
  const eventTypes = new Set(events.map((event) => event.type));
  const incompleteEvents = events.filter((event) => !event.durationMinutes || !event.teacherAction?.trim() || !event.studentAction?.trim() || !event.evidenceOfLearning?.trim() || !event.fallbackAction?.trim());
  if (events.length < 5 || incompleteEvents.length > 0 || ![...eventTypes].some((type) => type === "practice" || type === "inquire") || !eventTypes.has("feedback") || ![...eventTypes].some((type) => type === "closing" || type === "transfer" || type === "assess")) {
    p0.push("课堂事件链不完整：至少需要学习任务、反馈、收束或迁移，并包含可检查产出与兜底动作");
  }
  const missingDeliverables = [
    !deliveryPack?.teacherNotes?.length && "教师讲稿",
    !deliveryPack?.answerKey?.length && "答案与评分标准",
    !deliveryPack?.boardPlan?.columns?.length && "板书方案",
    !deliveryPack?.homework?.length && "分层作业",
    !deliveryPack?.answerKey?.some((answer) => answer.scoringCriteria?.trim()) && "评价标准",
    !deliveryPack?.teacherNotes?.some((note) => note.fallbackAction?.trim()) && "课堂兜底动作",
  ].filter(Boolean);
  if (missingDeliverables.length) p0.push(`教师交付包不完整：缺少${missingDeliverables.join("、")}`);
  const explicitLeakage = (input.subjectAudit?.leakageTerms || []).filter(Boolean);
  const detectedSubjectId = subjectIdOf(input.subjectAudit?.detectedSubject);
  const slideText = (input.slides || []).map((slide) => [slide.title, slide.body, ...(slide.bullets || [])].filter(Boolean).join(" ")).join(" ");
  const inferredLeakage = expectedSubjectId === "unclassified" ? [] : subjectSignals[expectedSubjectId].foreign.filter((term) => slideText.includes(term));
  if ((detectedSubjectId !== "unclassified" && detectedSubjectId !== expectedSubjectId) || explicitLeakage.length || inferredLeakage.length >= 2) {
    p0.push(`检测到跨学科内容泄漏：${[...new Set([...explicitLeakage, ...inferredLeakage])].join("、") || input.subjectAudit?.detectedSubject}`);
  }
  if (repeatedComposition(input.slides || [])) p0.push("版式构图重复：连续4页相同或单一构图占比超过70%");
  if (input.engineering?.rendered !== true || input.engineering?.screenshots !== true) p0.push("缺少真实渲染与逐页截图证据");
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
  const reviewCopyDimensionPass = dimensionPass(scores, scoreThresholds.reviewCopyDimensions);
  const classroomDimensionPass = dimensionPass(scores, scoreThresholds.classroomReadyDimensions);
  const uniqueP0 = [...new Set(p0)];
  const uniqueP1 = [...new Set(p1)];
  const reviewCopyAllowed = uniqueP0.length === 0 && scores.total >= scoreThresholds.reviewCopyTotal && Object.values(reviewCopyDimensionPass).every(Boolean);
  const classroomReady = reviewCopyAllowed && uniqueP1.length === 0 && !requiresTeacherConfirmation && scores.total >= scoreThresholds.classroomReadyTotal && Object.values(classroomDimensionPass).every(Boolean);
  return {
    version: "v3",
    scores,
    evidence: { persistedAssets, traceableSources, experimentalSources, averageCoverage: Math.round(averageCoverage), unsupportedClaimCount },
    contract: {
      version: "teacher-subject-scoring/v1",
      subjectId: expectedSubjectId,
      thresholds: scoreThresholds,
      reviewCopyDimensionPass,
      classroomDimensionPass,
      decision: classroomReady ? "classroom_ready" : reviewCopyAllowed ? "review_copy" : "blocked",
    },
    p0: uniqueP0,
    p1: uniqueP1,
    p2: [...new Set(p2)],
    reviewCopyAllowed,
    classroomReady,
    requiresTeacherConfirmation,
    commercialReady: false,
  };
}
