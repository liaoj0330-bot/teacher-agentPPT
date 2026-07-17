export type LessonPresentationStrategyInput = {
  duration?: string | number;
  subject?: string;
  teachingRequirements?: string;
  generationMode?: "chapter_prep" | "lesson_plan" | "optimize_existing";
};

export type LessonPresentationStrategy = {
  version: "lesson_pacing_v1";
  durationMinutes: number;
  recommendedPageCount: number;
  minimumPageCount: number;
  maximumPageCount: number;
  complexityScore: number;
  drivers: string[];
};

const requirementDrivers = [
  { pattern: /实验|演示|观察|探究|操作|朗读|讨论|合作|小组/, label: "包含需要投影支持的课堂活动" },
  { pattern: /练习|检测|测验|评价|作答|例题|习题/, label: "包含独立练习或形成性评价" },
  { pattern: /纠错|反馈|修改|订正|再练|讲评/, label: "包含反馈、纠错或二次学习" },
  { pattern: /迁移|拓展|应用|写作|表达|创作/, label: "包含迁移、表达或创作任务" },
  { pattern: /对比|比较|分层|变式|多组|多轮/, label: "包含多组材料或分层任务" },
  { pattern: /细读|批注|证据链|推导|建模/, label: "包含需要分步呈现的深加工任务" },
] as const;

export function parseLessonDuration(value: string | number | undefined, fallback = 45) {
  const parsed = typeof value === "number" ? value : Number(String(value || "").match(/\d{1,3}/)?.[0]);
  if (!Number.isFinite(parsed) || parsed < 10) return fallback;
  return Math.min(180, Math.round(parsed));
}

function basePageCount(minutes: number) {
  if (minutes <= 30) return 6;
  if (minutes <= 40) return 10;
  if (minutes <= 50) return 14;
  if (minutes <= 70) return 16;
  if (minutes <= 95) return 20;
  return Math.min(32, 20 + Math.ceil((minutes - 95) / 12));
}

export function deriveLessonPresentationStrategy(input: LessonPresentationStrategyInput): LessonPresentationStrategy {
  const durationMinutes = parseLessonDuration(input.duration);
  const subject = String(input.subject || "").trim();
  const requirements = String(input.teachingRequirements || "").trim();
  const drivers: string[] = [];
  let complexityScore = 0;

  if (/物理|化学|生物|科学/.test(subject)) {
    complexityScore += 1;
    drivers.push("实验科学需要保留现象、证据和解释页面");
  } else if (/语文|英语|音乐|美术/.test(subject)) {
    complexityScore += 1;
    drivers.push("语言或艺术学科需要保留作品、文本或表现性活动页面");
  }

  requirementDrivers.forEach((driver) => {
    if (driver.pattern.test(requirements)) {
      complexityScore += 1;
      drivers.push(driver.label);
    }
  });

  if (input.generationMode === "lesson_plan") {
    complexityScore += 1;
    drivers.push("教案生成需要呈现师生活动和课堂评价闭环");
  }

  const maximumBonus = durationMinutes <= 30 ? 1 : durationMinutes <= 95 ? 3 : 4;
  const complexityBonus = Math.min(maximumBonus, Math.ceil(complexityScore / 3));
  const recommendedPageCount = basePageCount(durationMinutes) + complexityBonus;
  const minimumPageCount = Math.max(6, recommendedPageCount - (durationMinutes <= 30 ? 1 : 2));
  const maximumPageCount = Math.min(36, recommendedPageCount + (durationMinutes <= 50 ? 3 : 4));

  return {
    version: "lesson_pacing_v1",
    durationMinutes,
    recommendedPageCount,
    minimumPageCount,
    maximumPageCount,
    complexityScore,
    drivers: drivers.length ? drivers : ["按课时长度配置讲解、活动、练习和收束页面"],
  };
}
