import type { CanvasProject, DesignSlide, SlideLayout, TeacherPptStyle, TeacherTheme } from "@/lib/canvas-data";
import type { PPTType } from "@/lib/ppt-review-rulebase";

export type DesignPalette = {
  ink: string;
  muted: string;
  line: string;
  soft: string;
  paper: string;
  pale: string;
  accent: string;
  accent2: string;
  good: string;
  warm: string;
  danger: string;
};

export type DeckDesignProfile = {
  id: string;
  name: string;
  label: string;
  pptType: PPTType;
  palette: DesignPalette;
  coverLabel: string;
  mood: string;
  imageStyle: string;
  layoutRhythm: SlideLayout[];
  density: "airy" | "balanced" | "dense";
  titleMax: number;
  subtitleMax: number;
};

export const designProfiles: Record<PPTType, DeckDesignProfile> = {
  project_report: {
    id: "gov-blue-grid",
    name: "政务蓝 · 评审汇报",
    label: "GOVERNANCE REVIEW",
    pptType: "project_report",
    palette: {
      ink: "101828",
      muted: "667085",
      line: "D9E2F2",
      soft: "F5F8FF",
      paper: "FFFFFF",
      pale: "EAF2FF",
      accent: "1D5ED8",
      accent2: "6B7CFF",
      good: "16A34A",
      warm: "D97706",
      danger: "DC2626"
    },
    coverLabel: "PROJECT REVIEW",
    mood: "政务、清晰、克制、可落地",
    imageStyle: "真实高校数字化平台、浅色政务汇报、现代教学空间、数据看板氛围，不要文字水印",
    layoutRhythm: ["cover", "split", "stats", "process", "matrix", "timeline", "matrix", "checklist", "comparison", "closing", "evidence"],
    density: "balanced",
    titleMax: 24,
    subtitleMax: 86
  },
  travel_guide: {
    id: "editorial-travel",
    name: "旅行杂志 · 路线攻略",
    label: "TRAVEL ITINERARY",
    pptType: "travel_guide",
    palette: {
      ink: "172033",
      muted: "667085",
      line: "E8EEF7",
      soft: "F7FBFF",
      paper: "FFFFFF",
      pale: "E9F4FF",
      accent: "2F7CFF",
      accent2: "12B8A6",
      good: "12B76A",
      warm: "F97316",
      danger: "E11D48"
    },
    coverLabel: "CITY GUIDE",
    mood: "真实目的地、杂志感、路线清楚、轻盈高级",
    imageStyle: "真实城市旅行摄影、清晨自然光、干净留白、适合PPT封面和路线页，不要文字水印",
    layoutRhythm: ["cover", "agenda", "day-route", "comparison", "map", "cards", "stats", "checklist", "source"],
    density: "airy",
    titleMax: 22,
    subtitleMax: 78
  },
  company_profile: {
    id: "corporate-minimal",
    name: "企业灰蓝 · 信任背书",
    label: "COMPANY PROFILE",
    pptType: "company_profile",
    palette: {
      ink: "111827",
      muted: "64748B",
      line: "DCE3ED",
      soft: "F7F9FC",
      paper: "FFFFFF",
      pale: "EEF3F8",
      accent: "2563EB",
      accent2: "0F766E",
      good: "16A34A",
      warm: "F59E0B",
      danger: "DC2626"
    },
    coverLabel: "CORPORATE STORY",
    mood: "可信、专业、干净、适合客户或招投标",
    imageStyle: "真实企业办公、生产现场或产品细节，高级商业摄影，浅色背景，不要文字水印",
    layoutRhythm: ["cover", "stats", "timeline", "matrix", "cards", "comparison", "closing"],
    density: "balanced",
    titleMax: 24,
    subtitleMax: 84
  },
  product_proposal: {
    id: "product-blueprint",
    name: "产品蓝图 · 解决方案",
    label: "PRODUCT SOLUTION",
    pptType: "product_proposal",
    palette: {
      ink: "111827",
      muted: "667085",
      line: "DDE7F5",
      soft: "F7FAFF",
      paper: "FFFFFF",
      pale: "EAF4FF",
      accent: "0B63F6",
      accent2: "7C3AED",
      good: "10B981",
      warm: "F97316",
      danger: "E11D48"
    },
    coverLabel: "SOLUTION DECK",
    mood: "企业级、技术可信、结构清楚、有采购判断感，像产品蓝图而不是模板宣传页",
    imageStyle: "企业级 AI 产品解决方案信息图、工作流编排、知识库、API 集成、监控看板、真实业务协作场景，浅色高级，不要文字水印",
    layoutRhythm: ["cover", "split", "process", "timeline", "matrix", "comparison", "timeline", "checklist", "evidence", "stats", "closing"],
    density: "balanced",
    titleMax: 24,
    subtitleMax: 86
  },
  business_bp: {
    id: "investor-clean",
    name: "投资人白底 · 增长叙事",
    label: "INVESTOR BP",
    pptType: "business_bp",
    palette: {
      ink: "18181B",
      muted: "71717A",
      line: "E4E4E7",
      soft: "FAFAFF",
      paper: "FFFFFF",
      pale: "F1EEFF",
      accent: "6D5DFC",
      accent2: "111827",
      good: "10B981",
      warm: "F59E0B",
      danger: "E11D48"
    },
    coverLabel: "INVESTOR BRIEF",
    mood: "增长、清晰、克制、面向投资判断",
    imageStyle: "创业团队、增长数据、产品场景、现代商业摄影，浅色高级，不要文字水印",
    layoutRhythm: ["cover", "stats", "split", "process", "matrix", "comparison", "timeline", "closing"],
    density: "balanced",
    titleMax: 22,
    subtitleMax: 82
  },
  financial_analysis: {
    id: "finance-ink",
    name: "财报墨绿 · 数据分析",
    label: "FINANCIAL ANALYSIS",
    pptType: "financial_analysis",
    palette: {
      ink: "102A28",
      muted: "64748B",
      line: "D7E8E2",
      soft: "F5FBF8",
      paper: "FFFFFF",
      pale: "DFF7EF",
      accent: "0F766E",
      accent2: "2563EB",
      good: "16A34A",
      warm: "D97706",
      danger: "DC2626"
    },
    coverLabel: "FINANCE REVIEW",
    mood: "数据可信、口径清楚、分析克制",
    imageStyle: "财务分析、商业数据、真实办公场景、简洁图表背景，不要文字水印",
    layoutRhythm: ["cover", "stats", "bar-chart" as SlideLayout, "comparison", "table" as SlideLayout, "evidence", "closing"],
    density: "dense",
    titleMax: 24,
    subtitleMax: 92
  },
  courseware: {
    id: "learning-warm",
    name: "课程暖白 · 教学课件",
    label: "LEARNING DECK",
    pptType: "courseware",
    palette: {
      ink: "1F2937",
      muted: "6B7280",
      line: "E7E2D8",
      soft: "FFFDF7",
      paper: "FFFFFF",
      pale: "FFF1D6",
      accent: "E9503F",
      accent2: "2563EB",
      good: "059669",
      warm: "F59E0B",
      danger: "DC2626"
    },
    coverLabel: "COURSEWARE",
    mood: "清晰、教学友好、重点明确",
    imageStyle: "课堂教学、学习场景、白板与材料、温暖自然光，不要文字水印",
    layoutRhythm: ["cover", "agenda", "process", "cards", "checklist", "quote", "closing"],
    density: "airy",
    titleMax: 24,
    subtitleMax: 84
  },
  policy_report: {
    id: "policy-red-blue",
    name: "政策红蓝 · 贯彻落实",
    label: "POLICY BRIEF",
    pptType: "policy_report",
    palette: {
      ink: "1F2937",
      muted: "6B7280",
      line: "E4E7EC",
      soft: "FAFAFA",
      paper: "FFFFFF",
      pale: "FFF1F1",
      accent: "C2410C",
      accent2: "1D5ED8",
      good: "16A34A",
      warm: "F59E0B",
      danger: "DC2626"
    },
    coverLabel: "POLICY REPORT",
    mood: "稳重、政策对齐、执行导向",
    imageStyle: "政务汇报、政策文件、城市公共服务、浅色稳重，不要文字水印",
    layoutRhythm: ["cover", "split", "timeline", "matrix", "comparison", "checklist", "closing"],
    density: "balanced",
    titleMax: 24,
    subtitleMax: 88
  },
  event_plan: {
    id: "event-bright",
    name: "活动亮白 · 执行策划",
    label: "EVENT PLAN",
    pptType: "event_plan",
    palette: {
      ink: "18181B",
      muted: "71717A",
      line: "E4E4E7",
      soft: "FCFCFF",
      paper: "FFFFFF",
      pale: "F5F3FF",
      accent: "7C3AED",
      accent2: "F97316",
      good: "10B981",
      warm: "F59E0B",
      danger: "E11D48"
    },
    coverLabel: "EVENT PLAN",
    mood: "执行清楚、有记忆点、轻活力",
    imageStyle: "真实活动现场、舞台灯光、品牌活动物料、干净构图，不要文字水印",
    layoutRhythm: ["cover", "split", "cards", "timeline", "matrix", "stats", "checklist", "closing"],
    density: "balanced",
    titleMax: 22,
    subtitleMax: 82
  },
  general_report: {
    id: "agent-clean",
    name: "Agent 白底 · 通用汇报",
    label: "AI PPT AGENT",
    pptType: "general_report",
    palette: {
      ink: "171719",
      muted: "667085",
      line: "E7EAF1",
      soft: "F7F8FC",
      paper: "FFFFFF",
      pale: "EEF4FF",
      accent: "2F7CFF",
      accent2: "6D5DFC",
      good: "12B76A",
      warm: "F97316",
      danger: "E11D48"
    },
    coverLabel: "AI PPT AGENT",
    mood: "简洁、信息清晰、可编辑",
    imageStyle: "高级商务信息图、浅色、真实资料工作台、不要文字水印",
    layoutRhythm: ["cover", "agenda", "split", "matrix", "timeline", "stats", "comparison", "checklist", "closing"],
    density: "balanced",
    titleMax: 24,
    subtitleMax: 86
  }
};

