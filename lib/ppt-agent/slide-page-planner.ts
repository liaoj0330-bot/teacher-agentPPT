import type { UploadedAsset } from "@/lib/canvas-data";
import type { ContentPlan, ContentPlanSlide, ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";
import { getScenarioPlaybook } from "@/lib/ppt-agent/scenario-playbooks";
import type { PageContentBlock, RecommendedVisualForm, SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";
import { cleanText } from "@/lib/text-sanitize";

type SlidePagePlannerMode = "quick" | "professional";

export type SlidePagePlannerInput = {
  contentPlan: ContentPlan;
  uploadedAssets?: UploadedAsset[];
  mode?: SlidePagePlannerMode;
  userPreferences?: Record<string, unknown>;
};

type PageExpressionProfile = {
  audienceLens: string;
  decisionVerb: string;
  writingStyle: string;
  visualPool: RecommendedVisualForm[];
  avoid: string[];
  qualityFocus: string[];
};

const sharedAvoid = ["空泛口号", "没有证据", "标题太虚", "只平铺信息", "重复上一页结论"];

const expressionProfiles: Record<ContentPlanPPTType, PageExpressionProfile> = {
  project_report: {
    audienceLens: "领导或管理层",
    decisionVerb: "判断是否认可、推进或验收",
    writingStyle: "结论前置、政务稳重、动作清楚、验收口径明确",
    visualPool: ["quote_highlight", "process_flow", "architecture_diagram", "timeline", "matrix", "metric_dashboard", "risk_table", "roadmap"],
    avoid: ["只有意义没有动作", "只有方案没有验收", "责任主体不清", ...sharedAvoid],
    qualityFocus: ["有建设必要性", "有实施路径", "有责任分工", "有验收标准", "有下一步动作"]
  },
  product_intro: {
    audienceLens: "客户、采购方或技术负责人",
    decisionVerb: "判断是否试用、部署或采购",
    writingStyle: "客户视角、价值先行、场景具体、部署可判断",
    visualPool: ["quote_highlight", "comparison_table", "architecture_diagram", "process_flow", "matrix", "timeline", "case_card", "metric_dashboard"],
    avoid: ["功能堆叠", "只讲优势不讲场景", "没有部署路径", ...sharedAvoid],
    qualityFocus: ["痛点具体", "能力边界清楚", "使用路径清楚", "有价值证明", "有采购下一步"]
  },
  business_plan: {
    audienceLens: "投资人、董事会或战略合作方",
    decisionVerb: "判断机会、增长和资金用途是否成立",
    writingStyle: "机会判断清楚、增长逻辑紧凑、财务假设克制",
    visualPool: ["quote_highlight", "metric_dashboard", "comparison_table", "process_flow", "timeline", "matrix", "case_card"],
    avoid: ["市场空间无来源", "商业模式空泛", "资金用途不清", ...sharedAvoid],
    qualityFocus: ["机会有数据", "方案有差异", "模式可闭环", "增长有里程碑", "资金用途清楚"]
  },
  financial_report: {
    audienceLens: "管理层、投资人或业务负责人",
    decisionVerb: "判断指标变化、经营风险和管理动作",
    writingStyle: "数据先行、原因解释、口径明确、建议克制",
    visualPool: ["metric_dashboard", "comparison_table", "matrix", "risk_table", "timeline", "quote_highlight"],
    avoid: ["只罗列数字", "没有同比环比口径", "没有原因解释", ...sharedAvoid],
    qualityFocus: ["有核心结论", "有数据口径", "有结构拆解", "有风险判断", "有管理建议"]
  },
  courseware: {
    audienceLens: "学员、学生或培训对象",
    decisionVerb: "判断是否理解、会练习、能应用",
    writingStyle: "教学清晰、例子先行、步骤明确、练习可检查",
    visualPool: ["process_flow", "card_grid", "case_card", "timeline", "comparison_table", "quote_highlight"],
    avoid: ["概念堆叠", "没有案例", "没有练习", ...sharedAvoid],
    qualityFocus: ["有学习目标", "有知识框架", "有案例示范", "有课堂练习", "有课后任务"]
  },
  travel_plan: {
    audienceLens: "真实出行用户",
    decisionVerb: "判断路线能不能照着执行",
    writingStyle: "路线清楚、时间可执行、预算有假设、避坑明确",
    visualPool: ["map_route", "timeline", "card_grid", "metric_dashboard", "risk_table", "comparison_table", "case_card"],
    avoid: ["只罗列景点", "路线不连贯", "没有交通和预算", ...sharedAvoid],
    qualityFocus: ["路线顺", "交通清楚", "预算清楚", "预约避坑", "备选方案"]
  },
  company_profile: {
    audienceLens: "客户、合作方或评审方",
    decisionVerb: "判断公司是否可信、是否值得合作",
    writingStyle: "可信背书、业务边界清楚、案例证明、合作导向",
    visualPool: ["quote_highlight", "timeline", "matrix", "case_card", "comparison_table", "metric_dashboard"],
    avoid: ["自夸口号", "没有案例", "业务边界不清", ...sharedAvoid],
    qualityFocus: ["定位清楚", "数据背书", "能力清楚", "案例可信", "合作路径明确"]
  },
  proposal: {
    audienceLens: "客户、甲方或采购方",
    decisionVerb: "判断合作是否值得启动",
    writingStyle: "客户问题先行、交付清楚、周期明确、行动导向",
    visualPool: ["comparison_table", "process_flow", "timeline", "matrix", "metric_dashboard", "risk_table", "roadmap"],
    avoid: ["只做公司介绍", "没有交付标准", "没有客户视角", ...sharedAvoid],
    qualityFocus: ["客户痛点明确", "方案匹配痛点", "交付物清楚", "风险可控", "下一步明确"]
  },
  research_report: {
    audienceLens: "管理层、研究人员或决策者",
    decisionVerb: "判断发现是否可信、建议是否成立",
    writingStyle: "发现先行、证据可追溯、含义清楚、建议可执行",
    visualPool: ["quote_highlight", "metric_dashboard", "comparison_table", "risk_table", "case_card", "matrix"],
    avoid: ["只有观点没有依据", "信息平铺", "建议空泛", ...sharedAvoid],
    qualityFocus: ["研究问题清楚", "来源可信", "发现具体", "趋势有原因", "建议可执行"]
  },
  activity_plan: {
    audienceLens: "主办方、客户或执行团队",
    decisionVerb: "判断活动能否执行、预算是否合理",
    writingStyle: "目标明确、创意服务目标、执行节奏清楚、预算风险可控",
    visualPool: ["quote_highlight", "card_grid", "timeline", "matrix", "metric_dashboard", "risk_table", "roadmap"],
    avoid: ["只有创意没有执行", "没有预算", "没有分工", ...sharedAvoid],
    qualityFocus: ["目标明确", "人群清楚", "流程可执行", "分工明确", "效果可复盘"]
  },
  policy_interpretation: {
    audienceLens: "政府部门、主管单位或领导",
    decisionVerb: "判断政策要求如何转成落实动作",
    writingStyle: "政策依据准确、任务转化清楚、责任明确、复盘可检查",
    visualPool: ["quote_highlight", "comparison_table", "timeline", "matrix", "risk_table", "roadmap"],
    avoid: ["只摘政策原文", "只表态不落实", "责任不清", ...sharedAvoid],
    qualityFocus: ["政策依据准确", "差距清楚", "任务明确", "责任明确", "复盘指标清楚"]
  },
  general: {
    audienceLens: "目标受众",
    decisionVerb: "形成判断并推进下一步",
    writingStyle: "结论前置、结构清楚、证据支撑、行动收束",
    visualPool: ["quote_highlight", "comparison_table", "process_flow", "timeline", "matrix", "metric_dashboard", "risk_table"],
    avoid: sharedAvoid,
    qualityFocus: ["结论明确", "问题具体", "方案清楚", "证据可追溯", "行动明确"]
  }
};

function unique<T>(items: T[]) {
  return [...new Set(items.filter(Boolean))];
}

function compact(value: string, max = 34) {
  const clean = cleanText(value).replace(/\s+/g, "");
  return [...clean].length > max ? `${[...clean].slice(0, max - 1).join("")}…` : clean;
}

function topicFromPlan(plan: ContentPlan) {
  const fromIntent = cleanText(plan.userIntent)
    .replace(/^生成一份/, "")
    .replace(/，.*$/g, "")
    .replace(/并按.*$/g, "")
    .trim();
  return compact(fromIntent || plan.coreMessage || getScenarioPlaybook(plan.pptType).scenarioName, 24);
}

function visualByRole(plan: ContentPlan, slide: ContentPlanSlide, index: number): RecommendedVisualForm {
  if (plan.playbookId === "teacher_math_science_v1" && slide.visualNeed) return slide.visualNeed as RecommendedVisualForm;
  const profile = expressionProfiles[plan.pptType] || expressionProfiles.general;
  const text = cleanText(`${slide.role} ${slide.titleIntent} ${slide.pagePurpose} ${slide.mustProve}`);
  if (/封面|开场|定位|结论|主题|机会/.test(text)) return "quote_highlight";
  if (/架构|系统|蓝图|能力|模块|产品/.test(text)) return "architecture_diagram";
  if (/路径|流程|工作流|方案|落实|任务/.test(text)) return "process_flow";
  if (/阶段|计划|里程碑|周期|路线|时间|课程结构/.test(text)) return "timeline";
  if (/指标|目标|财报|预算|资金|数据|成效|验收/.test(text)) return "metric_dashboard";
  if (/责任|分工|结构|业务|场景|资源|知识/.test(text)) return "matrix";
  if (/风险|应对|备选|差异|对比|现状差距/.test(text)) return "risk_table";
  if (/案例|客户|景点|餐饮|亮点|练习|创意/.test(text)) return "case_card";
  if (/交通|地图|行程|出行|移动/.test(text)) return "map_route";
  if (/下一步|动作|收束|采购|合作|复盘/.test(text)) return "summary_action";
  return profile.visualPool[index % profile.visualPool.length];
}

function audienceQuestion(plan: ContentPlan, slide: ContentPlanSlide, topic: string) {
  const profile = expressionProfiles[plan.pptType] || expressionProfiles.general;
  const subject = compact(slide.titleIntent || slide.role || topic, 18);
  if (plan.pptType === "project_report") return `${profile.audienceLens}会问：${subject}能否支撑项目被认可、推进或验收？`;
  if (plan.pptType === "product_intro") return `${profile.audienceLens}会问：${subject}能否证明产品值得试用、部署或采购？`;
  if (plan.pptType === "financial_report") return `${profile.audienceLens}会问：${subject}说明了什么经营变化和下一步风险？`;
  if (plan.pptType === "courseware") return `${profile.audienceLens}会问：学完${subject}之后到底能理解什么、练什么、怎么用？`;
  if (plan.pptType === "travel_plan") return `${profile.audienceLens}会问：${subject}能不能照着走、预算和风险是否清楚？`;
  if (plan.pptType === "proposal") return `${profile.audienceLens}会问：${subject}能否降低合作风险并推动下一步？`;
  if (plan.pptType === "research_report") return `${profile.audienceLens}会问：${subject}的发现依据是什么、对决策意味着什么？`;
  if (plan.pptType === "activity_plan") return `${profile.audienceLens}会问：${subject}是否服务目标、能否按资源落地？`;
  return `${profile.audienceLens}会问：${subject}为什么重要、依据是什么、下一步怎么做？`;
}

function coreClaim(plan: ContentPlan, slide: ContentPlanSlide, index: number, topic: string) {
  const target = compact(slide.titleIntent || slide.role, 18);
  const prove = compact(slide.mustProve || slide.pagePurpose, 34);
  const goal = compact(plan.decisionGoal, 24);
  const patterns = [
    `${target}必须先证明「${prove}」，否则${plan.audience}无法形成${goal}的判断。`,
    `这一页要把「${target}」转成可检查的判断，而不是停留在普通信息罗列。`,
    `只有讲清「${prove}」，${plan.audience}才会相信${topic}具备继续推进的价值。`,
    `${target}应当用证据和结构说明结论，让后续页面可以自然进入行动或决策。`
  ];
  return patterns[index % patterns.length];
}

function contentBlocksFor(plan: ContentPlan, slide: ContentPlanSlide, claim: string, evidenceNeed: string[]): PageContentBlock[] {
  const type = plan.pptType;
  const evidence = evidenceNeed[0] || plan.evidenceNeeds[0] || "可核验资料";
  const blocks: PageContentBlock[] = [
    {
      type: "question",
      title: "受众问题",
      body: `先回应本页为什么要出现，以及它如何服务「${plan.decisionGoal}」。`,
      priority: "must"
    },
    {
      type: "claim",
      title: "核心观点",
      body: claim,
      priority: "must"
    },
    {
      type: "evidence",
      title: "证据安排",
      body: `用「${evidence}」支撑本页判断，证据不足时明确标记待补来源。`,
      evidenceNeed: evidence,
      priority: "must"
    }
  ];

  if (type === "travel_plan") {
    blocks.push({ type: "steps", title: "执行路径", body: "补充时间、交通、预约、预算或备选动作，让用户能照着执行。", priority: "must" });
  } else if (type === "financial_report") {
    blocks.push({ type: "data", title: "原因解释", body: "不能只展示指标，要说明变化原因、口径和管理含义。", priority: "must" });
  } else if (type === "courseware") {
    blocks.push({ type: "action", title: "练习任务", body: "把知识点转成示例、提问或练习，便于检查学习效果。", priority: "should" });
  } else if (type === "proposal" || type === "project_report") {
    blocks.push({ type: "action", title: "行动落点", body: "把页面结论落到责任、验收、合作动作或需决策事项。", priority: "must" });
  } else if (type === "research_report") {
    blocks.push({ type: "recommendation", title: "判断含义", body: "说明发现对机会、风险或策略选择意味着什么。", priority: "must" });
  } else {
    blocks.push({ type: "recommendation", title: "页面结论", body: "给出清晰建议或下一步判断，避免页面只停留在说明层。", priority: "should" });
  }

  return blocks.slice(0, 5);
}

function layoutIntentFor(form: RecommendedVisualForm, role: string) {
  const map: Record<RecommendedVisualForm, string> = {
    bullet_list: "使用短句列表承载轻量说明，但必须保留观点句和证据提示。",
    card_grid: "使用卡片网格拆分并列信息，控制每张卡只表达一个判断。",
    comparison_table: "使用对照表呈现差异、取舍、现状差距或方案选择。",
    process_flow: "使用流程图表达步骤、机制、工作流或实施闭环。",
    timeline: "使用时间线表达阶段、路线、课程节奏或里程碑。",
    metric_dashboard: "使用指标看板表达目标、预算、成效、财务或验收口径。",
    matrix: "使用矩阵表达角色、场景、能力、责任或资源之间的对应关系。",
    architecture_diagram: "使用架构图表达系统层级、产品蓝图或模块关系。",
    roadmap: "使用路线图表达下一步动作、试点计划、合作推进或复盘口径。",
    map_route: "使用路线图表达空间移动、交通、行程顺序或执行路径。",
    risk_table: "使用风险表表达风险、原因、影响和应对动作。",
    quote_highlight: "使用观点强调页建立开场判断、核心结论或章节定调。",
    case_card: "使用案例卡表达样例、场景、景点、客户或练习任务。",
    summary_action: "使用行动收束页表达下一步动作、责任、节奏和需要拍板的事项。",
    coordinate_graph: "使用可编辑坐标轴、刻度、点和函数图像连接已有知识与新概念。",
    table_formula_graph_mapping: "使用数值表、解析式与坐标图像三栏映射同一数学关系。",
    parameter_compare: "使用双列或多图坐标系比较参数变化，不用纯文字代替图像。",
    worked_example_steps: "使用题目、已知、分步推导、关键判断和结论组成可讲解例题。",
    practice_feedback: "使用真实题目、学生作答区、提示与反馈标准形成课堂检查闭环。",
    concept_relation: "使用概念、变量、表示与图像特征的关系结构完成定义或总结。"
  };
  return `${map[form]}本页角色是「${role}」，版式必须服务证明任务。`;
}

function qualityChecksFor(plan: ContentPlan, slide: ContentPlanSlide, form: RecommendedVisualForm) {
  const profile = expressionProfiles[plan.pptType] || expressionProfiles.general;
  return unique([
    `标题是观点句，而不是「${slide.titleIntent}」这类名词标签。`,
    `正文必须证明：${slide.mustProve}`,
    `证据至少覆盖：${slide.suggestedEvidence.slice(0, 2).join("、") || plan.evidenceNeeds.slice(0, 2).join("、")}`,
    `视觉形式采用 ${form} 时，不能退化成纯文字堆叠。`,
    ...profile.qualityFocus.slice(0, 3)
  ]).slice(0, 7);
}

export function createSlidePagePlans(input: SlidePagePlannerInput): SlidePagePlan[] {
  const { contentPlan } = input;
  const playbook = getScenarioPlaybook(contentPlan.pptType);
  const profile = expressionProfiles[contentPlan.pptType] || expressionProfiles.general;
  const topic = topicFromPlan(contentPlan);
  const uploadedEvidence = (input.uploadedAssets || []).slice(0, 3).map((asset) => `上传资料：${asset.name}`);
  return contentPlan.slidePlan.map((slide, index) => {
    const form = visualByRole(contentPlan, slide, index);
    const evidenceNeed = unique([...slide.suggestedEvidence, ...uploadedEvidence, ...contentPlan.evidenceNeeds.slice(0, 3)]).slice(0, 6);
    const claim = coreClaim(contentPlan, slide, index, topic);
    const contentBlocks = contentBlocksFor(contentPlan, slide, claim, evidenceNeed);
    return {
      pagePlanId: `${contentPlan.planId}-page-${index + 1}`,
      planId: contentPlan.planId,
      contentPlanSlideId: slide.id,
      pptType: contentPlan.pptType,
      role: cleanText(slide.role, playbook.requiredSlideRoles[index]?.role || "页面论证"),
      pageIndex: index + 1,
      audienceQuestion: audienceQuestion(contentPlan, slide, topic),
      coreClaim: claim,
      pagePurpose: cleanText(slide.pagePurpose, "说明本页在整套 PPT 中承担的具体作用。"),
      mustProve: cleanText(slide.mustProve, "本页必须证明一个清晰判断。"),
      evidenceNeed,
      contentBlocks,
      informationHierarchy: {
        primary: claim,
        secondary: unique([slide.mustProve, ...evidenceNeed.slice(0, 2)]).slice(0, 4),
        tertiary: unique([...slide.avoid.slice(0, 2), ...profile.avoid.slice(0, 2)]).slice(0, 4)
      },
      recommendedVisualForm: form,
      layoutIntent: layoutIntentFor(form, slide.role),
      writingStyle: profile.writingStyle,
      avoidPatterns: unique([...slide.avoid, ...profile.avoid]).slice(0, 8),
      qualityChecks: qualityChecksFor(contentPlan, slide, form),
      generationWarnings: [
        `必须先回答「${audienceQuestion(contentPlan, slide, topic)}」。`,
        "证据不足时写明待补资料，不编造来源。",
        "页面要保留可编辑结构，避免整页图片化。"
      ],
      studentAction: slide.studentAction,
      masteryCheck: slide.masteryCheck,
      childOutputRequired: slide.childOutputRequired,
      visualNeed: slide.visualNeed,
      contentLimit: slide.contentLimit
    };
  });
}
