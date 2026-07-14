import type { DocumentAnalysis, DocumentBlock, DocumentPage } from "@/lib/document-analysis";
import { cleanText } from "@/lib/text-sanitize";

export type BeautifySeverity = "info" | "warn" | "risk";

export type BeautifyPageDiagnosis = {
  page: number;
  role: string;
  originalTitle: string;
  detectedIssues: Array<{
    severity: BeautifySeverity;
    title: string;
    detail: string;
    autoFixable: boolean;
  }>;
  preserve: string[];
  rewriteActions: string[];
  recommendedLayout: string;
  targetVisualRole: string;
  optimizedTitle?: string;
  optimizedBullets?: string[];
  diffSummary?: string[];
};

export type BeautifyPlan = {
  sourceFileName: string;
  sourceKind: string;
  originalPageCount: number;
  originalBlockCount: number;
  diagnosisScore: number;
  level: "可直接美化" | "需要重排" | "需要补资料";
  globalIssues: string[];
  preserveStrategy: string[];
  redesignStrategy: string[];
  pageDiagnoses: BeautifyPageDiagnosis[];
  exportNotes: string[];
  createdAt: string;
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function blockTextLength(blocks: DocumentBlock[]) {
  return blocks.reduce((sum, block) => sum + cleanText(block.text).length, 0);
}

function roleForPage(page: DocumentPage, index: number, total: number) {
  const text = cleanText(`${page.title} ${page.summary} ${page.blocks.map((block) => block.text).join(" ")}`);
  if (index === 0) return "封面识别与标题层级重建";
  if (index === total - 1 || /总结|展望|谢谢|联系|下一步|行动/.test(text)) return "收束页与行动建议";
  if (/目录|contents|agenda|大纲/.test(text.toLowerCase())) return "目录页信息架构";
  if (/数据|指标|增长|预算|成本|收入|利润|%|同比|环比/.test(text)) return "数据页视觉化";
  if (/流程|步骤|路径|计划|时间|阶段|roadmap|timeline/i.test(text)) return "流程页重排";
  if (/问题|痛点|风险|挑战|不足/.test(text)) return "问题与风险页";
  if (/方案|架构|能力|功能|平台|系统/.test(text)) return "方案结构页";
  return "内容页层级优化";
}

function layoutForRole(role: string) {
  if (/封面/.test(role)) return "cover_clean";
  if (/目录/.test(role)) return "agenda_list";
  if (/数据/.test(role)) return "metric_dashboard";
  if (/流程/.test(role)) return "timeline";
  if (/风险|问题/.test(role)) return "risk_table";
  if (/方案|架构/.test(role)) return "architecture_diagram";
  if (/收束/.test(role)) return "summary_action";
  return "card_grid";
}

function pageIssues(page: DocumentPage, role: string) {
  const issues: BeautifyPageDiagnosis["detectedIssues"] = [];
  const textLength = blockTextLength(page.blocks);
  const title = cleanText(page.title);
  const imageCount = page.imageCount || page.blocks.filter((block) => block.type === "image").length;
  const tableCount = page.tableCount || page.blocks.filter((block) => block.type === "table").length;
  const blockCount = page.blockCount || page.blocks.length;

  if (!title || /^第\s*\d+\s*页$/.test(title)) {
    issues.push({
      severity: "warn",
      title: "页面标题缺少观点",
      detail: "原稿标题偏占位，无法让读者快速判断本页结论。",
      autoFixable: true
    });
  }
  if (textLength > 160) {
    issues.push({
      severity: "risk",
      title: "文字密度过高",
      detail: "该页正文过长，需要压缩为结论句、卡片或表格，否则导出后容易拥挤。",
      autoFixable: true
    });
  }
  if (blockCount >= 8) {
    issues.push({
      severity: "risk",
      title: "内容块过多",
      detail: "原稿信息切得太碎，需要合并为 3-5 个视觉模块。",
      autoFixable: true
    });
  }
  if (/数据|流程|方案|架构|风险/.test(role) && imageCount === 0 && tableCount === 0) {
    issues.push({
      severity: "warn",
      title: "缺少视觉承载",
      detail: "该页角色需要图表、流程或结构化模块，目前主要是文字。",
      autoFixable: true
    });
  }
  if (!issues.length) {
    issues.push({
      severity: "info",
      title: "结构可保留",
      detail: "该页内容结构基本可用，优先统一版式、字体和留白。",
      autoFixable: true
    });
  }
  return issues;
}

function preserveForPage(page: DocumentPage) {
  const blocks = page.blocks.slice(0, 4).map((block) => cleanText(block.text).slice(0, 34)).filter(Boolean);
  return [
    cleanText(page.title) ? `保留原页主题：${cleanText(page.title)}` : "保留原页主题关系",
    ...blocks.map((text) => `保留内容块：${text}`)
  ].slice(0, 5);
}

function rewriteActionsForPage(role: string, issues: BeautifyPageDiagnosis["detectedIssues"]) {
  const actions = new Set<string>();
  if (issues.some((issue) => /标题/.test(issue.title))) actions.add("重写标题为观点句");
  if (issues.some((issue) => /文字密度/.test(issue.title))) actions.add("压缩长段落为 3-5 个短句模块");
  if (issues.some((issue) => /视觉承载/.test(issue.title))) actions.add("补充可编辑图表、流程或卡片结构");
  if (/数据/.test(role)) actions.add("把关键数字转成指标卡和柱状图");
  if (/流程/.test(role)) actions.add("把步骤转成时间线或路线图");
  if (/方案|架构/.test(role)) actions.add("把能力模块转成架构图");
  if (/风险|问题/.test(role)) actions.add("把风险改成问题-影响-动作表");
  actions.add("统一字体层级、对齐、留白和色彩");
  return [...actions].slice(0, 5);
}

export function createBeautifyPlan(input: { analysis?: DocumentAnalysis; prompt: string }): BeautifyPlan | undefined {
  const analysis = input.analysis;
  if (!analysis || analysis.sourceKind !== "pptx") return undefined;

  const pages = analysis.pages.length
    ? analysis.pages
    : [{
        page: 1,
        title: cleanText(input.prompt, analysis.fileName).slice(0, 24),
        summary: analysis.summary,
        blockCount: analysis.blockCount,
        imageCount: analysis.blocks.filter((block) => block.type === "image").length,
        tableCount: analysis.blocks.filter((block) => block.type === "table").length,
        blocks: analysis.blocks
      }];

  const pageDiagnoses = pages.slice(0, 14).map((page, index) => {
    const role = roleForPage(page, index, pages.length);
    const issues = pageIssues(page, role);
    return {
      page: page.page,
      role,
      originalTitle: cleanText(page.title, `第 ${page.page} 页`),
      detectedIssues: issues,
      preserve: preserveForPage(page),
      rewriteActions: rewriteActionsForPage(role, issues),
      recommendedLayout: layoutForRole(role),
      targetVisualRole: role.replace(/重建|优化|重排/g, "呈现")
    };
  });

  const riskCount = pageDiagnoses.flatMap((page) => page.detectedIssues).filter((issue) => issue.severity === "risk").length;
  const warnCount = pageDiagnoses.flatMap((page) => page.detectedIssues).filter((issue) => issue.severity === "warn").length;
  const parsedScore = analysis.blockCount > 0 ? 18 : 0;
  const structureScore = Math.min(32, pageDiagnoses.length * 3);
  const visualScore = Math.min(20, analysis.pages.reduce((sum, page) => sum + Math.min(2, page.imageCount + page.tableCount), 0) * 3);
  const diagnosisScore = clamp(38 + parsedScore + structureScore + visualScore - riskCount * 8 - warnCount * 3);
  const level: BeautifyPlan["level"] = diagnosisScore >= 78 ? "可直接美化" : diagnosisScore >= 58 ? "需要重排" : "需要补资料";

  return {
    sourceFileName: analysis.fileName,
    sourceKind: analysis.sourceKind,
    originalPageCount: analysis.pageCount,
    originalBlockCount: analysis.blockCount,
    diagnosisScore,
    level,
    globalIssues: [
      riskCount ? `${riskCount} 个高风险排版问题需要优先压缩和重排。` : "",
      warnCount ? `${warnCount} 个层级或视觉承载问题需要统一修复。` : "",
      analysis.blockCount === 0 ? "原稿没有解析到正文，建议重新上传或提供文字稿。" : ""
    ].filter(Boolean),
    preserveStrategy: [
      "保留原稿主题、页序和核心内容块。",
      "保留表格、图片和关键数据的引用关系。",
      "不把原稿内容改写成全新主题，优先做结构化重排。"
    ],
    redesignStrategy: [
      "将长段落压缩为结论句、指标卡、流程图或表格。",
      "统一标题层级、字号、留白、对齐和色彩。",
      "按页面角色分配版式，避免整套 PPT 套同一模板。",
      "导出 PPTX 时保留可编辑文本和结构化模块。"
    ],
    pageDiagnoses,
    exportNotes: [
      "美化结果会以可编辑 PPTX 输出，文字和结构模块可继续修改。",
      "若原稿图片无法解析，会以可替换视觉占位保留位置和说明。",
      "低置信页面会在评审中枢中标记，建议导出前逐页确认。"
    ],
    createdAt: new Date().toISOString()
  };
}
