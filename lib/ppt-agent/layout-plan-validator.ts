import type { ContentPlan } from "@/lib/ppt-agent/content-plan";
import { createDeckLayoutPlans } from "@/lib/ppt-agent/deck-layout-planner";
import {
  getLayoutDefinition,
  pptTypeMatchesLayout,
  roleMatchesLayout
} from "@/lib/ppt-agent/layout-library";
import type { LayoutPlan } from "@/lib/ppt-agent/layout-plan";
import type { SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";
import { cleanText } from "@/lib/text-sanitize";

export type LayoutPlanValidationIssue = {
  id: string;
  field: string;
  message: string;
  blocking: boolean;
  layoutPlanId?: string;
  pagePlanId?: string;
  pageIndex?: number;
};

export type LayoutPlanValidationResult = {
  valid: boolean;
  score: number;
  issues: LayoutPlanValidationIssue[];
  blockingIssues: LayoutPlanValidationIssue[];
  suggestedFixes: string[];
};

const MOJIBAKE_PATTERN = /[\uFFFD]|[脙脗芒鈧撁ぢ掆€斆瀅]/;
const QUESTION_MARK_PLACEHOLDER_PATTERN = /\?{3,}/;
const INTERNAL_FIELD_PATTERN = /\b(day-route|hero-image|image-strip|tips-grid|stat-card|source-note|route-card|bar-chart|donut-chart|visualPrompt|pageIntent|evidenceBlockIds|sourceIds|debug|mock|placeholder|generated visual)\b/i;

function unique<T>(items: T[]) {
  return [...new Set(items.filter(Boolean))];
}

function push(
  issues: LayoutPlanValidationIssue[],
  plan: LayoutPlan | undefined,
  id: string,
  field: string,
  message: string,
  blocking = true
) {
  issues.push({
    id,
    field,
    message,
    blocking,
    layoutPlanId: plan?.layoutPlanId,
    pagePlanId: plan?.pagePlanId,
    pageIndex: plan?.pageIndex
  });
}

function readableText(plans: LayoutPlan[]) {
  return plans
    .flatMap((plan) => [
      plan.role,
      ...plan.contentSlots,
      ...plan.visualSlots,
      ...plan.hierarchyRules,
      ...plan.spacingRules,
      ...plan.typographyHints,
      ...plan.exportHints,
      ...plan.previewHints,
      plan.fallbackReason || "",
      ...plan.warnings
    ])
    .map((item) => cleanText(item))
    .join("\n");
}

function contentBlockCount(plan: LayoutPlan, pagePlan?: SlidePagePlan) {
  return pagePlan?.contentBlocks?.length || plan.contentSlots.length;
}

export function validateLayoutPlans(plans: LayoutPlan[], contentPlan?: ContentPlan, slidePagePlans: SlidePagePlan[] = []): LayoutPlanValidationResult {
  const issues: LayoutPlanValidationIssue[] = [];
  if (!Array.isArray(plans) || plans.length === 0) {
    push(issues, undefined, "empty-layout-plans", "layoutPlans", "缺少 LayoutPlan。");
  }

  if (slidePagePlans.length && plans.length !== slidePagePlans.length) {
    push(issues, undefined, "layout-plan-count-mismatch", "layoutPlans", "LayoutPlan 数量必须与 SlidePagePlan 一一对应。");
  }

  plans.forEach((plan) => {
    const layout = getLayoutDefinition(plan.selectedLayout);
    const pagePlan = slidePagePlans.find((item) => item.pagePlanId === plan.pagePlanId || item.pageIndex === plan.pageIndex);
    if (!plan.layoutPlanId) push(issues, plan, "missing-layout-plan-id", "layoutPlanId", "缺少 layoutPlanId。");
    if (!plan.pagePlanId) push(issues, plan, "missing-page-plan-id", "pagePlanId", "缺少 pagePlanId。");
    if (!plan.selectedLayout) push(issues, plan, "missing-selected-layout", "selectedLayout", "缺少 selectedLayout。");
    if (!layout) {
      push(issues, plan, "unknown-selected-layout", "selectedLayout", "selectedLayout 不存在于通用版式库。");
      return;
    }
    if (!layout.supportedVisualForms.includes(plan.recommendedVisualForm) && !plan.fallbackReason) {
      push(issues, plan, "visual-layout-mismatch", "selectedLayout", "selectedLayout 与 recommendedVisualForm 不匹配，且没有 fallbackReason。");
    }
    if (!roleMatchesLayout(layout, `${plan.role} ${pagePlan?.pagePurpose || ""} ${pagePlan?.mustProve || ""}`) && !plan.fallbackReason) {
      push(issues, plan, "role-layout-mismatch", "selectedLayout", "selectedLayout 与页面角色匹配度偏弱，且没有 fallbackReason。");
    }
    if (contentPlan && !pptTypeMatchesLayout(layout, contentPlan.pptType) && !plan.fallbackReason) {
      push(issues, plan, "type-layout-mismatch", "selectedLayout", "selectedLayout 与 PPT 类型匹配度偏弱，且没有 fallbackReason。", false);
    }
    if (!plan.layoutFamily) push(issues, plan, "missing-layout-family", "layoutFamily", "缺少 layoutFamily。");
    if (!plan.informationDensity) push(issues, plan, "missing-density", "informationDensity", "缺少 informationDensity。");
    if (!plan.contentSlots?.length) push(issues, plan, "missing-content-slots", "contentSlots", "contentSlots 不能为空。");
    if (!plan.visualSlots?.length) push(issues, plan, "missing-visual-slots", "visualSlots", "visualSlots 不能为空。");
    if (!plan.hierarchyRules?.length) push(issues, plan, "missing-hierarchy-rules", "hierarchyRules", "hierarchyRules 不能为空。");
    if (!plan.spacingRules?.length) push(issues, plan, "missing-spacing-rules", "spacingRules", "spacingRules 不能为空。");
    if (!plan.typographyHints?.length) push(issues, plan, "missing-typography-hints", "typographyHints", "typographyHints 不能为空。");
    if (!plan.exportHints?.length) push(issues, plan, "missing-export-hints", "exportHints", "exportHints 不能为空。");
    if (!plan.previewHints?.length) push(issues, plan, "missing-preview-hints", "previewHints", "previewHints 不能为空。");
    if (layout.exportCompatibility !== "editable-shapes") {
      push(issues, plan, "not-export-compatible", "selectedLayout", "该版式不能进入 PPTX 可编辑导出链路。");
    }
    if (plan.informationDensity === "low" && contentBlockCount(plan, pagePlan) > 5) {
      push(issues, plan, "density-content-conflict", "informationDensity", "低密度版式承载了过多内容块。", false);
    }
  });

  const text = readableText(plans);
  if (MOJIBAKE_PATTERN.test(text)) {
    push(issues, undefined, "mojibake", "layoutPlans", "LayoutPlan 可读说明中出现乱码。");
  }
  if (QUESTION_MARK_PLACEHOLDER_PATTERN.test(text)) {
    push(issues, undefined, "question-mark-placeholder", "layoutPlans", "LayoutPlan 可读说明中出现连续问号占位文本。");
  }
  if (INTERNAL_FIELD_PATTERN.test(text)) {
    push(issues, undefined, "internal-field", "layoutPlans", "LayoutPlan 可读说明中出现工程字段。");
  }

  const selectedLayouts = unique(plans.map((plan) => plan.selectedLayout));
  const families = unique(plans.map((plan) => plan.layoutFamily));
  if (plans.length >= 4 && selectedLayouts.length < Math.min(3, plans.length)) {
    push(issues, undefined, "selected-layout-too-uniform", "selectedLayout", "selectedLayout 过于单一。");
  }
  if (plans.length >= 4 && families.length < Math.min(3, plans.length)) {
    push(issues, undefined, "layout-family-too-uniform", "layoutFamily", "layoutFamily 过于单一。");
  }
  if (plans.length >= 4 && plans.every((plan) => plan.selectedLayout === "bullet_insight")) {
    push(issues, undefined, "all-bullet-layout", "selectedLayout", "所有页面都退回 bullet_insight。");
  }
  if (plans.length >= 4 && plans.every((plan) => plan.selectedLayout === "card_grid")) {
    push(issues, undefined, "all-card-layout", "selectedLayout", "所有页面都退回 card_grid。");
  }
  const maxFamilyShare = plans.length ? Math.max(...[...countFamilies(plans).values()]) / plans.length : 0;
  if (plans.length >= 6 && maxFamilyShare > 0.6) {
    push(issues, undefined, "layout-family-dominates", "layoutFamily", "同一 layoutFamily 超过整套 PPT 的 60%。");
  }

  const blockingIssues = issues.filter((issue) => issue.blocking);
  const score = Math.max(0, Math.min(100, 100 - blockingIssues.length * 12 - (issues.length - blockingIssues.length) * 4));
  return {
    valid: blockingIssues.length === 0 && score >= 84,
    score,
    issues,
    blockingIssues,
    suggestedFixes: issues.map((issue) => {
      if (issue.id.includes("uniform") || issue.id.includes("dominates")) return "按页面角色穿插流程、指标、矩阵、对比、案例和收束版式。";
      if (issue.id === "visual-layout-mismatch") return "按 recommendedVisualForm 重新选择匹配版式，或写明 fallbackReason。";
      if (issue.id === "unknown-selected-layout") return "从 layout-library 中选择存在且可导出的版式。";
      if (issue.id === "density-content-conflict") return "合并内容块或切换为中/高密度版式。";
      return `补齐 ${issue.field}。`;
    })
  };
}

function countFamilies(plans: LayoutPlan[]) {
  return plans.reduce((map, plan) => map.set(plan.layoutFamily, (map.get(plan.layoutFamily) || 0) + 1), new Map<LayoutPlan["layoutFamily"], number>());
}

export function repairLayoutPlans(plans: LayoutPlan[], contentPlan: ContentPlan, slidePagePlans: SlidePagePlan[]): LayoutPlan[] {
  const validation = validateLayoutPlans(plans, contentPlan, slidePagePlans);
  if (validation.valid) {
    return plans;
  }
  return createDeckLayoutPlans({ contentPlan, slidePagePlans });
}
