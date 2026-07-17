export type TeacherDeckScoreReportV2 = {
  version: "v2";
  mode: "shadow";
  sceneEligible: boolean;
  scores: { structure: number; pedagogy: number; visual: number; editability: number; automaticTotal: number };
  teacherTrial: { status: "pending" | "complete"; score: null };
  p0: string[];
  p1: string[];
  p2: string[];
  pageIssues: Array<{ page?: number; severity: "P0" | "P1" | "P2"; issue: string }>;
  requiresHumanReview: boolean;
  exportRecommendation: "shadow_only" | "human_review_required";
  templateExpansionAllowed: false;
  commercialReady: false;
};

export type TeacherDeckScoreInputV2 = {
  scene?: string;
  topic?: string;
  slides?: Array<{ page?: number; id?: string; module?: string; role?: string; title?: string; body?: string; bullets?: string[]; layout?: string; fontSize?: number; overflow?: boolean; collision?: boolean; internalField?: unknown }>;
  engineering?: {
    rendered?: boolean; screenshots?: boolean; ooxmlEditable?: boolean; fontsPassed?: boolean; geometryPassed?: boolean;
    editableObjectCoverage?: number; imageCoverageMax?: number; nativeTextObjects?: number; nativeShapeObjects?: number;
  };
  visualReview?: { completed?: boolean; p0?: number; p1?: number; p2?: number };
  teacherTrial?: { trialCompleted?: boolean; reviewedByTeacher?: boolean };
};

const textOf = (slide: NonNullable<TeacherDeckScoreInputV2["slides"]>[number]) =>
  [slide.title, slide.body, ...(slide.bullets || [])].filter((value): value is string => typeof value === "string").join(" ");

const moduleFor = (slide: NonNullable<TeacherDeckScoreInputV2["slides"]>[number]) => {
  const explicit = (slide.module || slide.id || "").toUpperCase().match(/M0[24789]/)?.[0];
  if (explicit) return explicit;
  const role = `${slide.role || ""} ${slide.title || ""}`;
  if (/目标|导入|learning goals?|warm-?up|course cover/i.test(role)) return "M02";
  if (/概念|定义|解释|算理|方法|表示|词句|细读|key expressions?|language patterns?|explain/i.test(role)) return "M04";
  if (/例题|讲解|步骤|示范|重点段落|精读|model dialogue|worked example/i.test(role)) return "M07";
  if (/练习|反馈|互动|纠错|再练习|practice|feedback|pair work|retry/i.test(role)) return "M08";
  if (/总结|迁移|作业|离堂|收束|summary|transfer|homework|closing/i.test(role)) return "M09";
  return undefined;
};

