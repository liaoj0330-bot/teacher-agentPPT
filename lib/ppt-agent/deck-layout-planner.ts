import type { ContentPlan } from "@/lib/ppt-agent/content-plan";
import {
  getCandidateLayoutsForVisualForm,
  layoutLibrary,
  pptTypeMatchesLayout,
  roleMatchesLayout
} from "@/lib/ppt-agent/layout-library";
import type { LayoutDefinition } from "@/lib/ppt-agent/layout-library";
import type { LayoutFamily, LayoutPlan } from "@/lib/ppt-agent/layout-plan";
import { materializeLayoutPlan, selectLayoutForSlidePagePlan } from "@/lib/ppt-agent/layout-selector";
import type { SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";

type DeckLayoutPlannerMode = "quick" | "professional";

export type DeckLayoutPlannerInput = {
  contentPlan: ContentPlan;
  slidePagePlans: SlidePagePlan[];
  themeHint?: string;
  mode?: DeckLayoutPlannerMode;
};

function countBy<T extends string>(values: T[]) {
  return values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map<T, number>());
}

function isProtectedRole(plan: LayoutPlan) {
  return /封面|开场|定调/.test(plan.role);
}

function compatibleAlternatives(contentPlan: ContentPlan, pagePlan: SlidePagePlan, forbiddenFamilies = new Set<LayoutFamily>(), forbiddenLayouts = new Set<string>()) {
  const roleText = `${pagePlan.role} ${pagePlan.pagePurpose} ${pagePlan.mustProve}`;
  const candidates = getCandidateLayoutsForVisualForm(pagePlan.recommendedVisualForm);
  const broadPool = candidates.length ? candidates : layoutLibrary;
  const scored = broadPool
    .filter((layout) => !forbiddenFamilies.has(layout.layoutFamily) && !forbiddenLayouts.has(layout.layoutId))
    .map((layout) => ({
      layout,
      score:
        (layout.supportedVisualForms.includes(pagePlan.recommendedVisualForm) ? 40 : 20) +
        (roleMatchesLayout(layout, roleText) ? 18 : 0) +
        (pptTypeMatchesLayout(layout, contentPlan.pptType) ? 10 : 0)
    }))
    .sort((a, b) => b.score - a.score);
  return scored.map((item) => item.layout);
}

function replaceWithAlternative(
  plans: LayoutPlan[],
  index: number,
  contentPlan: ContentPlan,
  slidePagePlans: SlidePagePlan[],
  forbiddenFamilies: Set<LayoutFamily>,
  forbiddenLayouts: Set<string>,
  reason: string
) {
  const pagePlan = slidePagePlans[index];
  if (!pagePlan) return plans;
  const alternative = compatibleAlternatives(contentPlan, pagePlan, forbiddenFamilies, forbiddenLayouts)[0];
  if (!alternative) return plans;
  const next = [...plans];
  next[index] = materializeLayoutPlan({
    contentPlan,
    slidePagePlan: pagePlan,
    layout: alternative,
    fallbackReason: reason,
    warnings: ["为控制整套页面重复度进行了版式调整。"]
  });
  return next;
}

function enforceSelectedLayoutDiversity(plans: LayoutPlan[], contentPlan: ContentPlan, slidePagePlans: SlidePagePlan[]) {
  if (plans.length < 4) return plans;
  let next = [...plans];
  const maxSameLayout = Math.max(2, Math.ceil(plans.length * 0.45));
  let selectedCounts = countBy(next.map((plan) => plan.selectedLayout));
  [...selectedCounts.entries()].forEach(([selectedLayout, count]) => {
    if (count <= maxSameLayout) return;
    const indexes = next
      .map((plan, index) => ({ plan, index }))
      .filter(({ plan }) => plan.selectedLayout === selectedLayout && !isProtectedRole(plan))
      .slice(0, count - maxSameLayout)
      .map((item) => item.index);
    indexes.forEach((index) => {
      next = replaceWithAlternative(
        next,
        index,
        contentPlan,
        slidePagePlans,
        new Set(),
        new Set([selectedLayout]),
        "为避免整套 PPT 版式重复，改用同表达形式下的相邻版式。"
      );
    });
  });
  return next;
}