function inferTypeFromText(text: string): PPTType {
  if (/旅游|旅行|攻略|路线|景点|预约|交通/.test(text)) return "travel_guide";
  if (/项目|建设|验收|责任分工|实施|平台|落地|高校|产教融合/.test(text)) return "project_report";
  if (/企业介绍|公司介绍|发展历程|客户案例|资质/.test(text)) return "company_profile";
  if (/产品|解决方案|功能|部署|客户/.test(text)) return "product_proposal";
  if (/BP|融资|投资人|商业模式|市场规模/.test(text)) return "business_bp";
  if (/财报|收入|利润|毛利|同比|现金流/.test(text)) return "financial_analysis";
  if (/课程|课件|教学|培训|学习目标/.test(text)) return "courseware";
  if (/政策|政务|贯彻|主管部门|落实/.test(text)) return "policy_report";
  if (/活动|策划|会务|嘉宾|赞助|执行/.test(text)) return "event_plan";
  return "general_report";
}

const teacherThemePalettes: Record<TeacherTheme, DesignPalette> = {
  book_blue: { ink: "173B66", muted: "5E7085", line: "BDD1E3", soft: "E8F1F7", paper: "F7F2E9", pale: "D8E7F5", accent: "D69F44", accent2: "285D88", good: "257A59", warm: "C7792C", danger: "B42318" },
  rational_teal: { ink: "0D5364", muted: "55747A", line: "A7D4CB", soft: "DFF2EC", paper: "F0F8F4", pale: "EDF7F2", accent: "D67935", accent2: "17685E", good: "237A57", warm: "A85B21", danger: "B42318" },
  warm_orange: { ink: "8B3D23", muted: "78665C", line: "EAB879", soft: "FBE8C8", paper: "FFF8EC", pale: "FFF6E7", accent: "32706B", accent2: "A84D25", good: "287A55", warm: "B95F1B", danger: "B42318" },
  high_contrast: { ink: "171717", muted: "4B4B4B", line: "737373", soft: "EEEEEE", paper: "FFFFFF", pale: "F4F4F4", accent: "171717", accent2: "5A5A5A", good: "166534", warm: "8A4B08", danger: "991B1B" }
};

