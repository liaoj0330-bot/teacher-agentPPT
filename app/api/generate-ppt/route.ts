import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildProjectFromPrompt, type CanvasProject, type ResearchItem, type SearchGroup, type TeacherPptStyle } from "@/lib/canvas-data";
import { spendCredits } from "@/lib/credits";
import { compactAnalysisForPrompt, type DocumentAnalysis } from "@/lib/document-analysis";
import { buildProjectFromBeautifySource, buildProjectFromDocument } from "@/lib/project-builder";
import { ensureProjectQuality } from "@/lib/project-quality";
import { attachDeckSpec } from "@/lib/deck-spec";
import { applyContentPlanToReviewCenter, applyEvidenceReportToReviewCenter, applyLayoutPlansToReviewCenter, applyPlanningAuditToProject, applySlidePagePlansToReviewCenter, detectPPTType, initializeReviewCenter, persistDeductionRules, reviewGeneratedProject } from "@/lib/ppt-review-center";
import { scoreTeacherDeckV2 } from "@/lib/teacher-deck-scoring";
import { scoreTeacherDeckV3 } from "@/lib/teacher-deck-scoring-v3";
import { createContentPlan } from "@/lib/ppt-agent/content-planner";
import { createDeckLayoutPlans } from "@/lib/ppt-agent/deck-layout-planner";
import { createBeautifyPlan } from "@/lib/ppt-agent/beautify-plan";
import { extractEvidenceBlocks } from "@/lib/ppt-agent/evidence-extractor";
import { mapSlideEvidence } from "@/lib/ppt-agent/evidence-mapper";
import { buildEvidenceNeeds } from "@/lib/ppt-agent/evidence-need-builder";
import { buildDeckEvidenceReport } from "@/lib/ppt-agent/evidence-reporter";
import { createDeckContentDrafts } from "@/lib/ppt-agent/deck-content-realizer";
import { createSlidePagePlans } from "@/lib/ppt-agent/slide-page-planner";
import { repairLayoutPlans, validateLayoutPlans } from "@/lib/ppt-agent/layout-plan-validator";
import { repairSlidePagePlans, validateSlidePagePlans } from "@/lib/ppt-agent/slide-page-plan-validator";
import { acquireSourceDocuments } from "@/lib/ppt-agent/source-acquisition";
import { cleanProject, cleanText } from "@/lib/text-sanitize";
import { selectTeacherTemplate } from "@/lib/teacher-template-registry";
import { upsertCoursewareVersion, type CoursewareVersionInsertResult } from "@/lib/courseware-version";
import type { TeacherCoursewareTask } from "@/lib/teacher-courseware-task";
import { normalizeTeacherTask } from "@/lib/teacher-topic-normalizer";
import { buildTeacherMaterialPackage } from "@/lib/ppt-agent/teacher-material-package";

type Mode = CanvasProject["mode"];

const systemPrompt = [
  "你是一个画布式 PPT Agent，不是模板填字工具。",
  "工作流必须是：需求理解 -> 公开资料/上传资料解析 -> 便签式大纲 -> 页面内容策划 -> 页面级设计。",
  "如果 documentContext 存在，优先使用上传资料，必须把内容块映射到 outline、plan、slides 的 evidenceBlockIds。",
  "如果 researchSources 存在，优先使用其中的真实来源，不要编造 URL。",
  "输出必须是严格 JSON，不要 Markdown，不要解释。",
  "字段必须包含 title、prompt、mode、outline、research、plan、slides。",
  "slides 需要 9-12 页。每页包含 title、subtitle、tone、layout、bullets、visualPrompt、speakerNote，可包含 evidenceBlockIds、sourceIds、pageIntent。",
  "每页尽量提供 sections 数组，用于页面级自动排版。sections 比 bullets 更重要，bullets 只是兜底文案。",
  "sections 支持：hero-image、image-strip、day-card、route-card、tips-grid、stat-card、donut-chart、bar-chart、table、warning、tag-row、timeline、quote、source-note、callout。",
  "旅行、报告、产品介绍都要按页面内容选择不同 sections：封面用 hero-image/stat-card/tag-row；路线页用 timeline/day-card/route-card；数据页用 stat-card/bar-chart/donut-chart/table；风险页用 warning/tips-grid；来源页用 source-note。",
  "layout 必须按内容差异选择，允许 cover、agenda、section、split、matrix、timeline、stats、comparison、evidence、quote、process、checklist、closing、source，不要整套都用同一种布局。",
  "页面文案必须中文可读，避免乱码、空话、重复句。每页只承载一个清晰观点，正文短句化，适合真实 PPT 排版。",
  "设计原则：明确视觉层级、网格对齐、留白充足、重点对比、少文字多结构，避免廉价模板感。"
].join("\n");

function responsesEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  return normalized.endsWith("/v1") ? `${normalized}/responses` : `${normalized}/v1/responses`;
}

function chatCompletionsEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  return normalized.endsWith("/v1") ? `${normalized}/chat/completions` : `${normalized}/v1/chat/completions`;
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") {
    return record.output_text;
  }
  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    const content = Array.isArray((item as Record<string, unknown>).content) ? ((item as Record<string, unknown>).content as unknown[]) : [];
    for (const contentItem of content) {
      const contentRecord = contentItem as Record<string, unknown>;
      if (typeof contentRecord.text === "string") {
        return contentRecord.text;
      }
      if (typeof contentRecord.output_text === "string") {
        return contentRecord.output_text;
      }
    }
  }
  return "";
}

function extractChatText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const choices = Array.isArray((payload as Record<string, unknown>).choices) ? ((payload as Record<string, unknown>).choices as unknown[]) : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  return typeof message?.content === "string" ? message.content : "";
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("empty model response");
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("model response is not json");
    }
    return JSON.parse(match[0]);
  }
}

function timeoutMs() {
  const parsed = Number(process.env.OPENAI_TIMEOUT_MS);
  const configured = Number.isFinite(parsed) && parsed >= 15000 ? parsed : 45000;
  return Math.min(configured, 120000);
}

function isAbortError(error: unknown) {
  return (error instanceof DOMException && error.name === "AbortError") || (error instanceof Error && error.name === "AbortError");
}

function flattenResearchSources(value: unknown): ResearchItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const groups = value as SearchGroup[];
  return groups
    .flatMap((group, groupIndex) =>
      (Array.isArray(group.results) ? group.results : []).slice(0, 3).map((result, resultIndex) => ({
        id: `research-source-${groupIndex + 1}-${resultIndex + 1}`,
        title: cleanText(result.title, group.query || `资料 ${groupIndex + 1}`),
        source: cleanText(result.sourceName || result.url || "公开网页"),
        sourceName: cleanText(result.sourceName || result.url || "公开网页"),
        sourceType: result.sourceType || "search",
        status: result.status || "search-result",
        url: cleanText(result.url),
        summary: cleanText(result.snippet, "公开资料摘要。"),
        confidence: Math.max(35, Math.min(98, Number(result.confidence) || 68))
      }))
    )
    .filter((item) => item.title && (item.url || item.summary))
    .slice(0, 12);
}

function getUploadedAnalysis(uploadedFile: unknown): DocumentAnalysis | undefined {
  if (!uploadedFile || typeof uploadedFile !== "object") {
    return undefined;
  }
  const analysis = (uploadedFile as { analysis?: DocumentAnalysis }).analysis;
  return analysis && analysis.blockCount > 0 ? analysis : undefined;
}

function normalizeTeacherStyle(value: unknown): TeacherPptStyle | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const visualMode = record.visualMode === "teaching_grid" || record.visualMode === "teaching_editorial" ? record.visualMode : undefined;
  const theme = ["book_blue", "rational_teal", "warm_orange", "high_contrast"].includes(String(record.theme)) ? record.theme as TeacherPptStyle["theme"] : undefined;
  return visualMode && theme ? { visualMode, theme } : undefined;
}

function isTravelPrompt(prompt: string) {
  return /(旅游|旅行|攻略|行程|景点|一日游|二日游|三日游|四日游|五日游|自由行)/.test(prompt);
}

