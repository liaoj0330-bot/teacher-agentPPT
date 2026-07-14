import type { CanvasProject, ResearchItem, SlideSection, UploadedAsset } from "@/lib/canvas-data";
import { attachDeckSpec } from "@/lib/deck-spec";
import { buildEvidenceNeeds } from "@/lib/ppt-agent/evidence-need-builder";
import { extractEvidenceBlocks } from "@/lib/ppt-agent/evidence-extractor";
import { mapSlideEvidence } from "@/lib/ppt-agent/evidence-mapper";
import { buildDeckEvidenceReport } from "@/lib/ppt-agent/evidence-reporter";
import { parseSourceDocuments } from "@/lib/ppt-agent/source-document-parser";
import type { SourceDocument } from "@/lib/ppt-agent/evidence-types";
import { applyEvidenceReportToReviewCenter, reviewGeneratedProject, type ReviewCenterState } from "@/lib/ppt-review-center";
import { ensureProjectQuality } from "@/lib/project-quality";
import { cleanProject, cleanText } from "@/lib/text-sanitize";

export type ManualSourceInput = {
  title?: string;
  url?: string;
  summary?: string;
  content?: string;
  sourceName?: string;
};

export type ManualSourceRefreshSummary = {
  beforeScore: number;
  afterScore: number;
  beforeRealSourceCount: number;
  afterRealSourceCount: number;
  beforeEvidenceCoverage: number;
  afterEvidenceCoverage: number;
  addedSources: number;
  addedEvidenceBlocks: number;
  status: "improved" | "updated" | "needs_more_sources" | "no_valid_source";
  message: string;
  remainingBlockers: string[];
};

function normalizeUrl(value: unknown) {
  const url = cleanText(value);
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : "";
}

function sourceTitle(source: ManualSourceInput, index: number) {
  return cleanText(source.title || source.sourceName || source.url, `manual source ${index + 1}`);
}

function manualSourceToResearch(source: ManualSourceInput, index: number): ResearchItem | null {
  const url = normalizeUrl(source.url);
  const summary = cleanText(source.summary || source.content);
  const title = sourceTitle(source, index);
  if (!url && !summary) return null;
  return {
    id: `manual-source-${Date.now()}-${index + 1}`,
    title,
    source: cleanText(source.sourceName || url || title, "user provided source"),
    sourceName: cleanText(source.sourceName || title, "user provided source"),
    sourceType: url ? "search" : "document",
    status: url ? "verified" : "search-result",
    url,
    summary: summary || `${title} ${url}`,
    confidence: url ? 78 : 64
  };
}