function teacherDesignProfile(style: TeacherPptStyle): DeckDesignProfile {
  const editorial = style.visualMode === "teaching_editorial";
  const names: Record<TeacherTheme, string> = { book_blue: "书卷蓝", rational_teal: "理性蓝绿", warm_orange: "暖橙米白", high_contrast: "黑白高对比" };
  return {
    ...designProfiles.courseware,
    id: `teacher-${style.visualMode}-${style.theme}`,
    name: `教师课件 · ${names[style.theme]}`,
    label: editorial ? "TEACHING EDITORIAL" : "TEACHING GRID",
    palette: teacherThemePalettes[style.theme],
    coverLabel: "TEACHER PPT",
    mood: editorial ? "教学叙事、节奏清晰、适合阅读与讨论" : "教学结构、层级清楚、适合概念与步骤",
    imageStyle: "课堂投影友好、清晰留白、轻量教学图形，不要文字水印",
    layoutRhythm: editorial ? ["cover", "agenda", "split", "quote", "process", "checklist", "closing"] : ["cover", "agenda", "matrix", "process", "evidence", "checklist", "closing"],
    density: "airy",
    titleMax: 22,
    subtitleMax: 78
  };
}

function profileTypeFromProject(project: CanvasProject): PPTType | undefined {
  const plannedType = project.contentPlan?.pptType;
  if (plannedType === "proposal" || plannedType === "product_intro") return "product_proposal";
  if (plannedType === "project_report") return "project_report";
  if (plannedType === "courseware") return "courseware";
  if (plannedType === "company_profile") return "company_profile";
  if (plannedType === "travel_plan") return "travel_guide";
  if (plannedType === "financial_report") return "financial_analysis";
  if (plannedType === "business_plan") return "business_bp";
  if (plannedType === "policy_interpretation") return "policy_report";
  if (plannedType === "activity_plan") return "event_plan";
  return project.reviewCenter?.pptType;
}