function enforceFamilyDiversity(plans: LayoutPlan[], contentPlan: ContentPlan, slidePagePlans: SlidePagePlan[]) {
  if (plans.length < 5) return plans;
  let next = [...plans];
  const maxSameFamily = Math.ceil(plans.length * 0.6);
  let familyCounts = countBy(next.map((plan) => plan.layoutFamily));
  [...familyCounts.entries()].forEach(([family, count]) => {
    if (count <= maxSameFamily) return;
    const indexes = next
      .map((plan, index) => ({ plan, index }))
      .filter(({ plan }) => plan.layoutFamily === family && !isProtectedRole(plan))
      .slice(0, count - maxSameFamily)
      .map((item) => item.index);
    indexes.forEach((index) => {
      next = replaceWithAlternative(
        next,
        index,
        contentPlan,
        slidePagePlans,
        new Set([family]),
        new Set(),
        "为控制同一家族版式占比，选择更适合整套节奏的替代版式。"
      );
    });
  });
  return next;
}

function enforceConsecutiveVariety(plans: LayoutPlan[], contentPlan: ContentPlan, slidePagePlans: SlidePagePlan[]) {
  if (plans.length < 4) return plans;
  let next = [...plans];
  for (let index = 1; index < next.length; index += 1) {
    const prev = next[index - 1];
    const current = next[index];
    if (!prev || !current || prev.layoutFamily !== current.layoutFamily || isProtectedRole(current)) {
      continue;
    }
    next = replaceWithAlternative(
      next,
      index,
      contentPlan,
      slidePagePlans,
      new Set([current.layoutFamily]),
      new Set([current.selectedLayout]),
      "相邻页面版式家族重复，已切换为相邻可导出版式。"
    );
  }
  return next;
}

function ensureNoAllGeneric(plans: LayoutPlan[], contentPlan: ContentPlan, slidePagePlans: SlidePagePlan[]) {
  if (!plans.length) return plans;
  const allBulletOrCard = plans.every((plan) => plan.selectedLayout === "bullet_insight" || plan.selectedLayout === "card_grid");
  if (!allBulletOrCard) return plans;
  let next = [...plans];
  const replacements: LayoutDefinition[] = [
    layoutLibrary.find((layout) => layout.layoutId === "process_flow")!,
    layoutLibrary.find((layout) => layout.layoutId === "metric_dashboard")!,
    layoutLibrary.find((layout) => layout.layoutId === "comparison_table")!
  ];
  replacements.forEach((layout, offset) => {
    const index = Math.min(next.length - 1, offset + 1);
    const pagePlan = slidePagePlans[index];
    if (!pagePlan) return;
    next[index] = materializeLayoutPlan({
      contentPlan,
      slidePagePlan: pagePlan,
      layout,
      fallbackReason: "整套页面不能全部退回文字或卡片页，按页面角色补入结构化版式。",
      warnings: ["已防止通用版式过度集中。"]
    });
  });
  return next;
}

export function createDeckLayoutPlans(input: DeckLayoutPlannerInput): LayoutPlan[] {
  const { contentPlan, slidePagePlans } = input;
  let plans: LayoutPlan[] = [];
  slidePagePlans.forEach((slidePagePlan) => {
    plans.push(selectLayoutForSlidePagePlan({
      contentPlan,
      slidePagePlan,
      existingPlans: plans,
      themeHint: input.themeHint,
      mode: input.mode || "professional"
    }));
  });
  plans = enforceSelectedLayoutDiversity(plans, contentPlan, slidePagePlans);
  plans = enforceFamilyDiversity(plans, contentPlan, slidePagePlans);
  plans = enforceConsecutiveVariety(plans, contentPlan, slidePagePlans);
  plans = ensureNoAllGeneric(plans, contentPlan, slidePagePlans);
  return plans.map((plan, index) => ({ ...plan, pageIndex: slidePagePlans[index]?.pageIndex || index + 1 }));
}
