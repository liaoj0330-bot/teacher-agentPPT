import type { SlideLayout, SlideSection } from "@/lib/canvas-data";
import type { ContentPlan, ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";
import type { EvidenceBlock, EvidenceReliability, SlideEvidenceMap } from "@/lib/ppt-agent/evidence-types";
import type { LayoutPlan } from "@/lib/ppt-agent/layout-plan";
import type { SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";
import type { EvidenceSnippet, SlideContentDraft, VisibleContentBlock } from "@/lib/ppt-agent/slide-content-draft";
import { slideLayoutForSelectedLayout } from "@/lib/ppt-agent/layout-library";
import { validateSlideContentDraft } from "@/lib/ppt-agent/slide-content-validator";
import { cleanText } from "@/lib/text-sanitize";

export type SlideContentRealizerInput = {
  contentPlan: ContentPlan;
  slidePagePlan: SlidePagePlan;
  layoutPlan?: LayoutPlan;
  slideEvidenceMap?: SlideEvidenceMap;
  evidenceBlocks?: EvidenceBlock[];
  mode?: "quick" | "professional";
};

function uniq<T>(items: T[]) {
  return [...new Set(items.filter(Boolean))];
}

function compact(value: string | undefined, max = 34) {
  const clean = cleanText(value).replace(/\s+/g, " ");
  if ([...clean].length <= max) return clean;
  const separators = ["，", "；", "。", "、", "-", "·", "|", ":"];
  for (const separator of separators) {
    const head = clean.split(separator)[0]?.trim();
    if (head && [...head].length >= 6 && [...head].length <= max) return head;
  }
  return [...clean].slice(0, max).join("");
}

function cleanSentence(value: string | undefined, max = 62) {
  return compact(value, max)
    .replace(/^(受众问题|核心观点|证据安排|页面结论|版式执行层|推荐表达形式)[:：\s]*/g, "")
    .replace(/^(本页|这一页|页面|此页)(要|需要|用于|用来|必须)?/g, "")
    .replace(/必须先证明|否则|无法形成判断|转成可检查的判断|不要停留在普通信息罗列|不是停留在普通信息罗列/g, "")
    .replace(/页面结论/g, "本页判断")
    .replace(/先回应本页为什么要出现，以及它如何服务「[^」]+」。?/g, "")
    .replace(/把「([^」]+)」/g, "$1")
    .trim();
}

function roleIncludes(role: string, pattern: RegExp) {
  return pattern.test(cleanText(role));
}

function titleByType(type: ContentPlanPPTType, role: string, claim: string, index: number) {
  const roleText = cleanText(role);
  const subject = cleanSentence(claim || role, 16);
  if (index === 0 || roleIncludes(roleText, /封面|开场|定位/)) {
    if (type === "courseware") return "先建立能照着练的学习路径";
    if (type === "proposal") return "合作方案先回答是否值得推进";
    if (type === "project_report") return "阶段汇报聚焦进展风险与决策";
    if (type === "product_intro") return "产品介绍帮助客户判断是否试用";
  }
  if (roleIncludes(roleText, /目录|结构|导航/)) return "先看清本次判断路径";
  if (roleIncludes(roleText, /来源|证据|资料/)) return "资料边界决定结论可信度";
  if (roleIncludes(roleText, /风险|治理|安全/)) return "风险要提前进入可控清单";
  if (roleIncludes(roleText, /行动|下一步|收束|合作|采购/)) return "下一步要落到可执行动作";
  if (roleIncludes(roleText, /部署|实施|路径|流程|步骤|周期/)) return "落地路径要分阶段验证";
  if (roleIncludes(roleText, /指标|成果|价值|验收|证明/)) return "价值判断要回到可验收指标";
  if (roleIncludes(roleText, /场景|痛点|问题|需求|目标/)) return "真实场景决定方案优先级";
  if (roleIncludes(roleText, /能力|架构|蓝图|内容|框架/)) return "能力边界要让使用者看得懂";
  if (type === "courseware") return `${subject}要转成课堂练习`;
  if (type === "proposal") return `${subject}要降低客户合作风险`;
  if (type === "project_report") return `${subject}要支撑管理层判断`;
  if (type === "product_intro") return `${subject}要服务试用决策`;
  return `${subject}需要形成清晰判断`;
}

function sanitizeTitle(raw: string) {
  let title = cleanSentence(raw, 28).replace(/[，。；：:、\s]+$/g, "");
  if ([...title].length < 8) title = `${title || "核心判断"}需要可验证`;
  if ([...title].length > 28) title = compact(title, 28);
  return title;
}

function matchedEvidence(input: SlideContentRealizerInput) {
  const byId = new Map((input.evidenceBlocks || []).map((block) => [block.evidenceBlockId, block]));
  return (input.slideEvidenceMap?.matchedEvidenceBlocks || [])
    .map((matched) => {
      const full = byId.get(matched.evidenceBlockId);
      return {
        evidenceBlockId: matched.evidenceBlockId,
        sourceId: matched.sourceId,
        text: cleanSentence(full?.summary || matched.summary || full?.text, 68),
        reliability: (full?.reliability || matched.reliability) as EvidenceReliability,
        confidence: Math.max(0, Math.min(100, Number(full?.confidence || matched.confidence || 0))),
        blockType: full?.blockType || matched.blockType
      };
    })
    .filter((item) => item.text)
    .slice(0, 4);
}

function evidenceSnippets(input: SlideContentRealizerInput): EvidenceSnippet[] {
  return matchedEvidence(input).map((item) => {
    const reliable = item.reliability === "verified" || item.reliability === "traceable";
    const prefix = reliable ? "可追溯资料显示" : "当前资料初步显示";
    return {
      text: `${prefix}：${compact(item.text, 56)}。`,
      sourceId: item.sourceId,
      evidenceBlockId: item.evidenceBlockId,
      reliability: item.reliability,
      confidence: item.confidence,
      visible: true
    };
  });
}

function blockCountFor(layout: string | undefined) {
  if (/metric|dashboard|stats/.test(layout || "")) return 4;
  if (/timeline|process|roadmap|architecture/.test(layout || "")) return 5;
  if (/matrix|comparison|risk|table/.test(layout || "")) return 4;
  if (/summary|closing/.test(layout || "")) return 4;
  return 3;
}

function blockTypeFor(layout: string | undefined): VisibleContentBlock["type"] {
  if (/metric|dashboard/.test(layout || "")) return "metric";
  if (/timeline|process|roadmap|architecture/.test(layout || "")) return "step";
  if (/comparison|matrix/.test(layout || "")) return "comparison";
  if (/risk|checklist/.test(layout || "")) return "risk";
  if (/case/.test(layout || "")) return "example";
  if (/summary|closing/.test(layout || "")) return "action";
  return "point";
}

function contentSeeds(input: SlideContentRealizerInput) {
  const page = input.slidePagePlan;
  const evidence = matchedEvidence(input).map((item) => item.text);
  const fromBlocks = (page.contentBlocks || [])
    .filter((block) => !/受众问题|核心观点|证据安排|页面结论|版式执行层|推荐表达形式/.test(block.title))
    .flatMap((block) => [block.body, block.evidenceNeed || ""]);
  const fromPlan = [
    page.coreClaim,
    page.pagePurpose,
    page.mustProve,
    ...page.evidenceNeed,
    ...(input.contentPlan.slidePlan.find((slide) => slide.id === page.contentPlanSlideId)?.suggestedEvidence || [])
  ];
  return uniq([...evidence, ...fromBlocks, ...fromPlan].map((item) => cleanSentence(item, 62))).filter((item) => item.length >= 6);
}

function labelsByType(type: VisibleContentBlock["type"]) {
  const labels: Record<VisibleContentBlock["type"], string[]> = {
    point: ["关键判断", "落地要点", "决策依据", "补充说明", "边界条件"],
    metric: ["观察指标", "验收口径", "过程数据", "复盘信号", "风险阈值"],
    step: ["第一步", "第二步", "第三步", "第四步", "复盘动作"],
    comparison: ["当前做法", "推荐做法", "客户收益", "实施边界", "决策建议"],
    risk: ["主要风险", "触发条件", "控制动作", "责任边界", "复盘机制"],
    recommendation: ["建议动作", "优先顺序", "配套资源", "验收方式", "后续安排"],
    action: ["确认范围", "补齐资料", "安排试点", "复盘决策", "推进节奏"],
    example: ["典型场景", "使用对象", "输出结果", "复用方式", "注意事项"],
    evidence: ["资料摘录", "来源说明", "可验证点", "待补信息", "使用边界"]
  };
  return labels[type];
}

function visibleBlocks(input: SlideContentRealizerInput): VisibleContentBlock[] {
  const layout = input.layoutPlan?.selectedLayout || input.slidePagePlan.recommendedVisualForm;
  const count = blockCountFor(layout);
  const type = blockTypeFor(layout);
  const seeds = contentSeeds(input);
  const fallback = [
    input.slidePagePlan.coreClaim,
    input.slidePagePlan.pagePurpose,
    input.slidePagePlan.mustProve,
    ...input.contentPlan.keyQuestions,
    ...input.contentPlan.evidenceNeeds
  ];
  const pool = uniq([...seeds, ...fallback].map((item) => cleanSentence(item, 58))).slice(0, Math.max(count, 5));
  const labels = labelsByType(type);
  return Array.from({ length: count }, (_, index) => {
    const body = pool[index] || pool[index % Math.max(1, pool.length)] || "当前需要结合真实资料继续补齐判断依据。";
    return {
      type,
      title: labels[index] || `要点 ${index + 1}`,
      body,
      tag: index === 0 ? "核心" : index === count - 1 ? "收束" : "支撑",
      priority: index < 2 ? "must" : "should"
    };
  });
}

function confidenceNote(snippets: EvidenceSnippet[], input: SlideContentRealizerInput) {
  if (!snippets.length) return "当前缺少可直接引用的证据片段，建议补充真实数据后确认。";
  const reliable = snippets.filter((snippet) => snippet.reliability === "verified" || snippet.reliability === "traceable").length;
  if (reliable > 0) return `已有 ${reliable} 条可追溯资料进入本页，正式交付前仍建议复核原文。`;
  if ((input.slideEvidenceMap?.sourceConfidence || 0) < 60) return "当前依据上传或低置信资料做初步整理，关键判断仍需业务数据支撑。";
  return "当前资料可用于初稿表达，正式交付前建议补充来源口径。";
}

function sourceUseSummary(snippets: EvidenceSnippet[]) {
  if (!snippets.length) return "本页暂无可见证据片段，已降级为待补资料表达。";
  const sourceCount = uniq(snippets.map((snippet) => snippet.sourceId || "")).length;
  return `本页使用 ${snippets.length} 条资料片段，覆盖 ${sourceCount} 个来源。`;
}

function sectionsFromDraft(draft: SlideContentDraft, layoutPlan?: LayoutPlan): SlideSection[] {
  const layout = layoutPlan?.selectedLayout || "";
  const blocks = draft.visibleBlocks;
  const evidenceText = draft.evidenceSnippets[0]?.text || draft.confidenceNote;
  if (/timeline|process|roadmap|architecture/.test(layout)) {
    return [
      {
        type: "timeline",
        title: "推进路径",
        steps: blocks.slice(0, 5).map((block, index) => ({
          label: String(index + 1).padStart(2, "0"),
          title: block.title,
          body: block.body
        }))
      },
      { type: "source-note", text: evidenceText }
    ];
  }
  if (/metric|dashboard/.test(layout)) {
    return [
      {
        type: "stat-card",
        title: "关键指标",
        stats: blocks.slice(0, 4).map((block) => ({
          label: block.title,
          value: compact(block.body, 14),
          note: block.body
        }))
      },
      { type: "source-note", text: evidenceText }
    ];
  }
  if (/matrix|comparison|risk|table/.test(layout)) {
    return [
      {
        type: "table",
        title: "判断表",
        columns: ["维度", "内容", "说明"],
        rows: blocks.slice(0, 5).map((block) => [block.title, block.body, block.tag || ""])
      },
      { type: "source-note", text: evidenceText }
    ];
  }
  if (/summary|closing/.test(layout)) {
    return [
      {
        type: "tips-grid",
        title: "行动清单",
        items: blocks.slice(0, 4).map((block) => ({ title: block.title, body: block.body, tag: block.tag }))
      },
      { type: "callout", title: "建议动作", body: draft.actionText, accent: "blue" },
      { type: "source-note", text: evidenceText }
    ];
  }
  if (/quote/.test(layout)) {
    return [
      { type: "quote", text: draft.leadSentence, author: draft.role },
      { type: "tag-row", tags: blocks.slice(0, 4).map((block) => block.title) },
      { type: "source-note", text: evidenceText }
    ];
  }
  return [
    {
      type: "tips-grid",
      title: "页面要点",
      items: blocks.slice(0, 6).map((block) => ({ title: block.title, body: block.body, tag: block.tag }))
    },
    { type: "source-note", text: evidenceText }
  ];
}

export function createSlideContentDraft(input: SlideContentRealizerInput): SlideContentDraft {
  const page = input.slidePagePlan;
  const snippets = evidenceSnippets(input);
  const claim = cleanSentence(page.coreClaim, 86) || cleanSentence(page.mustProve || page.pagePurpose, 86);
  const finalTitle = sanitizeTitle(titleByType(page.pptType, page.role, claim, page.pageIndex - 1));
  const blocks = visibleBlocks(input);
  const actionText = roleIncludes(page.role, /行动|下一步|收束|合作|采购|验收/)
    ? cleanSentence(page.mustProve || input.contentPlan.decisionGoal, 70)
    : cleanSentence(input.contentPlan.decisionGoal || page.mustProve, 70);
  const confidence = confidenceNote(snippets, input);
  const draftBase: SlideContentDraft = {
    contentDraftId: `content-draft-${page.pageIndex}-${page.pagePlanId}`,
    planId: page.planId,
    pagePlanId: page.pagePlanId,
    layoutPlanId: input.layoutPlan?.layoutPlanId || "",
    slideIndex: page.pageIndex,
    pptType: page.pptType,
    role: page.role,
    finalTitle,
    subtitle: cleanSentence(page.pagePurpose || input.contentPlan.coreMessage, 74),
    leadSentence: claim,
    visibleBlocks: blocks,
    evidenceSnippets: snippets,
    actionText,
    speakerNotes: `内部讲解：${page.role}。策划依据保留在 SlidePagePlan，页面可见内容使用成稿层。`,
    sourceUseSummary: sourceUseSummary(snippets),
    confidenceNote: confidence,
    contentQualityChecks: {
      titleLengthOk: [...finalTitle].length <= 32,
      titleIsConclusion: !/^(本页|这一页|页面|必须|需要)/.test(finalTitle),
      visibleBlocksPresent: blocks.length > 0,
      scaffoldFree: true,
      evidenceRealized: snippets.length > 0,
      noInternalFields: true,
      lowConfidenceMarked: Boolean(confidence)
    },
    blockedScaffoldTerms: [],
    warnings: snippets.length ? [] : ["缺少可直接引用的证据片段，已使用低置信提示。"]
  };
  const validation = validateSlideContentDraft(draftBase);
  return {
    ...draftBase,
    blockedScaffoldTerms: validation.scaffoldMatches,
    warnings: uniq([...draftBase.warnings, ...validation.issues.filter((issue) => issue.severity === "warn").map((issue) => issue.message)]),
    contentQualityChecks: {
      ...draftBase.contentQualityChecks,
      scaffoldFree: validation.scaffoldMatches.length === 0,
      noInternalFields: !validation.issues.some((issue) => issue.id === "internal-field-leakage")
    },
    sections: sectionsFromDraft(draftBase, input.layoutPlan)
  };
}

export function slideLayoutFromDraft(layoutPlan?: LayoutPlan): SlideLayout {
  return slideLayoutForSelectedLayout(layoutPlan?.selectedLayout);
}