function looksLowQualityProject(project: CanvasProject, prompt: string) {
  const title = cleanText(project.title);
  const joined = cleanText([project.title, project.prompt, ...project.slides.map((slide) => `${slide.title} ${slide.subtitle}`)].join(" "));
  const slideCount = project.slides.length;
  const suspiciousTitle = /(待确认|请先|无法解析|补充主题|输入不完整|未提供|placeholder)/i.test(title);
  const tooManyQuestionMarks = (joined.match(/\?/g) ?? []).length >= 6;
  const lowSections = project.slides.filter((slide) => (slide.sections?.length || 0) > 0).length < Math.max(3, Math.floor(slideCount / 3));
  const travelWithoutTravelStructure =
    isTravelPrompt(prompt) &&
    !project.slides.some((slide) => ["agenda", "day-route", "comparison", "stats", "checklist", "source"].includes(slide.layout || "")) &&
    !project.slides.some((slide) => slide.sections?.some((section) => ["day-card", "route-card", "timeline", "table", "donut-chart"].includes(section.type)));

  return suspiciousTitle || tooManyQuestionMarks || slideCount < 8 || lowSections || travelWithoutTravelStructure;
}

function normalizeProject(project: Partial<CanvasProject>, prompt: string, mode: Mode, researchContext: ResearchItem[] = [], uploadedFile?: unknown): CanvasProject {
  const fallback = getUploadedAnalysis(uploadedFile)
    ? buildProjectFromDocument(prompt, mode, uploadedFile, researchContext)
    : buildProjectFromPrompt(prompt, mode);
  const sourceOutline = Array.isArray(project.outline) && project.outline.length > 0 ? project.outline : fallback.outline;
  const sourceResearch =
    researchContext.length > 0
      ? researchContext
      : Array.isArray(project.research) && project.research.length > 0
        ? project.research
        : fallback.research;
  const sourcePlan = Array.isArray(project.plan) && project.plan.length > 0 ? project.plan : fallback.plan;
  const sourceSlides = Array.isArray(project.slides) && project.slides.length > 0 ? project.slides : fallback.slides;

  return cleanProject({
    title: cleanText(project.title, fallback.title),
    prompt,
    mode,
    outline: sourceOutline.slice(0, 10).map((item, index) => ({
      id: `outline-${index + 1}`,
      page: Number.isFinite(Number(item?.page)) ? Number(item?.page) : index + 1,
      title: cleanText(item?.title, fallback.outline[index % fallback.outline.length]?.title || `第 ${index + 1} 页`),
      note: cleanText(item?.note, fallback.outline[index % fallback.outline.length]?.note || ""),
      evidenceBlockIds: Array.isArray(item?.evidenceBlockIds) ? item.evidenceBlockIds.map((id) => cleanText(id)).filter(Boolean) : []
    })),
    research: sourceResearch.slice(0, 12).map((item, index) => ({
      id: `research-${index + 1}`,
      title: cleanText(item?.title, fallback.research[index % Math.max(1, fallback.research.length)]?.title || `资料 ${index + 1}`),
      source: cleanText(item?.source, fallback.research[index % Math.max(1, fallback.research.length)]?.source || "公开资料"),
      sourceName: cleanText(item?.sourceName, item?.source || "公开资料"),
      sourceType: item?.sourceType || "search",
      status: item?.status || "search-result",
      url: cleanText(item?.url),
      summary: cleanText(item?.summary),
      confidence: Math.max(35, Math.min(98, Number(item?.confidence) || 68))
    })),
    plan: sourcePlan.slice(0, 12).map((item, index) => ({
      id: `plan-${index + 1}`,
      page: Number.isFinite(Number(item?.page)) ? Number(item?.page) : index + 1,
      title: cleanText(item?.title, fallback.plan[index % Math.max(1, fallback.plan.length)]?.title || `策划 ${index + 1}`),
      layout: cleanText(item?.layout, fallback.plan[index % Math.max(1, fallback.plan.length)]?.layout || "cards"),
      elements:
        Array.isArray(item?.elements) && item.elements.length > 0
          ? item.elements.map((element) => cleanText(element)).filter(Boolean).slice(0, 6)
          : fallback.plan[index % Math.max(1, fallback.plan.length)]?.elements || [],
      evidenceBlockIds: Array.isArray(item?.evidenceBlockIds) ? item.evidenceBlockIds.map((id) => cleanText(id)).filter(Boolean) : []
    })),
    slides: sourceSlides.slice(0, 12).map((item, index) => ({
      id: `slide-${index + 1}`,
      title: cleanText(item?.title, fallback.slides[index % fallback.slides.length]?.title || `第 ${index + 1} 页`),
      subtitle: cleanText(item?.subtitle, fallback.slides[index % fallback.slides.length]?.subtitle || ""),
      tone: cleanText(item?.tone, "商务简约"),
      layout: item?.layout || fallback.slides[index % fallback.slides.length]?.layout || "cards",
      bullets:
        Array.isArray(item?.bullets) && item.bullets.length > 0
          ? item.bullets.map((bullet) => cleanText(bullet)).filter(Boolean).slice(0, 6)
          : fallback.slides[index % fallback.slides.length]?.bullets || [],
      visualPrompt: cleanText(item?.visualPrompt, fallback.slides[index % fallback.slides.length]?.visualPrompt || ""),
      speakerNote: cleanText(item?.speakerNote, fallback.slides[index % fallback.slides.length]?.speakerNote || ""),
      evidenceBlockIds: Array.isArray(item?.evidenceBlockIds) ? item.evidenceBlockIds.map((id) => cleanText(id)).filter(Boolean) : [],
      sourceIds: Array.isArray(item?.sourceIds) ? item.sourceIds.map((id) => cleanText(id)).filter(Boolean) : [],
      pageIntent: cleanText(item?.pageIntent),
      sections:
        Array.isArray(item?.sections) && item.sections.length > 0
          ? item.sections
          : fallback.slides[index % fallback.slides.length]?.sections || []
    }))
  });
}

