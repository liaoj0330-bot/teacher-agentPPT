import type { LessonEventType } from "@/lib/ppt-agent/content-plan";

export type InitialSubjectId = "math" | "chemistry" | "biology" | "history" | "geography" | "english";

export type SubjectLessonRouteStep = {
  type: LessonEventType;
  title: string;
  weight: number;
  teacherAction: string;
  studentAction: string;
  expectedResponse: string;
  evidenceOfLearning: string;
  fallbackAction: string;
};

export type InitialSubjectCoverage = {
  id: InitialSubjectId;
  subject: string;
  aliases: string[];
  coverageLevel: "initial";
  textbookIntake: { requiredFields: string[]; requiredSourceRoles: string[]; sourcePriority: string[] };
  lesson: {
    durationMinutes: 45;
    architecture: "representation_modeling" | "evidence_experiment" | "observation_systems" | "source_inquiry" | "spatial_reasoning" | "communicative_task_cycle";
    architectureReason: string;
    drivingQuestion: string;
    lessonPromise: string;
    route: SubjectLessonRouteStep[];
  };
  teacherDeliverables: string[];
  visualIntent: { primaryForms: string[]; nativeFallbacks: string[]; avoid: string[] };
  remainingHumanGates: string[];
};

const requiredFields = ["schoolStage", "grade", "publisher", "editionYear", "volume", "unit", "chapter", "pageRange", "topic", "teachingRequirements"];
const requiredSourceRoles = ["textbook", "teacher_guide", "lesson_plan", "exercise"];
const sourcePriority = ["teacher_uploaded_textbook", "teacher_uploaded_guide", "teacher_confirmed_reference"];
const requiredDeliverables = ["teacherNotes", "answerKey", "boardPlan", "differentiatedHomework", "assessmentCriteria", "fallbackActions"];

function textbookIntake() {
  return { requiredFields: [...requiredFields], requiredSourceRoles: [...requiredSourceRoles], sourcePriority: [...sourcePriority] };
}

function routeStep(type: LessonEventType, title: string, weight: number, action: string, evidence: string): SubjectLessonRouteStep {
  return {
    type,
    title,
    weight,
    teacherAction: action,
    studentAction: `完成“${title}”任务并提交可检查产出。`,
    expectedResponse: `学生能基于${evidence}说明判断。`,
    evidenceOfLearning: evidence,
    fallbackAction: `缩小任务范围，提供半结构化支架后再次完成“${title}”。`,
  };
}

function coverage(
  input: Omit<InitialSubjectCoverage, "coverageLevel" | "textbookIntake" | "teacherDeliverables">,
): InitialSubjectCoverage {
  return { ...input, coverageLevel: "initial", textbookIntake: textbookIntake(), teacherDeliverables: [...requiredDeliverables] };
}

