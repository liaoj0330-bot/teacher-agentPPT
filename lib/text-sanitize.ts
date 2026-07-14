import type { CanvasProject, DeckSpec, DesignSlide, OutlineItem, PlanItem, ResearchItem, SlideSection } from "@/lib/canvas-data";

const replacementPattern = /\uFFFD/g;
const mojibakePattern = /[脙脗芒鈧撁ぢ掆€斆瀅]/;

function readabilityScore(value: string) {
  const chinese = (value.match(/[\u3400-\u9fff]/g) ?? []).length;
  const ascii = (value.match(/[a-z0-9]/gi) ?? []).length;
  const replacements = (value.match(replacementPattern) ?? []).length;
  const mojibake = (value.match(mojibakePattern) ?? []).length;
  return chinese * 4 + ascii * 0.2 - replacements * 8 - mojibake * 2;
}

export function repairMojibake(value: string) {
  if (!value) {
    return value;
  }

  if (typeof Buffer === "undefined") {
    return value.replace(replacementPattern, "").trim();
  }

  let best = value;
  for (const encoding of ["latin1", "binary"] as const) {
    try {
      const decoded = Buffer.from(value, encoding).toString("utf8");
      if (readabilityScore(decoded) > readabilityScore(best)) {
        best = decoded;
      }
    } catch {
      // Keep the original text when conversion is not possible.
    }
  }

  return best.replace(replacementPattern, "").trim();
}

export function cleanText(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = repairMojibake(value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned || fallback;
}

function cleanArray(values: unknown, fallback: string[] = []) {
  if (!Array.isArray(values)) {
    return fallback;
  }

  return values.map((item) => cleanText(item)).filter(Boolean);
}

function cleanDeep(value: unknown): unknown {
  if (typeof value === "string") {
    return cleanText(value);
  }
  if (Array.isArray(value)) {
    return value.map(cleanDeep).filter((item) => item !== "");
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cleanDeep(entry)]));
  }
  return value;
}

function cleanSections(values: unknown): SlideSection[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((item) => cleanDeep(item) as SlideSection)
    .filter((item) => item && typeof item === "object" && "type" in item);
}

