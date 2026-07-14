import type { DocumentAnalysis } from "@/lib/document-analysis";
import type { ContentPlan, ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";
import type { BeautifyPlan } from "@/lib/ppt-agent/beautify-plan";
import type { DeckEvidenceReport, EvidenceBlock, EvidenceNeed, SlideEvidenceMap, SourceDocument } from "@/lib/ppt-agent/evidence-types";
import type { InformationDensity, LayoutPlan } from "@/lib/ppt-agent/layout-plan";
import type { InformationHierarchy, RecommendedVisualForm, SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";
import type { DeckContentQualityReport, EvidenceSnippet, SlideContentDraft, VisibleContentBlock } from "@/lib/ppt-agent/slide-content-draft";
import type { AcquisitionReport } from "@/lib/ppt-agent/source-acquisition";
import { detectScenarioPlaybookType, getScenarioPlaybook } from "@/lib/ppt-agent/scenario-playbooks";
import type { ReviewCenterState } from "@/lib/ppt-review-center";

export type SourceType = "official" | "encyclopedia" | "travel" | "news" | "community" | "search" | "local" | "document";

export type UploadedAsset = {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "uploaded" | "processing" | "ready" | "error";
  mimeType?: string;
  analysis?: DocumentAnalysis;
};

export type OutlineItem = {
  id: string;
  page: number;
  title: string;
  note: string;
  evidenceBlockIds?: string[];
};

export type ResearchItem = {
  id: string;
  title: string;
  source: string;
  summary: string;
  confidence: number;
  url?: string;
  sourceName?: string;
  sourceType?: SourceType;
  providerTier?: "official_provider" | "experimental_fallback" | "local_or_user";
  status?: "verified" | "search-result" | "fallback";
};

export type PlanItem = {
  id: string;
  page: number;
  title: string;
  layout: string;
  elements: string[];
  evidenceBlockIds?: string[];
};

export type SlideLayout =
  | "cover"
  | "agenda"
  | "section"
  | "day-route"
  | "map"
  | "cards"
  | "budget"
  | "checklist"
  | "split"
  | "matrix"
  | "timeline"
  | "stats"
  | "comparison"
  | "evidence"
  | "quote"
  | "gallery"
  | "process"
  | "closing"
  | "source";

export type SlideSection =
  | {
      type: "hero-image";
      title?: string;
      caption?: string;
      imagePrompt?: string;
      accent?: string;
    }
  | {
      type: "image-strip";
      title?: string;
      items: Array<{ title: string; caption?: string; imagePrompt?: string }>;
    }
  | {
      type: "day-card";
      title?: string;
      cards: Array<{ day?: string; title: string; route?: string; highlights?: string[]; note?: string }>;
    }
  | {
      type: "route-card";
      title?: string;
      origin?: string;
      destination?: string;
      steps: string[];
      note?: string;
    }
  | {
      type: "tips-grid";
      title?: string;
      items: Array<{ title: string; body: string; tag?: string }>;
    }
  | {
      type: "stat-card";
      title?: string;
      stats: Array<{ label: string; value: string; note?: string }>;
    }
  | {
      type: "donut-chart";
      title?: string;
      centerLabel?: string;
      segments: Array<{ label: string; value: number; color?: string }>;
      note?: string;
    }
  | {
      type: "bar-chart";
      title?: string;
      bars: Array<{ label: string; value: number; note?: string }>;
      unit?: string;
    }
  | {
      type: "table";
      title?: string;
      columns: string[];
      rows: string[][];
      note?: string;
    }
  | {
      type: "warning";
      title: string;
      body: string;
      severity?: "info" | "warn" | "high";
    }
  | {
      type: "tag-row";
      tags: string[];
    }
  | {
      type: "timeline";
      title?: string;
      steps: Array<{ label: string; title: string; body?: string }>;
    }
  | {
      type: "quote";
      text: string;
      author?: string;
    }
  | {
      type: "source-note";
      sourceIds?: string[];
      text?: string;
    }
  | {
      type: "callout";
      title: string;
      body: string;
      accent?: string;
    };

export type DesignSlide = {
  id: string;
  title: string;
  subtitle: string;
  tone: string;
  bullets?: string[];
  layout?: SlideLayout;
  visualPrompt?: string;
  speakerNote?: string;
  evidenceBlockIds?: string[];
  sourceIds?: string[];
  pageIntent?: string;
  sections?: SlideSection[];
};

export type TeacherVisualMode = "teaching_editorial" | "teaching_grid";
export type TeacherTheme = "book_blue" | "rational_teal" | "warm_orange" | "high_contrast";
export type TeacherPptStyle = {
  visualMode: TeacherVisualMode;
  theme: TeacherTheme;
};

export type SlideSpec = {
  id: string;
  page: number;
  slideId?: string;
  contentPlanSlideId?: string;
  pagePlanId?: string;
  contentDraftId?: string;
  audienceQuestion?: string;
  coreClaim?: string;
  title: string;
  finalTitle?: string;
  role: string;
  pagePurpose?: string;
  leadSentence?: string;
  claim: string;
  mustProve: string;
  visibleBlocks?: VisibleContentBlock[];
  evidenceSnippets?: EvidenceSnippet[];
  sourceUseSummary?: string;
  confidenceNote?: string;
  evidenceNeed?: string[];
  evidenceNeeds: string[];
  evidenceSourceIds: string[];
  evidenceMapId?: string;
  matchedEvidenceBlocks?: Array<{ summary: string; blockType: string; confidence: number; reliability: string }>;
  evidenceCoverage?: number;
  sourceConfidence?: number;
  unsupportedClaims?: string[];
  lowConfidenceWarnings?: string[];
  userConfirmationNeeded?: string[];
  recommendedVisualForm?: RecommendedVisualForm;
  layoutPlanId?: string;
  selectedLayout?: string;
  layoutFamily?: string;
  informationDensity?: InformationDensity;
  contentSlots?: string[];
  visualSlots?: string[];
  hierarchyRules?: string[];
  exportHints?: string[];
  previewHints?: string[];
  informationHierarchy?: InformationHierarchy;
  qualityChecks?: string[];
  layoutIntent: SlideLayout;
  layoutReason: string;
  visualIntent: string;
  density: "airy" | "balanced" | "dense";
  mustHave: string[];
  avoid: string[];
  scoreRules: Array<{ dimension: string; points: number; rule: string }>;
};

export type DeckSpec = {
  id: string;
  version: string;
  // ── Versioning fields (Phase 4 / 069) ─────────────────────────────────────
  projectId?: string;
  requestId?: string;
  versionId?: string;
  versionNumber?: number;
  contentHash?: string;
  // ────────────────────────────────────────────────────────────────────────────
  pptType: string;
  pptTypeLabel: string;
  audience: string;
  goal: string;
  coreMessage: string;
  expectedDecision: string;
  recommendedSlideCount: number;
  requiredPages: string[];
  forbiddenContent: string[];
  evidenceNeeds: string[];
  styleProfile: string;
  qualityBar: number;
  slideSpecs: SlideSpec[];
  createdAt: string;
};

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  confidence: number;
  sourceName?: string;
  sourceType?: SourceType;
  providerTier?: "official_provider" | "experimental_fallback" | "local_or_user";
  status?: "verified" | "search-result" | "fallback";
};

export type SearchGroup = {
  query: string;
  provider: string;
  providerTier?: "official_provider" | "experimental_fallback" | "local_or_user" | "none";
  results: SearchResult[];
  status?: string;
  error?: string;
  warnings?: string[];
};

export type QualityStatus = "ready" | "needs-review" | "risky";

export type QualityMetric = {
  label: string;
  score: number;
  status: "good" | "warn" | "risk";
  detail: string;
};

export type QualityIssue = {
  id: string;
  severity: "info" | "warn" | "risk";
  title: string;
  detail: string;
  slideId?: string;
  slideTitle?: string;
  action?: string;
};

export type ProjectQualityReport = {
  score: number;
  status: QualityStatus;
  summary: string;
  metrics: QualityMetric[];
  issues: QualityIssue[];
  updatedAt: string;
  // Phase 6 / 069 – teacher courseware only; absent for general PPT
  engineeringScore?: number;        // Build quality: layout, structure, overflow, editability
  teacherReadinessScore?: number;   // Pedagogy quality: teaching flow, module coverage, content depth
  commercialReady?: false;          // Always false in this release; absent for non-teacher paths
};

export type CanvasProject = {
  title: string;
  prompt: string;
  mode: "agent" | "reference" | "beautify";
  outline: OutlineItem[];
  research: ResearchItem[];
  plan: PlanItem[];
  slides: DesignSlide[];
  deckSpec?: DeckSpec;
  quality?: ProjectQualityReport;
  reviewCenter?: ReviewCenterState;
  contentPlan?: ContentPlan;
  slidePagePlans?: SlidePagePlan[];
  layoutPlans?: LayoutPlan[];
  beautifyPlan?: BeautifyPlan;
  sourceDocuments?: SourceDocument[];
  acquisitionReport?: AcquisitionReport;
  evidenceBlocks?: EvidenceBlock[];
  evidenceNeeds?: EvidenceNeed[];
  slideEvidenceMaps?: SlideEvidenceMap[];
  evidenceReport?: DeckEvidenceReport;
  contentDrafts?: SlideContentDraft[];
  deckContentQualityReport?: DeckContentQualityReport;
  teacherStyle?: TeacherPptStyle;
  templateId?: string;
  lessonType?: string;
};

export const beijingResearchSources: ResearchItem[] = [
  {
    id: "beijing-dpm",
    title: "故宫博物院参观须知",
    source: "故宫博物院",
    sourceName: "故宫博物院",
    sourceType: "official",
    status: "verified",
    url: "https://www.dpm.org.cn/singles_detail/259831.html",
    summary: "用于核对实名预约、入馆动线、开放规则和故宫相关参观提示。",
    confidence: 96
  },
  {
    id: "beijing-dpm-ticket",
    title: "故宫博物院在线订票",
    source: "故宫博物院",
    sourceName: "故宫博物院",
    sourceType: "official",
    status: "verified",
    url: "https://ticket.dpm.org.cn/",
    summary: "用于提示门票预约、证件要求、放票和余票确认。",
    confidence: 95
  },
  {
    id: "beijing-national-museum",
    title: "中国国家博物馆参观服务",
    source: "中国国家博物馆",
    sourceName: "中国国家博物馆",
    sourceType: "official",
    status: "verified",
    url: "https://m.chnmuseum.cn/cg/",
    summary: "用于核对开放时间、预约渠道、入馆须知和展览动线。",
    confidence: 93
  },
  {
    id: "beijing-summer-palace",
    title: "颐和园官方网站",
    source: "颐和园",
    sourceName: "颐和园",
    sourceType: "official",
    status: "verified",
    url: "https://www.summerpalace.net.cn/",
    summary: "用于支撑皇家园林、海淀片区和景区服务信息。",
    confidence: 91
  },
  {
    id: "beijing-badaling",
    title: "八达岭长城官方旅游服务",
    source: "八达岭长城",
    sourceName: "八达岭长城",
    sourceType: "official",
    status: "verified",
    url: "https://www.badaling.cn/",
    summary: "用于核对长城线路、景区服务、票务和交通提示。",
    confidence: 88
  },
  {
    id: "beijing-culture",
    title: "北京市文化和旅游局",
    source: "北京市文化和旅游局",
    sourceName: "北京市文化和旅游局",
    sourceType: "official",
    status: "verified",
    url: "https://whlyj.beijing.gov.cn/",
    summary: "用于补充北京文旅公共服务、政策和便民信息。",
    confidence: 84
  }
];

export const hangzhouResearchSources: ResearchItem[] = [
  {
    id: "hangzhou-travel",
    title: "杭州旅游官方资讯",
    source: "杭州网旅游频道",
    sourceName: "杭州旅游",
    sourceType: "official",
    status: "verified",
    url: "https://travel.hangzhou.com.cn/",
    summary: "用于补充杭州城市活动、景点资讯、线路建议和文旅服务信息。",
    confidence: 90
  },
  {
    id: "hangzhou-westlake",
    title: "西湖风景名胜区",
    source: "西湖风景名胜区",
    sourceName: "西湖风景名胜区",
    sourceType: "official",
    status: "verified",
    url: "https://www.hzwestlake.gov.cn/",
    summary: "用于核对西湖景区概览、游览提示、公共服务和景区管理信息。",
    confidence: 92
  },
  {
    id: "hangzhou-gov",
    title: "杭州市人民政府",
    source: "杭州市人民政府",
    sourceName: "杭州市人民政府",
    sourceType: "official",
    status: "verified",
    url: "https://www.hangzhou.gov.cn/",
    summary: "用于核对城市公共信息、政策发布和政务服务入口。",
    confidence: 84
  }
];

const genericLayouts: SlideLayout[] = ["cover", "agenda", "section", "split", "matrix", "timeline", "stats", "evidence", "comparison", "process", "checklist", "closing"];

const genericBlueprints = [
  ["封面", "用一句话说明主题和成果目标", ["主题", "对象", "目标"]],
  ["目录与叙事线", "建立听众对整套 PPT 的路径感", ["背景", "洞察", "方案", "落地"]],
  ["背景与问题", "说明为什么现在必须讨论这个主题", ["外部趋势", "用户痛点", "机会窗口"]],
  ["核心洞察", "把调研信息压缩成可决策的判断", ["关键发现", "证据来源", "对业务的影响"]],
  ["总体方案", "用结构化框架展示完整解法", ["能力模块", "协作机制", "交付成果"]],
  ["页面级策划", "把每一页的内容、证据和视觉元素讲清楚", ["主张", "素材", "版式"]],
  ["实施路径", "用阶段和里程碑说明如何落地", ["启动", "建设", "运营"]],
  ["资源与预算", "说明投入结构、关键假设和风险缓冲", ["人力", "费用", "资源"]],
  ["效果指标", "定义验收标准和复盘方式", ["业务指标", "体验指标", "交付指标"]],
  ["风险与预案", "提前处理高概率的不确定性", ["风险", "监控", "备选方案"]],
  ["行动清单", "把结论落到下一步动作", ["责任人", "时间点", "交付物"]]
] as const;

function isGenericTravelPrompt(prompt: string) {
  return /(旅游|旅行|游|攻略|行程|景点|自由行|一日游|二日游|三日游|四日游|五日游)/i.test(prompt);
}

function isProjectReportPrompt(prompt: string) {
  return /(项目汇报|项目申报|建设方案|立项|验收|主管部门|政务|可落地|平台项目|责任分工|推进计划)/.test(prompt);
}

function inferTravelDays(prompt: string) {
  if (/(一日游|1\s*日|一日|一天|1\s*天)/.test(prompt)) return 1;
  if (/(二日游|2\s*日|二日|两天|2\s*天)/.test(prompt)) return 2;
  if (/(三日游|3\s*日|三日|三天|3\s*天)/.test(prompt)) return 3;
  if (/(四日游|4\s*日|四日|四天|4\s*天)/.test(prompt)) return 4;
  if (/(五日游|5\s*日|五日|五天|5\s*天)/.test(prompt)) return 5;
  return 1;
}

function inferTitle(prompt: string) {
  const stripped = prompt
    .replace(/^帮我(做|生成|制作)?一份?/, "")
    .replace(/PPTX?/gi, "")
    .replace(/(?:，|,|；|;)?\s*(面向|要求|包含|需要|体现|突出|包括|用于|给|受众|风格|页数|导出).*$/g, "")
    .replace(/[。！？\n].*$/g, "")
    .trim();
  return stripped.length > 32 ? `${stripped.slice(0, 32)}…` : stripped || "AI PPT Agent 演示文稿";
}

function inferTravelCity(prompt: string) {
  const match = prompt.match(/([\u4e00-\u9fa5]{2,8})(?:\s*[0-9一二三四五六七八九十]+\s*日)?(?:深度)?(?:旅游|旅行|游|攻略|行程|自由行)/);
  return match?.[1]?.replace(/帮我做一份|帮我生成一份|帮我制作一份/g, "").trim() || "城市";
}

function makeGenericSections(title: string, subtitle: string, bullets: readonly string[], layout: SlideLayout, index: number): SlideSection[] {
  const normalizedBullets = bullets.length ? [...bullets] : ["核心判断", "支撑证据", "行动建议"];

  if (layout === "cover") {
    return [
      { type: "tag-row", tags: ["需求理解", "资料检索", "内容策划", "可编辑 PPTX"] },
      { type: "hero-image", title, caption: subtitle, imagePrompt: `${title} 高级商务 PPT 封面，清晰层级，真实项目质感` },
      {
        type: "stat-card",
        stats: [
          { label: "输出", value: "10-12 页", note: "可编辑 PPTX" },
          { label: "流程", value: "5 阶段", note: "调研到设计" },
          { label: "风格", value: "商务简约", note: "按内容定制" }
        ]
      }
    ];
  }

  if (layout === "agenda" || layout === "process" || layout === "timeline") {
    return [
      {
        type: "timeline",
        title: "叙事路径",
        steps: normalizedBullets.slice(0, 5).map((bullet, bulletIndex) => ({
          label: `0${bulletIndex + 1}`,
          title: bullet,
          body: bulletIndex === 0 ? "先定义问题与边界" : bulletIndex === normalizedBullets.length - 1 ? "最后落到行动与验收" : "承接上一页结论继续展开"
        }))
      }
    ];
  }

  if (layout === "stats" || layout === "budget") {
    return [
      {
        type: "stat-card",
        title: "关键指标",
        stats: normalizedBullets.slice(0, 4).map((bullet, bulletIndex) => ({
          label: `指标 ${bulletIndex + 1}`,
          value: bullet.length > 10 ? bullet.slice(0, 10) : bullet,
          note: bullet
        }))
      },
      {
        type: "bar-chart",
        title: "优先级分布",
        unit: "%",
        bars: normalizedBullets.slice(0, 4).map((bullet, bulletIndex) => ({
          label: bullet.length > 8 ? bullet.slice(0, 8) : bullet,
          value: 84 - bulletIndex * 9,
          note: "依据内容密度估算"
        }))
      }
    ];
  }

  if (layout === "comparison") {
    return [
      {
        type: "table",
        title: "方案对比",
        columns: ["维度", "推荐方案", "备选方案"],
        rows: [
          ["目标", normalizedBullets[0] || "主方案", normalizedBullets[2] || "备选路径"],
          ["优势", normalizedBullets[1] || "稳定可控", normalizedBullets[3] || "灵活补充"],
          ["建议", "优先采用", "作为风险缓冲"]
        ]
      },
      { type: "warning", title: "决策提示", body: "不要只比较视觉效果，也要比较信息完整性、执行成本和后续可编辑性。", severity: "info" }
    ];
  }

  if (layout === "evidence" || layout === "source") {
    return [
      {
        type: "tips-grid",
        title: "资料映射",
        items: normalizedBullets.slice(0, 4).map((bullet, bulletIndex) => ({
          title: `证据 ${bulletIndex + 1}`,
          body: bullet,
          tag: bulletIndex % 2 ? "补充" : "核心"
        }))
      },
      { type: "source-note", text: "本页保留资料来源映射，后续可以在工作台继续回溯和替换依据。" }
    ];
  }

  if (layout === "checklist") {
    return [
      {
        type: "tips-grid",
        title: "执行清单",
        items: normalizedBullets.slice(0, 6).map((bullet, bulletIndex) => ({
          title: `检查 ${bulletIndex + 1}`,
          body: bullet,
          tag: "待确认"
        }))
      }
    ];
  }

  if (layout === "quote" || layout === "section") {
    return [
      { type: "quote", text: subtitle || title, author: "AI PPT Agent" },
      { type: "tag-row", tags: normalizedBullets.slice(0, 4) }
    ];
  }

  return [
    { type: "callout", title, body: subtitle || normalizedBullets[0], accent: index % 2 ? "purple" : "blue" },
    {
      type: "tips-grid",
      title: "页面内容策划",
      items: normalizedBullets.slice(0, 4).map((bullet, bulletIndex) => ({
        title: `模块 ${bulletIndex + 1}`,
        body: bullet,
        tag: bulletIndex === 0 ? "主张" : "支撑"
      }))
    },
    { type: "hero-image", title: "视觉方向", caption: `${title}，信息图与卡片式布局结合`, imagePrompt: `${title} 高级信息图风格 PPT 页面` }
  ];
}

function makeGenericCityTravelSections(city: string, slide: DesignSlide, index: number): SlideSection[] {
  const bullets = slide.bullets?.length ? slide.bullets : ["路线规划", "交通建议", "预约提醒", "预算控制"];

  if (index === 0) {
    return [
      { type: "tag-row", tags: ["旅行攻略", "路线策划", "交通避坑", "可编辑 PPTX"] },
      { type: "hero-image", title: slide.title, caption: slide.subtitle, imagePrompt: `${city}旅行攻略 PPT 封面，真实目的地气质，高级干净` },
      {
        type: "stat-card",
        stats: [
          { label: "行程", value: /一日/.test(slide.title) ? "1 天" : "多日", note: "按体力与交通拆分" },
          { label: "资料", value: "待检索", note: "可在资料模块补齐官方源" },
          { label: "输出", value: "可编辑 PPTX", note: "文字与图形均可修改" }
        ]
      }
    ];
  }

  if (slide.layout === "agenda") {
    return [
      {
        type: "timeline",
        title: /一日/.test(slide.title) || bullets.some((item) => /上午|下午|傍晚/.test(item)) ? "一日游时间骨架" : "行程骨架",
        steps: bullets.slice(0, 5).map((bullet, bulletIndex) => ({
          label: bulletIndex === 0 ? "08:00" : bulletIndex === 1 ? "12:00" : bulletIndex === 2 ? "15:00" : bulletIndex === 3 ? "18:00" : "备选",
          title: bullet.split("：").pop() || bullet,
          body: bullet
        }))
      },
      {
        type: "tips-grid",
        title: "策划原则",
        items: [
          { title: "先重后轻", body: "把必须预约、不可替换的核心景点放在体力最好或交通最稳的时段。", tag: "路线" },
          { title: "少跨城区", body: "控制主线移动，避免为了单点打卡打乱整天节奏。", tag: "交通" },
          { title: "留备用页", body: "高温、雨雪、闭馆和排队都需要备用路线。", tag: "风险" }
        ]
      }
    ];
  }

  if (slide.layout === "day-route") {
    return [
      {
        type: "day-card",
        title: `${city}主线卡`,
        cards: bullets.slice(0, 4).map((bullet, bulletIndex) => ({
          day: bulletIndex === 0 ? "上午" : bulletIndex === 1 ? "中午" : bulletIndex === 2 ? "下午" : "傍晚",
          title: bullet.split("：").pop() || bullet,
          route: bullet,
          highlights: bulletIndex === 0 ? ["优先预约", "低回头路"] : bulletIndex === 1 ? ["就近用餐", "体力缓冲"] : ["拍照节点", "备用替换"],
          note: "出发前再按官方开放信息核对"
        }))
      },
      { type: "warning", title: "执行提醒", body: "热门景点的预约、安检和排队会影响动线，建议至少保留 60-90 分钟机动时间。", severity: "warn" }
    ];
  }

  if (slide.layout === "comparison") {
    return [
      {
        type: "table",
        title: "备选模块选择",
        columns: ["方案", "适合人群", "注意事项"],
        rows: [
          ["主方案", "首次到访 / 招牌景点", "优先确认预约和交通"],
          ["慢行方案", "亲友轻松游 / 拍照", "减少跨区移动"],
          ["雨天方案", "天气不佳或体力有限", "切换室内或短线"]
        ]
      },
      {
        type: "donut-chart",
        title: "推荐权重",
        centerLabel: "选择模型",
        segments: [
          { label: "交通稳定", value: 35, color: "2F7CFF" },
          { label: "体验密度", value: 30, color: "6D5DFC" },
          { label: "排队风险", value: 20, color: "F59E0B" },
          { label: "体力消耗", value: 15, color: "12B76A" }
        ],
        note: "按普通亲友出行场景估算，可根据人群调整。"
      }
    ];
  }

  if (slide.layout === "map") {
    return [
      {
        type: "route-card",
        title: "交通主线",
        origin: `${city}住宿点 / 交通枢纽`,
        destination: `${city}核心游线`,
        steps: bullets.slice(0, 5),
        note: "跨区移动只保留必要段，打车作为补充而非默认方案。"
      },
      {
        type: "tips-grid",
        title: "交通避坑",
        items: [
          { title: "高峰", body: "核心城区优先轨道交通或步行，不把地面交通作为刚性节点。", tag: "时间" },
          { title: "景区", body: "进出热门景区提前确认接驳点和步行距离。", tag: "动线" },
          { title: "返程", body: "返程日前减少远距离跨区，给车站/机场预留缓冲。", tag: "收尾" }
        ]
      }
    ];
  }

  if (slide.layout === "stats") {
    return [
      {
        type: "stat-card",
        title: "预算拆解",
        stats: [
          { label: "门票预约", value: "按官方核对", note: "热门场馆以预约页面为准" },
          { label: "餐饮", value: "舒适型预留", note: "按城市消费水平调整" },
          { label: "市内交通", value: "步行+轨交", note: "跨区另算" },
          { label: "机动", value: "15%-20%", note: "天气、排队、临时替换" }
        ]
      },
      {
        type: "bar-chart",
        title: "时间占比",
        unit: "%",
        bars: [
          { label: "游览", value: 46 },
          { label: "交通", value: 18 },
          { label: "用餐休息", value: 21 },
          { label: "机动缓冲", value: 15 }
        ]
      }
    ];
  }

  if (slide.layout === "checklist") {
    return [
      {
        type: "tips-grid",
        title: "出发前检查",
        items: bullets.slice(0, 6).map((bullet, bulletIndex) => ({
          title: `检查 ${bulletIndex + 1}`,
          body: bullet,
          tag: bulletIndex < 2 ? "必须" : "建议"
        }))
      },
      { type: "warning", title: "不要硬塞行程", body: "如果遇到天气、闭馆或排队，优先删掉低优先级点位，而不是压缩核心体验。", severity: "high" }
    ];
  }

  if (slide.layout === "source") {
    return [
      {
        type: "tips-grid",
        title: "资料来源置信度",
        items: bullets.slice(0, 4).map((bullet, bulletIndex) => ({
          title: bullet,
          body: "待通过搜索模块补齐公开来源、官方页面和开放信息。",
          tag: bulletIndex < 2 ? "待检索" : "补充"
        }))
      },
      { type: "source-note", text: `正式出发前需要检索并核对 ${city} 官方文旅、景区开放、票务预约和交通信息。` }
    ];
  }

  return makeGenericSections(slide.title, slide.subtitle, bullets, slide.layout || "cards", index);
}

function makeSlidesFromBlueprints(title: string, prompt: string): DesignSlide[] {
  return genericBlueprints.map((item, index) => ({
    id: `slide-${index + 1}`,
    title: index === 0 ? title : item[0],
    subtitle: index === 0 ? "基于调研、大纲、策划和页面级设计自动生成" : item[1],
    tone: index % 3 === 0 ? "商务简约" : index % 3 === 1 ? "信息图表" : "内容策划",
    layout: genericLayouts[index] ?? "cards",
    bullets: [...item[2]],
    visualPrompt: `${title}，${item[0]}，高端干净的 PPT 页面，清晰层级，留白充足`,
    speakerNote: `本页围绕“${title}”展开，强调结论先行、证据支撑和页面可编辑。`,
    sections: makeGenericSections(index === 0 ? title : item[0], index === 0 ? "基于调研、大纲、策划和页面级设计自动生成" : item[1], item[2], genericLayouts[index] ?? "cards", index)
  }));
}

function makeScenarioResearch(title: string, type: ContentPlanPPTType): ResearchItem[] {
  const playbook = getScenarioPlaybook(type);
  const evidenceText = playbook.evidenceExpectations.join("、");
  return [
    {
      id: `scenario-${type}-brief`,
      title: `${title}：用户需求简报`,
      source: "用户输入需求",
      sourceName: "用户需求简报",
      sourceType: "document",
      status: "verified",
      summary: `用户已明确 PPT 类型、受众、目标和内容边界，后续页面围绕「${playbook.scenarioName}」组织。`,
      confidence: 86
    },
    {
      id: `scenario-${type}-evidence`,
      title: `${title}：证据需求清单`,
      source: "公开检索计划",
      sourceName: "公开检索计划",
      sourceType: "search",
      status: "search-result",
      summary: `本类型需要优先核验：${evidenceText}。`,
      confidence: 72
    },
    {
      id: `scenario-${type}-public-source`,
      title: `${playbook.scenarioName}公开资料检索入口`,
      source: "公开网页 / 官方文件 / 行业资料",
      sourceName: "公开资料入口",
      sourceType: "search",
      status: "search-result",
      summary: `生成时先挂载检索入口，正式交付前应补齐 ${evidenceText} 对应的公开链接或上传资料。`,
      confidence: 70
    },
    {
      id: `scenario-${type}-quality`,
      title: `${playbook.scenarioName}质量检查清单`,
      source: "PPT Review Center",
      sourceName: "评审规则",
      sourceType: "local",
      status: "fallback",
      summary: playbook.qualityChecklistSeeds.slice(0, 5).join("；"),
      confidence: 80
    }
  ];
}

function makeScenarioProject(prompt: string, mode: CanvasProject["mode"], explicitType?: ContentPlanPPTType): CanvasProject {
  const type = explicitType || detectScenarioPlaybookType(prompt);
  const playbook = getScenarioPlaybook(type);
  const title = inferTitle(prompt) || `${playbook.scenarioName} PPT`;
  const roleSeeds = [...playbook.requiredSlideRoles, ...playbook.optionalSlideRoles.slice(0, 2)];
  const research = makeScenarioResearch(title, type);
  const slides: DesignSlide[] = roleSeeds.map((seed, index) => {
    const layout = seed.layoutHint || genericLayouts[index % genericLayouts.length] || "cards";
    const bullets = [seed.pagePurpose, seed.mustProve, ...seed.suggestedEvidence.slice(0, 3)].filter(Boolean);
    return {
      id: `slide-${index + 1}`,
      title: index === 0 ? title : seed.titleIntent,
      subtitle: index === 0 ? playbook.narrativePatterns[0] : seed.pagePurpose,
      tone: `${playbook.styleDefaults} / ${seed.role}`,
      layout,
      bullets,
      sourceIds: research.map((item) => item.id),
      pageIntent: seed.role,
      visualPrompt: `${title}，${seed.titleIntent}，${playbook.styleDefaults}，清晰层级，可编辑 PPT 页面`,
      speakerNote: `页面角色：${seed.role}。本页必须证明：${seed.mustProve}`,
      sections: makeGenericSections(index === 0 ? title : seed.titleIntent, index === 0 ? playbook.narrativePatterns[0] : seed.pagePurpose, bullets, layout, index)
    };
  });

  return {
    title,
    prompt,
    mode,
    outline: slides.slice(1).map((slide, index) => ({
      id: `outline-${type}-${index + 1}`,
      page: index + 1,
      title: slide.title,
      note: slide.subtitle
    })),
    research,
    plan: slides.map((slide, index) => ({
      id: `plan-${type}-${index + 1}`,
      page: index + 1,
      title: slide.title,
      layout: slide.layout || "cards",
      elements: slide.bullets?.slice(0, 5) || []
    })),
    slides
  };
}

function makeGenericTravelProject(prompt: string, mode: CanvasProject["mode"]): CanvasProject {
  const city = inferTravelCity(prompt);
  const isOneDay = /(一日游|1\s*日|一日)/.test(prompt);
  const days = /(五日游|5\s*日)/.test(prompt) ? 5 : /(四日游|4\s*日)/.test(prompt) ? 4 : /(三日游|3\s*日)/.test(prompt) ? 3 : /(二日游|2\s*日)/.test(prompt) ? 2 : 1;
  const title = `${city} ${isOneDay ? "一日精华游攻略" : `${days} 日深度游攻略`}`;
  const slides: DesignSlide[] = [
    {
      id: "slide-1",
      title,
      subtitle: `${city}旅行工作台版本，按路线、交通、预算、避坑和真实来源组织内容`,
      tone: "旅行方案 / 高级干净",
      layout: "cover",
      bullets: [`${days} 日行程`, "真实资料来源", "路线与预算完整规划"]
    },
    {
      id: "slide-2",
      title: "行程总览",
      subtitle: "先看主线，再把景点、交通、用餐和预约放进可执行节奏",
      tone: "路线总览",
      layout: "agenda",
      bullets: isOneDay
        ? ["上午：核心景点主线", "中午：就近用餐与休息", "下午：第二组景点 / 拍照节点", "傍晚：夜游或返程收尾"]
        : Array.from({ length: Math.min(days, 5) }, (_, index) => `Day ${index + 1}：核心片区 ${index + 1} / 主景点 / 用餐 / 收尾`)
    },
    {
      id: "slide-3",
      title: "主线体验页",
      subtitle: "把高优先级景点放在体力最好、交通最稳的时段",
      tone: "文化体验",
      layout: "day-route",
      bullets: ["核心景点放在最稳时段", "拍照和休息节点插入主线之间", "减少跨区移动", "热门点位提前预约"]
    },
    {
      id: "slide-4",
      title: "备选模块选择",
      subtitle: "按天气、体力和人群偏好预留替换路径",
      tone: "决策对比",
      layout: "comparison",
      bullets: ["主方案：城市招牌景点", "备选方案：室内 / 慢行模块", "极端天气直接切换", "不要在同一天硬塞全部点位"]
    },
    {
      id: "slide-5",
      title: "交通策略",
      subtitle: "用公共交通解决主线移动，用缓冲解决不确定性",
      tone: "实用指南",
      layout: "map",
      bullets: ["优先地铁 / 步行主线", "临时打车只作为补充", "热门景区进出点提前确认", "返程日前不做远距离跨区"]
    },
    {
      id: "slide-6",
      title: "美食与休息节点",
      subtitle: "餐饮围绕路线就近安排，不为单一餐厅牺牲行程稳定性",
      tone: "生活方式",
      layout: "cards",
      bullets: ["核心片区就近用餐", "下午插入茶饮 / 咖啡缓冲", "夜游收尾再放特色餐饮", "避免网红店长距离排队"]
    },
    {
      id: "slide-7",
      title: "预算与时间分配",
      subtitle: "用区间和假设做规划，避免给出不可依赖的死数",
      tone: "预算分析",
      layout: "stats",
      bullets: ["门票 / 预约按官方核对", "餐饮按舒适型预留", "市内交通与跨区交通分开估算", "机动缓冲预留 15%-20%"]
    },
    {
      id: "slide-8",
      title: "避坑清单",
      subtitle: "出发前确认预约、天气、步行量和备用路线",
      tone: "执行清单",
      layout: "checklist",
      bullets: ["热门景点先核对预约规则", "每天保留一个可删减点位", "高温雨雪切到室内路线", "返程交通作为刚性约束"]
    },
    {
      id: "slide-9",
      title: "资料来源与置信度",
      subtitle: "保留公开资料入口，方便后续核验和替换",
      tone: "资料模块",
      layout: "source",
      bullets: ["官方文旅入口", "景区开放信息", "交通与票务说明", "天气与城市公共服务信息"]
    }
  ];

  const enhancedSlides = slides.map((slide, index) => ({
    ...slide,
    sections: slide.sections?.length ? slide.sections : makeGenericCityTravelSections(city, slide, index)
  }));

  return {
    title,
    prompt,
    mode,
    outline: enhancedSlides.slice(1, 8).map((slide, index) => ({
      id: `outline-${index + 1}`,
      page: index + 1,
      title: slide.title,
      note: slide.subtitle
    })),
    research: [
      {
        id: "generic-travel-source",
        title: `${city}公开旅游信息入口`,
        source: `${city}公开资料`,
        sourceName: `${city}公开资料`,
        sourceType: "search",
        status: "search-result",
        summary: "当前城市旅行题材先进入路线策划模式，正式出发前再用搜索模块核验官方入口与开放信息。",
        confidence: 76
      },
      {
        id: "generic-travel-official-check",
        title: `${city}官方文旅与景区开放信息`,
        source: "官方文旅 / 景区公告",
        sourceName: "官方文旅核验项",
        sourceType: "official",
        status: "verified",
        summary: "用于核验景区开放时间、预约规则、入园要求和临时闭园信息。",
        confidence: 82
      },
      {
        id: "generic-travel-transport-check",
        title: `${city}交通与移动时间假设`,
        source: "城市交通公开信息",
        sourceName: "交通核验项",
        sourceType: "search",
        status: "search-result",
        summary: "用于支撑路线顺序、跨区移动方式、返程约束和机动时间预留。",
        confidence: 74
      },
      {
        id: "generic-travel-budget-check",
        title: `${city}预算、餐饮与风险备选清单`,
        source: "公开资料 / 用户需求",
        sourceName: "预算与风险清单",
        sourceType: "document",
        status: "verified",
        summary: "用于拆分门票、餐饮、市内交通和天气/体力/预约失败的备选方案。",
        confidence: 78
      }
    ],
    plan: enhancedSlides.slice(1).map((slide, index) => ({
      id: `plan-${index + 1}`,
      page: index + 1,
      title: slide.title,
      layout: slide.layout || "cards",
      elements: slide.bullets?.slice(0, 4) || []
    })),
    slides: enhancedSlides
  };
}

function isProductPrompt(prompt: string) {
  if (/项目汇报|政策汇报|工作汇报|验收标准|推进计划|责任分工/.test(prompt)) {
    return false;
  }
  return /(产品介绍|产品方案|解决方案|客户方案|采购方案|Agent|RAG|知识库|工作流|MCP|API|SaaS|平台能力|应用场景|架构优势|部署集成)/i.test(prompt);
}

function inferProductName(prompt: string) {
  const match =
    prompt.match(/([A-Za-z][A-Za-z0-9._-]{1,28}|[\u4e00-\u9fa5A-Za-z0-9]{2,18})(?:\s*)?(?:产品介绍|产品方案|解决方案|产品PPT|产品 PPT)/i) ||
    prompt.match(/(?:介绍|讲解|展示)([\u4e00-\u9fa5A-Za-z0-9._-]{2,18})(?:产品|平台|方案)/i);
  return match?.[1]?.replace(/^帮我|^做一份|^生成/, "").trim() || "AI 产品";
}

function makeProductResearch(productName: string): ResearchItem[] {
  return [
    {
      id: "product-public-source",
      title: `${productName}公开产品资料`,
      source: "公开资料 / 产品文档",
      sourceName: "公开产品资料",
      sourceType: "search",
      status: "fallback",
      summary: "本地生成器先按企业产品方案方法论组织内容，正式交付前应接入搜索模块、官网、产品文档、客户案例和安全说明。",
      confidence: 68
    },
    {
      id: "product-customer-source",
      title: "客户场景与试点反馈",
      source: "待补充客户资料",
      sourceName: "待补客户证据",
      sourceType: "local",
      status: "fallback",
      summary: "用于补充客户痛点、现有流程、试点范围、关键指标和采购约束，避免产品页停留在功能罗列。",
      confidence: 60
    }
  ];
}

function productCopy(productName: string) {
  return {
    positioning: `${productName} 需要把产品定位、业务问题、核心能力、部署路径和验收指标串成可采购、可试点、可评估的解决方案。`,
    pains: ["客户知道要数字化，但不知道产品具体解决哪类业务问题", "功能很多但缺少工作流闭环，难以判断落地成本", "采购方需要看到试点路径、验收标准和风险控制"],
    modules: ["需求入口", "业务流程", "核心功能", "数据/知识", "系统集成", "运营监控"],
    workflow: ["需求澄清", "场景配置", "任务执行", "结果输出", "运营监控", "迭代优化"],
    scenarios: ["业务咨询", "流程自动化", "内容生成", "数据分析", "客户服务", "管理驾驶舱"],
    differences: [
      ["传统模板", "交付快但难落地", `${productName} 应强调业务流程和结果验收`],
      ["单点工具", "只解决局部问题", `${productName} 需要说明从输入到交付的闭环`],
      ["纯定制开发", "周期长、成本高", `${productName} 可先试点再扩展，降低采购风险`]
    ],
    deployment: ["确认试点场景", "配置产品能力", "接入必要数据", "上线试运行", "按验收指标复盘扩展"],
    security: ["账号权限", "数据隔离", "接口鉴权", "日志审计", "内容风控", "备份与恢复"]
  };
}

function productSourceIds(productName: string, index: number) {
  const ids = ["product-public-source", "product-customer-source"];
  return [ids[index % ids.length]];
}

function sourceNoteForProduct(productName: string, index: number): SlideSection {
  const sourceIds = productSourceIds(productName, index);
  return {
    type: "source-note",
    sourceIds,
    text: `资料依据：${productName} 公开产品资料与客户访谈占位；正式交付前需要补充官网、产品文档、案例和安全说明。`
  };
}

function makeProductProject(prompt: string, mode: CanvasProject["mode"]): CanvasProject {
  const productName = inferProductName(prompt);
  const copy = productCopy(productName);
  const research = makeProductResearch(productName);
  const title = `${productName} 产品介绍与解决方案`;

  const slides: DesignSlide[] = [
    {
      id: "slide-1",
      title,
      subtitle: copy.positioning,
      tone: "产品方案 / 企业客户",
      layout: "cover",
      bullets: ["产品定位", "能力架构", "落地路径", "试点验收"],
      sourceIds: productSourceIds(productName, 0),
      pageIntent: "开场建立产品定位和采购判断标准。",
      visualPrompt: `${productName} 产品介绍封面，浅色高级，企业级 AI 产品蓝图，留出标题区，不要文字水印`,
      sections: [
        { type: "tag-row", tags: ["产品定位", "工作流", "企业落地", "可评估"] },
        { type: "hero-image", title, caption: "从业务问题到可发布应用的产品路径", imagePrompt: `${productName} product solution cover, clean enterprise AI blueprint` },
        {
          type: "stat-card",
          stats: [
            { label: "建议页数", value: "12 页", note: "完整产品方案" },
            { label: "核心链路", value: "6 步", note: "需求到交付" },
            { label: "交付状态", value: "可编辑", note: "PPTX 输出" }
          ]
        }
      ]
    },
    {
      id: "slide-2",
      title: "客户问题与采购目标",
      subtitle: "先证明为什么需要这个产品，再说明产品如何进入客户现有流程。",
      tone: "问题定义",
      layout: "split",
      bullets: copy.pains,
      sourceIds: productSourceIds(productName, 1),
      pageIntent: "把产品价值绑定到客户真实痛点和采购目标。",
      visualPrompt: `${productName} 客户痛点和采购目标，企业会议室，流程断点信息图`,
      sections: [
        {
          type: "table",
          title: "痛点到目标映射",
          columns: ["客户问题", "影响", "采购目标"],
          rows: copy.pains.slice(0, 3).map((pain, index) => [pain, index === 0 ? "上线风险高" : index === 1 ? "协作成本高" : "运营不可控", index === 0 ? "形成生产闭环" : index === 1 ? "统一编排入口" : "可管理可观测"])
        },
        { type: "warning", title: "扣分风险", body: "如果一上来只列功能，客户无法判断为什么现在要采购。", severity: "warn" },
        sourceNoteForProduct(productName, 1)
      ]
    },
    {
      id: "slide-3",
      title: "产品能力架构",
      subtitle: "用层级结构说明能力边界、模块关系和企业集成入口。",
      tone: "架构说明",
      layout: "process",
      bullets: copy.modules,
      sourceIds: productSourceIds(productName, 2),
      pageIntent: "让技术负责人能快速理解产品边界和接入方式。",
      visualPrompt: `${productName} 产品能力架构，模块化架构图，浅色技术蓝图`,
      sections: [
        {
          type: "table",
          title: "能力架构",
          columns: ["层级", "模块", "客户价值"],
          rows: copy.modules.slice(0, 6).map((module, index) => [
            index < 2 ? "应用层" : index < 4 ? "编排层" : "运营层",
            module,
            index < 2 ? "承接业务入口" : index < 4 ? "串联模型、知识与工具" : "支撑发布、监控和治理"
          ])
        },
        {
          type: "donut-chart",
          title: "能力构成",
          centerLabel: "产品",
          segments: [
            { label: "编排", value: 30 },
            { label: "知识", value: 24 },
            { label: "工具", value: 22 },
            { label: "运营", value: 24 }
          ],
          note: "权重用于表达方案叙事，不代表真实产品统计。"
        },
        sourceNoteForProduct(productName, 2)
      ]
    },
    {
      id: "slide-4",
      title: "从需求到交付的工作流",
      subtitle: "产品不只是功能集合，而是把业务任务稳定地转成可发布应用。",
      tone: "流程闭环",
      layout: "timeline",
      bullets: copy.workflow,
      sourceIds: productSourceIds(productName, 3),
      pageIntent: "证明产品能把用户需求转成端到端流程。",
      visualPrompt: `${productName} 工作流编排，流程节点，企业 AI 应用交付`,
      sections: [
        {
          type: "timeline",
          title: "端到端工作流",
          steps: copy.workflow.map((step, index) => ({
            label: `0${index + 1}`,
            title: step,
            body: index === 0 ? "业务需求进入系统" : index === copy.workflow.length - 1 ? "进入发布、监控和迭代" : "承接上一环节并形成结构化输出"
          }))
        },
        {
          type: "tips-grid",
          title: "客户看点",
          items: [
            { title: "可配置", body: "业务团队可以理解流程，技术团队可以控制边界。", tag: "效率" },
            { title: "可追踪", body: "关键步骤、输入输出和异常都能进入复盘。", tag: "运营" },
            { title: "可迭代", body: "从试点流程开始，逐步扩展到更多场景。", tag: "落地" }
          ]
        },
        sourceNoteForProduct(productName, 3)
      ]
    },
    {
      id: "slide-5",
      title: "关键能力与可编辑输出",
      subtitle: "把功能写成客户能试用、能验收、能复用的能力单元。",
      tone: "核心功能",
      layout: "matrix",
      bullets: copy.modules,
      sourceIds: productSourceIds(productName, 4),
      pageIntent: "把核心功能从功能名转成可验收的输出能力。",
      visualPrompt: `${productName} 核心功能矩阵，企业级产品模块卡片`,
      sections: [
        {
          type: "tips-grid",
          title: "能力单元",
          items: copy.modules.slice(0, 6).map((module, index) => ({
            title: module,
            body: index % 2 ? "支持配置、调用、发布或运营复盘。" : "承接真实业务任务并形成可复用输出。",
            tag: index < 3 ? "核心" : "扩展"
          }))
        },
        sourceNoteForProduct(productName, 4)
      ]
    },
    {
      id: "slide-6",
      title: "典型应用场景",
      subtitle: "场景页要说明谁在什么情况下使用，以及使用后产生什么业务结果。",
      tone: "场景证明",
      layout: "matrix",
      bullets: copy.scenarios,
      sourceIds: productSourceIds(productName, 5),
      pageIntent: "帮助客户把产品映射到自己的部门和流程。",
      visualPrompt: `${productName} 应用场景，企业部门、知识库、自动化流程，干净信息图`,
      sections: [
        {
          type: "table",
          title: "场景映射",
          columns: ["场景", "使用者", "输出结果"],
          rows: copy.scenarios.slice(0, 6).map((scenario, index) => [
            scenario,
            index % 3 === 0 ? "业务部门" : index % 3 === 1 ? "运营团队" : "技术团队",
            index % 2 ? "减少人工流转" : "提升响应质量"
          ])
        },
        sourceNoteForProduct(productName, 5)
      ]
    },
    {
      id: "slide-7",
      title: "相比传统工具与模板站的差异",
      subtitle: "产品介绍不能只说自己强，要说清楚替代方案为什么不够。",
      tone: "差异化说明",
      layout: "comparison",
      bullets: copy.differences.map((row) => `${row[0]}：${row[2]}`),
      sourceIds: productSourceIds(productName, 6),
      pageIntent: "形成采购比较框架，避免客户把产品理解成普通模板或聊天工具。",
      visualPrompt: `${productName} 竞品差异化对比，企业采购决策表，浅色高级`,
      sections: [
        {
          type: "table",
          title: "替代方案对比",
          columns: ["替代方案", "短板", `${productName}价值`],
          rows: copy.differences
        },
        { type: "warning", title: "讲法提醒", body: "差异化页要避免贬低竞品，重点讲适用边界和客户收益。", severity: "info" },
        sourceNoteForProduct(productName, 6)
      ]
    },
    {
      id: "slide-8",
      title: "部署路径与系统集成",
      subtitle: "让客户知道如何低风险启动、接入现有系统，并进入持续运营。",
      tone: "部署落地",
      layout: "timeline",
      bullets: copy.deployment,
      sourceIds: productSourceIds(productName, 7),
      pageIntent: "打消技术评估和落地成本疑虑。",
      visualPrompt: `${productName} 部署路径，系统集成，API，企业 IT 架构`,
      sections: [
        {
          type: "timeline",
          title: "部署路线",
          steps: copy.deployment.map((step, index) => ({ label: `0${index + 1}`, title: step, body: index === 0 ? "先选低风险试点" : "按阶段扩展能力和接入范围" }))
        },
        sourceNoteForProduct(productName, 7)
      ]
    },
    {
      id: "slide-9",
      title: "权限、数据与风控机制",
      subtitle: "企业客户需要确认产品可控、可审计、可治理。",
      tone: "安全治理",
      layout: "checklist",
      bullets: copy.security,
      sourceIds: productSourceIds(productName, 8),
      pageIntent: "补齐企业级产品介绍中最容易缺失的安全治理页。",
      visualPrompt: `${productName} 安全治理，权限、数据隔离、日志审计，浅色企业安全信息图`,
      sections: [
        {
          type: "tips-grid",
          title: "治理检查点",
          items: copy.security.slice(0, 6).map((item, index) => ({
            title: item,
            body: index < 2 ? "明确边界和责任主体。" : index < 4 ? "支撑审计与持续运营。" : "降低上线后的合规与内容风险。",
            tag: index < 3 ? "必备" : "增强"
          }))
        },
        { type: "warning", title: "扣分风险", body: "产品页如果没有安全与治理内容，企业客户通常无法进入采购评估。", severity: "warn" },
        sourceNoteForProduct(productName, 8)
      ]
    },
    {
      id: "slide-10",
      title: "客户案例与效果指标",
      subtitle: "没有真实案例时，要明确标注待补证据，并给出应该收集的效果口径。",
      tone: "证据证明",
      layout: "evidence",
      bullets: ["试点前后效率变化", "用户活跃与留存", "任务完成率", "人工处理量下降", "错误率与反馈质量"],
      sourceIds: productSourceIds(productName, 9),
      pageIntent: "用证据和指标支撑产品价值，而不是只讲愿景。",
      visualPrompt: `${productName} 客户案例与效果指标，数据卡片，企业案例证据`,
      sections: [
        {
          type: "stat-card",
          title: "建议验证指标",
          stats: [
            { label: "效率", value: "节省时长", note: "对比试点前后任务处理时间" },
            { label: "质量", value: "命中率", note: "答案采纳、流程完成或人工返工率" },
            { label: "运营", value: "活跃度", note: "使用频次、部门覆盖和复用次数" },
            { label: "成本", value: "Token/人力", note: "模型成本与人工成本一起看" }
          ]
        },
        {
          type: "warning",
          title: "证据待补",
          body: "如果没有客户授权案例，页面应标注为试点指标建议，避免编造客户名称和数据。",
          severity: "high"
        },
        sourceNoteForProduct(productName, 9)
      ]
    },
    {
      id: "slide-11",
      title: "试点范围与验收标准",
      subtitle: "先用小范围试点证明价值，再决定采购扩展和系统集成深度。",
      tone: "试点计划",
      layout: "stats",
      bullets: ["2-4 周完成场景确认和配置", "选择 1-2 个高频流程试点", "定义效果、质量、成本和安全指标", "复盘后进入采购或扩容决策"],
      sourceIds: productSourceIds(productName, 10),
      pageIntent: "把产品介绍收束到可执行试点。",
      visualPrompt: `${productName} 试点计划与验收标准，项目里程碑和指标看板`,
      sections: [
        {
          type: "bar-chart",
          title: "试点验收权重",
          unit: "%",
          bars: [
            { label: "业务效果", value: 32, note: "是否解决高频任务" },
            { label: "使用体验", value: 24, note: "业务团队是否愿意持续使用" },
            { label: "集成成本", value: 20, note: "数据、接口和权限接入难度" },
            { label: "安全治理", value: 24, note: "权限、日志和内容风险可控" }
          ]
        },
        {
          type: "tips-grid",
          title: "试点边界",
          items: [
            { title: "场景", body: "只选高频、可衡量、数据边界清楚的流程。", tag: "范围" },
            { title: "人群", body: "选择业务 owner、技术 owner 和一线试用者。", tag: "组织" },
            { title: "输出", body: "形成指标复盘、问题清单和采购建议。", tag: "验收" }
          ]
        },
        sourceNoteForProduct(productName, 10)
      ]
    },
    {
      id: "slide-12",
      title: "下一步动作与采购决策",
      subtitle: "看完这份产品介绍后，客户应知道下一步需要确认什么。",
      tone: "行动收束",
      layout: "closing",
      bullets: ["确认试点部门与业务流程", "补齐产品文档、案例和安全材料", "安排技术对接与数据边界评审", "确定试点验收口径和采购路径"],
      sourceIds: productSourceIds(productName, 11),
      pageIntent: "把介绍转化为可跟进的销售或试点动作。",
      visualPrompt: `${productName} 下一步采购决策，行动清单，商务收束页`,
      sections: [
        {
          type: "callout",
          title: "建议先做一个可验收试点",
          body: "用真实业务流程验证效果、成本、安全和团队接受度，再进入采购扩展。",
          accent: "blue"
        },
        {
          type: "tips-grid",
          title: "行动清单",
          items: [
            { title: "业务确认", body: "选定试点流程、使用人群和成功标准。", tag: "本周" },
            { title: "技术确认", body: "确认数据源、模型供应商、接口和权限边界。", tag: "本周" },
            { title: "材料确认", body: "补充产品文档、案例、部署和安全说明。", tag: "交付" },
            { title: "决策确认", body: "约定复盘时间和采购/扩容判断口径。", tag: "拍板" }
          ]
        },
        sourceNoteForProduct(productName, 11)
      ]
    }
  ];

  return {
    title,
    prompt,
    mode,
    outline: slides.slice(1, 11).map((slide, index) => ({
      id: `outline-product-${index + 1}`,
      page: index + 1,
      title: slide.title,
      note: slide.subtitle,
      evidenceBlockIds: slide.sourceIds
    })),
    research,
    plan: slides.slice(1).map((slide, index) => ({
      id: `plan-product-${index + 1}`,
      page: index + 1,
      title: slide.title,
      layout: slide.layout || "cards",
      elements: slide.bullets?.slice(0, 5) || [],
      evidenceBlockIds: slide.sourceIds
    })),
    slides
  };
}

export const defaultProject: CanvasProject = {
  title: "AI PPT Agent 工作台示例",
  prompt: "帮我做一份项目汇报 PPT，面向管理层，强调目标、方案、实施路径、验收标准和下一步动作。",
  mode: "agent",
  outline: [
    { id: "outline-1", page: 1, title: "汇报目标与核心判断", note: "说明这份 PPT 要让受众做什么判断。" },
    { id: "outline-2", page: 2, title: "背景依据与问题判断", note: "把背景转化为必须解决的问题。" },
    { id: "outline-3", page: 3, title: "总体方案与实施路径", note: "说明做什么、怎么做、谁负责。" },
    { id: "outline-4", page: 4, title: "验收标准与风险控制", note: "定义交付标准、风险和补救动作。" },
    { id: "outline-5", page: 5, title: "下一步动作", note: "收束到会后决策和推进清单。" }
  ],
  research: [
    {
      id: "research-1",
      title: "项目汇报资料需求",
      source: "用户需求与公开资料",
      sourceName: "公开资料",
      sourceType: "search",
      status: "fallback",
      summary: "示例项目先保留资料需求，正式生成时会按 PPT 类型补齐证据、页面角色和验收口径。",
      confidence: 78
    }
  ],
  plan: [
    { id: "plan-1", page: 1, title: "背景依据页", layout: "split", elements: ["资料来源", "现状问题", "决策目标"] },
    { id: "plan-2", page: 2, title: "方案总览页", layout: "matrix", elements: ["建设目标", "能力模块", "协同机制"] },
    { id: "plan-3", page: 3, title: "实施路径页", layout: "timeline", elements: ["阶段任务", "责任分工", "验收节点"] }
  ],
  slides: makeSlidesFromBlueprints("AI PPT Agent 工作台示例", "项目汇报 PPT")
};

export const samplePrompts = [
  {
    title: "城市 5 日游攻略",
    prompt: "帮我做一份城市 5 日游攻略 PPT，包含每日路线、景点亮点、交通建议、美食推荐、预算安排和预约避坑。"
  },
  {
    title: "城市一日游攻略",
    prompt: "帮我做一份城市一日游攻略 PPT，包含路线、交通、美食、预算和预约避坑建议。"
  },
  {
    title: "智能产品介绍",
    prompt: "帮我做一份智能产品介绍 PPT，面向企业客户，包含产品定位、核心能力、应用场景、部署方式和价值证明。"
  },
  {
    title: "企业介绍 PPT",
    prompt: "帮我做一份制造业企业介绍 PPT，突出发展历程、核心业务、技术实力、市场布局和未来战略。"
  }
];

export function buildProjectFromPrompt(prompt: string, mode: CanvasProject["mode"] = "agent"): CanvasProject {
  const normalized = prompt.trim() || defaultProject.prompt;
  if (isGenericTravelPrompt(normalized)) {
    return makeGenericTravelProject(normalized, mode);
  }
  if (isProjectReportPrompt(normalized)) {
    return makeScenarioProject(normalized, mode, "project_report");
  }
  if (isProductPrompt(normalized)) {
    return makeScenarioProject(normalized, mode, "product_intro");
  }

  const scenarioType = detectScenarioPlaybookType(normalized);
  if (scenarioType !== "general") {
    return makeScenarioProject(normalized, mode, scenarioType);
  }

  const title = inferTitle(normalized);
  const slides = makeSlidesFromBlueprints(title, normalized);
  return {
    title,
    prompt: normalized,
    mode,
    outline: slides.slice(1, 8).map((slide, index) => ({
      id: `outline-${index + 1}`,
      page: index + 1,
      title: slide.title,
      note: slide.subtitle
    })),
    research: defaultProject.research,
    plan: slides.slice(1).map((slide, index) => ({
      id: `plan-${index + 1}`,
      page: index + 1,
      title: slide.title,
      layout: slide.layout || "cards",
      elements: slide.bullets || []
    })),
    slides
  };
}