function userPayload(prompt: string, mode: Mode, uploadedFile: unknown, researchSources: ResearchItem[]) {
  const analysis = getUploadedAnalysis(uploadedFile);
  return {
    prompt,
    mode,
    uploadedFile: uploadedFile
      ? {
          name: (uploadedFile as { name?: string }).name,
          type: (uploadedFile as { type?: string }).type,
          size: (uploadedFile as { size?: number }).size
        }
      : null,
    documentContext: compactAnalysisForPrompt(analysis),
    researchSources,
    requiredWorkflow: ["需求理解", "资料解析/检索", "便签式大纲", "内容策划", "页面级设计", "PPTX 导出"],
    designRules: ["一页一个观点", "按内容密度选版式", "少文字多结构", "保留证据来源", "避免整套同模板", "优先输出 sections 页面模块"]
  };
}

async function generateWithOpenAI(prompt: string, mode: Mode, uploadedFile: unknown, researchSources: ResearchItem[]): Promise<CanvasProject> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com";
  const model = process.env.OPENAI_MODEL || "gpt-5.5";
  const wireApi = process.env.OPENAI_WIRE_API || "responses";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const primary = wireApi === "chat" ? generateWithChatCompletions : generateWithResponses;
  const secondary = wireApi === "chat" ? generateWithResponses : generateWithChatCompletions;

  return primary({ apiKey, baseUrl, model, prompt, mode, uploadedFile, researchSources }).catch(async (error) => {
    if (isAbortError(error)) {
      throw error;
    }
    console.warn("[generate-ppt] Primary model request failed, trying fallback wire API.", error);
    return secondary({ apiKey, baseUrl, model, prompt, mode, uploadedFile, researchSources });
  });
}

