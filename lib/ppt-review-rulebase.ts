import type { SlideLayout } from "@/lib/canvas-data";

export type PPTType =
  | "project_report"
  | "company_profile"
  | "product_proposal"
  | "business_bp"
  | "financial_analysis"
  | "courseware"
  | "policy_report"
  | "event_plan"
  | "travel_guide"
  | "general_report";

export type RuleDimensionSeed = {
  key: string;
  name: string;
  defaultWeight: number;
  why: string;
  deductionTriggers: string[];
  evidenceRequired: string[];
};

export type RequiredPageSeed = {
  role: string;
  title: string;
  mustProve: string;
  layout: SlideLayout;
  requiredKeywords: string[];
};

export type PPTTypeRuleSeed = {
  type: PPTType;
  label: string;
  audienceHints: string[];
  goalHints: string[];
  recommendedSlides: [number, number];
  coreQuestion: string;
  dimensions: RuleDimensionSeed[];
  requiredPages: RequiredPageSeed[];
  vaguePatterns: string[];
  evidenceNeeds: string[];
};

const sharedDimensions: RuleDimensionSeed[] = [
  {
    key: "logic",
    name: "主线逻辑",
    defaultWeight: 20,
    why: "PPT 必须让受众快速理解核心判断和行动方向。",
    deductionTriggers: ["只有背景铺垫，没有明确结论", "页面之间没有递进关系", "同一观点多页重复"],
    evidenceRequired: ["核心观点", "页面角色", "行动指向"]
  },
  {
    key: "evidence",
    name: "证据支撑",
    defaultWeight: 20,
    why: "关键判断需要资料、数据或上传内容支撑。",
    deductionTriggers: ["关键判断没有来源", "数据没有口径", "上传资料没有映射到页面"],
    evidenceRequired: ["公开资料", "上传资料", "可核验数据"]
  },
  {
    key: "page_planning",
    name: "页面策划",
    defaultWeight: 20,
    why: "每页要承担不同任务，避免模板化堆字。",
    deductionTriggers: ["页面角色不清", "全部页面都是 bullet", "缺少表格、流程、对比、指标页"],
    evidenceRequired: ["页面角色", "证明目标", "适配版式"]
  },
  {
    key: "delivery",
    name: "交付表达",
    defaultWeight: 15,
    why: "可交付 PPT 需要可讲、可读、可编辑。",
    deductionTriggers: ["标题过长", "一页多个观点", "没有最后动作或决策页"],
    evidenceRequired: ["短标题", "结构化模块", "行动建议"]
  }
];

function dim(key: string, name: string, weight: number, why: string, deductionTriggers: string[], evidenceRequired: string[]): RuleDimensionSeed {
  return { key, name, defaultWeight: weight, why, deductionTriggers, evidenceRequired };
}

function page(role: string, title: string, mustProve: string, layout: SlideLayout, requiredKeywords: string[]): RequiredPageSeed {
  return { role, title, mustProve, layout, requiredKeywords };
}

