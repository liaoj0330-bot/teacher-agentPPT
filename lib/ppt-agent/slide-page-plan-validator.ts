import type { ContentPlan } from "@/lib/ppt-agent/content-plan";
import { recommendedVisualForms, type RecommendedVisualForm, type SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";
import { cleanText } from "@/lib/text-sanitize";

export type SlidePagePlanValidationIssue = {
  id: string;
  field: string;
  message: string;
  blocking: boolean;
  pagePlanId?: string;
  pageIndex?: number;
};

export type SlidePagePlanValidationResult = {
  valid: boolean;
  score: number;
  issues: SlidePagePlanValidationIssue[];
  blockingIssues: SlidePagePlanValidationIssue[];
  suggestedFixes: string[];
};

const MOJIBAKE_PATTERN = /[\uFFFD]|[脙脗芒鈧撁ぢ掆€斆瀅]/;
const INTERNAL_FIELD_PATTERN = /\b(day-route|hero-image|image-strip|tips-grid|stat-card|source-note|route-card|bar-chart|donut-chart|visualPrompt|pageIntent|evidenceBlockIds|sourceIds|debug|mock|placeholder|generated visual)\b/i;
const UNIVERSAL_TEMPLATE_PATTERN = /背景[、，,]\s*意义[、，,]\s*方案[、，,]\s*总结|背景意义方案总结/;
const GENERIC_WEAK_PATTERN = /^(核心功能|建设背景|产品功能|方案介绍|项目背景|总结|目录|核心优势|实施方案|页面策划)$/;

function unique<T>(items: T[]) {
  return [...new Set(items.filter(Boolean))];
}

function hasValue(value: unknown) {
  return typeof value === "string" ? cleanText(value).length >= 2 : Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function visiblePlanText(plans: SlidePagePlan[]) {
  return plans
    .flatMap((plan) => [
      plan.role,
      plan.audienceQuestion,
      plan.coreClaim,
      plan.pagePurpose,
      plan.mustProve,
      ...plan.evidenceNeed,
      ...plan.contentBlocks.flatMap((block) => [block.title, block.body, block.evidenceNeed || ""]),
      plan.informationHierarchy.primary,
      ...plan.informationHierarchy.secondary,
      ...plan.informationHierarchy.tertiary,
      plan.layoutIntent,
      plan.writingStyle,
      ...plan.avoidPatterns,
      ...plan.qualityChecks,
      ...plan.generationWarnings
    ])
    .map((item) => cleanText(item))
    .join("\n");
}

function positiveStructureText(plans: SlidePagePlan[]) {
  return plans
    .flatMap((plan) => [
      plan.audienceQuestion,
      plan.coreClaim,
      plan.pagePurpose,
      plan.mustProve,
      ...plan.contentBlocks.flatMap((block) => [block.title, block.body]),
      plan.informationHierarchy.primary,
      ...plan.informationHierarchy.secondary,
      plan.layoutIntent,
      plan.writingStyle
    ])
    .map((item) => cleanText(item))
    .join("\n");
}

function isOpinionClaim(value: string) {
  const clean = cleanText(value);
  if ([...clean].length < 10) return false;
  if (GENERIC_WEAK_PATTERN.test(clean)) return false;
  return /必须|需要|应当|应该|能够|可以|通过|帮助|证明|说明|让|降低|提升|形成|支撑|转成|转化|确保|避免|不能|才会/.test(clean);
}

function push(
  issues: SlidePagePlanValidationIssue[],
  plan: SlidePagePlan | undefined,
  id: string,
  field: string,
  message: string,
  blocking = true
) {
  issues.push({ id, field, message, blocking, pagePlanId: plan?.pagePlanId, pageIndex: plan?.pageIndex });
}

function visualFormMatchesRole(form: RecommendedVisualForm, roleText: string) {
  const text = cleanText(roleText);
  if (/风险|备选|差异|对比|差距/.test(text)) return form === "risk_table" || form === "comparison_table" || form === "matrix";
  if (/路线|交通|出行|行程/.test(text)) return form === "map_route" || form === "timeline" || form === "card_grid";
  if (/阶段|计划|周期|路径|里程碑/.test(text)) return form === "timeline" || form === "roadmap" || form === "process_flow";
  if (/指标|财报|预算|资金|成效|验收|目标/.test(text)) return form === "metric_dashboard" || form === "comparison_table" || form === "matrix";
  if (/架构|系统|蓝图|能力|模块/.test(text)) return form === "architecture_diagram" || form === "process_flow" || form === "matrix";
  return recommendedVisualForms.includes(form);
}

export function validateSlidePagePlans(plans: SlidePagePlan[], contentPlan?: ContentPlan): SlidePagePlanValidationResult {
  const issues: SlidePagePlanValidationIssue[] = [];
  if (!Array.isArray(plans) || plans.length === 0) {
    push(issues, undefined, "empty-page-plans", "slidePagePlans", "缺少 SlidePagePlan。");
  }

  if (contentPlan?.slidePlan?.length && plans.length !== contentPlan.slidePlan.length) {
    push(issues, undefined, "page-plan-count-mismatch", "slidePagePlans", "SlidePagePlan 数量必须与 ContentPlan.slidePlan 一一对应。");
  }

  plans.forEach((plan) => {
    if (!hasValue(plan.audienceQuestion)) push(issues, plan, "missing-audience-question", "audienceQuestion", "缺少受众问题。");
    if (!hasValue(plan.coreClaim)) push(issues, plan, "missing-core-claim", "coreClaim", "缺少核心观点。");
    if (hasValue(plan.coreClaim) && !isOpinionClaim(plan.coreClaim)) {
      push(issues, plan, "weak-core-claim", "coreClaim", "coreClaim 不是观点句，像普通名词标题。");
    }
    if (!hasValue(plan.pagePurpose)) push(issues, plan, "missing-page-purpose", "pagePurpose", "缺少页面作用。");
    if (!hasValue(plan.mustProve)) push(issues, plan, "missing-must-prove", "mustProve", "缺少证明任务。");
    if (!plan.evidenceNeed?.length) push(issues, plan, "missing-evidence-need", "evidenceNeed", "缺少证据需求。");
    if (!plan.informationHierarchy?.primary || !plan.informationHierarchy?.secondary?.length) {
      push(issues, plan, "missing-information-hierarchy", "informationHierarchy", "缺少信息层级。");
    }
    if (!plan.recommendedVisualForm || !recommendedVisualForms.includes(plan.recommendedVisualForm)) {
      push(issues, plan, "invalid-visual-form", "recommendedVisualForm", "recommendedVisualForm 不在允许范围内。");
    } else if (!visualFormMatchesRole(plan.recommendedVisualForm, `${plan.role} ${plan.pagePurpose} ${plan.mustProve}`)) {
      push(issues, plan, "visual-form-role-mismatch", "recommendedVisualForm", "推荐视觉形式与页面角色匹配度偏弱。", false);
    }
    if (!plan.qualityChecks?.length) push(issues, plan, "missing-quality-checks", "qualityChecks", "缺少页面质量检查项。");
    if (!plan.avoidPatterns?.length) push(issues, plan, "missing-avoid-patterns", "avoidPatterns", "缺少页面避坑要求。");
    if (!plan.contentBlocks?.length) push(issues, plan, "missing-content-blocks", "contentBlocks", "缺少内容块。");
  });

  const text = visiblePlanText(plans);
  const structureText = positiveStructureText(plans);
  if (MOJIBAKE_PATTERN.test(text)) {
    push(issues, undefined, "mojibake", "slidePagePlans", "SlidePagePlan 出现乱码。");
  }
  if (INTERNAL_FIELD_PATTERN.test(text)) {
    push(issues, undefined, "internal-field", "slidePagePlans", "SlidePagePlan 出现工程字段。");
  }
  if (UNIVERSAL_TEMPLATE_PATTERN.test(structureText)) {
    push(issues, undefined, "universal-template", "slidePagePlans", "SlidePagePlan 出现万能模板表达。");
  }

  const visualForms = unique(plans.map((plan) => plan.recommendedVisualForm));
  if (plans.length >= 4 && visualForms.length < 3) {
    push(issues, undefined, "visual-form-too-uniform", "recommendedVisualForm", "页面推荐视觉形式过于单一。");
  }

  const weakClaims = plans.filter((plan) => !isOpinionClaim(plan.coreClaim));
  if (plans.length > 0 && weakClaims.length === plans.length) {
    push(issues, undefined, "all-claims-weak", "coreClaim", "所有页面 coreClaim 都像名词式标题。");
  }

  const blockingIssues = issues.filter((issue) => issue.blocking);
  const score = Math.max(0, Math.min(100, 100 - blockingIssues.length * 12 - (issues.length - blockingIssues.length) * 4));
  return {
    valid: blockingIssues.length === 0 && score >= 84,
    score,
    issues,
    blockingIssues,
    suggestedFixes: issues.map((issue) => {
      if (issue.id === "weak-core-claim") return "把 coreClaim 改为“必须/需要/能够/通过...”开头的观点句。";
      if (issue.id === "visual-form-too-uniform") return "按页面角色穿插流程图、指标看板、矩阵、风险表、案例卡等表达形式。";
      if (issue.id === "internal-field") return "删除 mock/debug/section 类型名等工程字段。";
      if (issue.id === "page-plan-count-mismatch") return "重新基于 ContentPlan.slidePlan 逐页生成 SlidePagePlan。";
      return `补齐 ${issue.field}。`;
    })
  };
}

export function repairSlidePagePlans(plans: SlidePagePlan[], contentPlan: ContentPlan): SlidePagePlan[] {
  const fallbackForms: RecommendedVisualForm[] = [
    "quote_highlight",
    "comparison_table",
    "process_flow",
    "timeline",
    "metric_dashboard",
    "matrix",
    "risk_table",
    "roadmap",
    "case_card"
  ];
  const byContentSlideId = new Map(plans.map((plan) => [plan.contentPlanSlideId || `${plan.pageIndex}`, plan]));
  return contentPlan.slidePlan.map((slide, index) => {
    const existing = byContentSlideId.get(slide.id) || plans[index];
    const form = existing?.recommendedVisualForm && recommendedVisualForms.includes(existing.recommendedVisualForm)
      ? existing.recommendedVisualForm
      : fallbackForms[index % fallbackForms.length];
    const coreClaim = isOpinionClaim(existing?.coreClaim || "")
      ? existing!.coreClaim
      : `${slide.titleIntent}必须证明「${slide.mustProve}」，否则${contentPlan.audience}无法形成${contentPlan.decisionGoal}的判断。`;
    const evidenceNeed = unique([...(existing?.evidenceNeed || []), ...slide.suggestedEvidence, ...contentPlan.evidenceNeeds.slice(0, 2)]).slice(0, 6);
    return {
      pagePlanId: existing?.pagePlanId || `${contentPlan.planId}-page-${index + 1}`,
      planId: contentPlan.planId,
      contentPlanSlideId: slide.id,
      pptType: contentPlan.pptType,
      role: cleanText(existing?.role, slide.role || "页面论证"),
      pageIndex: index + 1,
      audienceQuestion: cleanText(existing?.audienceQuestion, `${contentPlan.audience}会问：${slide.titleIntent}为什么重要、依据是什么、下一步怎么做？`),
      coreClaim,
      pagePurpose: cleanText(existing?.pagePurpose, slide.pagePurpose),
      mustProve: cleanText(existing?.mustProve, slide.mustProve),
      evidenceNeed,
      contentBlocks: existing?.contentBlocks?.length
        ? existing.contentBlocks
        : [
            { type: "claim", title: "核心观点", body: coreClaim, priority: "must" },
            { type: "evidence", title: "证据安排", body: `用${evidenceNeed.slice(0, 2).join("、") || "可核验资料"}支撑本页判断。`, priority: "must" },
            { type: "action", title: "行动落点", body: "把页面结论转成可判断、可执行或可复盘的动作。", priority: "should" }
          ],
      informationHierarchy: existing?.informationHierarchy?.primary
        ? existing.informationHierarchy
        : { primary: coreClaim, secondary: [slide.mustProve, ...evidenceNeed.slice(0, 2)], tertiary: slide.avoid.slice(0, 2) },
      recommendedVisualForm: form,
      layoutIntent: cleanText(existing?.layoutIntent, `使用 ${form} 承载本页证明任务，避免退化成普通文字页。`),
      writingStyle: cleanText(existing?.writingStyle, "结论前置、证据支撑、行动清楚。"),
      avoidPatterns: unique([...(existing?.avoidPatterns || []), ...slide.avoid, "空泛口号", "无证据判断"]).slice(0, 8),
      qualityChecks: unique([...(existing?.qualityChecks || []), `必须证明：${slide.mustProve}`, "标题必须是观点句", "证据不足时标记待补资料"]).slice(0, 7),
      generationWarnings: unique([...(existing?.generationWarnings || []), "不编造来源。", "保留可编辑结构。"]).slice(0, 5)
    };
  });
}