async function generateWithResponses({
  apiKey,
  baseUrl,
  model,
  prompt,
  mode,
  uploadedFile,
  researchSources
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  mode: Mode;
  uploadedFile: unknown;
  researchSources: ResearchItem[];
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs());
  let response: Response;
  try {
    response = await fetch(responsesEndpoint(baseUrl), {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload(prompt, mode, uploadedFile, researchSources)) }
        ],
        max_output_tokens: 6500
      })
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI request failed: ${response.status} ${detail.slice(0, 240)}`);
  }
  const payload = await response.json();
  const parsed = parseJsonObject(extractResponseText(payload)) as Partial<CanvasProject>;
  return normalizeProject(parsed, prompt, mode, researchSources, uploadedFile);
}

async function generateWithChatCompletions({
  apiKey,
  baseUrl,
  model,
  prompt,
  mode,
  uploadedFile,
  researchSources
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  mode: Mode;
  uploadedFile: unknown;
  researchSources: ResearchItem[];
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs());
  let response: Response;
  try {
    response = await fetch(chatCompletionsEndpoint(baseUrl), {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload(prompt, mode, uploadedFile, researchSources)) }
        ],
        max_tokens: 6500
      })
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI chat request failed: ${response.status} ${detail.slice(0, 240)}`);
  }
  const payload = await response.json();
  const parsed = parseJsonObject(extractChatText(payload)) as Partial<CanvasProject>;
  return normalizeProject(parsed, prompt, mode, researchSources, uploadedFile);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user) {
    try {
      await spendCredits(user.id, 24, "生成 PPT", "api", "generate-ppt");
    } catch (error) {
      if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") {
        return NextResponse.json({ message: "积分不足，请邀请好友或切换本地演示模式" }, { status: 402 });
      }
      throw error;
    }
  }

  const body = await request.json().catch(() => null);
  const scenario = body?.scenario === "teacher_courseware" ? "teacher_courseware" as const : undefined;
  const normalizedTeacherTask = scenario && body?.teacherTask ? normalizeTeacherTask(body.teacherTask as TeacherCoursewareTask) : undefined;
  const materialPackage = normalizedTeacherTask ? buildTeacherMaterialPackage({ task: normalizedTeacherTask }) : undefined;
  if (materialPackage?.readiness.status === "blocked") {
    return NextResponse.json({
      code: "MATERIAL_PACKAGE_BLOCKED",
      message: "上传资料尚不能支持可靠生成，请处理解析失败或教材匹配问题。",
      materialPackage,
    }, { status: 422 });
  }
  const teacherTask = normalizedTeacherTask && materialPackage
    ? { ...normalizedTeacherTask, materialPackage }
    : normalizedTeacherTask;
  if (scenario === "teacher_courseware" && (!teacherTask || teacherTask.scenario !== scenario || teacherTask.planningMode !== "professional")) {
    return NextResponse.json({ message: "teacherTask is required for teacher_courseware" }, { status: 400 });
  }
  const taskPrompt = scenario && teacherTask
    ? `请为${teacherTask.schoolStage || ""}${teacherTask.grade || ""}${teacherTask.subject || ""}课题“${teacherTask.topic || ""}”生成一份${teacherTask.duration || ""}的课堂课件。${teacherTask.pastedMaterials || ""}`
    : "";
  const prompt = typeof body?.prompt === "string" ? cleanText(body.prompt) : cleanText(taskPrompt);
  const mode = body?.mode === "reference" || body?.mode === "beautify" ? body.mode : "agent";
  const uploadedFile = body?.uploadedFile ?? body?.uploadedFiles ?? teacherTask?.uploadedFiles ?? null;
  const researchSources = flattenResearchSources(body?.researchSources);
  const uploadedAssets = Array.isArray(body?.uploadedAssets)
    ? body.uploadedAssets
    : Array.isArray(uploadedFile)
      ? uploadedFile
      : uploadedFile
        ? [uploadedFile]
        : [];
  const forceLocal = body?.forceLocal === true || body?.provider === "local";
  const teacherStyle = normalizeTeacherStyle(body?.teacherStyle ?? teacherTask?.teacherStyle);
  const teacherTemplate = scenario && teacherTask
    ? selectTeacherTemplate({ scenario, lessonType: teacherTask.lessonType, subject: teacherTask.subject, schoolStage: teacherTask.schoolStage, planningMode: teacherTask.planningMode })
    : undefined;

  if (!prompt) {
    return NextResponse.json({ message: "prompt is required" }, { status: 400 });
  }

  const typeDetection = detectPPTType(prompt, uploadedAssets);
  const beautifyPlan = mode === "beautify"
    ? createBeautifyPlan({
        analysis: getUploadedAnalysis(uploadedFile),
        prompt,
        intensity: teacherTask?.beautifyOptions?.intensity,
        sourceAssetId: teacherTask?.beautifyOptions?.sourceAssetId,
      })
    : undefined;
  const { contentPlan, validation: contentPlanValidation } = createContentPlan({
    prompt,
    pptType: scenario ? "courseware" : typeDetection.type,
    uploadedAssets,
    research: researchSources,
    typeDetection,
    mode: body?.planningMode === "quick" ? "quick" : "professional",
    userPreferences: {
      ...(body?.userPreferences || {}),
      scenario,
      teacherTask,
      teacherStyle,
      workbenchMode: mode,
      templateId: teacherTemplate?.templateId
    },
    expertStyle: body?.expertStyle
  });

  if (!contentPlanValidation.valid) {
    return NextResponse.json(
      {
        message: "ContentPlan 校验未通过，已阻止低质量生成",
        contentPlan,
        contentPlanValidation
      },
      { status: 422 }
    );
  }

  let slidePagePlans = createSlidePagePlans({
    contentPlan,
    uploadedAssets,
    mode: body?.planningMode === "quick" ? "quick" : "professional",
    userPreferences: body?.userPreferences
  });
  let slidePagePlanValidation = validateSlidePagePlans(slidePagePlans, contentPlan);
  if (!slidePagePlanValidation.valid) {
    slidePagePlans = repairSlidePagePlans(slidePagePlans, contentPlan);
    slidePagePlanValidation = validateSlidePagePlans(slidePagePlans, contentPlan);
  }

  if (!slidePagePlanValidation.valid) {
    return NextResponse.json(
      {
        message: "SlidePagePlan 校验未通过，已阻止低质量生成",
        contentPlan,
        contentPlanValidation,
        slidePagePlans,
        slidePagePlanValidation
      },
      { status: 422 }
    );
  }

  let layoutPlans = createDeckLayoutPlans({
    contentPlan,
    slidePagePlans,
    themeHint: body?.themeHint,
    mode: body?.planningMode === "quick" ? "quick" : "professional"
  });
  let layoutPlanValidation = validateLayoutPlans(layoutPlans, contentPlan, slidePagePlans);
  if (!layoutPlanValidation.valid) {
    layoutPlans = repairLayoutPlans(layoutPlans, contentPlan, slidePagePlans);
    layoutPlanValidation = validateLayoutPlans(layoutPlans, contentPlan, slidePagePlans);
  }

  if (!layoutPlanValidation.valid) {
    return NextResponse.json(
      {
        message: "LayoutPlan 校验未通过，已阻止低质量生成",
        contentPlan,
        contentPlanValidation,
        slidePagePlans,
        slidePagePlanValidation,
        layoutPlans,
        layoutPlanValidation
      },
      { status: 422 }
    );
  }

  const evidenceNeeds = buildEvidenceNeeds(contentPlan, slidePagePlans);
  const sourceAcquisition = await acquireSourceDocuments({
    prompt,
    uploadedAssets,
    uploadedFile,
    searchMaterials: body?.searchMaterials,
    researchSources: body?.researchSources,
    contentPlan,
    slidePagePlans,
    evidenceNeeds,
    mode,
    pastedText: body?.pastedText || body?.longText || body?.referenceText,
    // A forced-local request is intentionally offline; do not let optional public search block it.
    disablePublicSearch: forceLocal || body?.disablePublicSearch === true
  });
  const sourceDocuments = sourceAcquisition.sourceDocuments;
  const acquisitionReport = sourceAcquisition.acquisitionReport;
  const acquiredResearchSources = sourceAcquisition.researchSources.length ? sourceAcquisition.researchSources : researchSources;
  const evidenceBlocks = extractEvidenceBlocks(sourceDocuments);
  const slideEvidenceMaps = mapSlideEvidence({
    contentPlan,
    slidePagePlans,
    evidenceNeeds,
    evidenceBlocks,
    sourceDocuments
  });
  const evidenceReport = buildDeckEvidenceReport({
    contentPlan,
    sourceDocuments,
    evidenceBlocks,
    slideEvidenceMaps
  });
  const { contentDrafts, deckContentQualityReport } = createDeckContentDrafts({
    contentPlan,
    slidePagePlans,
    layoutPlans,
    slideEvidenceMaps,
    evidenceBlocks,
    mode: body?.planningMode === "quick" ? "quick" : "professional"
  });

  if (!deckContentQualityReport.valid) {
    return NextResponse.json(
      {
        message: "SlideContentDraft 成稿度校验未通过，已阻止脚手架内容进入 PPT",
        contentPlan,
        slidePagePlans,
        layoutPlans,
        slideEvidenceMaps,
        contentDrafts,
        deckContentQualityReport
      },
      { status: 422 }
    );
  }

  let provider: "openai" | "local" = "local";
  let project: CanvasProject;

  try {
    if (forceLocal) {
      throw new Error("forced local generation");
    }
    project = await generateWithOpenAI(prompt, mode, uploadedFile, acquiredResearchSources);
    if (looksLowQualityProject(project, prompt)) {
      throw new Error("model output did not pass quality gate");
    }
    provider = "openai";
  } catch (error) {
    console.warn("[generate-ppt] OpenAI generation failed, falling back to local/document generator.", error);
    project = mode === "beautify" && beautifyPlan
      ? buildProjectFromBeautifySource(prompt, mode, uploadedFile, beautifyPlan, acquiredResearchSources)
      : buildProjectFromDocument(prompt, mode, uploadedFile, acquiredResearchSources);
  }

  const baseProject = ensureProjectQuality({ ...project, teacherStyle, templateId: teacherTemplate?.templateId, lessonType: teacherTask?.lessonType, research: acquiredResearchSources.length ? acquiredResearchSources : project.research, contentPlan, slidePagePlans, layoutPlans, beautifyPlan, sourceDocuments, acquisitionReport, evidenceBlocks, evidenceNeeds, slideEvidenceMaps, evidenceReport, contentDrafts, deckContentQualityReport });
  const reviewCenterBase = initializeReviewCenter({
    prompt,
    uploadedAssets,
    research: baseProject.research?.length ? baseProject.research : acquiredResearchSources,
    contentPlanPptType: contentPlan.pptType
  });
  const reviewCenter = applyEvidenceReportToReviewCenter(
    applyLayoutPlansToReviewCenter(
      applySlidePagePlansToReviewCenter(applyContentPlanToReviewCenter(reviewCenterBase, contentPlan), slidePagePlans),
      layoutPlans
    ),
    evidenceReport,
    slideEvidenceMaps
  );
  const plannedProject = ensureProjectQuality(attachDeckSpec({
    ...applyPlanningAuditToProject(baseProject, reviewCenter),
    teacherStyle,
    templateId: teacherTemplate?.templateId,
    lessonType: teacherTask?.lessonType,
    contentPlan,
    slidePagePlans,
    layoutPlans,
    beautifyPlan,
    sourceDocuments,
    acquisitionReport,
    evidenceBlocks,
    evidenceNeeds,
    slideEvidenceMaps,
    evidenceReport,
    contentDrafts,
    deckContentQualityReport
  }, reviewCenter));
  const postReview = reviewGeneratedProject(plannedProject, reviewCenter.ruleSet, reviewCenter.planningAudit);
  const teacherScoreV2Shadow = scenario === "teacher_courseware" ? scoreTeacherDeckV2({
    scene: scenario,
    topic: prompt,
    slides: plannedProject.slides.map((slide, index) => ({
      page: index + 1, id: slide.id, role: slide.pageIntent, title: slide.title,
      body: slide.subtitle, bullets: slide.bullets, layout: slide.layout
    })),
    teacherTrial: { trialCompleted: false, reviewedByTeacher: false }
  }) : undefined;
  const teacherScoreV3 = scenario === "teacher_courseware" ? scoreTeacherDeckV3({
    scene: scenario,
    topic: prompt,
    task: teacherTask,
    sources: sourceDocuments,
    evidenceMaps: slideEvidenceMaps,
    slides: plannedProject.slides.map((slide, index) => ({
      page: index + 1, id: slide.id, role: slide.pageIntent, title: slide.title,
      body: slide.subtitle, bullets: slide.bullets, layout: slide.layout
    })),
    lessonPlan: contentPlan.lessonPlan || contentPlan.lessonBlueprint?.lessonPlan,
    deliveryPack: contentPlan.deliveryPack,
    teacherTrial: { trialCompleted: false, reviewedByTeacher: false },
  }) : undefined;
  persistDeductionRules(postReview);
  const finalProject = ensureProjectQuality(attachDeckSpec({
    ...plannedProject,
    teacherStyle,
    templateId: teacherTemplate?.templateId,
    lessonType: teacherTask?.lessonType,
    contentPlan,
    slidePagePlans,
    layoutPlans,
    beautifyPlan,
    sourceDocuments,
    acquisitionReport,
    evidenceBlocks,
    evidenceNeeds,
    slideEvidenceMaps,
    evidenceReport,
    contentDrafts,
    deckContentQualityReport,
    reviewCenter: {
      ...reviewCenter,
      postReview,
      teacherScoreV2Shadow,
      teacherScoreV3
    }
  }, { ...reviewCenter, postReview }));

  // ── Phase 1/069: Persist CoursewareVersion when scenario=teacher_courseware ──
  let coursewareVersionResult: CoursewareVersionInsertResult | null = null;
  if (scenario === "teacher_courseware" && user) {
    try {
      const engStatus: "passed" | "failed" | "pending" =
        deckContentQualityReport?.valid ? "passed" : "failed";
      const contentP0 = (teacherScoreV2Shadow?.p0 || []).filter((issue) => !/真实渲染截图|OOXML可编辑性/.test(issue));
      const trReadiness: "pending" | "review_required" | "ready_for_teacher" | "failed" =
        contentP0.length > 0
          ? "failed"
          : teacherScoreV2Shadow?.requiresHumanReview
          ? "review_required"
          : "pending";
      // Version-history: a client may extend an existing project by supplying
      // its projectId. Ownership is validated server-side inside
      // upsertCoursewareVersion — an unowned/unknown id falls through to a fresh
      // project (never leak/attach to someone else's project).
      const requestedProjectId =
        typeof body?.projectId === "string" && body.projectId
          ? body.projectId
          : undefined;
      coursewareVersionResult = await upsertCoursewareVersion({
        userId: user.id,
        task: teacherTask as TeacherCoursewareTask,
        contentPlan: contentPlan!,
        slidePagePlans: slidePagePlans ?? [],
        layoutPlans: layoutPlans ?? [],
        deckSpec: finalProject.deckSpec ?? null,
        slides: finalProject.slides,
        evidence: Array.isArray(slideEvidenceMaps) ? slideEvidenceMaps : [],
        engineeringStatus: engStatus,
        teacherReadiness: trReadiness,
        requestedProjectId,
        requestType: requestedProjectId ? "regenerate" : "initial_generate",
        sourceDocuments,
      });
    } catch (e) {
      // Non-blocking: CoursewareVersion creation failure does not block the response
      console.error("[069] CoursewareVersion creation failed:", e);
    }
  }

  // ── Phase 6/069: Augment quality report with separated Engineering / Teacher Readiness scores ──
  const finalQuality =
    scenario === "teacher_courseware" && finalProject.quality && teacherScoreV2Shadow
      ? {
          ...finalProject.quality,
          engineeringScore: finalProject.quality.score,
          teacherReadinessScore: teacherScoreV2Shadow.scores.pedagogy,
          classroomReadinessScore: teacherScoreV3?.scores.total,
          commercialReady: false as const,
        }
      : finalProject.quality;

  return NextResponse.json({
    scenario,
    title: finalProject.title,
    slides: finalProject.slides.length,
    style: "商务简约",
    status: "ready",
    provider,
    teacherStyle,
    contentPlan,
    slidePagePlan: slidePagePlans,
    layoutPlan: layoutPlans,
    generationWarnings: [
      ...slidePagePlans.flatMap((plan) => plan.generationWarnings || []),
      ...layoutPlans.flatMap((plan) => plan.warnings || [])
    ],
    contentPlanValidation,
    pagePlans: slidePagePlans.map((plan) => ({
      pagePlanId: plan.pagePlanId,
      pageIndex: plan.pageIndex,
      role: plan.role,
      audienceQuestion: plan.audienceQuestion,
      coreClaim: plan.coreClaim,
      mustProve: plan.mustProve,
      recommendedVisualForm: plan.recommendedVisualForm,
      generationWarnings: plan.generationWarnings
    })),
    slidePagePlanValidation,
    layoutPlans: layoutPlans.map((plan) => ({
      layoutPlanId: plan.layoutPlanId,
      pagePlanId: plan.pagePlanId,
      pageIndex: plan.pageIndex,
      role: plan.role,
      recommendedVisualForm: plan.recommendedVisualForm,
      selectedLayout: plan.selectedLayout,
      layoutFamily: plan.layoutFamily,
      informationDensity: plan.informationDensity,
      fallbackReason: plan.fallbackReason,
      warnings: plan.warnings
    })),
    layoutPlanValidation,
    beautifyPlan,
    sourceDocuments,
    acquisitionReport,
    evidenceBlocks,
    evidenceNeeds,
    slideEvidenceMaps,
    evidenceReport,
    contentDrafts,
    deckContentQualityReport,
    quality: finalQuality,
    reviewCenter: finalProject.reviewCenter,
    project: cleanProject(finalProject),
    ...(coursewareVersionResult
      ? {
          projectId: coursewareVersionResult.projectId,
          requestId: coursewareVersionResult.requestId,
          versionId: coursewareVersionResult.versionId,
          versionNumber: coursewareVersionResult.versionNumber,
          lifecycleStatus: coursewareVersionResult.lifecycleStatus,
        }
      : {}),
  });
}
