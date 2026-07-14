import type { UploadedAsset } from "@/lib/canvas-data";
import type { ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";
import type { PPTType } from "@/lib/ppt-review-rulebase";
import { pptTypeRuleSeeds } from "@/lib/ppt-review-rulebase";
import { cleanText } from "@/lib/text-sanitize";

type TypeContract = {
  reviewType: PPTType;
  planType: ContentPlanPPTType;
  positive: Array<[RegExp, number]>;
  negative?: Array<[RegExp, number]>;
  priority?: number;
};

export type PPTTypeDetection = {
  reviewType: PPTType;
  planType: ContentPlanPPTType;
  confidence: number;
  audience: string;
  goal: string;
  scores: Record<PPTType, number>;
  reasons: string[];
};

const contracts: TypeContract[] = [
  {
    reviewType: "project_report",
    planType: "project_report",
    priority: 8,
    positive: [
      [/项目汇报|项目申报|项目验收|建设项目|平台项目|项目推进|项目建设|立项汇报|验收汇报|项目方案/, 88],
      [/高校|产教融合|实训|教务|就业|校企协同|政务|主管部门/, 34],
      [/落地|验收|实施|可执行|推进计划|责任分工|成效指标|评价口径|下一步动作|决策事项/, 38],
      [/平台/, 16]
    ],
    negative: [[/产品介绍|产品方案|解决方案|客户采购|试点采购|SaaS|API|MCP|RAG|知识库/, 42]]
  },
  {
    reviewType: "company_profile",
    planType: "company_profile",
    priority: 2,
    positive: [
      [/企业介绍|公司介绍|企业宣传|企业概况|发展历程|核心业务|资质|荣誉|客户案例/, 78],
      [/业务能力|市场布局|服务网络|合作客户|资质认证/, 22]
    ]
  },
  {
    reviewType: "product_proposal",
    planType: "product_intro",
    priority: 4,
    positive: [
      [/产品介绍|产品定位|产品蓝图|核心能力|产品能力|功能介绍|部署方式|采购判断/, 82],
      [/RAG|知识库|工作流|Agent|MCP|API|SaaS|工具调用|模型供应商|可观测|部署集成/, 42],
      [/客户|采购|试点|部署|安全|权限|集成/, 24]
    ],
    negative: [[/项目汇报|项目验收|责任分工|验收标准|推进计划/, 35]]
  },
  {
    reviewType: "product_proposal",
    planType: "proposal",
    priority: 6,
    positive: [
      [/合作方案|销售提案|服务方案|客户痛点|服务内容|交付成果|报价逻辑|合作动作|采购方|甲方|实施周期/, 92],
      [/报价|交付|验收|试点|资源投入|合作路径/, 32]
    ],
    negative: [[/产品介绍|产品定位|产品蓝图|核心能力/, 24]]
  },
  {
    reviewType: "business_bp",
    planType: "business_plan",
    priority: 5,
    positive: [
      [/商业BP|商业 BP|BP|路演|融资|投资人|商业计划|股权|估值|资金用途/, 88],
      [/市场规模|商业模式|增长路径|竞争壁垒|团队能力/, 34]
    ]
  },
  {
    reviewType: "financial_analysis",
    planType: "financial_report",
    priority: 6,
    positive: [
      [/财报|季报|年报|季度报告|年度报告|收入|营收|利润|毛利|同比|环比|现金流|资产负债|财务分析/, 86],
      [/核心指标|收入结构|利润变化|费用|风险因素|管理建议/, 28]
    ]
  },
  {
    reviewType: "courseware",
    planType: "courseware",
    priority: 3,
    positive: [
      [/课程|课件|教学|培训|学生|学员|学习目标|练习|教案|课堂|知识点|课后任务/, 82],
      [/案例演示|课堂练习|知识框架|教学目标/, 24]
    ]
  },
  {
    reviewType: "policy_report",
    planType: "policy_interpretation",
    priority: 5,
    positive: [
      [/政策汇报|政策解读|贯彻落实|主管部门文件|政策依据|政策原文|落实方案/, 84],
      [/政策|政务|主管部门|贯彻|落实|文件|指示|条款/, 28]
    ],
    negative: [[/项目汇报|项目建设|验收标准|平台项目/, 30]]
  },
  {
    reviewType: "event_plan",
    planType: "activity_plan",
    priority: 4,
    positive: [
      [/活动策划|活动方案|发布会|会务|嘉宾|赞助|传播节奏|主办方|执行团队|新品发布会/, 88],
      [/活动|策划|流程|物料|预算|场地|传播|复盘/, 30]
    ]
  },
  {
    reviewType: "travel_guide",
    planType: "travel_plan",
    priority: 7,
    positive: [
      [/旅游|旅行|攻略|一日游|二日游|三日游|四日游|五日游|路线|景点|预约|交通|避坑|自由行|游玩|行程/, 88],
      [/预算|餐饮|住宿|门票|开放时间|天气|备选方案/, 24]
    ]
  },
  {
    reviewType: "general_report",
    planType: "research_report",
    priority: 3,
    positive: [
      [/研究报告|行业报告|趋势研究|调研报告|白皮书|市场研究|行业趋势|关键发现/, 76],
      [/数据来源|研究问题|趋势判断|机会风险|管理建议/, 26]
    ]
  }
];

function baseScores(): Record<PPTType, number> {
  return {
    project_report: 0,
    company_profile: 0,
    product_proposal: 0,
    business_bp: 0,
    financial_analysis: 0,
    courseware: 0,
    policy_report: 0,
    event_plan: 0,
    travel_guide: 0,
    general_report: 8
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function sourceText(prompt: string, uploadedAssets: UploadedAsset[] = []) {
  return cleanText(`${prompt}\n${uploadedAssets.map((asset) => `${asset.name} ${asset.analysis?.summary || ""} ${asset.analysis?.outlineSuggestions?.join(" ") || ""}`).join("\n")}`);
}

export function detectPPTTypeContract(prompt: string, uploadedAssets: UploadedAsset[] = []): PPTTypeDetection {
  const clean = sourceText(prompt, uploadedAssets);
  const hasProjectAnchor = /项目|平台|建设|立项|申报|验收|产教融合|系统架构|三端功能/.test(clean);
  const reviewScores = baseScores();
  const planScores = new Map<ContentPlanPPTType, number>();
  const reasons: string[] = [];

  contracts.forEach((contract) => {
    let contractScore = contract.priority || 0;
    contract.positive.forEach(([pattern, amount]) => {
      if (pattern.test(clean)) {
        contractScore += amount;
        reasons.push(`${contract.reviewType}:${pattern.source}`);
      }
    });
    contract.negative?.forEach(([pattern, amount]) => {
      if (pattern.test(clean)) {
        contractScore -= amount;
      }
    });
    if (contractScore > (contract.priority || 0)) {
      reviewScores[contract.reviewType] += contractScore;
      planScores.set(contract.planType, (planScores.get(contract.planType) || 0) + contractScore);
    }
  });

  if (hasProjectAnchor && /汇报|领导|评审|决策|下一步/.test(clean)) reviewScores.project_report += 14;
  if (/面向高校领导|高校领导|校领导|院领导/.test(clean)) reviewScores.project_report += 18;
  if (/产品/.test(clean) && /客户|采购|部署|试点|方案/.test(clean)) reviewScores.product_proposal += 18;
  if (hasProjectAnchor && /项目|建设|推进/.test(clean) && /验收|责任|计划|落地/.test(clean)) reviewScores.project_report += 28;
  if (/政策|政务/.test(clean) && /项目|平台|建设|汇报|可落地|验收/.test(clean)) {
    reviewScores.project_report += 26;
    reviewScores.policy_report -= 12;
  }
  if (/政策汇报|政策解读|贯彻落实|主管部门文件|政策原文/.test(clean) && !hasProjectAnchor) {
    reviewScores.policy_report += 40;
    reviewScores.project_report -= 36;
  }

  const sorted = (Object.entries(reviewScores) as Array<[PPTType, number]>).sort((a, b) => b[1] - a[1]);
  const reviewType = sorted[0]?.[0] || "general_report";
  const contractPlanType = [...planScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const planType = contractPlanType || contracts.find((contract) => contract.reviewType === reviewType)?.planType || "general";
  const confidence = clamp(58 + (sorted[0]?.[1] || 0) - (sorted[1]?.[1] || 0) * 0.35, 52, 96);
  const seed = pptTypeRuleSeeds[reviewType];
  const audience =
    clean.match(/面向([^，。；;\n]+)/)?.[1]?.trim() ||
    seed.audienceHints.find((hint) => clean.includes(hint)) ||
    seed.audienceHints[0] ||
    "汇报对象";
  const goal =
    clean.includes("验收") ? "通过验收或评审" :
    clean.includes("可落地") || clean.includes("落地") ? "获得认可并推动落地" :
    seed.goalHints.find((hint) => clean.includes(hint)) ||
    seed.goalHints[0] ||
    "形成判断并推进下一步";

  return {
    reviewType,
    planType,
    confidence,
    audience,
    goal,
    scores: reviewScores,
    reasons: reasons.slice(0, 8)
  };
}

export function planTypeFromReviewType(reviewType: PPTType): ContentPlanPPTType {
  return contracts.find((contract) => contract.reviewType === reviewType)?.planType || "general";
}