export function scoreTeacherDeckV2(input: TeacherDeckScoreInputV2): TeacherDeckScoreReportV2 {
  const sceneEligible = input.scene === "teacher_courseware";
  const empty: TeacherDeckScoreReportV2 = { version: "v2", mode: "shadow", sceneEligible, scores: { structure: 0, pedagogy: 0, visual: 0, editability: 0, automaticTotal: 0 }, teacherTrial: { status: "pending", score: null }, p0: [], p1: [], p2: [], pageIssues: [], requiresHumanReview: false, exportRecommendation: "shadow_only", templateExpansionAllowed: false, commercialReady: false };
  if (!sceneEligible) return empty;

  const slides = input.slides || [];
  const p0: string[] = [], p1: string[] = [], p2: string[] = [];
  const pageIssues: TeacherDeckScoreReportV2["pageIssues"] = [];
  const add = (severity: "P0" | "P1" | "P2", issue: string, page?: number) => {
    ({ P0: p0, P1: p1, P2: p2 })[severity].push(issue);
    pageIssues.push({ page, severity, issue });
  };
  const allText = slides.map(textOf).join(" ");
  if (/\uFFFD|锟斤拷|鏂囧瓧|缂哄皯/.test(allText)) add("P0", "检测到乱码或损坏文本");
  slides.forEach((slide, index) => {
    if (slide.internalField !== undefined || Object.keys(slide).some(key => /^(internal|debug|raw)/i.test(key))) add("P0", "检测到内部字段泄漏", slide.page || index + 1);
    if (slide.fontSize !== undefined && slide.fontSize < 18) add("P1", "字号小于18pt", slide.page || index + 1);
    if (slide.overflow || slide.collision) add("P1", "存在几何溢出或碰撞", slide.page || index + 1);
  });

  const requirements: Record<string, Array<{ label: string; matches: (text: string) => boolean }>> = {
    M02: ["目标", "学习"].map(term => ({ label: term, matches: text => text.includes(term) })),
    M04: ["概念", "解释"].map(term => ({ label: term, matches: text => text.includes(term) })),
    M07: ["题目", "步骤", "结论"].map(term => ({ label: term, matches: text => text.includes(term) })),
    M08: ["练习", "作答", "反馈"].map(term => ({ label: term, matches: text => text.includes(term) })),
    M09: [
      { label: "总结", matches: text => /总结|复盘|回扣/.test(text) },
      {
        label: "迁移",
        matches: text =>
          /迁移|延伸/.test(text) &&
          /学生(?:活动|操作)|独立|选择/.test(text) &&
          /答案|解析式|列表|作图|输出/.test(text) &&
          /反馈|自评|修正|核对/.test(text) &&
          /检查|标准|正确/.test(text),
      },
    ],
  };
  let moduleHits = 0;
  for (const [module, checks] of Object.entries(requirements)) {
    const owned = slides.filter(slide => moduleFor(slide) === module);
    const text = owned.map(textOf).join(" ");
    const hits = checks.filter(check => check.matches(text)).length;
    moduleHits += hits / checks.length;
    if (!owned.length) add("P0", `${module}缺少页面证据`);
    else if (hits < checks.length) {
      const ruleId = module === "M09" ? "M09_TEACHING_EVIDENCE_COMPLETE: " : "";
      add(module === "M07" || module === "M08" ? "P0" : "P1", `${ruleId}${module}证据不完整：缺少${checks.filter(check => !check.matches(text)).map(check => check.label).join("、")}`, owned[0].page);
    }
  }

  for (let start = 0; start <= slides.length - 6; start++) {
    const layouts = slides.slice(start, start + 6).map(slide => slide.layout).filter(Boolean);
    if (layouts.length === 6 && new Set(layouts).size === 1) { add("P2", `第${start + 1}-${start + 6}页连续重复布局`); break; }
  }
  const eng = input.engineering || {};
  if (!eng.rendered || !eng.screenshots) add("P0", "缺少真实渲染截图证据");
  if (eng.ooxmlEditable !== true) add("P0", "缺少原生OOXML可编辑性证据");
  if (eng.fontsPassed === false) add("P1", "字体检查未通过");
  if (eng.geometryPassed === false) add("P1", "几何检查未通过");
  if (eng.editableObjectCoverage !== undefined && eng.editableObjectCoverage < 0.8) add("P1", "数学内容可编辑对象覆盖率不足");
  if (eng.imageCoverageMax !== undefined && eng.imageCoverageMax >= 0.8) add("P1", "页面可能截图化：图片覆盖面积过高");

  const structure = Math.max(0, Math.min(20, Math.round(4 * moduleHits)));
  const pedagogy = Math.max(0, Math.min(30, Math.round(6 * moduleHits) - p0.filter(x => /M0/.test(x)).length * 4));
  const visual = Math.max(0, 25 - p1.filter(x => /字号|几何|布局/.test(x)).length * 4 - p2.length * 2 - (!eng.rendered ? 8 : 0));
  const editability = Math.max(0, 15 - (eng.ooxmlEditable === true ? 0 : 10) - ((eng.editableObjectCoverage ?? 1) < 0.8 ? 5 : 0));
  const automaticTotal = structure + pedagogy + visual + editability;
  const trialComplete = input.teacherTrial?.trialCompleted === true && input.teacherTrial?.reviewedByTeacher === true;
  const visualComplete = input.visualReview?.completed === true;
  return { version: "v2", mode: "shadow", sceneEligible, scores: { structure, pedagogy, visual, editability, automaticTotal }, teacherTrial: { status: trialComplete ? "complete" : "pending", score: null }, p0, p1, p2, pageIssues, requiresHumanReview: p0.length > 0 || p1.length > 0 || !trialComplete || !visualComplete, exportRecommendation: p0.length || p1.length || !trialComplete || !visualComplete ? "human_review_required" : "shadow_only", templateExpansionAllowed: false, commercialReady: false };
}