export const initialSubjectCoverageMatrix: Record<InitialSubjectId, InitialSubjectCoverage> = {
  math: coverage({
    id: "math",
    subject: "数学",
    aliases: ["数学", "math", "mathematics"],
    lesson: {
      durationMinutes: 45,
      architecture: "representation_modeling",
      architectureReason: "从问题和已有表征出发，在数、式、图、表之间建立关系，再通过变式与纠错稳定方法。",
      drivingQuestion: "怎样用不同数学表征说明结论为什么成立，并在条件变化后继续使用？",
      lessonPromise: "学生不仅会套步骤，还能连接表征、说明依据并完成一次变式迁移。",
      route: [
        routeStep("activate", "前置诊断", 4, "用最小诊断题暴露前置概念和典型误区。", "诊断作答"),
        routeStep("inquire", "多表征观察", 7, "组织数、式、图、表对照，暂不直接给规则。", "表征对照记录"),
        routeStep("explain", "概念与边界建构", 8, "根据学生发现规范概念、条件和反例。", "概念解释与正反例"),
        routeStep("model", "推理方法示范", 7, "示范审题、选择表征、推理和复查。", "完整推理链"),
        routeStep("practice", "独立练习与变式", 8, "安排基础任务和条件变化的变式任务。", "个人作答与变式比较"),
        routeStep("feedback", "错因诊断与再练", 6, "定位概念、运算或表征转换错误。", "错误诊断和再练"),
        routeStep("closing", "最小达标任务", 5, "用未见过的短任务检查解释和迁移。", "离堂任务与依据"),
      ],
    },
    visualIntent: { primaryForms: ["数式图表联动", "坐标与几何关系", "逐步推理链", "变式对照"], nativeFallbacks: ["可编辑坐标轴", "几何图形", "公式步骤", "数据表格"], avoid: ["装饰性数学符号", "只展示答案", "图表脱离题目条件"] },
    remainingHumanGates: ["教材事实抽查", "数学教师过课", "WPS/PowerPoint真机"],
  }),
  chemistry: coverage({
    id: "chemistry",
    subject: "化学",
    aliases: ["化学", "chemistry"],
    lesson: {
      durationMinutes: 45,
      architecture: "evidence_experiment",
      architectureReason: "从实验安全、变量、现象和证据出发，在宏观现象、微观解释和符号表达之间建立对应。",
      drivingQuestion: "实验现象提供了什么证据，怎样用微观模型和化学语言解释？",
      lessonPromise: "学生能记录可信现象、形成证据解释，并用规范化学表达完成迁移。",
      route: [
        routeStep("opening", "安全边界与研究问题", 3, "明确试剂、操作、安全边界和观察变量。", "风险清单与问题"),
        routeStep("inquire", "对照实验与现象记录", 9, "组织对照实验并区分现象与结论。", "条件操作现象记录表"),
        routeStep("explain", "证据归纳与微观解释", 8, "连接多组现象和微观粒子模型。", "宏观微观证据链"),
        routeStep("model", "化学符号表达", 6, "示范把文字解释转成规范化学表达。", "符号表达与条件"),
        routeStep("practice", "条件变化与应用", 7, "安排新条件下的判断或计算任务。", "独立应用答案"),
        routeStep("feedback", "证据误读与纠错", 7, "诊断现象结论混写、漏条件和符号错误。", "纠错记录与再练"),
        routeStep("closing", "新实验解释", 5, "用新实验数据检查证据解释迁移。", "现象证据解释表达"),
      ],
    },
    visualIntent: { primaryForms: ["实验装置与变量", "现象证据表", "宏观微观符号三重表征", "安全操作序列"], nativeFallbacks: ["实验装置示意", "粒子模型", "反应方程步骤", "对照实验表"], avoid: ["危险操作无提示", "现象结论混写", "装饰烧杯代替证据"] },
    remainingHumanGates: ["教材实验核对", "化学教师过课", "实验安全人工审核"],
  }),
  biology: coverage({
    id: "biology",
    subject: "生物",
    aliases: ["生物", "biology"],
    lesson: {
      durationMinutes: 45,
      architecture: "observation_systems",
      architectureReason: "从真实结构、观察或数据入手，建立结构与功能、局部与系统、过程与调节之间的联系。",
      drivingQuestion: "观察到的结构或数据怎样支持功能和系统关系的解释？",
      lessonPromise: "学生能用观察证据解释结构功能关系，并把局部过程放回系统中判断。",
      route: [
        routeStep("activate", "生命现象观察", 4, "呈现真实图像、样本或数据并区分事实与猜想。", "观察记录与问题"),
        routeStep("inquire", "观察分类与数据整理", 8, "按层级、变量或时间组织证据。", "标注图分类表或曲线读数"),
        routeStep("explain", "结构功能建构", 8, "把结构特征与功能机制逐项对应。", "结构功能证据链"),
        routeStep("model", "过程与系统模型", 7, "示范物质、能量或信息在系统中的流动。", "系统流程模型"),
        routeStep("practice", "数据解释与条件变化", 7, "提供新图表或实验条件要求机制解释。", "数据解释答案"),
        routeStep("feedback", "因果与层级纠错", 6, "诊断层级混淆、因果倒置和过度概括。", "模型修改痕迹"),
        routeStep("closing", "新情境系统判断", 5, "用生活或生态情境检查迁移。", "结构功能系统解释"),
      ],
    },
    visualIntent: { primaryForms: ["结构标注图", "生命过程流程", "层级关系", "实验数据曲线"], nativeFallbacks: ["结构示意", "系统流程图", "分类矩阵", "数据图表"], avoid: ["结构比例误导", "相关性画成因果", "背景遮挡标注"] },
    remainingHumanGates: ["教材图示核对", "生物教师过课", "科学准确性人工审核"],
  }),
  history: coverage({
    id: "history",
    subject: "历史",
    aliases: ["历史", "history"],
    lesson: {
      durationMinutes: 45,
      architecture: "source_inquiry",
      architectureReason: "以时空定位和史料问题为主线，区分史实、材料信息与解释，用多则证据形成有边界的历史判断。",
      drivingQuestion: "哪些史料能够支持我们的历史解释，不同材料的立场和边界是什么？",
      lessonPromise: "学生能在时空坐标中读取史料、交叉验证，并形成有证据的历史解释。",
      route: [
        routeStep("opening", "时空定位", 4, "用时间轴和地图定位事件并提出解释性问题。", "时空定位卡"),
        routeStep("inquire", "史料信息提取与互证", 8, "提供出处明确的多类型史料，比较一致、冲突和缺失信息。", "史料摘录与互证矩阵"),
        routeStep("explain", "因果与变化解释", 8, "区分背景、直接原因、条件和影响。", "因果链与证据编号"),
        routeStep("model", "历史论证示范", 6, "示范观点、证据、解释和限定词。", "历史论证段"),
        routeStep("practice", "新史料独立判断", 7, "用未见史料要求独立引用和解释。", "个人史料解释"),
        routeStep("feedback", "新证据下修订解释", 7, "用反例或新材料检验原判断，依据反馈完成修订。", "修订前后对照"),
        routeStep("closing", "证据边界与课堂收束", 5, "回扣解释性问题，说明结论、证据边界和后续待证事项。", "离堂历史解释"),
      ],
    },
    visualIntent: { primaryForms: ["时间轴", "历史地图", "史料摘录与出处", "因果证据链"], nativeFallbacks: ["可编辑时间轴", "地图标注层", "史料卡片", "互证矩阵"], avoid: ["无出处史料", "影视剧照冒充史实", "时间与因果混淆"] },
    remainingHumanGates: ["史料出处核验", "历史教师过课", "观点边界人工审核"],
  }),
  geography: coverage({
    id: "geography",
    subject: "地理",
    aliases: ["地理", "geography"],
    lesson: {
      durationMinutes: 45,
      architecture: "spatial_reasoning",
      architectureReason: "从区域定位、尺度选择和图表判读出发，沿要素关系、过程机制和人地影响形成空间解释。",
      drivingQuestion: "地理现象在哪里、怎样分布、由哪些过程形成，又会产生什么人地影响？",
      lessonPromise: "学生能从地图和数据读取空间证据，解释区域差异并迁移到新区域。",
      route: [
        routeStep("activate", "区域定位与尺度", 4, "确定位置、范围、方向、图例和观察尺度。", "区域定位卡"),
        routeStep("inquire", "地图图表判读", 8, "组织读取分布、变化和异常点。", "分布描述与数据读数"),
        routeStep("explain", "要素关系与过程", 8, "连接自然和人文要素并明确关系方向。", "要素关系图"),
        routeStep("model", "区域分析示范", 7, "示范定位、特征、成因、影响和对策。", "区域分析链"),
        routeStep("practice", "区域对比与迁移", 7, "比较共同条件和主导差异。", "区域对比矩阵"),
        routeStep("feedback", "尺度与因果纠错", 6, "诊断尺度错配、单因论和图表误读。", "纠错说明与再判"),
        routeStep("closing", "新区域综合判断", 5, "用新区域材料检查空间推理迁移。", "离堂区域分析"),
      ],
    },
    visualIntent: { primaryForms: ["分层地图", "区域剖面", "气候与统计图", "要素关系网络"], nativeFallbacks: ["地图标注", "剖面示意", "组合图表", "区域对比矩阵"], avoid: ["地图无图例比例尺", "空间尺度混用", "照片代替空间证据"] },
    remainingHumanGates: ["地图数据核验", "地理教师过课", "区域事实人工审核"],
  }),
  english: coverage({
    id: "english",
    subject: "英语",
    aliases: ["英语", "英文", "english"],
    lesson: {
      durationMinutes: 45,
      architecture: "communicative_task_cycle",
      architectureReason: "以真实交际任务为终点，按输入理解、语言注意、支架操练、信息差互动、输出反馈完成任务循环。",
      drivingQuestion: "为了完成真实交际任务，需要理解和使用哪些语言，怎样让表达更清楚得体？",
      lessonPromise: "学生能理解关键输入，在有意义的互动中使用目标语言并完成可评价输出。",
      route: [
        routeStep("activate", "语境与交际任务", 4, "发布交际对象、目的、产出和成功标准。", "任务理解卡"),
        routeStep("inquire", "听读输入理解", 8, "先检查主旨，再定位细节和信息结构。", "听读任务单"),
        routeStep("explain", "语言注意与意义", 7, "从输入发现词块、句型、语音或语用特点。", "语言发现记录"),
        routeStep("model", "交际策略示范", 6, "示范发起、回应、追问和修正表达。", "对话功能标注"),
        routeStep("practice", "信息差互动", 8, "先准确性操练，再组织真实信息差任务。", "同伴任务记录"),
        routeStep("transfer", "独立交际输出", 7, "撤除部分支架，完成口头或书面产出。", "录音对话或短文"),
        routeStep("feedback", "反馈改进与再表达", 5, "按任务完成、语言准确和表达得体反馈。", "前后两次表现"),
      ],
    },
    visualIntent: { primaryForms: ["交际情境", "输入信息结构", "语言功能框架", "任务步骤与量规"], nativeFallbacks: ["对话气泡", "词块卡", "信息差任务表", "输出量规"], avoid: ["整页中文讲语法", "无目的机械操练", "图片与语言任务无关"] },
    remainingHumanGates: ["教材语篇核验", "英语教师过课", "听说音频与语音人工审核"],
  }),
};

export function resolveInitialSubjectCoverage(subject: string | undefined) {
  const normalized = String(subject || "").trim().toLowerCase();
  return Object.values(initialSubjectCoverageMatrix).find((entry) => entry.aliases.some((alias) => normalized === alias.toLowerCase()));
}

export function subjectCoverageSummary() {
  const entries = Object.values(initialSubjectCoverageMatrix);
  return {
    coverageLevel: "initial" as const,
    subjectCount: entries.length,
    textbookFieldCount: new Set(entries.flatMap((entry) => entry.textbookIntake.requiredFields)).size,
    sourceRoleCount: new Set(entries.flatMap((entry) => entry.textbookIntake.requiredSourceRoles)).size,
    architectureCount: new Set(entries.map((entry) => entry.lesson.architecture)).size,
    routeStepCount: entries.reduce((sum, entry) => sum + entry.lesson.route.length, 0),
    teacherDeliverableCount: new Set(entries.flatMap((entry) => entry.teacherDeliverables)).size,
    visualFormCount: new Set(entries.flatMap((entry) => entry.visualIntent.primaryForms)).size,
    subjects: entries.map((entry) => entry.subject),
  };
}
