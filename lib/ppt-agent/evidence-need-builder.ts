import type { ContentPlan, ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";
import type { SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";
import type { EvidenceBlockType, EvidenceNeed } from "@/lib/ppt-agent/evidence-types";
import { cleanText } from "@/lib/text-sanitize";

const expectedTypesByPptType: Record<ContentPlanPPTType, EvidenceBlockType[]> = {
  project_report: ["policy", "fact", "timeline", "metric", "risk"],
  product_intro: ["feature", "fact", "quote", "metric"],
  business_plan: ["data", "metric", "fact", "risk"],
  financial_report: ["data", "metric", "fact"],
  courseware: ["fact", "quote", "general_context"],
  travel_plan: ["timeline", "data", "risk", "fact"],
  company_profile: ["fact", "metric", "quote"],
  proposal: ["feature", "fact", "metric", "risk", "timeline"],
  research_report: ["fact", "data", "quote", "risk"],
  activity_plan: ["timeline", "data", "risk", "fact"],
  policy_interpretation: ["policy", "fact", "timeline", "risk"],
  general: ["fact", "general_context", "data"]
};

function uniq<T>(items: T[]) {
  return [...new Set(items.filter(Boolean))];
}

function expectedTypesFor(plan: SlidePagePlan, contentPlan: ContentPlan): EvidenceBlockType[] {
  const text = cleanText(`${plan.role} ${plan.coreClaim} ${plan.mustProve} ${(plan.evidenceNeed || []).join(" ")}`);
  const types = [...(expectedTypesByPptType[contentPlan.pptType] || expectedTypesByPptType.general)];
  if (/政策|依据|标准|文件/.test(text)) types.unshift("policy");
  if (/指标|数据|预算|金额|收入|利润|增长|验收/.test(text)) types.unshift("metric", "data");
  if (/功能|模块|能力|架构|部署|产品/.test(text)) types.unshift("feature");
  if (/阶段|计划|路线|日程|下一步|推进/.test(text)) types.unshift("timeline");
  if (/风险|备选|注意|预案/.test(text)) types.unshift("risk");
  return uniq(types).slice(0, 5);
}

function needTextFor(plan: SlidePagePlan, contentPlan: ContentPlan) {
  return uniq([
    ...(plan.evidenceNeed || []),
    ...(plan.contentBlocks || []).map((block) => block.evidenceNeed || ""),
    plan.mustProve,
    contentPlan.evidenceNeeds[0] || ""
  ]).filter((item) => cleanText(item).length >= 2);
}

function isRequired(plan: SlidePagePlan, contentPlan: ContentPlan) {
  const text = cleanText(`${contentPlan.pptType} ${plan.role} ${plan.mustProve} ${(plan.evidenceNeed || []).join(" ")}`);
  if (["project_report", "financial_report", "policy_interpretation", "proposal", "business_plan"].includes(contentPlan.pptType)) return true;
  return /数据|政策|财务|验收|风险|预算|指标|路线|功能|客户/.test(text);
}

export function buildEvidenceNeeds(contentPlan: ContentPlan, slidePagePlans: SlidePagePlan[]): EvidenceNeed[] {
  return slidePagePlans.flatMap((plan, index) => {
    const needTexts = needTextFor(plan, contentPlan);
    const texts = needTexts.length ? needTexts : [plan.mustProve || plan.coreClaim || plan.role];
    const expectedEvidenceTypes = expectedTypesFor(plan, contentPlan);
    return texts.slice(0, 4).map((text, needIndex): EvidenceNeed => ({
      needId: `need-${index + 1}-${needIndex + 1}`,
      pagePlanId: plan.pagePlanId,
      role: cleanText(plan.role, `第 ${index + 1} 页`),
      mustProve: cleanText(plan.mustProve || plan.coreClaim),
      evidenceNeedText: cleanText(text),
      expectedEvidenceTypes,
      priority: needIndex === 0 ? "high" : needIndex === 1 ? "medium" : "low",
      required: needIndex === 0 || isRequired(plan, contentPlan)
    }));
  });
}