export const pptTypeRuleSeeds: Record<PPTType, PPTTypeRuleSeed> = {
  project_report: {
    type: "project_report",
    label: "项目汇报",
    audienceHints: ["领导", "高校领导", "主管部门", "评审专家"],
    goalHints: ["争取立项", "申请资源", "通过验收", "推动落地"],
    recommendedSlides: [10, 12],
    coreQuestion: "这个项目是否值得支持、能否落地、如何验收？",
    dimensions: [
      dim("necessity", "建设必要性", 15, "领导首先关心为什么现在必须做。", ["只写宏观背景", "没有政策或业务依据"], ["政策依据", "现状痛点"]),
      dim("solution", "方案完整性", 20, "项目汇报必须说明做什么、怎么做、由谁做。", ["缺少总体架构", "缺少功能模块", "缺少实施路径"], ["总体架构", "功能清单", "流程路径"]),
      dim("feasibility", "可执行性", 20, "能不能落地是项目汇报的关键评分项。", ["缺少推进计划", "缺少责任分工", "缺少资源投入"], ["时间表", "组织保障", "责任分工"]),
      dim("acceptance", "验收与成效", 20, "没有验收标准，就无法判断项目是否成功。", ["缺少验收标准", "缺少量化指标", "缺少下一步动作"], ["验收指标", "评价口径", "下一步动作"]),
      ...sharedDimensions
    ],
    requiredPages: [
      page("开场定调", "项目汇报封面", "项目主题、汇报对象和交付场景清楚。", "cover", ["项目", "汇报"]),
      page("问题定义", "建设背景与现实痛点", "说明为什么高校现在需要做。", "split", ["背景", "痛点", "政策"]),
      page("目标对齐", "建设目标与评价口径", "目标可理解、可验收。", "stats", ["目标", "指标"]),
      page("方案说明", "平台总体架构", "平台不是概念，而是系统方案。", "process", ["架构", "平台"]),
      page("能力展开", "核心功能与应用场景", "功能能服务教学、实训、企业协同和就业。", "matrix", ["功能", "场景"]),
      page("落地路径", "实施路径与阶段计划", "项目可按阶段推进。", "timeline", ["阶段", "计划"]),
      page("保障机制", "组织保障与责任分工", "谁牵头、谁协同、谁交付要明确。", "matrix", ["责任", "分工", "保障"]),
      page("验收判断", "验收标准与成效指标", "领导能判断项目完成质量。", "checklist", ["验收", "指标", "成效"]),
      page("风险控制", "风险点与应对措施", "对数据、协同、资源、推广风险有预案。", "comparison", ["风险", "应对"]),
      page("行动收束", "下一步动作与需决策事项", "看完后知道要批什么、定什么、推进什么。", "closing", ["下一步", "决策", "动作"])
    ],
    vaguePatterns: ["加强赋能", "打造生态", "全面提升", "持续推进", "形成闭环"],
    evidenceNeeds: ["政策文件", "学校现状数据", "平台功能清单", "实施计划", "验收指标"]
  },
  company_profile: {
    type: "company_profile",
    label: "企业介绍",
    audienceHints: ["客户", "投资人", "合作伙伴", "招投标评委"],
    goalHints: ["建立信任", "展示实力", "促成合作"],
    recommendedSlides: [8, 12],
    coreQuestion: "这家公司是否可信、有什么优势、为什么值得合作？",
    dimensions: [dim("credibility", "可信背书", 25, "企业介绍首先要建立信任。", ["缺少年份、规模、资质、案例"], ["资质", "客户", "业绩"]), ...sharedDimensions],
    requiredPages: [
      page("身份说明", "企业概览", "公司是谁、服务谁、核心定位是什么。", "cover", ["企业", "定位"]),
      page("实力背书", "发展历程与关键数据", "公司有历史与规模。", "timeline", ["历程", "数据"]),
      page("业务展开", "核心业务与解决方案", "主营业务清晰可理解。", "matrix", ["业务", "方案"]),
      page("能力证明", "技术实力与交付能力", "公司不是概念包装，而有真实能力支撑。", "stats", ["技术", "能力", "交付"]),
      page("市场覆盖", "市场布局与服务网络", "公司服务范围和增长空间清楚。", "map", ["市场", "布局"]),
      page("案例证明", "客户案例与合作成果", "能力被真实客户验证。", "cards", ["案例", "客户"]),
      page("优势判断", "核心优势与差异化", "说明为什么选择这家公司。", "comparison", ["优势", "差异"]),
      page("合作收束", "合作价值与下一步", "受众知道如何继续合作。", "closing", ["合作", "下一步"])
    ],
    vaguePatterns: ["行业领先", "实力雄厚", "深耕多年", "全方位服务"],
    evidenceNeeds: ["官网", "资质证书", "客户案例", "公开业绩"]
  },
  product_proposal: {
    type: "product_proposal",
    label: "产品方案",
    audienceHints: ["客户", "采购方", "业务负责人", "技术负责人"],
    goalHints: ["说明方案", "促成采购", "获得试点"],
    recommendedSlides: [10, 12],
    coreQuestion: "产品是否解决真实业务问题，为什么现在要用，如何部署，如何证明效果？",
    dimensions: [
      dim("problem_fit", "问题匹配", 20, "产品方案必须从客户问题和使用场景出发。", ["先讲产品不讲痛点", "场景不具体", "没有说明目标用户"], ["业务痛点", "用户场景", "目标用户"]),
      dim("architecture", "能力架构", 18, "企业客户会关心产品能力边界、系统架构和集成方式。", ["功能堆砌但没有架构", "缺少工作流闭环", "没有集成或部署说明"], ["能力架构", "工作流", "集成方式"]),
      dim("differentiation", "差异化价值", 17, "产品介绍不能只列功能，必须说明相对替代方案的差异和取舍。", ["缺少竞品差异", "没有价值证明", "只写口号"], ["竞品差异", "客户价值", "效果指标"]),
      ...sharedDimensions
    ],
    requiredPages: [
      page("开场定调", "产品定位与一句话价值", "受众能立刻判断产品解决什么问题、适合谁、价值是什么。", "cover", ["产品", "定位", "价值"]),
      page("痛点定义", "客户问题与目标", "产品解决的是具体业务问题，而不是泛泛讲 AI 能力。", "split", ["问题", "目标", "场景"]),
      page("产品说明", "产品能力架构", "能力边界、模块关系和关键入口清楚。", "process", ["能力", "架构", "模块"]),
      page("工作流证明", "从需求到交付的工作流", "产品能把用户任务转成可执行流程，而不是单点功能演示。", "timeline", ["工作流", "流程", "交付"]),
      page("核心功能", "关键能力与可编辑输出", "核心功能能被客户理解、试用和验收。", "matrix", ["功能", "输出", "可编辑"]),
      page("场景证明", "典型应用场景", "产品可用于真实业务场景，并能说明谁在什么情况下使用。", "matrix", ["场景", "用户", "任务"]),
      page("差异化说明", "相比传统工具与模板站的差异", "说明为什么不是模板套壳或普通聊天机器人。", "comparison", ["差异", "竞品", "优势"]),
      page("部署集成", "部署路径与系统集成", "方案能部署、能接入、能维护，技术负责人能评估成本。", "timeline", ["部署", "集成", "保障"]),
      page("安全治理", "权限、数据与风控机制", "企业客户能判断数据、权限、内容安全是否可控。", "checklist", ["安全", "权限", "数据"]),
      page("案例证据", "客户案例与效果指标", "用真实或可验证证据证明产品价值。", "evidence", ["案例", "指标", "证据"]),
      page("试点计划", "试点范围与验收标准", "让客户知道如何低风险启动，并按什么标准判断成败。", "stats", ["试点", "验收", "指标"]),
      page("行动收束", "下一步动作与采购决策", "看完后知道要试点、评估、采购或继续沟通什么。", "closing", ["下一步", "决策", "采购"])
    ],
    vaguePatterns: ["智能化赋能", "一站式", "全面覆盖", "极致体验", "行业领先", "革命性"],
    evidenceNeeds: ["产品文档", "客户场景", "竞品差异", "部署条件", "效果指标", "安全机制"]
  },
  business_bp: {
    type: "business_bp",
    label: "商业 BP",
    audienceHints: ["投资人", "合伙人", "董事会"],
    goalHints: ["融资", "立项", "战略合作"],
    recommendedSlides: [10, 12],
    coreQuestion: "机会是否足够大，团队是否能做成？",
    dimensions: [dim("market", "市场机会", 25, "BP 必须证明市场空间和时机。", ["缺少市场规模", "缺少趋势依据"], ["市场规模", "增长趋势"]), ...sharedDimensions],
    requiredPages: [
      page("开场定调", "BP 封面与一句话机会", "投资人能立刻理解项目机会。", "cover", ["机会", "项目"]),
      page("机会定义", "市场机会与痛点", "问题足够大且值得解决。", "stats", ["市场", "痛点"]),
      page("方案说明", "产品与解决方案", "方案有差异化。", "split", ["产品", "方案"]),
      page("客户证明", "目标客户与使用场景", "需求来自真实客户和具体场景。", "matrix", ["客户", "场景"]),
      page("竞争格局", "竞争分析与差异化壁垒", "项目有清晰竞争位置和壁垒。", "comparison", ["竞争", "壁垒"]),
      page("商业证明", "商业模式与增长路径", "能赚钱、能扩张。", "process", ["商业模式", "增长"]),
      page("经营计划", "里程碑与关键指标", "未来 6-18 个月怎么推进清楚。", "timeline", ["里程碑", "指标"]),
      page("团队背书", "核心团队与资源能力", "团队有能力做成这件事。", "cards", ["团队", "资源"]),
      page("融资收束", "融资计划与资金用途", "钱花在哪里、换来什么。", "matrix", ["融资", "资金"])
    ],
    vaguePatterns: ["万亿市场", "颠覆行业", "快速增长", "巨大空间"],
    evidenceNeeds: ["市场报告", "竞品数据", "财务预测", "客户验证"]
  },
  financial_analysis: {
    type: "financial_analysis",
    label: "财报分析",
    audienceHints: ["管理层", "投资人", "董事会", "分析师"],
    goalHints: ["解释业绩", "判断风险", "制定策略"],
    recommendedSlides: [9, 12],
    coreQuestion: "业绩变化原因是什么，风险和下一步判断是什么？",
    dimensions: [dim("data_accuracy", "数据准确性", 30, "财报分析不能脱离数据口径。", ["缺少同比环比", "图表无来源"], ["财务数据", "同比环比", "来源口径"]), ...sharedDimensions],
    requiredPages: [
      page("分析封面", "财报分析结论", "先给出核心业绩判断。", "cover", ["财报", "结论"]),
      page("总览", "核心财务表现", "主要指标一眼看清。", "stats", ["收入", "利润"]),
      page("拆解", "收入结构与业务贡献", "增长来自哪里。", "stats", ["结构", "业务"]),
      page("盈利质量", "利润率与费用变化", "盈利改善或承压原因清楚。", "stats", ["利润率", "费用"]),
      page("现金与资产", "现金流与资产负债", "经营质量和偿债风险可判断。", "matrix", ["现金流", "资产"]),
      page("同行对比", "行业与同业对照", "业绩判断有参照系。", "comparison", ["行业", "同业"]),
      page("判断", "风险与展望", "未来不确定性清楚。", "comparison", ["风险", "展望"]),
      page("行动建议", "管理建议与关注指标", "看完后知道后续关注什么。", "closing", ["建议", "指标"])
    ],
    vaguePatterns: ["稳中向好", "持续优化", "表现亮眼", "潜力巨大"],
    evidenceNeeds: ["财报原文", "公告", "行业数据", "历史财务数据"]
  },
  courseware: {
    type: "courseware",
    label: "课程课件",
    audienceHints: ["学生", "学员", "教师", "培训对象"],
    goalHints: ["教学", "培训", "讲解知识"],
    recommendedSlides: [10, 16],
    coreQuestion: "学生能否理解、记住并完成练习？",
    dimensions: [dim("learning_goal", "学习目标", 25, "课件必须服务学习目标。", ["缺少学习目标", "知识点顺序混乱"], ["教学目标", "知识结构"]), ...sharedDimensions],
    requiredPages: [
      page("导入", "学习目标与课程结构", "这节课学什么。", "agenda", ["目标", "结构"]),
      page("讲解", "核心概念拆解", "概念可理解。", "process", ["概念"]),
      page("知识框架", "知识结构与关键关系", "学生能建立整体框架。", "matrix", ["知识", "结构"]),
      page("案例演示", "案例讲解与步骤示范", "抽象知识能落到案例。", "timeline", ["案例", "步骤"]),
      page("互动检查", "课堂提问与理解检查", "及时发现学生是否理解。", "checklist", ["提问", "检查"]),
      page("练习", "案例练习与课堂任务", "学生能应用。", "checklist", ["练习", "任务"]),
      page("总结", "知识总结与课后任务", "学习后有复盘和延展任务。", "closing", ["总结", "任务"])
    ],
    vaguePatterns: ["深入浅出", "全面掌握", "系统学习"],
    evidenceNeeds: ["教材", "案例", "练习题", "评价标准"]
  },
  policy_report: {
    type: "policy_report",
    label: "政策汇报",
    audienceHints: ["政府部门", "领导", "主管单位", "专家"],
    goalHints: ["政策解读", "工作汇报", "争取支持"],
    recommendedSlides: [9, 12],
    coreQuestion: "政策要求是什么，本单位如何响应并落地？",
    dimensions: [dim("policy_fit", "政策对齐", 30, "政策汇报必须严格对应政策文本。", ["政策依据不明确", "引用政策不准确"], ["政策原文", "条款依据"]), ...sharedDimensions],
    requiredPages: [
      page("开场定调", "政策汇报封面", "汇报主题、对象和政策语境清楚。", "cover", ["政策", "汇报"]),
      page("政策依据", "政策背景与核心要求", "政策依据清楚。", "split", ["政策", "要求"]),
      page("现状对照", "现状差距与问题清单", "说明本单位与政策要求的差距。", "comparison", ["现状", "差距"]),
      page("落实方案", "工作任务与推进路径", "能落实到行动。", "timeline", ["任务", "推进"]),
      page("责任分工", "组织机制与责任分工", "谁牵头、谁协同、谁负责清楚。", "matrix", ["责任", "分工"]),
      page("保障", "保障机制与风险应对", "有组织、有机制。", "comparison", ["保障", "风险"]),
      page("验收复盘", "成效指标与下一步", "落实效果可复核，后续动作明确。", "closing", ["成效", "下一步"])
    ],
    vaguePatterns: ["高度重视", "扎实推进", "持续深化", "全面贯彻"],
    evidenceNeeds: ["政策原文", "主管部门文件", "本地实施数据"]
  },
  event_plan: {
    type: "event_plan",
    label: "活动策划",
    audienceHints: ["主办方", "客户", "执行团队", "赞助商"],
    goalHints: ["办活动", "执行落地", "招商赞助"],
    recommendedSlides: [9, 12],
    coreQuestion: "活动为什么办、怎么办、风险如何控？",
    dimensions: [dim("execution", "执行可落地", 30, "活动策划最终看执行。", ["缺少流程", "缺少物料", "缺少人员分工"], ["流程表", "分工表", "预算"]), ...sharedDimensions],
    requiredPages: [
      page("活动封面", "活动主题与一句话亮点", "活动定位和记忆点清楚。", "cover", ["活动", "主题"]),
      page("目标", "活动目标与人群定位", "活动为什么办。", "split", ["目标", "人群"]),
      page("创意", "活动主题与核心玩法", "活动有记忆点。", "cards", ["主题", "玩法"]),
      page("执行", "执行流程与责任分工", "活动能落地。", "timeline", ["流程", "分工"]),
      page("传播", "传播节奏与内容物料", "活动前中后传播动作清楚。", "timeline", ["传播", "物料"]),
      page("资源", "场地、人员与供应商", "资源清单支撑执行。", "matrix", ["场地", "人员"]),
      page("预算", "预算与风险预案", "成本和风险可控。", "matrix", ["预算", "风险"]),
      page("复盘", "效果指标与复盘机制", "活动效果可评估。", "closing", ["效果", "复盘"])
    ],
    vaguePatterns: ["引爆传播", "打造声量", "全域联动"],
    evidenceNeeds: ["场地信息", "预算", "流程", "人员分工"]
  },
  travel_guide: {
    type: "travel_guide",
    label: "旅游攻略",
    audienceHints: ["游客", "家人", "朋友", "出行者"],
    goalHints: ["规划路线", "避坑", "做攻略"],
    recommendedSlides: [9, 12],
    coreQuestion: "路线是否真实可执行，预约、交通、预算和备选是否清楚？",
    dimensions: [dim("route_feasible", "路线可执行", 30, "旅游攻略首先要能走得通。", ["景点塞太满", "缺少交通时间", "缺少预约信息"], ["官方开放信息", "交通方式", "预约规则"]), ...sharedDimensions],
    requiredPages: [
      page("封面定调", "旅游攻略封面", "目的地、天数和路线风格清楚。", "cover", ["旅游", "攻略"]),
      page("路线定调", "行程主线与适用人群", "路线服务谁、适合什么时间。", "cover", ["路线", "人群"]),
      page("时间规划", "分时段路线安排", "行程能按节奏执行。", "timeline", ["时间", "路线"]),
      page("景点说明", "核心景点与停留建议", "每个景点为什么去、停多久清楚。", "cards", ["景点", "停留"]),
      page("预约避坑", "预约规则与风险提醒", "不会到现场才发现进不去。", "checklist", ["预约", "风险"]),
      page("预算交通", "交通与预算", "成本和移动方式清楚。", "stats", ["交通", "预算"]),
      page("餐饮休息", "美食与休息节点", "路线不是只赶景点，也能落地执行。", "matrix", ["美食", "休息"]),
      page("备选", "天气/体力/预约失败备选", "异常情况有替代方案。", "comparison", ["备选", "天气"]),
      page("行动清单", "出发前检查清单", "用户能直接照着准备。", "closing", ["清单", "准备"])
    ],
    vaguePatterns: ["必打卡", "超好玩", "网红路线", "不虚此行"],
    evidenceNeeds: ["官方预约", "开放时间", "交通信息", "天气备选"]
  },
  general_report: {
    type: "general_report",
    label: "通用汇报",
    audienceHints: ["领导", "团队", "客户", "评审"],
    goalHints: ["汇报情况", "说明方案", "形成共识"],
    recommendedSlides: [8, 12],
    coreQuestion: "这份汇报是否讲清现状、判断、方案和行动？",
    dimensions: sharedDimensions,
    requiredPages: [
      page("总览", "汇报结论与目录", "先给出判断。", "agenda", ["结论", "目录"]),
      page("现状", "背景与现状问题", "为什么要汇报。", "split", ["背景", "问题"]),
      page("方案", "核心方案与推进路径", "如何解决。", "process", ["方案", "路径"]),
      page("证据", "数据证据与案例支撑", "关键判断有依据。", "evidence", ["数据", "案例"]),
      page("风险", "风险与应对", "推进过程中的风险可控。", "comparison", ["风险", "应对"]),
      page("行动", "下一步动作", "汇报后怎么推进。", "closing", ["下一步"])
    ],
    vaguePatterns: ["持续推进", "全面提升", "加强建设", "形成合力"],
    evidenceNeeds: ["背景资料", "数据", "案例", "行动计划"]
  }
};

export const pptTypeLabels: Record<PPTType, string> = Object.fromEntries(
  Object.values(pptTypeRuleSeeds).map((seed) => [seed.type, seed.label])
) as Record<PPTType, string>;
