import { NextResponse } from "next/server";
import type { CanvasProject, ResearchItem, SearchGroup, UploadedAsset } from "@/lib/canvas-data";
import {
  applyReviewFixes,
  applyReviewFixesToPage,
  initializeReviewCenter,
  persistDeductionRules,
  reviewGeneratedProject,
  type ReviewCenterState
} from "@/lib/ppt-review-center";
import { attachDeckSpec } from "@/lib/deck-spec";
import { refreshEvidenceWithManualSources } from "@/lib/ppt-agent/manual-source-refresh";
import { ensureProjectQuality } from "@/lib/project-quality";
import { cleanProject, cleanText } from "@/lib/text-sanitize";

type Action = "initialize" | "review" | "apply-fixes" | "apply-page-fixes" | "add-sources";

function flattenResearchSources(value: unknown): ResearchItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return (value as SearchGroup[])
    .flatMap((group, groupIndex) =>
      (Array.isArray(group.results) ? group.results : []).slice(0, 3).map((result, resultIndex) => ({
        id: `review-source-${groupIndex + 1}-${resultIndex + 1}`,
        title: cleanText(result.title, group.query || `资料 ${groupIndex + 1}`),
        source: cleanText(result.sourceName || result.url || "公开网页"),
        sourceName: cleanText(result.sourceName || result.url || "公开网页"),
        sourceType: result.sourceType || "search",
        providerTier: result.providerTier,
        status: result.status || "search-result",
        url: cleanText(result.url),
        summary: cleanText(result.snippet, "公开资料摘要。"),
        confidence: Math.max(35, Math.min(98, Number(result.confidence) || 68))
      }))
    )
    .filter((item) => item.title && (item.url || item.summary))
    .slice(0, 12);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const action = (body?.action || "initialize") as Action;
  const prompt = cleanText(body?.prompt || body?.project?.prompt || "");
  const uploadedAssets = Array.isArray(body?.uploadedAssets) ? (body.uploadedAssets as UploadedAsset[]) : [];
  const project = body?.project ? cleanProject(body.project as CanvasProject) : null;
  const reviewCenter = body?.reviewCenter as ReviewCenterState | undefined;
  const research = [...(project?.research || []), ...flattenResearchSources(body?.researchSources)].slice(0, 12);

  if (action === "initialize") {
    if (!prompt) {
      return NextResponse.json({ message: "prompt is required" }, { status: 400 });
    }
    const state = initializeReviewCenter({
      prompt,
      uploadedAssets,
      research
    });
    return NextResponse.json({ status: "ready", reviewCenter: state });
  }

  if (!project) {
    return NextResponse.json({ message: "project is required" }, { status: 400 });
  }

  const state =
    reviewCenter ||
    initializeReviewCenter({
      prompt: prompt || project.prompt,
      uploadedAssets,
      research
    });

  if (action === "review") {
    const postReview = reviewGeneratedProject(project, state.ruleSet, state.planningAudit);
    persistDeductionRules(postReview);
    const nextState = { ...state, postReview };
    const nextProject = attachDeckSpec({ ...project, reviewCenter: nextState }, nextState);
    return NextResponse.json({
      status: "ready",
      reviewCenter: nextState,
      project: ensureProjectQuality(nextProject)
    });
  }

  if (action === "apply-fixes") {
    const result = applyReviewFixes(project, state);
    const nextState = { ...state, postReview: result.review, lastFixSummary: result.summary };
    const nextProject = attachDeckSpec({ ...result.project, reviewCenter: nextState }, nextState);
    return NextResponse.json({
      status: "ready",
      applied: result.applied,
      summary: result.summary,
      reviewCenter: nextState,
      project: ensureProjectQuality(nextProject)
    });
  }

  if (action === "apply-page-fixes") {
    const result = applyReviewFixesToPage(project, state, {
      slideId: typeof body?.slideId === "string" ? body.slideId : undefined,
      pageIndex: Number.isFinite(Number(body?.pageIndex)) ? Number(body.pageIndex) : undefined
    });
    const nextState = { ...state, postReview: result.review, lastPageFixSummary: result.summary };
    const nextProject = attachDeckSpec({ ...result.project, reviewCenter: nextState }, nextState);
    return NextResponse.json({
      status: "ready",
      applied: result.applied,
      summary: result.summary,
      reviewCenter: nextState,
      project: ensureProjectQuality(nextProject)
    });
  }

  if (action === "add-sources") {
    const manualSources = Array.isArray(body?.sources) ? body.sources : [];
    const result = refreshEvidenceWithManualSources({
      project,
      reviewCenter: state,
      sources: manualSources,
      uploadedAssets
    });
    persistDeductionRules(result.reviewCenter.postReview || reviewGeneratedProject(result.project, result.reviewCenter.ruleSet, result.reviewCenter.planningAudit));
    return NextResponse.json({
      status: "ready",
      addedResearch: result.addedResearch,
      summary: result.summary,
      reviewCenter: result.reviewCenter,
      project: ensureProjectQuality(result.project)
    });
  }

  return NextResponse.json({ message: "unknown action" }, { status: 400 });
}
