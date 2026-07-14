import type { ContentPlan, ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";
import type { EvidenceNeed } from "@/lib/ppt-agent/evidence-types";
import type { SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";
import { cleanText } from "@/lib/text-sanitize";

export type PlannedSearchQuery = {
  query: string;
  priority: "high" | "medium" | "low";
  queryReason: string;
  expectedEvidenceTypes: string[];
  evidenceNeedIds: string[];
  pagePlanId?: string;
  role?: string;
};

export type SearchQueryPlan = {
  deckQueries: PlannedSearchQuery[];
  slideQueries: PlannedSearchQuery[];
  priority: "high" | "medium" | "low";
  queryReason: string;
  expectedEvidenceTypes: string[];
};

type PlannerInput = {
  contentPlan: ContentPlan;
  slidePagePlans: SlidePagePlan[];
  evidenceNeeds: EvidenceNeed[];
  userPrompt: string;
  maxQueries?: number;
};

const typeTerms: Record<ContentPlanPPTType, string[]> = {
  project_report: ["政策依据", "建设背景", "实施方案", "验收标准", "责任分工"],
  product_intro: ["官网", "产品文档", "功能介绍", "部署文档", "客户案例"],
  business_plan: ["市场规模", "行业报告", "竞品分析", "商业模式", "融资计划"],
  financial_report: ["财务指标", "季度报告", "年度报告", "公告", "风险因素"],
  courseware: ["概念解释", "教程", "案例", "学习目标", "练习题"],
  travel_plan: ["官方预约", "开放时间", "交通", "预算", "风险提醒"],
  company_profile: ["官网", "企业资质", "客户案例", "业绩数据", "新闻报道"],
  proposal: ["客户行业", "痛点", "解决方案", "价值证明", "实施周期"],
  research_report: ["研究报告", "公开数据", "行业趋势", "案例", "风险机会"],
  activity_plan: ["活动流程", "场地信息", "预算", "传播节奏", "风险预案"],
  policy_interpretation: ["政策原文", "主管部门", "实施细则", "政策解读", "落实要求"],
  general: ["背景资料", "公开资料", "数据", "案例", "行动建议"]
};

function uniq<T>(items: T[]) {
  return [...new Set(items.filter(Boolean))];
}

function compactQuery(value: string) {
  return cleanText(value)
    .replace(/[，。！？；;、|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 86);
}

function topicFromPrompt(prompt: string, plan: ContentPlan) {
  const stripped = cleanText(prompt)
    .replace(/^帮我(做|生成|制作)?一份?/, "")
    .replace(/PPTX?/gi, "")
    .replace(/幻灯片/g, "")
    .replace(/[，。；;].*$/g, "")
    .trim();
  return compactQuery(stripped || plan.userIntent || plan.coreMessage || plan.pptType).slice(0, 42);
}

function queryForDeck(topic: string, plan: ContentPlan, term: string) {
  const official = ["project_report", "policy_interpretation", "travel_plan", "financial_report", "company_profile"].includes(plan.pptType)
    ? " 官方"
    : "";
  return compactQuery(`${topic} ${term}${official}`);
}

function gapScore(need: EvidenceNeed, plan: SlidePagePlan) {
  const text = cleanText(`${need.evidenceNeedText} ${need.mustProve} ${plan.role} ${plan.coreClaim}`);
  const highRisk = /政策|财务|验收|指标|预算|开放|预约|责任|风险|客户|案例|数据|公告|年报|季报/.test(text) ? 20 : 0;
  const priority = need.priority === "high" ? 22 : need.priority === "medium" ? 12 : 4;
  const required = need.required ? 16 : 0;
  return highRisk + priority + required + Math.min(18, [...text].length / 10);
}

function queryForNeed(topic: string, plan: ContentPlan, page: SlidePagePlan, need: EvidenceNeed) {
  const terms = typeTerms[plan.pptType] || typeTerms.general;
  const needText = compactQuery(need.evidenceNeedText || need.mustProve);
  const role = compactQuery(page.role || page.mustProve).slice(0, 16);
  const matchedTypeTerm = need.expectedEvidenceTypes.includes("policy")
    ? "政策 原文 官方"
    : need.expectedEvidenceTypes.includes("metric") || need.expectedEvidenceTypes.includes("data")
      ? "数据 指标 来源"
      : need.expectedEvidenceTypes.includes("feature")
        ? "产品 文档 功能"
        : need.expectedEvidenceTypes.includes("timeline")
          ? "时间 路线 计划"
          : need.expectedEvidenceTypes.includes("risk")
            ? "风险 注意事项"
            : terms[0];
  return compactQuery(`${topic} ${role} ${needText} ${matchedTypeTerm}`);
}

export function createSearchQueryPlan(input: PlannerInput): SearchQueryPlan {
  const maxQueries = Math.max(2, Math.min(10, input.maxQueries || 6));
  const topic = topicFromPrompt(input.userPrompt, input.contentPlan);
  const terms = typeTerms[input.contentPlan.pptType] || typeTerms.general;
  const deckQueries = uniq(terms.slice(0, 3).map((term) => queryForDeck(topic, input.contentPlan, term)))
    .slice(0, 3)
    .map((query, index): PlannedSearchQuery => ({
      query,
      priority: index === 0 ? "high" : "medium",
      queryReason: `${input.contentPlan.pptType} 需要先补齐 ${terms[index]} 类公开来源。`,
      expectedEvidenceTypes: terms.slice(index, index + 2),
      evidenceNeedIds: []
    }));

  const pagesById = new Map(input.slidePagePlans.map((plan) => [plan.pagePlanId, plan]));
  const slideQueries = input.evidenceNeeds
    .map((need) => {
      const page = pagesById.get(need.pagePlanId) || input.slidePagePlans[0];
      return {
        need,
        page,
        score: page ? gapScore(need, page) : 0
      };
    })
    .filter((item) => item.page)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, maxQueries - deckQueries.length))
    .map(({ need, page, score }): PlannedSearchQuery => ({
      query: queryForNeed(topic, input.contentPlan, page, need),
      priority: score >= 48 ? "high" : score >= 32 ? "medium" : "low",
      queryReason: `优先补「${page.role}」页的证据缺口：${need.evidenceNeedText}`,
      expectedEvidenceTypes: need.expectedEvidenceTypes,
      evidenceNeedIds: [need.needId],
      pagePlanId: page.pagePlanId,
      role: page.role
    }));

  const all = [...deckQueries, ...slideQueries];
  return {
    deckQueries,
    slideQueries,
    priority: all.some((item) => item.priority === "high") ? "high" : all.some((item) => item.priority === "medium") ? "medium" : "low",
    queryReason: `根据 ${input.contentPlan.pptType} 的证据需求，优先检索 ${terms.slice(0, 4).join("、")}。`,
    expectedEvidenceTypes: uniq(all.flatMap((item) => item.expectedEvidenceTypes)).slice(0, 8)
  };
}