export function getDesignProfile(project: CanvasProject): DeckDesignProfile {
  if (project.teacherStyle) return teacherDesignProfile(project.teacherStyle);
  const type = profileTypeFromProject(project) || inferTypeFromText(`${project.title} ${project.prompt}`);
  return designProfiles[type] || designProfiles.general_report;
}

export function profileForPrompt(prompt: string): DeckDesignProfile {
  return designProfiles[inferTypeFromText(prompt)] || designProfiles.general_report;
}

export function layoutForSlide(profile: DeckDesignProfile, index: number, fallback?: SlideLayout): SlideLayout {
  if (index === 0) return "cover";
  if (fallback && fallback !== "cards") return fallback;
  return profile.layoutRhythm[index % profile.layoutRhythm.length] || fallback || "cards";
}

export type VisualAssetPlan = {
  assetKind: "ai-image" | "native-diagram" | "native-cards" | "none";
  shouldGenerate: boolean;
  reason: string;
  promptGuardrails: string[];
};

export function planVisualAsset(slide: DesignSlide, index: number): VisualAssetPlan {
  const text = `${slide.title || ""} ${slide.subtitle || ""} ${slide.pageIntent || ""} ${slide.tone || ""}`.toLowerCase();
  const layout = String(slide.layout || "").toLowerCase();
  if (index === 0 || layout === "cover") return { assetKind: "ai-image", shouldGenerate: true, reason: "封面使用单一学科情境主视觉", promptGuardrails: ["真实课堂或学科场景", "不出现文字、公式、坐标轴、图表、UI截图和水印", "一侧保留干净标题安全区"] };
  if (/公式|函数|图像|性质|例题|练习|证明|概念|定义|graph|formula|example|practice/.test(text) || ["chart", "graph", "stats", "comparison", "timeline", "process", "matrix", "evidence", "checklist"].includes(layout)) return { assetKind: "native-diagram", shouldGenerate: false, reason: "教学结构由原生图形和数学排版表达", promptGuardrails: ["不调用AI图片", "保留图表、公式和练习的可编辑性"] };
  if (/总结|小结|回顾|summary|review/.test(text)) return { assetKind: "native-cards", shouldGenerate: false, reason: "总结页使用知识卡片和结构化留白", promptGuardrails: ["不调用AI图片", "突出要点层级"] };
  return { assetKind: "none", shouldGenerate: false, reason: "非关键页不添加装饰图", promptGuardrails: ["不调用AI图片"] };
}

export function visualPromptForSlide(profile: DeckDesignProfile, project: CanvasProject, slide: DesignSlide, index: number) {
  const role = slide.pageIntent || slide.tone || "页面设计";
  return [
    `主题：${project.title}`,
    `页面：${slide.title}`,
    `页面角色：${role}`,
    `视觉方向：${profile.imageStyle}`,
    `整体气质：${profile.mood}`,
    index === 0 ? "作为封面主视觉，右侧或背景留出可叠加标题的干净区域。" : "作为页面辅助视觉，不要抢正文层级，适合与图表和卡片叠加。"
  ].join("\n");
}

export function compactForDesign(value: string | undefined, max: number) {
  const clean = (value || "").replace(/\s+/g, " ").trim();
  if ([...clean].length <= max) return clean;
  const separators = ["，", "；", "。", "：", "、", "-", "｜", "|"];
  for (const separator of separators) {
    const head = clean.split(separator)[0]?.trim();
    if (head && [...head].length >= 5 && [...head].length <= max) {
      return head;
    }
  }
  return `${[...clean].slice(0, Math.max(6, max - 1)).join("")}…`;
}
