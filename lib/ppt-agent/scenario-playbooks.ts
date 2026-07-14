import type { SlideLayout } from "@/lib/canvas-data";
import type { PPTType } from "@/lib/ppt-review-rulebase";
import type { ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";
import { detectPPTTypeContract } from "@/lib/ppt-agent/type-contracts";
import { cleanText } from "@/lib/text-sanitize";

export type SlideRoleSeed = {
  role: string;
  titleIntent: string;
  pagePurpose: string;
  mustProve: string;
  suggestedEvidence: string[];
  avoid: string[];
  layoutHint: SlideLayout;
};

export type ScenarioPlaybook = {
  pptType: ContentPlanPPTType;
  scenarioName: string;
  commonAudiences: string[];
  commonDecisionGoals: string[];
  narrativePatterns: string[];
  requiredQuestions: string[];
  requiredSlideRoles: SlideRoleSeed[];
  optionalSlideRoles: SlideRoleSeed[];
  forbiddenGenericPatterns: string[];
  qualityChecklistSeeds: string[];
  commonRisks: string[];
  styleDefaults: string;
  layoutBias: SlideLayout[];
  evidenceExpectations: string[];
};

const genericForbidden = ["背景、意义、方案、总结", "空泛口号", "只列概念不做判断", "所有页面使用同一结构", "没有下一步动作"];

function role(role: string, titleIntent: string, pagePurpose: string, mustProve: string, suggestedEvidence: string[], layoutHint: SlideLayout, avoid: string[] = genericForbidden): SlideRoleSeed {
  return { role, titleIntent, pagePurpose, mustProve, suggestedEvidence, layoutHint, avoid };
}

export const scenarioPlaybooks: Record<ContentPlanPPTType, ScenarioPlaybook> = {
  project_report: {
    pptType: "project_report",
    scenarioName: "项目汇报",
    commonAudiences: ["领导", "管理层", "负责人", "评审专家", "甲方"],
    commonDecisionGoals: ["争取认可", "推动立项", "汇报成果", "申请资源", "完成验收"],
    narrativePatterns: ["先说明为什么必须做，再证明做什么、怎么做、谁负责、如何验收，最后收束到需决策事项。"],
    requiredQuestions: ["为什么现在要做？", "目标和评价口径是什么？", "方案如何落地？", "谁负责推进？", "如何验收？", "下一步要决策什么？"],
    requiredSlideRoles: [
      role("开场定调", "项目主题与核心判断", "让受众立刻知道汇报对象、项目方向和判断结论。", "项目值得被讨论，并有明确汇报目标。", ["用户需求", "项目背景"], "cover"),
      role("背景依据", "建设背景与依据", "说明项目为什么不是临时想法。", "项目有现实问题、政策依据或业务依据。", ["政策文件", "现状数据", "业务痛点"], "split"),
      role("问题判断", "现状痛点与机会", "把泛背景转为需要解决的问题。", "当前问题足以支撑项目建设。", ["现状调研", "用户材料", "对标资料"], "comparison"),
      role("目标定义", "建设目标与评价口径", "把愿景转换为可检查目标。", "目标可理解、可量化、可验收。", ["目标指标", "评价口径"], "stats"),
      role("方案路径", "总体方案与系统架构", "说明项目如何组成、如何运行。", "方案不是概念，而有结构和路径。", ["架构说明", "功能清单"], "process"),
      role("实施计划", "实施路径与阶段计划", "证明项目可以分阶段推进。", "时间、阶段、任务之间关系清楚。", ["时间表", "里程碑"], "timeline"),
      role("责任保障", "组织保障与责任分工", "说明谁牵头、谁协同、谁交付。", "项目执行责任明确。", ["组织机制", "责任清单"], "matrix"),
      role("验收成效", "验收标准与成果指标", "让受众知道如何判断项目做成。", "项目有验收指标和成效口径。", ["验收标准", "成果指标"], "checklist"),
      role("行动收束", "下一步动作与需决策事项", "把汇报导向具体决策。", "会后动作、资源和决策事项明确。", ["推进计划", "决策清单"], "closing")
    ],
    optionalSlideRoles: [
      role("风险控制", "风险点与应对措施", "提前说明推进风险和预案。", "关键风险可控。", ["风险清单", "应对措施"], "comparison")
    ],
    forbiddenGenericPatterns: [...genericForbidden, "只写背景意义不写验收", "只讲愿景不讲责任"],
    qualityChecklistSeeds: ["有受众和决策目标", "有验收标准", "有责任分工", "有阶段计划", "有证据来源"],
    commonRisks: ["内容容易变成空泛宣传", "缺少验收指标", "责任和下一步不清"],
    styleDefaults: "政务稳重、清晰、可落地",
    layoutBias: ["cover", "split", "comparison", "stats", "process", "timeline", "matrix", "checklist", "closing"],
    evidenceExpectations: ["政策依据", "现状数据", "项目材料", "实施计划", "验收指标"]
  },
  product_intro: {
    pptType: "product_intro",
    scenarioName: "产品介绍",
    commonAudiences: ["潜在客户", "采购方", "企业管理者", "内部团队", "渠道伙伴"],
    commonDecisionGoals: ["理解产品价值", "判断是否试用", "判断是否采购", "判断是否部署", "推动合作"],
    narrativePatterns: ["先定义目标用户和痛点，再说明产品定位、能力蓝图、使用路径、部署方式和价值证明。"],
    requiredQuestions: ["产品为谁解决问题？", "解决什么场景？", "核心能力是什么？", "如何使用和部署？", "为什么值得试用或采购？"],
    requiredSlideRoles: [
      role("产品定位", "产品定位与一句话价值", "让受众快速判断产品解决什么问题。", "产品价值具体而非口号。", ["产品说明", "用户场景"], "cover"),
      role("痛点场景", "目标用户与痛点场景", "从客户问题出发而不是先堆功能。", "产品对应真实业务场景。", ["客户问题", "场景材料"], "split"),
      role("产品蓝图", "产品蓝图与能力架构", "展示模块关系和能力边界。", "能力结构清楚。", ["产品文档", "功能架构"], "process"),
      role("使用路径", "从使用到交付的路径", "证明产品不是单点功能。", "用户能理解完整工作流。", ["流程说明", "截图材料"], "timeline"),
      role("核心能力", "核心功能与输出结果", "说明关键能力和可见成果。", "功能能带来明确输出。", ["功能清单", "输出样例"], "matrix"),
      role("部署集成", "部署方式与系统集成", "回答企业落地问题。", "部署、集成、权限边界清楚。", ["部署文档", "集成说明"], "timeline"),
      role("价值证明", "价值证明与采购判断", "把产品能力转成客户决策依据。", "价值、证据和采购判断明确。", ["案例", "指标", "客户反馈"], "evidence"),
      role("行动收束", "试用计划与下一步动作", "让受众知道怎么开始。", "试点范围、动作和标准清楚。", ["试点计划", "验收标准"], "closing")
    ],
    optionalSlideRoles: [
      role("安全治理", "权限、数据与风控机制", "回应企业客户对安全和治理的顾虑。", "数据、权限和内容风险可控。", ["安全说明", "权限机制"], "checklist")
    ],
    forbiddenGenericPatterns: [...genericForbidden, "产品背景、产品功能、产品优势、总结", "只罗列功能"],
    qualityChecklistSeeds: ["目标用户清楚", "痛点具体", "能力架构清楚", "有使用路径", "有价值证明", "有下一步动作"],
    commonRisks: ["只列功能", "没有客户场景", "没有部署和采购判断"],
    styleDefaults: "商务简洁、科技简约、产品蓝图感",
    layoutBias: ["cover", "split", "process", "timeline", "matrix", "checklist", "evidence", "closing"],
    evidenceExpectations: ["产品文档", "客户场景", "部署条件", "案例证据", "效果指标"]
  },
  business_plan: {
    pptType: "business_plan",
    scenarioName: "商业 BP / 路演",
    commonAudiences: ["投资人", "合伙人", "董事会", "战略合作方"],
    commonDecisionGoals: ["判断是否投资", "判断是否合作", "确认商业潜力", "支持下一轮推进"],
    narrativePatterns: ["从机会和问题切入，证明方案、市场、商业模式、增长路径和团队执行力。"],
    requiredQuestions: ["机会是否足够大？", "方案是否有差异化？", "商业模式是否成立？", "团队能否执行？", "资金如何使用？"],
    requiredSlideRoles: [
      role("机会判断", "市场机会与痛点", "证明问题值得被解决。", "市场机会和痛点成立。", ["市场数据", "用户痛点"], "stats"),
      role("解决方案", "产品与解决方案", "说明如何解决问题。", "方案可理解且有差异化。", ["产品说明", "方案图"], "split"),
      role("商业模式", "商业模式与收入路径", "说明如何赚钱和扩张。", "商业闭环成立。", ["收入模型", "价格假设"], "process"),
      role("增长计划", "增长路径与里程碑", "说明未来推进节奏。", "增长路径可执行。", ["里程碑", "增长指标"], "timeline"),
      role("竞争壁垒", "竞争格局与壁垒", "说明为什么能赢。", "差异化和壁垒清楚。", ["竞品资料", "壁垒说明"], "comparison"),
      role("团队资金", "团队能力与资金用途", "说明谁来做、钱花在哪。", "团队和资金用途匹配目标。", ["团队履历", "资金计划"], "matrix")
    ],
    optionalSlideRoles: [role("财务预测", "关键财务预测", "让投资人判断增长质量。", "预测有口径。", ["财务模型"], "stats")],
    forbiddenGenericPatterns: [...genericForbidden, "万亿市场但无依据", "只讲愿景不讲商业闭环"],
    qualityChecklistSeeds: ["市场有数据", "方案有差异", "模式能闭环", "增长有里程碑", "资金用途清楚"],
    commonRisks: ["市场空间没有来源", "商业模式空泛", "竞争壁垒不足"],
    styleDefaults: "投资人友好、增长叙事、克制专业",
    layoutBias: ["cover", "stats", "split", "process", "timeline", "comparison", "matrix", "closing"],
    evidenceExpectations: ["市场报告", "用户验证", "竞品数据", "财务预测", "团队履历"]
  },
  financial_report: {
    pptType: "financial_report",
    scenarioName: "财报分析",
    commonAudiences: ["管理层", "投资人", "财务团队", "业务负责人"],
    commonDecisionGoals: ["理解经营表现", "解释变化原因", "识别风险", "判断趋势", "制定管理动作"],
    narrativePatterns: ["先给核心结论，再拆关键指标、业务结构、利润与现金流，最后给风险、趋势和管理建议。"],
    requiredQuestions: ["核心指标如何变化？", "收入结构为什么变化？", "利润变化原因是什么？", "风险在哪里？", "下一步管理建议是什么？"],
    requiredSlideRoles: [
      role("核心结论", "财务表现核心结论", "先给经营判断。", "管理层能一眼看到结论。", ["财报数据", "核心指标"], "cover"),
      role("指标总览", "关键指标变化", "用指标解释总体表现。", "核心指标有同比、环比或口径。", ["收入", "利润", "现金流"], "stats"),
      role("收入结构", "营收结构与业务贡献", "说明增长来自哪里。", "收入结构和业务贡献清楚。", ["业务线数据"], "stats"),
      role("利润变化", "利润率与费用变化", "解释利润改善或承压原因。", "利润变化有原因。", ["成本", "费用", "毛利"], "comparison"),
      role("风险因素", "风险因素与异常信号", "提前暴露经营风险。", "风险不是泛泛提醒。", ["风险披露", "异常指标"], "comparison"),
      role("趋势建议", "趋势判断与管理建议", "把分析导向管理动作。", "建议可执行。", ["趋势数据", "管理动作"], "closing")
    ],
    optionalSlideRoles: [role("现金质量", "现金流与资产质量", "判断经营质量。", "现金和资产风险清楚。", ["现金流", "资产负债"], "matrix")],
    forbiddenGenericPatterns: [...genericForbidden, "只罗列数字", "没有口径的同比环比"],
    qualityChecklistSeeds: ["有核心结论", "有数据口径", "有原因解释", "有风险判断", "有管理建议"],
    commonRisks: ["只列数字", "没有解释变化原因", "没有风险和建议"],
    styleDefaults: "财报专业、数据可信、分析克制",
    layoutBias: ["cover", "stats", "comparison", "matrix", "evidence", "closing"],
    evidenceExpectations: ["财报原文", "公告", "历史财务数据", "业务数据", "行业数据"]
  },
  courseware: {
    pptType: "courseware",
    scenarioName: "课程课件 / 培训课件",
    commonAudiences: ["学生", "培训对象", "企业员工", "教师"],
    commonDecisionGoals: ["理解知识点", "完成练习", "掌握方法", "通过培训评估"],
    narrativePatterns: ["先设定学习目标，再建立知识框架，通过案例示范和练习巩固，最后总结复盘。"],
    requiredQuestions: ["学习目标是什么？", "知识框架如何组织？", "案例如何演示？", "如何练习？", "课后如何巩固？"],
    requiredSlideRoles: [
      role("学习目标", "学习目标与课程结构", "让学员知道学什么。", "目标具体可检查。", ["课程目标"], "agenda"),
      role("知识框架", "知识框架与关键关系", "建立整体认知。", "知识点之间关系清楚。", ["教材", "知识点"], "process"),
      role("概念讲解", "核心概念拆解", "讲清难点。", "概念能被零基础理解。", ["例子", "定义"], "cards"),
      role("案例演示", "案例演示与步骤", "把知识用于真实任务。", "方法步骤清楚。", ["案例材料"], "timeline"),
      role("课堂练习", "课堂练习与反馈", "让学员应用。", "练习能检验学习效果。", ["练习题", "任务"], "checklist"),
      role("总结复盘", "总结复盘与课后任务", "形成记忆和延展。", "课后任务明确。", ["作业", "复盘清单"], "closing")
    ],
    optionalSlideRoles: [role("互动提问", "互动问题与讨论", "检查理解程度。", "问题能引导思考。", ["提问清单"], "quote")],
    forbiddenGenericPatterns: [...genericForbidden, "只做知识点堆叠", "没有练习和反馈"],
    qualityChecklistSeeds: ["有学习目标", "有知识框架", "有案例", "有练习", "有课后任务"],
    commonRisks: ["概念堆叠", "没有互动", "案例不具体"],
    styleDefaults: "教育清晰、友好、层次明确",
    layoutBias: ["cover", "agenda", "process", "cards", "timeline", "checklist", "closing"],
    evidenceExpectations: ["教材", "案例", "练习题", "评价标准"]
  },
  travel_plan: {
    pptType: "travel_plan",
    scenarioName: "旅游攻略 / 行程方案",
    commonAudiences: ["游客", "家庭", "情侣", "学生", "自由行用户"],
    commonDecisionGoals: ["能照着执行行程", "确认预算", "降低踩坑风险", "安排备选方案"],
    narrativePatterns: ["先给路线总览，再按时间或天数展开交通、景点、餐饮、预算和风险备选。"],
    requiredQuestions: ["路线怎么走？", "每天节奏是否合理？", "交通怎么安排？", "预算是多少？", "有哪些避坑和备选？"],
    requiredSlideRoles: [
      role("路线总览", "行程总览与适用人群", "让用户知道这条路线适合谁。", "路线定位清楚。", ["目的地资料"], "cover"),
      role("每日路线", "每日路线与时间安排", "让用户能照着走。", "路线顺、节奏合理。", ["地图", "开放时间"], "timeline"),
      role("交通安排", "交通方式与移动建议", "降低移动成本和踩坑。", "交通方式可执行。", ["交通信息"], "map"),
      role("景点餐饮", "景点亮点与餐饮节点", "解释为什么这样安排。", "景点和餐饮不只是罗列。", ["景点信息", "餐饮建议"], "cards"),
      role("预算规划", "预算区间与费用构成", "让用户能估算花费。", "预算有结构。", ["门票", "交通", "餐饮"], "stats"),
      role("风险备选", "避坑提醒与备选方案", "异常情况仍能执行。", "预约、天气、体力风险有预案。", ["预约规则", "天气备选"], "checklist")
    ],
    optionalSlideRoles: [role("出发清单", "出发前检查清单", "让用户做好准备。", "准备动作清楚。", ["清单"], "closing")],
    forbiddenGenericPatterns: [...genericForbidden, "只罗列景点", "路线不可执行", "没有交通和预算"],
    qualityChecklistSeeds: ["路线可执行", "预算清楚", "交通清楚", "有避坑", "有备选方案"],
    commonRisks: ["景点堆砌", "时间过满", "缺少预约信息"],
    styleDefaults: "旅游轻松、路线清楚、杂志感",
    layoutBias: ["cover", "timeline", "map", "cards", "stats", "checklist", "closing"],
    evidenceExpectations: ["官方开放信息", "预约规则", "交通信息", "天气和备选"]
  },
  company_profile: {
    pptType: "company_profile",
    scenarioName: "公司介绍",
    commonAudiences: ["客户", "投资人", "合作伙伴", "招投标评委"],
    commonDecisionGoals: ["建立信任", "判断实力", "促成合作", "支持投标"],
    narrativePatterns: ["先建立身份和可信背书，再说明业务、能力、案例、优势和合作方式。"],
    requiredQuestions: ["公司是谁？", "有什么业务？", "有什么能力？", "有什么案例？", "为什么值得合作？"],
    requiredSlideRoles: [
      role("企业概览", "企业定位与概览", "建立基本身份。", "公司定位清楚。", ["官网", "企业资料"], "cover"),
      role("发展实力", "发展历程与关键数据", "建立可信度。", "规模和发展有证据。", ["历史", "数据"], "timeline"),
      role("业务能力", "核心业务与能力体系", "说明能做什么。", "业务边界清楚。", ["业务资料"], "matrix"),
      role("案例背书", "客户案例与成果", "用客户验证能力。", "案例真实可信。", ["客户案例"], "cards"),
      role("合作价值", "合作价值与下一步", "导向合作动作。", "合作路径清楚。", ["合作方式"], "closing")
    ],
    optionalSlideRoles: [role("资质荣誉", "资质认证与荣誉", "补强信任。", "背书可核验。", ["资质证书"], "evidence")],
    forbiddenGenericPatterns: [...genericForbidden, "行业领先但无证据", "只写公司口号"],
    qualityChecklistSeeds: ["定位清楚", "数据背书", "业务清楚", "案例可信", "下一步明确"],
    commonRisks: ["自夸过多", "缺少案例", "业务边界不清"],
    styleDefaults: "企业专业、可信、简洁",
    layoutBias: ["cover", "timeline", "matrix", "cards", "evidence", "closing"],
    evidenceExpectations: ["官网", "资质", "客户案例", "公开业绩"]
  },
  proposal: {
    pptType: "proposal",
    scenarioName: "销售提案 / 合作方案",
    commonAudiences: ["客户", "甲方", "采购方", "合作伙伴"],
    commonDecisionGoals: ["推动合作", "争取预算", "促成购买", "启动试点"],
    narrativePatterns: ["先从客户问题出发，再给解决方案、交付内容、实施周期、资源报价、风险控制和下一步动作。"],
    requiredQuestions: ["客户问题是什么？", "方案如何解决？", "交付什么？", "周期和资源如何安排？", "风险如何控制？", "下一步怎么合作？"],
    requiredSlideRoles: [
      role("客户问题", "客户痛点与合作目标", "证明方案从客户问题出发。", "痛点和目标具体。", ["客户访谈", "业务材料"], "split"),
      role("解决方案", "解决方案与服务内容", "说明交付什么能力。", "方案与痛点匹配。", ["服务清单", "方案说明"], "process"),
      role("交付成果", "交付成果与验收标准", "让客户知道能拿到什么。", "成果和验收标准清楚。", ["交付物", "验收口径"], "checklist"),
      role("实施周期", "实施周期与项目安排", "说明怎么推进。", "周期、阶段、责任清楚。", ["实施计划"], "timeline"),
      role("价值证明", "价值证明与资源投入", "回答为什么值得投入。", "价值和投入逻辑清楚。", ["案例", "报价逻辑", "效果指标"], "stats"),
      role("风险控制", "风险控制与保障机制", "降低合作顾虑。", "关键风险有预案。", ["风险清单", "保障机制"], "comparison"),
      role("合作动作", "下一步合作动作", "推动客户决策。", "会后动作清楚。", ["行动清单"], "closing")
    ],
    optionalSlideRoles: [role("团队背书", "团队与案例背书", "增强信任。", "执行能力可信。", ["团队案例"], "cards")],
    forbiddenGenericPatterns: [...genericForbidden, "只做自我介绍", "只有创意没有执行", "没有报价或资源逻辑"],
    qualityChecklistSeeds: ["客户问题明确", "方案匹配痛点", "交付清楚", "周期清楚", "风险可控", "下一步明确"],
    commonRisks: ["变成公司介绍", "缺少交付标准", "没有实施和资源安排"],
    styleDefaults: "商务提案、客户导向、可信可执行",
    layoutBias: ["cover", "split", "process", "checklist", "timeline", "stats", "comparison", "closing"],
    evidenceExpectations: ["客户材料", "服务清单", "案例", "报价逻辑", "实施计划"]
  },
  research_report: {
    pptType: "research_report",
    scenarioName: "研究报告 / 行业报告",
    commonAudiences: ["管理层", "研究人员", "客户", "投资人", "团队"],
    commonDecisionGoals: ["解释趋势", "形成判断", "支持决策", "识别机会风险"],
    narrativePatterns: ["先提出研究问题和数据来源，再给关键发现、趋势判断、机会风险和建议。"],
    requiredQuestions: ["研究问题是什么？", "数据来源是什么？", "关键发现是什么？", "趋势如何判断？", "建议是什么？"],
    requiredSlideRoles: [
      role("研究问题", "研究背景与核心问题", "定义研究边界。", "问题具体。", ["研究资料"], "cover"),
      role("数据来源", "数据来源与方法", "说明依据可信。", "来源和方法清楚。", ["数据来源"], "evidence"),
      role("关键发现", "关键发现与证据", "给出核心洞察。", "发现有依据。", ["调研数据"], "stats"),
      role("趋势判断", "趋势判断与变化原因", "解释方向和原因。", "趋势不是空泛判断。", ["趋势数据"], "comparison"),
      role("机会风险", "机会、风险与建议", "导向决策。", "建议可执行。", ["风险清单", "建议"], "closing")
    ],
    optionalSlideRoles: [role("案例对照", "案例或标杆对照", "增强证据。", "案例可对比。", ["案例"], "cards")],
    forbiddenGenericPatterns: [...genericForbidden, "只有观点没有依据", "没有数据来源"],
    qualityChecklistSeeds: ["问题清楚", "来源可信", "发现具体", "趋势有原因", "建议可执行"],
    commonRisks: ["观点先行", "来源不清", "建议空泛"],
    styleDefaults: "研究专业、证据导向、判断清楚",
    layoutBias: ["cover", "evidence", "stats", "comparison", "cards", "closing"],
    evidenceExpectations: ["研究报告", "公开数据", "访谈材料", "案例资料"]
  },
  activity_plan: {
    pptType: "activity_plan",
    scenarioName: "活动策划",
    commonAudiences: ["客户", "领导", "执行团队", "合作方"],
    commonDecisionGoals: ["确认活动方案", "确认预算", "确认执行路径", "评估预期效果"],
    narrativePatterns: ["先说明活动目标和人群，再给主题创意、流程安排、资源物料、分工预算、风险和效果评估。"],
    requiredQuestions: ["活动为什么办？", "目标人群是谁？", "创意是什么？", "如何执行？", "预算和风险如何控制？"],
    requiredSlideRoles: [
      role("活动目标", "活动目标与人群定位", "说明为什么办。", "目标和人群具体。", ["活动需求"], "split"),
      role("主题创意", "主题创意与核心玩法", "形成记忆点。", "创意服务目标。", ["创意材料"], "cards"),
      role("流程安排", "流程安排与执行节奏", "说明怎么执行。", "流程完整。", ["流程表"], "timeline"),
      role("资源分工", "资源物料与责任分工", "保证执行落地。", "资源和分工清楚。", ["物料清单", "人员分工"], "matrix"),
      role("预算风险", "预算、风险与效果评估", "控制成本和风险。", "预算和效果口径清楚。", ["预算表", "风险预案"], "closing")
    ],
    optionalSlideRoles: [role("传播计划", "传播节奏与内容物料", "放大活动影响。", "传播动作清楚。", ["传播计划"], "timeline")],
    forbiddenGenericPatterns: [...genericForbidden, "只有创意没有执行", "没有预算和分工"],
    qualityChecklistSeeds: ["目标明确", "人群清楚", "流程可执行", "分工明确", "预算风险清楚"],
    commonRisks: ["创意脱离目标", "执行不具体", "预算不清"],
    styleDefaults: "活动感、执行清楚、有记忆点",
    layoutBias: ["cover", "split", "cards", "timeline", "matrix", "closing"],
    evidenceExpectations: ["活动需求", "场地信息", "预算", "人员分工", "传播计划"]
  },
  policy_interpretation: {
    pptType: "policy_interpretation",
    scenarioName: "政策解读",
    commonAudiences: ["政府部门", "主管单位", "领导", "业务团队"],
    commonDecisionGoals: ["理解政策要求", "制定落实方案", "明确责任动作", "完成工作汇报"],
    narrativePatterns: ["先解释政策背景和核心要求，再对照现状差距，转化为任务、机制、风险和下一步。"],
    requiredQuestions: ["政策要求是什么？", "与现状差距是什么？", "要落实哪些任务？", "谁负责？", "如何复盘？"],
    requiredSlideRoles: [
      role("政策依据", "政策背景与核心要求", "讲清政策来源和要求。", "政策依据准确。", ["政策原文"], "split"),
      role("现状差距", "现状对照与问题清单", "找出需要落实的差距。", "差距具体。", ["现状数据"], "comparison"),
      role("落实任务", "重点任务与推进路径", "把政策转成行动。", "任务和路径清楚。", ["任务清单"], "timeline"),
      role("责任机制", "责任分工与保障机制", "说明谁来落实。", "责任和机制清楚。", ["责任分工"], "matrix"),
      role("成效复盘", "成效指标与下一步", "说明如何评价落实效果。", "成效可复核。", ["指标", "复盘机制"], "closing")
    ],
    optionalSlideRoles: [role("风险提醒", "落实风险与应对", "提前处理阻力。", "风险可控。", ["风险清单"], "checklist")],
    forbiddenGenericPatterns: [...genericForbidden, "只摘政策原文", "只表态不落实"],
    qualityChecklistSeeds: ["政策依据准确", "差距清楚", "任务明确", "责任明确", "有复盘指标"],
    commonRisks: ["政策引用不准确", "没有落地动作", "责任不清"],
    styleDefaults: "政策稳重、条理清楚、执行导向",
    layoutBias: ["cover", "split", "comparison", "timeline", "matrix", "closing"],
    evidenceExpectations: ["政策原文", "主管部门文件", "现状数据", "落实方案"]
  },
  general: {
    pptType: "general",
    scenarioName: "通用汇报",
    commonAudiences: ["领导", "团队", "客户", "评审"],
    commonDecisionGoals: ["形成共识", "说明方案", "推动下一步", "完成汇报"],
    narrativePatterns: ["先给结论和问题，再给判断、方案、证据、风险和行动。"],
    requiredQuestions: ["要解决什么问题？", "核心判断是什么？", "依据是什么？", "下一步怎么做？"],
    requiredSlideRoles: [
      role("结论总览", "汇报结论与结构", "先给判断。", "核心结论清楚。", ["用户需求"], "agenda"),
      role("问题现状", "背景与现状问题", "说明为什么汇报。", "问题具体。", ["背景资料"], "split"),
      role("核心方案", "核心方案与路径", "说明如何解决。", "方案路径清楚。", ["方案材料"], "process"),
      role("证据支撑", "数据证据与案例", "增强可信度。", "判断有依据。", ["数据", "案例"], "evidence"),
      role("行动收束", "下一步动作", "明确后续推进。", "动作具体。", ["行动清单"], "closing")
    ],
    optionalSlideRoles: [role("风险应对", "风险与应对", "说明不确定性。", "风险可控。", ["风险清单"], "comparison")],
    forbiddenGenericPatterns: genericForbidden,
    qualityChecklistSeeds: ["结论明确", "问题具体", "方案清楚", "证据可追溯", "行动明确"],
    commonRisks: ["泛泛汇报", "没有证据", "没有行动"],
    styleDefaults: "简洁清楚、商务可读",
    layoutBias: ["cover", "agenda", "split", "process", "evidence", "comparison", "closing"],
    evidenceExpectations: ["背景资料", "数据", "案例", "行动计划"]
  }
};

export function playbookTypeFromCoreType(coreType: PPTType): ContentPlanPPTType {
  const map: Record<PPTType, ContentPlanPPTType> = {
    project_report: "project_report",
    company_profile: "company_profile",
    product_proposal: "product_intro",
    business_bp: "business_plan",
    financial_analysis: "financial_report",
    courseware: "courseware",
    policy_report: "policy_interpretation",
    event_plan: "activity_plan",
    travel_guide: "travel_plan",
    general_report: "general"
  };
  return map[coreType] || "general";
}

export function detectScenarioPlaybookType(prompt: string, coreType?: PPTType): ContentPlanPPTType {
  const contract = detectPPTTypeContract(prompt);
  if (coreType && contract.reviewType === coreType) return contract.planType;
  if (!coreType && contract.confidence >= 64) return contract.planType;
  const clean = cleanText(prompt);
  if (/合作方案|销售提案|服务方案|报价|交付成果|客户痛点|实施周期|合作动作|采购方|甲方/.test(clean)) return "proposal";
  if (/研究报告|行业报告|趋势研究|调研报告|白皮书|市场研究/.test(clean)) return "research_report";
  if (/项目汇报|项目方案|项目建设|建设背景|验收标准|成果验收|推进计划|责任分工/.test(clean)) return "project_report";
  if (/产品介绍|产品定位|产品蓝图|核心能力|部署方式|采购判断/.test(clean)) return "product_intro";
  if (/商业BP|商业 BP|路演|融资|投资人|商业计划/.test(clean)) return "business_plan";
  if (/财报|季报|年报|营收|利润|现金流|财务/.test(clean)) return "financial_report";
  if (/课程|课件|培训|学员|学习目标|课堂练习/.test(clean)) return "courseware";
  if (/企业介绍|公司介绍|客户案例|资质|核心业务/.test(clean)) return "company_profile";
  if (/活动策划|活动方案|会务|嘉宾|赞助|传播节奏/.test(clean)) return "activity_plan";
  if (/(旅游|旅行|游玩|自由行|一日游|二日游|三日游|四日游|五日游|景点|行程|路线|避坑)/.test(clean)) return "travel_plan";
  if (/政策解读|政策汇报|贯彻落实|主管部门文件/.test(clean)) return "policy_interpretation";
  return coreType ? playbookTypeFromCoreType(coreType) : "general";
}

export function getScenarioPlaybook(type: ContentPlanPPTType): ScenarioPlaybook {
  return scenarioPlaybooks[type] || scenarioPlaybooks.general;
}
