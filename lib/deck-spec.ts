import type { CanvasProject, DeckSpec, DesignSlide, SlideLayout, SlideSpec } from "@/lib/canvas-data";
import type { PlanningAuditPage, ReviewCenterState } from "@/lib/ppt-review-center";
import { slideLayoutForSelectedLayout } from "@/lib/ppt-agent/layout-library";
import type { LayoutPlan } from "@/lib/ppt-agent/layout-plan";
import type { SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";
import { slideLayoutFromDraft } from "@/lib/ppt-agent/slide-content-realizer";
import type { SlideContentDraft } from "@/lib/ppt-agent/slide-content-draft";
import { getDesignProfile } from "@/lib/ppt-design-system";
import { cleanProject, cleanText } from "@/lib/text-sanitize";

const forbiddenByType: Record<string, string[]> = {
  project_report: ["空泛口号", "只有背景意义", "缺少验收标准", "缺少责任分工", "没有下一步动作"],
  product_proposal: ["只堆功能", "不讲客户问题", "没有部署路径", "没有安全治理", "没有试点验收"],
  travel_guide: ["景点堆砌", "没有预约规则", "没有交通假设", "预算给死数", "缺少备选路线"],
  financial_analysis: ["只描述涨跌", "没有数据口径", "没有风险解释", "没有来源"],
  company_profile: ["只写行业领先", "没有客户案例", "没有资质背书"],
  general_report: ["重复背景", "没有核心观点", "没有证据来源", "没有行动收束"]
};

const qualityBarByType: Record<string, number> = {
  project_report: 86,
  product_proposal: 84,
  travel_guide: 82,
  financial_analysis: 88,
  business_bp: 86,
  company_profile: 82,
  policy_report: 88,
  courseware: 80,
  event_plan: 82,
  general_report: 82
};

function uniq<T>(items: T[]) {
  return [...new Set(items.filter(Boolean))];
}

function densityForPage(page: PlanningAuditPage, index: number): SlideSpec["density"] {
  if (/封面|开场|收束|观点/.test(page.role + page.title)) return "airy";
  if (/来源|证据|对照|验收|指标|财报/.test(page.role + page.title)) return "dense";
  return index % 3 === 0 ? "airy" : "balanced";
}

function slideForPage(project: CanvasProject, page: PlanningAuditPage, index: number) {
  return project.slides.find((slide) => {
    const text = cleanText(`${slide.title} ${slide.pageIntent}`);
    return slide.title === page.title || slide.pageIntent === page.role;
  }) || project.slides[index];
}

function pagePlanForPage(project: CanvasProject, page: PlanningAuditPage, index: number, contentPlanSlideId?: string) {
  const pagePlans = project.slidePagePlans || [];
  return (
    pagePlans.find((plan) => contentPlanSlideId && plan.contentPlanSlideId === contentPlanSlideId) ||
    pagePlans.find((plan) => plan.role === page.role || plan.pageIndex === index + 1) ||
    pagePlans[index]
  );
}

function layoutPlanForPage(project: CanvasProject, pagePlan: SlidePagePlan | undefined, index: number): LayoutPlan | undefined {
  const layoutPlans = project.layoutPlans || [];
  return (
    layoutPlans.find((plan) => pagePlan?.pagePlanId && plan.pagePlanId === pagePlan.pagePlanId) ||
    layoutPlans.find((plan) => plan.pageIndex === index + 1) ||
    layoutPlans[index]
  );
}

function evidenceMapForPage(project: CanvasProject, pagePlan: SlidePagePlan | undefined, slideId: string | undefined, index: number) {
  const maps = project.slideEvidenceMaps || [];
  return (
    maps.find((map) => pagePlan?.pagePlanId && map.pagePlanId === pagePlan.pagePlanId) ||
    maps.find((map) => slideId && map.slideId === slideId) ||
    maps[index]
  );
}

function contentDraftForPage(project: CanvasProject, pagePlan: SlidePagePlan | undefined, index: number): SlideContentDraft | undefined {
  const drafts = project.contentDrafts || [];
  return (
    drafts.find((draft) => pagePlan?.pagePlanId && draft.pagePlanId === pagePlan.pagePlanId) ||
    drafts.find((draft) => draft.slideIndex === index + 1) ||
    drafts[index]
  );
}

function sanitizedEvidenceBlocks(project: CanvasProject, map: ReturnType<typeof evidenceMapForPage>) {
  if (!map) return [];
  return map.matchedEvidenceBlocks
    .map((block) => {
      const full = project.evidenceBlocks?.find((item) => item.evidenceBlockId === block.evidenceBlockId);
      return {
        summary: cleanText(full?.summary || block.summary),
        blockType: block.blockType,
        confidence: block.confidence,
        reliability: block.reliability
      };
    })
    .slice(0, 6);
}

function specForPage(project: CanvasProject, state: ReviewCenterState, page: PlanningAuditPage, index: number): SlideSpec {
  const slide = slideForPage(project, page, index);
  const dimensions = state.ruleSet.dimensions.slice(0, 4);
  const contentPlanSlide = project.contentPlan?.slidePlan?.find((item) => item.role === page.role || item.titleIntent === page.title) || project.contentPlan?.slidePlan?.[index];
  const pagePlan = pagePlanForPage(project, page, index, contentPlanSlide?.id);
  const layoutPlan = layoutPlanForPage(project, pagePlan, index);
  const evidenceMap = evidenceMapForPage(project, pagePlan, slide?.id, index);
  const contentDraft = contentDraftForPage(project, pagePlan, index);
  const layoutIntent = contentDraft ? slideLayoutFromDraft(layoutPlan) : layoutPlan ? slideLayoutForSelectedLayout(layoutPlan.selectedLayout) : page.suggestedLayout;
  return {
    id: `spec-${index + 1}`,
    page: index + 1,
    slideId: slide?.id,
    contentPlanSlideId: contentPlanSlide?.id,
    pagePlanId: pagePlan?.pagePlanId,
    contentDraftId: contentDraft?.contentDraftId,
    audienceQuestion: pagePlan?.audienceQuestion,
    coreClaim: pagePlan?.coreClaim,
    title: contentDraft?.finalTitle || page.title,
    finalTitle: contentDraft?.finalTitle,
    role: contentPlanSlide?.role || page.role,
    pagePurpose: pagePlan?.pagePurpose || contentPlanSlide?.pagePurpose || page.role,
    leadSentence: contentDraft?.leadSentence,
    claim: contentDraft?.leadSentence || pagePlan?.coreClaim || page.claim || contentPlanSlide?.pagePurpose || page.mustProve,
    mustProve: pagePlan?.mustProve || contentPlanSlide?.mustProve || page.mustProve,
    visibleBlocks: contentDraft?.visibleBlocks,
    evidenceSnippets: contentDraft?.evidenceSnippets,
    sourceUseSummary: contentDraft?.sourceUseSummary,
    confidenceNote: contentDraft?.confidenceNote,
    evidenceNeed: pagePlan?.evidenceNeed || [],
    evidenceNeeds: uniq([...(pagePlan?.evidenceNeed || []), ...(contentPlanSlide?.suggestedEvidence || []), ...(page.evidenceNeeded || []), ...state.ruleSet.evidenceNeeds.slice(0, 2)]).slice(0, 8),
    evidenceSourceIds: evidenceMap?.matchedEvidenceBlocks?.map((block) => block.sourceId) || page.evidenceSourceIds || [],
    evidenceMapId: evidenceMap?.pagePlanId,
    matchedEvidenceBlocks: sanitizedEvidenceBlocks(project, evidenceMap),
    evidenceCoverage: evidenceMap?.evidenceCoverage,
    sourceConfidence: evidenceMap?.sourceConfidence,
    unsupportedClaims: evidenceMap?.unsupportedClaims || [],
    lowConfidenceWarnings: evidenceMap?.lowConfidenceWarnings || [],
    userConfirmationNeeded: evidenceMap?.userConfirmationNeeded || [],
    recommendedVisualForm: pagePlan?.recommendedVisualForm,
    layoutPlanId: layoutPlan?.layoutPlanId,
    selectedLayout: layoutPlan?.selectedLayout,
    layoutFamily: layoutPlan?.layoutFamily,
    informationDensity: layoutPlan?.informationDensity,
    contentSlots: layoutPlan?.contentSlots || [],
    visualSlots: layoutPlan?.visualSlots || [],
    hierarchyRules: layoutPlan?.hierarchyRules || [],
    exportHints: layoutPlan?.exportHints || [],
    previewHints: layoutPlan?.previewHints || [],
    informationHierarchy: pagePlan?.informationHierarchy,
    qualityChecks: pagePlan?.qualityChecks || [],
    layoutIntent,
    layoutReason: layoutPlan?.fallbackReason || pagePlan?.layoutIntent || page.layoutReason || `使用结构化版式承载${page.role}，避免退化成普通 bullet 页。`,
    visualIntent: slide?.visualPrompt || `${page.title}，${state.ruleSet.pptTypeLabel}，结构化信息设计，中文可读，不要水印`,
    density: densityForPage(page, index),
    mustHave: uniq([
      contentDraft?.leadSentence,
      ...(contentDraft?.visibleBlocks || []).map((block) => block.body),
      ...(contentDraft?.evidenceSnippets || []).map((snippet) => snippet.text),
      ...page.successCriteria,
      ...page.contentBlocks.filter((block) => block.priority === "must").map((block) => block.title)
    ].map((item) => cleanText(item))).slice(0, 7),
    avoid: uniq([...(contentPlanSlide?.avoid || []), ...(page.whatToCut || []), ...state.ruleSet.vagueOrRepeatedContent.slice(0, 3)]).slice(0, 6),
    scoreRules: dimensions.map((dimension) => ({
      dimension: dimension.name,
      points: Math.max(4, Math.round(dimension.weight / Math.max(1, dimensions.length))),
      rule: `${page.title}必须支撑「${dimension.evidenceRequired.slice(0, 2).join(" / ")}」，否则扣${dimension.name}分。`
    }))
  };
}

function deckSpecHash(specs: SlideSpec[]): string {
  const raw = specs.map((s) => JSON.stringify({
    role: s.role,
    title: s.title,
    mustProve: s.mustProve,
    claim: s.claim,
    visibleBlocks: s.visibleBlocks,
    evidenceSnippets: s.evidenceSnippets,
    layoutIntent: s.layoutIntent,
  })).join("|");
  let h = 0;
  for (const ch of raw) { h = ((h << 5) - h + ch.charCodeAt(0)) | 0; }
  return Math.abs(h).toString(16).padStart(8, "0");
}

/**
 * Recompute the DeckSpec content hash from its slideSpecs. Exported so the
 * export route can verify that a frozen DeckSpec snapshot has not been mutated
 * (its stored contentHash must equal the recomputed hash of its own specs).
 */
export function computeDeckSpecHash(specs: SlideSpec[]): string {
  return deckSpecHash(specs);
}

export function buildDeckSpec(projectInput: CanvasProject, state: ReviewCenterState, opts?: { projectId?: string; requestId?: string; versionId?: string; versionNumber?: number }): DeckSpec {
  const project = cleanProject(projectInput);
  const profile = getDesignProfile({ ...project, reviewCenter: state });
  const pages = state.planningAudit.pageRoles;
  const plannedSpecs = pages.map((page, index) => specForPage(project, state, page, index));
  const extraSpecs = project.slides.slice(plannedSpecs.length).map((slide, extraIndex): SlideSpec => {
    const index = plannedSpecs.length + extraIndex;
    const dimensions = state.ruleSet.dimensions.slice(0, 4);
    const pagePlan = project.slidePagePlans?.[index];
    const layoutPlan = layoutPlanForPage(project, pagePlan, index);
    const evidenceMap = evidenceMapForPage(project, pagePlan, slide.id, index);
    const layoutIntent = layoutPlan ? slideLayoutForSelectedLayout(layoutPlan.selectedLayout) : (slide.layout || "evidence") as SlideLayout;
    return {
      id: `spec-${index + 1}`,
      page: index + 1,
      slideId: slide.id,
      contentPlanSlideId: project.contentPlan?.slidePlan?.[index]?.id,
      pagePlanId: pagePlan?.pagePlanId,
      audienceQuestion: pagePlan?.audienceQuestion,
      coreClaim: pagePlan?.coreClaim,
      title: slide.title || `补充页面 ${extraIndex + 1}`,
      role: slide.pageIntent || "补充论证",
      pagePurpose: pagePlan?.pagePurpose || project.contentPlan?.slidePlan?.[index]?.pagePurpose || slide.pageIntent || "补充资料、证据或行动建议。",
      claim: pagePlan?.coreClaim || slide.subtitle || slide.title || "补充说明",
      mustProve: pagePlan?.mustProve || project.contentPlan?.slidePlan?.[index]?.mustProve || slide.subtitle || "补充资料、证据或行动建议。",
      evidenceNeed: pagePlan?.evidenceNeed || [],
      evidenceNeeds: uniq([...(pagePlan?.evidenceNeed || []), ...(project.contentPlan?.slidePlan?.[index]?.suggestedEvidence || []), ...state.ruleSet.evidenceNeeds.slice(0, 4)]),
      evidenceSourceIds: evidenceMap?.matchedEvidenceBlocks?.map((block) => block.sourceId) || slide.sourceIds || [],
      evidenceMapId: evidenceMap?.pagePlanId,
      matchedEvidenceBlocks: sanitizedEvidenceBlocks(project, evidenceMap),
      evidenceCoverage: evidenceMap?.evidenceCoverage,
      sourceConfidence: evidenceMap?.sourceConfidence,
      unsupportedClaims: evidenceMap?.unsupportedClaims || [],
      lowConfidenceWarnings: evidenceMap?.lowConfidenceWarnings || [],
      userConfirmationNeeded: evidenceMap?.userConfirmationNeeded || [],
      recommendedVisualForm: pagePlan?.recommendedVisualForm,
      layoutPlanId: layoutPlan?.layoutPlanId,
      selectedLayout: layoutPlan?.selectedLayout,
      layoutFamily: layoutPlan?.layoutFamily,
      informationDensity: layoutPlan?.informationDensity,
      contentSlots: layoutPlan?.contentSlots || [],
      visualSlots: layoutPlan?.visualSlots || [],
      hierarchyRules: layoutPlan?.hierarchyRules || [],
      exportHints: layoutPlan?.exportHints || [],
      previewHints: layoutPlan?.previewHints || [],
      informationHierarchy: pagePlan?.informationHierarchy,
      qualityChecks: pagePlan?.qualityChecks || [],
      layoutIntent,
      layoutReason: layoutPlan?.fallbackReason || pagePlan?.layoutIntent || "补充页面用于承载资料追溯、评审口径或交付补强，避免游离在页面合同之外。",
      visualIntent: slide.visualPrompt || `${slide.title}，${state.ruleSet.pptTypeLabel}，补充论证页面，中文可读`,
      density: densityForPage({ ...pages[pages.length - 1], title: slide.title, role: slide.pageIntent || "补充论证" }, index),
      mustHave: uniq([slide.subtitle, ...(slide.bullets || []).slice(0, 3), "证据来源或行动建议"]).filter(Boolean).slice(0, 6),
      avoid: uniq([...(forbiddenByType[state.pptType] || forbiddenByType.general_report), ...state.ruleSet.vagueOrRepeatedContent.slice(0, 2)]).slice(0, 5),
      scoreRules: dimensions.map((dimension) => ({
        dimension: dimension.name,
        points: Math.max(4, Math.round(dimension.weight / Math.max(1, dimensions.length))),
        rule: `${slide.title}必须支撑「${dimension.evidenceRequired.slice(0, 2).join(" / ")}」，否则扣${dimension.name}分。`
      }))
    };
  });
  const allSpecs = [...plannedSpecs, ...extraSpecs];
  return {
    id: opts?.versionId ? `deck-spec-${opts.versionId}` : `deck-spec-${Date.now()}`,
    version: opts?.versionNumber ? String(opts.versionNumber) : "1.0",
    projectId: opts?.projectId,
    requestId: opts?.requestId,
    versionId: opts?.versionId,
    versionNumber: opts?.versionNumber,
    contentHash: deckSpecHash(allSpecs),
    pptType: state.pptType,
    pptTypeLabel: state.pptTypeLabel,
    audience: state.audience,
    goal: state.goal,
    coreMessage: project.contentPlan?.coreMessage || state.planningAudit.coreMessage,
    expectedDecision: project.contentPlan?.decisionGoal || state.planningAudit.expectedDecision,
    recommendedSlideCount: Math.max(state.planningAudit.recommendedSlideCount, project.contentPlan?.slidePlan?.length || 0),
    requiredPages: pages.map((page) => page.title),
    forbiddenContent: uniq([
      ...(forbiddenByType[state.pptType] || forbiddenByType.general_report),
      ...state.ruleSet.vagueOrRepeatedContent
    ]).slice(0, 10),
    evidenceNeeds: uniq([...(project.contentPlan?.evidenceNeeds || []), ...state.ruleSet.evidenceNeeds, ...pages.flatMap((page) => page.evidenceNeeded)]).slice(0, 12),
    styleProfile: `${project.contentPlan?.styleDirection || profile.name}｜${profile.mood}`,
    qualityBar: qualityBarByType[state.pptType] || 82,
    slideSpecs: allSpecs,
    createdAt: new Date().toISOString()
  };
}

export function attachDeckSpec(projectInput: CanvasProject, state?: ReviewCenterState): CanvasProject {
  const project = cleanProject(projectInput);
  const reviewCenter = state || project.reviewCenter;
  if (!reviewCenter) return project;
  const deckSpec = buildDeckSpec(project, reviewCenter);
  const slides = deckSpec.slideSpecs.map((spec, index): DesignSlide => {
    const slide = project.slides.find((candidate) => candidate.id === spec.slideId) || project.slides[index] || {
      id: spec.slideId || spec.id,
      title: spec.finalTitle || spec.title || `第 ${index + 1} 页`,
      subtitle: spec.leadSentence || spec.claim || "",
      tone: "教学设计",
      layout: (spec.layoutIntent || "split") as SlideLayout,
      bullets: [],
      visualPrompt: spec.visualIntent,
      speakerNote: `页面角色：${spec.role}。要证明：${spec.mustProve}。`,
    };
    const draft = project.contentDrafts?.find((item) => item.contentDraftId === spec.contentDraftId || item.pagePlanId === spec.pagePlanId || item.slideIndex === index + 1);
    // Teacher-math drafts carry semantic blocks beyond the compact DeckSpec
    // preview (M07 needs the full 题目/步骤/结论 chain). Prefer that draft
    // when rebuilding slides so the export gate sees the same complete content
    // that the renderer uses.
    const visibleBlocks = project.contentPlan?.playbookId === "teacher_math_science_v1"
      ? draft?.visibleBlocks || spec.visibleBlocks || []
      : spec.visibleBlocks || draft?.visibleBlocks || [];
    const evidenceSnippets = spec.evidenceSnippets || draft?.evidenceSnippets || [];
    const draftSections = draft?.sections || [];
    // Teacher-math layouts address blocks by their semantic labels (M07 uses
    // 题目/步骤/结论/学生检查). Keep the complete draft so the renderer and
    // the export gate can both see those required fields; other deck types keep
    // the compact five-bullet fallback used by the general slide UI.
    const bulletLimit = project.contentPlan?.playbookId === "teacher_math_science_v1" ? visibleBlocks.length : 5;
    return {
      ...slide,
      title: spec.finalTitle || draft?.finalTitle || spec.title || slide.title,
      subtitle: spec.leadSentence || draft?.leadSentence || slide.subtitle,
      bullets: visibleBlocks.length ? visibleBlocks.map((block) => `${block.title}: ${block.body}`).slice(0, bulletLimit) : slide.bullets,
      sections: draftSections.length
        ? draftSections
        : visibleBlocks.length
          ? [
              {
                type: "tips-grid",
                title: "页面要点",
                items: visibleBlocks.slice(0, 6).map((block) => ({ title: block.title, body: block.body, tag: block.tag }))
              },
              {
                type: "source-note",
                text: evidenceSnippets[0]?.text || spec.confidenceNote || draft?.confidenceNote || "当前页面保留资料边界，正式交付前建议复核来源。"
              }
            ]
          : slide.sections,
      pageIntent: slide.pageIntent || spec.role,
      layout: (spec.layoutIntent || slide.layout || "split") as SlideLayout,
      sourceIds: slide.sourceIds?.length ? slide.sourceIds : spec.evidenceSourceIds,
      speakerNote: slide.speakerNote || `页面角色：${spec.role}。要证明：${spec.mustProve}。`,
      visualPrompt: slide.visualPrompt || spec.visualIntent
    };
  });
  return cleanProject({ ...project, deckSpec, slides });
}

export function findSpecForSlide(project: CanvasProject, slide: DesignSlide, index: number) {
  return project.deckSpec?.slideSpecs.find((item) => item.slideId === slide.id || item.title === slide.title) || project.deckSpec?.slideSpecs[index];
}