function dedupeResearch(items: ResearchItem[]) {
  const seen = new Set<string>();
  const result: ResearchItem[] = [];
  items.forEach((item) => {
    const key = cleanText(item.url || `${item.title}-${item.summary}`).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result.slice(0, 32);
}

function dedupeSourceDocuments(items: SourceDocument[]) {
  const seen = new Set<string>();
  const result: SourceDocument[] = [];
  items.forEach((item) => {
    const key = cleanText(item.sourceId || item.url || `${item.title}-${item.normalizedText}`).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result.slice(0, 64);
}

function realSourceCount(project: CanvasProject) {
  return project.sourceDocuments?.filter((source) =>
    (source.sourceType === "search_result" && Boolean(source.url)) ||
    (source.sourceType === "uploaded_file" && source.parseStatus === "parsed")
  ).length || 0;
}

function sourceSection(sourceIds: string[]): SlideSection | null {
  if (!sourceIds.length) return null;
  return {
    type: "source-note",
    sourceIds: sourceIds.slice(0, 3),
    text: `补充来源：${sourceIds.slice(0, 3).join(" / ")}`
  };
}

function withMappedEvidence(project: CanvasProject, maps: ReturnType<typeof mapSlideEvidence>): CanvasProject {
  const slides = (project.slides || []).map((slide, index) => {
    const map = maps[index];
    if (!map) return slide;
    const sourceIds = [...new Set(map.matchedEvidenceBlocks.map((block) => block.sourceId).filter(Boolean))];
    const evidenceBlockIds = [...new Set(map.matchedEvidenceBlocks.map((block) => block.evidenceBlockId).filter(Boolean))];
    const extraSourceSection = sourceSection(sourceIds);
    const hasSourceNote = slide.sections?.some((section) => section.type === "source-note");
    return {
      ...slide,
      sourceIds: slide.sourceIds?.length ? slide.sourceIds : sourceIds,
      evidenceBlockIds: slide.evidenceBlockIds?.length ? slide.evidenceBlockIds : evidenceBlockIds,
      sections: extraSourceSection && !hasSourceNote
        ? [...(slide.sections || []), extraSourceSection]
        : slide.sections
    };
  });
  return cleanProject({ ...project, slides });
}

function summaryFor(input: {
  beforeProject: CanvasProject;
  afterProject: CanvasProject;
  beforeState: ReviewCenterState;
  afterState: ReviewCenterState;
  addedSources: number;
  previousEvidenceBlockCount: number;
}): ManualSourceRefreshSummary {
  const beforeScore = input.beforeState.postReview?.totalScore ?? 0;
  const afterScore = input.afterState.postReview?.totalScore ?? 0;
  const beforeRealSourceCount = realSourceCount(input.beforeProject);
  const afterRealSourceCount = realSourceCount(input.afterProject);
  const beforeEvidenceCoverage = input.beforeProject.evidenceReport?.averageCoverage ?? 0;
  const afterEvidenceCoverage = input.afterProject.evidenceReport?.averageCoverage ?? 0;
  const addedEvidenceBlocks = Math.max(0, (input.afterProject.evidenceBlocks?.length || 0) - input.previousEvidenceBlockCount);
  const remainingBlockers = [
    ...(input.afterProject.evidenceReport?.blockingIssues || []),
    ...(input.afterState.postReview?.deductions || [])
      .filter((item) => item.dimensionKey === "evidence" || /来源|证据|资料|公开|上传/.test(`${item.where} ${item.reason} ${item.suggestion}`))
      .slice(0, 4)
      .map((item) => `${item.where}：${item.suggestion}`)
  ].filter(Boolean).slice(0, 6);
  const status: ManualSourceRefreshSummary["status"] =
    input.addedSources === 0
      ? "no_valid_source"
      : remainingBlockers.length > 0
        ? "needs_more_sources"
        : afterScore > beforeScore || afterRealSourceCount > beforeRealSourceCount || afterEvidenceCoverage > beforeEvidenceCoverage
          ? "improved"
          : "updated";
  const message =
    status === "no_valid_source"
      ? "没有识别到有效来源。请至少提供一个 http/https 链接，或粘贴可引用的资料摘要。"
      : status === "needs_more_sources"
        ? "已补充来源并重建证据链，但仍有页面缺少足够证据，需要继续补公开资料或上传文档。"
        : status === "improved"
          ? "已补充来源、重建证据链并完成重新评分，当前结果已变好。"
          : "已补充来源并刷新评审结果，建议继续查看导出闸门。";
  return {
    beforeScore,
    afterScore,
    beforeRealSourceCount,
    afterRealSourceCount,
    beforeEvidenceCoverage,
    afterEvidenceCoverage,
    addedSources: input.addedSources,
    addedEvidenceBlocks,
    status,
    message,
    remainingBlockers
  };
}

export function refreshEvidenceWithManualSources(input: {
  project: CanvasProject;
  reviewCenter: ReviewCenterState;
  sources: ManualSourceInput[];
  uploadedAssets?: UploadedAsset[];
}): { project: CanvasProject; reviewCenter: ReviewCenterState; addedResearch: ResearchItem[]; summary: ManualSourceRefreshSummary } {
  const beforeProject = cleanProject(input.project);
  const beforeState = input.reviewCenter;
  const manualResearch = input.sources
    .map((source, index) => manualSourceToResearch(source, index))
    .filter((item): item is ResearchItem => Boolean(item));

  if (!manualResearch.length) {
    return {
      project: beforeProject,
      reviewCenter: beforeState,
      addedResearch: [],
      summary: summaryFor({
        beforeProject,
        afterProject: beforeProject,
        beforeState,
        afterState: beforeState,
        addedSources: 0,
        previousEvidenceBlockCount: beforeProject.evidenceBlocks?.length || 0
      })
    };
  }

  const research = dedupeResearch([...(beforeProject.research || []), ...manualResearch]);
  const parsedSourceDocuments = beforeProject.sourceDocuments?.length
    ? parseSourceDocuments({
        prompt: "",
        uploadedAssets: [],
        research: manualResearch,
        pastedText: ""
      })
    : parseSourceDocuments({
        prompt: beforeProject.prompt,
        uploadedAssets: input.uploadedAssets || [],
        research,
        pastedText: ""
      });
  const sourceDocuments = dedupeSourceDocuments([
    ...(beforeProject.sourceDocuments || []),
    ...parsedSourceDocuments
  ]);
  const contentPlan = beforeProject.contentPlan || beforeState.contentPlan;
  const slidePagePlans = beforeProject.slidePagePlans || beforeState.slidePagePlans || [];
  const evidenceNeeds = contentPlan && slidePagePlans.length
    ? buildEvidenceNeeds(contentPlan, slidePagePlans)
    : beforeProject.evidenceNeeds || [];
  const evidenceBlocks = extractEvidenceBlocks(sourceDocuments);
  const slideEvidenceMaps = contentPlan && slidePagePlans.length
    ? mapSlideEvidence({
        contentPlan,
        slidePagePlans,
        evidenceNeeds,
        evidenceBlocks,
        sourceDocuments
      })
    : beforeProject.slideEvidenceMaps || [];
  const evidenceReport = contentPlan && slideEvidenceMaps.length
    ? buildDeckEvidenceReport({
        contentPlan,
        sourceDocuments,
        evidenceBlocks,
        slideEvidenceMaps
      })
    : beforeProject.evidenceReport;
  const acquisitionReport = {
    ...(beforeProject.acquisitionReport || {
      usedSources: [],
      searchEnabled: false,
      searchProvider: "manual",
      searchStatus: "disabled" as const,
      searchQueries: [],
      uploadedParsedCount: 0,
      uploadedFailedCount: 0,
      pastedTextUsed: false,
      fallbackUsed: false,
      warnings: [],
      errors: []
    }),
    usedSources: sourceDocuments.map((source) => ({
      sourceId: source.sourceId,
      title: source.title,
      sourceType: source.sourceType,
      url: source.url,
      confidence: source.confidence,
      parseStatus: source.parseStatus
    })),
    searchProvider: beforeProject.acquisitionReport?.searchProvider || "manual",
    warnings: [
      ...(beforeProject.acquisitionReport?.warnings || []),
      "用户手动补充了可追溯来源，系统已重建证据链并重新评分。"
    ]
  };

  const mappedProject = withMappedEvidence({
    ...beforeProject,
    research,
    sourceDocuments,
    acquisitionReport,
    evidenceBlocks,
    evidenceNeeds,
    slideEvidenceMaps,
    evidenceReport
  }, slideEvidenceMaps);
  const evidenceState = evidenceReport
    ? applyEvidenceReportToReviewCenter(beforeState, evidenceReport, slideEvidenceMaps)
    : beforeState;
  const postReview = reviewGeneratedProject(mappedProject, evidenceState.ruleSet, evidenceState.planningAudit);
  const reviewCenter = {
    ...evidenceState,
    postReview,
    evidenceReport,
    slideEvidenceMaps
  };
  const finalProject = ensureProjectQuality(attachDeckSpec({
    ...mappedProject,
    reviewCenter
  }, reviewCenter));
  const finalReviewCenter = finalProject.reviewCenter || reviewCenter;
  return {
    project: finalProject,
    reviewCenter: finalReviewCenter,
    addedResearch: manualResearch,
    summary: summaryFor({
      beforeProject,
      afterProject: finalProject,
      beforeState,
      afterState: finalReviewCenter,
      addedSources: manualResearch.length,
      previousEvidenceBlockCount: beforeProject.evidenceBlocks?.length || 0
    })
  };
}