function cleanDeckSpec(value: unknown): DeckSpec | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const spec = cleanDeep(value) as DeckSpec;
  if (!spec.pptType || !Array.isArray(spec.slideSpecs)) {
    return undefined;
  }

  return {
    ...spec,
    id: cleanText(spec.id, `deck-spec-${Date.now()}`),
    version: cleanText(spec.version, "1.0"),
    pptType: cleanText(spec.pptType, "general_report"),
    pptTypeLabel: cleanText(spec.pptTypeLabel, "通用汇报"),
    audience: cleanText(spec.audience, "目标受众"),
    goal: cleanText(spec.goal, "生成可交付 PPT"),
    coreMessage: cleanText(spec.coreMessage),
    expectedDecision: cleanText(spec.expectedDecision),
    recommendedSlideCount: Number.isFinite(Number(spec.recommendedSlideCount)) ? Number(spec.recommendedSlideCount) : spec.slideSpecs.length,
    requiredPages: cleanArray(spec.requiredPages),
    forbiddenContent: cleanArray(spec.forbiddenContent),
    evidenceNeeds: cleanArray(spec.evidenceNeeds),
    styleProfile: cleanText(spec.styleProfile, "AI PPT Agent"),
    qualityBar: Math.max(60, Math.min(95, Number(spec.qualityBar) || 82)),
    createdAt: cleanText(spec.createdAt, new Date().toISOString()),
    slideSpecs: spec.slideSpecs.map((item, index) => ({
      ...item,
      id: cleanText(item.id, `slide-spec-${index + 1}`),
      page: Number.isFinite(Number(item.page)) ? Number(item.page) : index + 1,
      slideId: cleanText(item.slideId),
      contentPlanSlideId: cleanText(item.contentPlanSlideId),
      pagePlanId: cleanText(item.pagePlanId),
      contentDraftId: cleanText(item.contentDraftId),
      audienceQuestion: cleanText(item.audienceQuestion),
      coreClaim: cleanText(item.coreClaim),
      title: cleanText(item.title, `第 ${index + 1} 页`),
      role: cleanText(item.role, "页面论证"),
      finalTitle: cleanText(item.finalTitle),
      pagePurpose: cleanText(item.pagePurpose),
      leadSentence: cleanText(item.leadSentence),
      claim: cleanText(item.claim),
      mustProve: cleanText(item.mustProve),
      visibleBlocks: Array.isArray(item.visibleBlocks) ? cleanDeep(item.visibleBlocks) as typeof item.visibleBlocks : undefined,
      evidenceSnippets: Array.isArray(item.evidenceSnippets) ? cleanDeep(item.evidenceSnippets) as typeof item.evidenceSnippets : undefined,
      sourceUseSummary: cleanText(item.sourceUseSummary),
      confidenceNote: cleanText(item.confidenceNote),
      evidenceNeed: cleanArray(item.evidenceNeed),
      evidenceNeeds: cleanArray(item.evidenceNeeds),
      evidenceSourceIds: cleanArray(item.evidenceSourceIds),
      evidenceMapId: cleanText(item.evidenceMapId),
      matchedEvidenceBlocks: Array.isArray(item.matchedEvidenceBlocks)
        ? item.matchedEvidenceBlocks.map((block) => ({
            summary: cleanText(block.summary),
            blockType: cleanText(block.blockType),
            confidence: Math.max(0, Math.min(100, Number(block.confidence) || 0)),
            reliability: cleanText(block.reliability)
          }))
        : [],
      evidenceCoverage: Number.isFinite(Number(item.evidenceCoverage)) ? Number(item.evidenceCoverage) : undefined,
      sourceConfidence: Number.isFinite(Number(item.sourceConfidence)) ? Number(item.sourceConfidence) : undefined,
      unsupportedClaims: cleanArray(item.unsupportedClaims),
      lowConfidenceWarnings: cleanArray(item.lowConfidenceWarnings),
      userConfirmationNeeded: cleanArray(item.userConfirmationNeeded),
      recommendedVisualForm: item.recommendedVisualForm,
      layoutPlanId: cleanText(item.layoutPlanId),
      selectedLayout: cleanText(item.selectedLayout),
      layoutFamily: cleanText(item.layoutFamily),
      informationDensity: item.informationDensity === "low" || item.informationDensity === "high" ? item.informationDensity : item.informationDensity === "medium" ? "medium" : undefined,
      contentSlots: cleanArray(item.contentSlots),
      visualSlots: cleanArray(item.visualSlots),
      hierarchyRules: cleanArray(item.hierarchyRules),
      exportHints: cleanArray(item.exportHints),
      previewHints: cleanArray(item.previewHints),
      informationHierarchy: item.informationHierarchy ? cleanDeep(item.informationHierarchy) as typeof item.informationHierarchy : undefined,
      qualityChecks: cleanArray(item.qualityChecks),
      layoutIntent: item.layoutIntent,
      layoutReason: cleanText(item.layoutReason),
      visualIntent: cleanText(item.visualIntent),
      density: item.density === "airy" || item.density === "dense" ? item.density : "balanced",
      mustHave: cleanArray(item.mustHave),
      avoid: cleanArray(item.avoid),
      scoreRules: Array.isArray(item.scoreRules)
        ? item.scoreRules.map((rule) => ({
            dimension: cleanText(rule.dimension, "页面质量"),
            points: Math.max(1, Math.min(30, Number(rule.points) || 5)),
            rule: cleanText(rule.rule)
          }))
        : []
    }))
  };
}

