import type { CanvasProject, DesignSlide, ProjectQualityReport, QualityIssue, QualityMetric, ResearchItem } from "@/lib/canvas-data";
import { findSpecForSlide } from "@/lib/deck-spec";
import { cleanProject } from "@/lib/text-sanitize";

const STRUCTURED_SECTION_TYPES = new Set([
  "day-card",
  "route-card",
  "tips-grid",
  "stat-card",
  "donut-chart",
  "bar-chart",
  "table",
  "timeline",
  "warning",
  "source-note",
  "callout"
]);

const INTERNAL_FIELD_PATTERN = /\b(day-route|hero-image|tips-grid|stat-card|source-note|route-card|bar-chart|donut-chart|visual|auto|layout)\b/i;
const PLACEHOLDER_PATTERN = /占位|待替换|lorem|placeholder|generated visual|灰块|视觉模块|提醒模块/i;

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function metricStatus(score: number): QualityMetric["status"] {
  if (score >= 82) return "good";
  if (score >= 65) return "warn";
  return "risk";
}

function issueId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`;
}

function textLength(value: string | undefined) {
  return [...(value || "").trim()].length;
}

function containsInternalText(value: string | undefined) {
  return INTERNAL_FIELD_PATTERN.test(value || "");
}

function containsPlaceholderText(value: string | undefined) {
  return PLACEHOLDER_PATTERN.test(value || "");
}

function normalizeForMatch(value: string | undefined) {
  return (value || "").replace(/\s+/g, "").replace(/[：:｜|·\-_/]/g, "");
}

function overlapsText(a: string | undefined, b: string | undefined) {
  const left = normalizeForMatch(a);
  const right = normalizeForMatch(b);
  if (!left || !right) return false;
  if (left.includes(right) || right.includes(left)) return true;
  const leftPairs = new Set(Array.from({ length: Math.max(0, left.length - 1) }, (_, index) => left.slice(index, index + 2)));
  const rightPairs = Array.from({ length: Math.max(0, right.length - 1) }, (_, index) => right.slice(index, index + 2));
  const hits = rightPairs.filter((pair) => leftPairs.has(pair)).length;
  return hits >= Math.min(3, Math.ceil(rightPairs.length * 0.45));
}

function slideMatchesSpec(slide: DesignSlide, spec: NonNullable<CanvasProject["deckSpec"]>["slideSpecs"][number]) {
  if (slide.id && spec.slideId && slide.id === spec.slideId) return true;
  if (slide.pageIntent && slide.pageIntent === spec.role) return true;
  if (slide.layout === "cover" && spec.layoutIntent === "cover") return true;
  return overlapsText(`${slide.title} ${slide.subtitle} ${slide.pageIntent || ""}`, `${spec.title} ${spec.role}`);
}

function averageConfidence(research: ResearchItem[]) {
  if (!research.length) return 0;
  return research.reduce((sum, item) => sum + (Number(item.confidence) || 0), 0) / research.length;
}

function hasSourceNote(slide: DesignSlide) {
  return slide.sections?.some((section) => section.type === "source-note") ?? false;
}

function hasStructuredSections(slide: DesignSlide) {
  return slide.sections?.some((section) => STRUCTURED_SECTION_TYPES.has(section.type)) ?? false;
}

function slideEvidenceCoverage(slides: DesignSlide[]) {
  if (!slides.length) return 0;
  const covered = slides.filter((slide) => (slide.sourceIds?.length || 0) > 0 || (slide.evidenceBlockIds?.length || 0) > 0 || hasSourceNote(slide)).length;
  return covered / slides.length;
}

function layoutDiversity(slides: DesignSlide[]) {
  if (!slides.length) return 0;
  return new Set(slides.map((slide) => slide.layout || "cards")).size / Math.min(8, slides.length);
}

function structuredCoverage(slides: DesignSlide[]) {
  if (!slides.length) return 0;
  return slides.filter(hasStructuredSections).length / slides.length;
}

function editableCoverage(slides: DesignSlide[]) {
  if (!slides.length) return 0;
  const editableSlides = slides.filter((slide) => {
    const sections = slide.sections || [];
    if (!sections.length) return (slide.bullets?.length || 0) > 0;
    const nonImageSections = sections.filter((section) => section.type !== "hero-image" && section.type !== "image-strip");
    return nonImageSections.length > 0;
  }).length;
  return editableSlides / slides.length;
}

function makeMetric(label: string, score: number, detail: string): QualityMetric {
  const normalized = clamp(score);
  return {
    label,
    score: normalized,
    status: metricStatus(normalized),
    detail
  };
}

function collectIssues(project: CanvasProject, metrics: QualityMetric[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const slides = project.slides || [];
  const research = project.research || [];
  const avgConfidence = averageConfidence(research);
  const spec = project.deckSpec;

  if (!spec && project.reviewCenter) {
    issues.push({
      id: "missing-deck-spec",
      severity: "risk",
      title: "缺少生成合同",
      detail: "项目已有评审中枢，但没有 DeckSpec 生成合同，生成、评分和导出无法共享同一套标准。",
      action: "重新生成或重新评分，让系统生成 DeckSpec。"
    });
  }

  if (spec) {
    const missingRequiredSpecs = spec.slideSpecs.filter((slideSpec) => !slides.some((slide) => slideMatchesSpec(slide, slideSpec)));
    const missingRequired = missingRequiredSpecs.map((item) => item.title);
    if (missingRequired.length) {
      issues.push({
        id: "deck-spec-missing-pages",
        severity: "risk",
        title: "缺少必备页面",
        detail: `DeckSpec 要求出现「${missingRequired.slice(0, 4).join("、")}」，当前稿件没有覆盖。`,
        action: "先应用评审中枢自动修复，补齐必备页面。"
      });
    }

    if (spec.slideSpecs.length && slides.length < Math.min(spec.recommendedSlideCount - 1, spec.slideSpecs.length)) {
      issues.push({
        id: "below-recommended-count",
        severity: "warn",
        title: "页数低于生成合同建议",
        detail: `当前 ${slides.length} 页，DeckSpec 建议 ${spec.recommendedSlideCount} 页。`,
        action: "补齐证据页、验收页或行动收束页。"
      });
    }
  }

  if (slides.length < 8) {
    issues.push({
      id: "deck-too-short",
      severity: "risk",
      title: "页数不足",
      detail: `当前只有 ${slides.length} 页，完整汇报型 PPT 建议至少 8-12 页。`,
      action: "补充背景、路线/方案、预算、风险、来源页。"
    });
  }

  if (research.length < 3) {
    issues.push({
      id: "research-too-thin",
      severity: project.deckSpec ? "warn" : "risk",
      title: "资料源不足",
      detail: `当前只有 ${research.length} 条资料源，容易生成泛泛内容。`,
      action: "先执行公开检索或上传 PDF/需求文档。"
    });
  } else if (avgConfidence < 72) {
    issues.push({
      id: "research-low-confidence",
      severity: "warn",
      title: "资料置信度偏低",
      detail: `平均置信度约 ${Math.round(avgConfidence)}，建议补充官方或一手来源。`,
      action: "优先添加官网、政策文件、景区/企业官方入口。"
    });
  }

  const repeatedLayouts = new Map<string, number>();
  slides.forEach((slide) => {
    const layout = slide.layout || "cards";
    repeatedLayouts.set(layout, (repeatedLayouts.get(layout) || 0) + 1);
  });
  const dominantLayout = [...repeatedLayouts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (dominantLayout && dominantLayout[1] >= Math.max(5, Math.ceil(slides.length * 0.55))) {
    issues.push({
      id: "layout-repetition",
      severity: "warn",
      title: "版式重复度偏高",
      detail: `${dominantLayout[0]} 版式出现 ${dominantLayout[1]} 次，成片会显得机械。`,
      action: "穿插时间线、表格、对比、数据卡、路线卡和来源页。"
    });
  }

  if (project.mode === "beautify" && !project.beautifyPlan) {
    issues.push({
      id: "beautify-plan-missing",
      severity: "risk",
      title: "缺少原稿美化诊断",
      detail: "PPT 美化模式必须先诊断原稿，再决定保留、重排和提分策略。",
      action: "重新上传 PPT/PPTX 并执行美化诊断。"
    });
  }

  project.beautifyPlan?.pageDiagnoses.slice(0, 6).forEach((page) => {
    const riskIssue = page.detectedIssues.find((issue) => issue.severity === "risk");
    if (riskIssue) {
      issues.push({
        id: `beautify-page-${page.page}-risk`,
        severity: "warn",
        title: `原稿第 ${page.page} 页需要重排`,
        detail: `${riskIssue.title}：${riskIssue.detail}`,
        action: page.rewriteActions.slice(0, 3).join("；")
      });
    }
  });

  slides.forEach((slide, index) => {
    const slideText = `${slide.title} ${slide.subtitle} ${(slide.bullets || []).join(" ")} ${slide.pageIntent || ""}`;
    const slideSpec = findSpecForSlide(project, slide, index);

    if (containsInternalText(slideText)) {
      issues.push({
        id: issueId("internal-field-leak", index),
        severity: "risk",
        title: `第 ${index + 1} 页暴露内部字段`,
        detail: "页面文案里出现 layout、day-route、visual 等工程字段，会让成片像 demo。",
        slideId: slide.id,
        slideTitle: slide.title,
        action: "用中文页面角色、路线图或真实模块替代内部字段。"
      });
    }

    if (containsPlaceholderText(slideText)) {
      issues.push({
        id: issueId("placeholder-leak", index),
        severity: "risk",
        title: `第 ${index + 1} 页仍有占位内容`,
        detail: "页面里出现占位、待替换、视觉模块等演示痕迹。",
        slideId: slide.id,
        slideTitle: slide.title,
        action: "替换为真实路线、证据、图表或执行提醒。"
      });
    }

    if (project.deckSpec && !slideSpec && index < project.deckSpec.slideSpecs.length) {
      issues.push({
        id: issueId("missing-slide-spec", index),
        severity: "warn",
        title: `第 ${index + 1} 页没有页面合同`,
        detail: "该页没有对应 SlideSpec，无法判断页面角色、证据需求和扣分规则。",
        slideId: slide.id,
        slideTitle: slide.title,
        action: "重新应用策划审核，让页面绑定 SlideSpec。"
      });
    }

    if (slideSpec) {
      const hasRole = !slideSpec.role || slide.pageIntent === slideSpec.role || slideText.includes(slideSpec.role);
      const hasEditableStructure = hasStructuredSections(slide);
      const hasEvidence = (slide.sourceIds?.length || 0) > 0 || (slide.evidenceBlockIds?.length || 0) > 0 || hasSourceNote(slide);
      const missingContract = [
        hasRole ? "" : `页面角色应为「${slideSpec.role}」`,
        hasEditableStructure ? "" : "至少出现 1 个结构化模块而不是纯 bullet",
        hasEvidence || slideSpec.evidenceSourceIds.length === 0 ? "" : "需要绑定证据来源或资料块"
      ].filter(Boolean);
      if (missingContract.length) {
        issues.push({
          id: issueId("missing-must-have", index),
          severity: "warn",
          title: `第 ${index + 1} 页未满足页面合同`,
          detail: `缺少合同要求：${missingContract.slice(0, 3).join("、")}。`,
          slideId: slide.id,
          slideTitle: slide.title,
          action: "按本页 SlideSpec 补齐主张、证据或行动项。"
        });
      }
    }

    if ((slide.bullets?.length || 0) > 6) {
      issues.push({
        id: issueId("dense-bullets", index),
        severity: "warn",
        title: `第 ${index + 1} 页文字偏密`,
        detail: "bullet 超过 6 条，导出后容易出现拥挤或字号过小。",
        slideId: slide.id,
        slideTitle: slide.title,
        action: "压缩为 3-4 个卡片，或改成表格/流程图。"
      });
    }

    if (textLength(slide.title) > 32) {
      issues.push({
        id: issueId("long-title", index),
        severity: "warn",
        title: `第 ${index + 1} 页标题过长`,
        detail: "标题超过 32 个字符，可能削弱视觉层级。",
        slideId: slide.id,
        slideTitle: slide.title,
        action: "改成结论式短标题，把解释放到副标题。"
      });
    }

    if (textLength(slide.subtitle) > 105) {
      issues.push({
        id: issueId("long-subtitle", index),
        severity: "info",
        title: `第 ${index + 1} 页副标题偏长`,
        detail: "副标题过长时会挤压主画面空间。",
        slideId: slide.id,
        slideTitle: slide.title,
        action: "保留一句核心判断，细节放入卡片。"
      });
    }

    if (!hasStructuredSections(slide)) {
      issues.push({
        id: issueId("missing-sections", index),
        severity: "warn",
        title: `第 ${index + 1} 页缺少页面模块`,
        detail: "没有可用于自动排版的结构化 sections，导出会退回基础 bullet 版式。",
        slideId: slide.id,
        slideTitle: slide.title,
        action: "补充 tips-grid、table、timeline、stat-card 等模块。"
      });
    }

    if ((project.research?.length || 0) > 0 && (slide.sourceIds?.length || 0) === 0 && !hasSourceNote(slide)) {
      issues.push({
        id: issueId("missing-source-map", index),
        severity: index === 0 ? "info" : "warn",
        title: `第 ${index + 1} 页缺少来源映射`,
        detail: "页面没有 sourceIds 或 source-note，后续复核时难以追溯依据。",
        slideId: slide.id,
        slideTitle: slide.title,
        action: "为本页挂载对应资料源或上传资料块。"
      });
    }
  });

  metrics
    .filter((metric) => metric.status === "risk")
    .forEach((metric, index) => {
      issues.push({
        id: `metric-risk-${index + 1}`,
        severity: "risk",
        title: `${metric.label}不足`,
        detail: metric.detail,
        action: "先按自检建议补资料或调整页面结构，再导出正式版。"
      });
    });

  return issues.slice(0, 14);
}

export function enhanceProjectEvidence(project: CanvasProject): CanvasProject {
  const cleaned = cleanProject(project);
  const research = cleaned.research || [];
  if (!research.length || !cleaned.slides?.length) {
    return cleaned;
  }

  const officialSource = research.find((item) => item.sourceType === "official" || item.status === "verified") || research[0];
  const slides = cleaned.slides.map((slide, index) => {
    const source = index === 0 ? officialSource : research[index % research.length] || officialSource;
    const sourceIds = slide.sourceIds?.length ? slide.sourceIds : source ? [source.id] : [];
    const sections = slide.sections || [];
    const hasNote = sections.some((section) => section.type === "source-note");
    return {
      ...slide,
      sourceIds,
      sections:
        hasNote || !source
          ? sections
          : [
              ...sections,
              {
                type: "source-note" as const,
                sourceIds: [source.id],
                text: `参考资料：${source.sourceName || source.source || source.title}`
              }
            ]
    };
  });

  const outline = cleaned.outline.map((item, index) => ({
    ...item,
    evidenceBlockIds: item.evidenceBlockIds?.length ? item.evidenceBlockIds : [research[index % research.length]?.id].filter(Boolean)
  }));

  const plan = cleaned.plan.map((item, index) => ({
    ...item,
    evidenceBlockIds: item.evidenceBlockIds?.length ? item.evidenceBlockIds : [research[index % research.length]?.id].filter(Boolean)
  }));

  return cleanProject({ ...cleaned, outline, plan, slides });
}

export function buildProjectQualityReport(project: CanvasProject): ProjectQualityReport {
  const slides = project.slides || [];
  const research = project.research || [];
  const avgConfidence = averageConfidence(research);
  const verifiedSources = research.filter((item) => item.sourceType === "official" || item.status === "verified").length;
  const fallbackSources = research.filter((item) => item.status === "fallback" || item.sourceType === "local").length;
  const evidenceCoverage = slideEvidenceCoverage(slides);
  const sectionCoverage = structuredCoverage(slides);
  const diversity = layoutDiversity(slides);
  const editable = editableCoverage(slides);
  const idealSlideScore = slides.length >= 9 && slides.length <= 12 ? 100 : slides.length >= 8 && slides.length <= 14 ? 84 : 58;
  const outlinePlanScore = Math.min(100, ((project.outline?.length || 0) / Math.max(1, slides.length - 1)) * 45 + ((project.plan?.length || 0) / Math.max(1, slides.length - 1)) * 45 + 10);

  const researchBaseScore = research.length === 0
    ? 0
    : Math.min(100, avgConfidence * 0.5 + Math.min(verifiedSources, 5) * 8 + evidenceCoverage * 14 + Math.min(research.length, 8) * 2);
  const researchPenalty =
    (research.length < 3 ? 18 : 0) +
    (verifiedSources === 0 ? 22 : 0) +
    (fallbackSources >= Math.max(1, Math.ceil(research.length * 0.6)) ? 12 : 0);

  const metrics = [
    makeMetric("内容完整度", idealSlideScore * 0.42 + outlinePlanScore * 0.58, `${slides.length} 页，${project.outline?.length || 0} 条大纲，${project.plan?.length || 0} 条页面策划。`),
    makeMetric("资料可信度", researchBaseScore - researchPenalty, `${research.length} 条资料源，${verifiedSources} 条官方/已验证来源，${fallbackSources} 条兜底来源，页面映射率 ${Math.round(evidenceCoverage * 100)}%。`),
    makeMetric("页面策划", sectionCoverage * 62 + diversity * 38, `结构化页面占比 ${Math.round(sectionCoverage * 100)}%，版式多样度 ${Math.round(diversity * 100)}%。`),
    makeMetric("排版安全", 100 - slides.reduce((penalty, slide) => penalty + Math.max(0, (slide.bullets?.length || 0) - 5) * 4 + (textLength(slide.title) > 34 ? 5 : 0) + (textLength(slide.subtitle) > 115 ? 4 : 0), 0), "按标题长度、正文密度和模块完整度估算导出溢出风险。"),
    makeMetric("可编辑性", editable * 86 + sectionCoverage * 14, `可编辑模块覆盖 ${Math.round(editable * 100)}%，避免整页图片化。`),
    ...(project.mode === "beautify" && project.beautifyPlan
      ? [makeMetric("原稿诊断", project.beautifyPlan.diagnosisScore, `${project.beautifyPlan.sourceFileName}：${project.beautifyPlan.originalPageCount} 页、${project.beautifyPlan.originalBlockCount} 个内容块，${project.beautifyPlan.level}。`)]
      : project.mode === "beautify"
        ? [makeMetric("原稿诊断", 36, "当前是 PPT 美化模式，但没有生成原稿诊断计划。")]
        : [])
  ];

  const issues = collectIssues(project, metrics);
  const score = clamp(metrics.reduce((sum, metric) => sum + metric.score, 0) / Math.max(1, metrics.length));
  const riskIssues = issues.filter((issue) => issue.severity === "risk").length;
  const warnIssues = issues.filter((issue) => issue.severity === "warn").length;
  const status: ProjectQualityReport["status"] = score >= 84 && riskIssues === 0 && warnIssues <= 3 ? "ready" : score >= 68 && riskIssues <= 1 ? "needs-review" : "risky";
  const qualityBar = project.deckSpec?.qualityBar || 0;
  const gatedStatus: ProjectQualityReport["status"] =
    qualityBar && score < qualityBar
      ? score >= Math.max(68, qualityBar - 12) && riskIssues <= 1
        ? "needs-review"
        : "risky"
      : status;
  const summary =
    gatedStatus === "ready"
      ? "已达到可交付预览标准，可以导出后做人工微调。"
      : gatedStatus === "needs-review"
        ? "整体可用，但建议导出前复核资料来源、个别页面密度和版式变化。"
        : "当前仍有明显交付风险，建议先补资料或重跑页面策划。";

  return {
    score,
    status: gatedStatus,
    summary,
    metrics,
    issues,
    updatedAt: new Date().toISOString()
  };
}

export function ensureProjectQuality(project: CanvasProject): CanvasProject {
  const enhanced = enhanceProjectEvidence(project);
  return cleanProject({
    ...enhanced,
    quality: buildProjectQualityReport(enhanced)
  });
}