export function cleanProject(project: CanvasProject): CanvasProject {
  const outlineFallback = project.outline?.length ? project.outline : [];
  const researchFallback = project.research?.length ? project.research : [];
  const planFallback = project.plan?.length ? project.plan : [];
  const slideFallback = project.slides?.length ? project.slides : [];

  return {
    ...project,
    title: cleanText(project.title, "AI PPT Agent"),
    prompt: cleanText(project.prompt),
    outline: outlineFallback.map(
      (item, index): OutlineItem => ({
        ...item,
        id: item.id || `outline-${index + 1}`,
        page: Number.isFinite(Number(item.page)) ? Number(item.page) : index + 1,
        title: cleanText(item.title, `第 ${index + 1} 页`),
        note: cleanText(item.note),
        evidenceBlockIds: cleanArray(item.evidenceBlockIds)
      })
    ),
    research: researchFallback.map(
      (item, index): ResearchItem => ({
        ...item,
        id: item.id || `research-${index + 1}`,
        title: cleanText(item.title, `资料 ${index + 1}`),
        source: cleanText(item.source, "公开资料"),
        summary: cleanText(item.summary),
        sourceName: cleanText(item.sourceName, item.source),
        url: cleanText(item.url),
        sourceType: item.sourceType,
        status: item.status,
        confidence: Math.max(0, Math.min(100, Number(item.confidence) || 60))
      })
    ),
    plan: planFallback.map(
      (item, index): PlanItem => ({
        ...item,
        id: item.id || `plan-${index + 1}`,
        page: Number.isFinite(Number(item.page)) ? Number(item.page) : index + 1,
        title: cleanText(item.title, `策划 ${index + 1}`),
        layout: cleanText(item.layout, "标题 + 卡片布局"),
        elements: cleanArray(item.elements),
        evidenceBlockIds: cleanArray(item.evidenceBlockIds)
      })
    ),
    contentPlan: project.contentPlan ? cleanDeep(project.contentPlan) as CanvasProject["contentPlan"] : undefined,
    slidePagePlans: project.slidePagePlans ? cleanDeep(project.slidePagePlans) as CanvasProject["slidePagePlans"] : undefined,
    layoutPlans: project.layoutPlans ? cleanDeep(project.layoutPlans) as CanvasProject["layoutPlans"] : undefined,
    beautifyPlan: project.beautifyPlan ? cleanDeep(project.beautifyPlan) as CanvasProject["beautifyPlan"] : undefined,
    sourceDocuments: project.sourceDocuments ? cleanDeep(project.sourceDocuments) as CanvasProject["sourceDocuments"] : undefined,
    acquisitionReport: project.acquisitionReport ? cleanDeep(project.acquisitionReport) as CanvasProject["acquisitionReport"] : undefined,
    evidenceBlocks: project.evidenceBlocks ? cleanDeep(project.evidenceBlocks) as CanvasProject["evidenceBlocks"] : undefined,
    evidenceNeeds: project.evidenceNeeds ? cleanDeep(project.evidenceNeeds) as CanvasProject["evidenceNeeds"] : undefined,
    slideEvidenceMaps: project.slideEvidenceMaps ? cleanDeep(project.slideEvidenceMaps) as CanvasProject["slideEvidenceMaps"] : undefined,
    evidenceReport: project.evidenceReport ? cleanDeep(project.evidenceReport) as CanvasProject["evidenceReport"] : undefined,
    contentDrafts: project.contentDrafts ? cleanDeep(project.contentDrafts) as CanvasProject["contentDrafts"] : undefined,
    deckContentQualityReport: project.deckContentQualityReport ? cleanDeep(project.deckContentQualityReport) as CanvasProject["deckContentQualityReport"] : undefined,
    deckSpec: cleanDeckSpec(project.deckSpec),
    slides: slideFallback.map(
      (item, index): DesignSlide => ({
        ...item,
        id: item.id || `slide-${index + 1}`,
        title: cleanText(item.title, `第 ${index + 1} 页`),
        subtitle: cleanText(item.subtitle),
        tone: cleanText(item.tone, "商务简约"),
        bullets: cleanArray(item.bullets),
        visualPrompt: cleanText(item.visualPrompt),
        speakerNote: cleanText(item.speakerNote),
        evidenceBlockIds: cleanArray(item.evidenceBlockIds),
        sourceIds: cleanArray(item.sourceIds),
        pageIntent: cleanText(item.pageIntent),
        sections: cleanSections(item.sections)
      })
    )
  };
}
