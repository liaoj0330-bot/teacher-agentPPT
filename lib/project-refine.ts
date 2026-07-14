import type { CanvasProject, DesignSlide, QualityIssue, SlideLayout, SlideSection } from "@/lib/canvas-data";
import { compactForDesign, getDesignProfile, layoutForSlide, visualPromptForSlide } from "@/lib/ppt-design-system";
import { ensureProjectQuality } from "@/lib/project-quality";
import { cleanProject, cleanText } from "@/lib/text-sanitize";

export type RefineMode = "auto" | "layout" | "copy" | "evidence";

export type RefineResult = {
  project: CanvasProject;
  changes: string[];
};

const layoutCycle: SlideLayout[] = ["agenda", "day-route", "comparison", "stats", "timeline", "cards", "checklist", "source"];

function compact(value: string, max: number) {
  const clean = cleanText(value).replace(/\s+/g, " ").trim();
  if ([...clean].length <= max) return clean;
  const separators = ["，", "；", "。", "：", "、", "-", "｜", "|"];
  for (const separator of separators) {
    const head = clean.split(separator)[0]?.trim();
    if (head && [...head].length >= 6 && [...head].length <= max) {
      return head;
    }
  }
  return `${[...clean].slice(0, Math.max(6, max - 1)).join("")}…`;
}

function uniqueBullets(bullets: string[] | undefined) {
  const seen = new Set<string>();
  return (bullets || [])
    .map((bullet) => compact(bullet, 42))
    .filter((bullet) => {
      const key = bullet.replace(/[^\u3400-\u9fffa-z0-9]/gi, "").slice(0, 14);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

function hasSection(slide: DesignSlide, type: SlideSection["type"]) {
  return slide.sections?.some((section) => section.type === type) ?? false;
}

function makeTips(slide: DesignSlide, title = "页面要点"): SlideSection {
  const bullets = uniqueBullets(slide.bullets);
  return {
    type: "tips-grid",
    title,
    items: (bullets.length ? bullets : [slide.title, slide.subtitle, "后续可继续编辑"]).slice(0, 4).map((bullet, index) => ({
      title: compact(bullet, 16),
      body: compact(index === 0 ? slide.subtitle || bullet : bullet, 46),
      tag: index === 0 ? "主张" : index === 1 ? "证据" : "补充"
    }))
  };
}

function makeTable(slide: DesignSlide): SlideSection {
  const bullets = uniqueBullets(slide.bullets);
  const rows = (bullets.length ? bullets : ["推荐方案", "备选方案", "执行提醒"]).slice(0, 4).map((bullet, index) => [
    index === 0 ? "优先级高" : index === 1 ? "优先级中" : "补充项",
    compact(bullet, 24),
    index < 2 ? "建议保留" : "按时间调整"
  ]);
  return {
    type: "table",
    title: "对比与取舍",
    columns: ["维度", "内容", "建议"],
    rows
  };
}

function makeStats(slide: DesignSlide): SlideSection {
  const bullets = uniqueBullets(slide.bullets);
  return {
    type: "stat-card",
    title: "关键判断",
    stats: (bullets.length ? bullets : ["内容完整", "来源可追溯", "页面可编辑"]).slice(0, 4).map((bullet, index) => ({
      label: index === 0 ? "重点" : `指标 ${index + 1}`,
      value: compact(bullet, 10),
      note: compact(bullet, 32)
    }))
  };
}

function makeTimeline(slide: DesignSlide): SlideSection {
  const bullets = uniqueBullets(slide.bullets);
  return {
    type: "timeline",
    title: "推进节奏",
    steps: (bullets.length ? bullets : ["确认目标", "整理资料", "生成初稿", "导出微调"]).slice(0, 5).map((bullet, index) => ({
      label: String(index + 1).padStart(2, "0"),
      title: compact(bullet, 14),
      body: compact(bullet, 36)
    }))
  };
}

function sectionForLayout(slide: DesignSlide, layout: SlideLayout, index: number): SlideSection {
  if (layout === "comparison") return makeTable(slide);
  if (layout === "stats" || layout === "budget") return makeStats(slide);
  if (layout === "timeline" || layout === "process" || layout === "agenda") return makeTimeline(slide);
  if (layout === "source" || layout === "evidence") {
    return {
      type: "source-note",
      sourceIds: slide.sourceIds,
      text: "本页保留资料来源映射，便于后续核验和替换。"
    };
  }
  return makeTips(slide, index === 0 ? "封面信息" : "页面要点");
}

function diversifyLayout(slide: DesignSlide, index: number, previousLayout?: SlideLayout): SlideLayout {
  if (index === 0) return "cover";
  const current = slide.layout || "cards";
  if (current !== previousLayout) return current;
  return layoutCycle[index % layoutCycle.length];
}

function refineSlide(project: CanvasProject, slide: DesignSlide, index: number, previousLayout: SlideLayout | undefined, changes: string[], mode: RefineMode): DesignSlide {
  const profile = getDesignProfile(project);
  const rhythmicLayout = layoutForSlide(profile, index, slide.layout);
  const nextLayout = mode === "copy" ? slide.layout || "cards" : rhythmicLayout === previousLayout ? diversifyLayout(slide, index, previousLayout) : rhythmicLayout;
  const nextBullets = uniqueBullets(slide.bullets);
  const title = compactForDesign(slide.title, index === 0 ? Math.max(30, profile.titleMax + 6) : profile.titleMax);
  const subtitle = compactForDesign(slide.subtitle, profile.subtitleMax);
  const sections = [...(slide.sections || [])];

  if (title !== slide.title) changes.push(`第 ${index + 1} 页压缩标题`);
  if (subtitle !== slide.subtitle) changes.push(`第 ${index + 1} 页压缩副标题`);
  if ((slide.bullets?.length || 0) !== nextBullets.length) changes.push(`第 ${index + 1} 页精简正文要点`);
  if (nextLayout !== slide.layout) changes.push(`第 ${index + 1} 页调整版式为 ${nextLayout}`);

  const lacksStructure = sections.length === 0 || !sections.some((section) => section.type !== "hero-image" && section.type !== "image-strip" && section.type !== "tag-row");
  if (mode !== "copy" && lacksStructure) {
    sections.push(sectionForLayout({ ...slide, title, subtitle, bullets: nextBullets, layout: nextLayout }, nextLayout, index));
    changes.push(`第 ${index + 1} 页补充结构化排版模块`);
  }

  if (mode !== "layout" && nextBullets.length >= 4 && !hasSection({ ...slide, sections }, "tips-grid") && !hasSection({ ...slide, sections }, "table")) {
    sections.push(makeTips({ ...slide, title, subtitle, bullets: nextBullets }, "可编辑内容卡片"));
    changes.push(`第 ${index + 1} 页补充可编辑卡片`);
  }

  return {
    ...slide,
    title,
    subtitle,
    tone: slide.tone || profile.name,
    layout: nextLayout,
    bullets: nextBullets,
    sections,
    visualPrompt: slide.visualPrompt || visualPromptForSlide(profile, project, { ...slide, title, subtitle, layout: nextLayout }, index),
    pageIntent: slide.pageIntent || `${title}：用一页讲清一个核心判断`,
    speakerNote: slide.speakerNote || `本页围绕“${title}”展开，导出后可继续编辑文字、图形和来源。`
  };
}

function shouldAddQualitySlide(project: CanvasProject, mode: RefineMode) {
  if (mode === "copy") return false;
  if (project.contentPlan?.pptType === "courseware") return false;
  if (project.slides.some((slide) => slide.id === "slide-quality-check" || /交付自检|质量自检/.test(slide.title))) return false;
  const quality = project.quality;
  return Boolean(quality && quality.status !== "ready" && project.slides.length < 12);
}

function qualitySlide(project: CanvasProject): DesignSlide {
  const quality = project.quality;
  const fallbackIssues: QualityIssue[] = [
    { title: "来源核验", detail: "确认关键判断均有资料来源。", severity: "info", id: "fallback-1" },
    { title: "排版检查", detail: "确认标题、表格和卡片没有溢出。", severity: "info", id: "fallback-2" }
  ];
  const issues = quality?.issues?.slice(0, 4) || [];
  return {
    id: "slide-quality-check",
    title: "交付自检与后续微调",
    subtitle: quality?.summary || "导出前复核资料来源、页面密度和可编辑模块。",
    tone: "质量复核",
    layout: "checklist",
    bullets: issues.length ? issues.map((issue) => `${issue.title}：${issue.action || issue.detail}`) : ["核验来源", "检查文字密度", "确认导出排版", "人工微调重点页"],
    sections: [
      {
        type: "tips-grid",
        title: "导出前检查",
        items: (issues.length ? issues : fallbackIssues).slice(0, 4).map((issue) => ({
          title: issue.title,
          body: issue.action || issue.detail,
          tag: issue.severity === "risk" ? "风险" : issue.severity === "warn" ? "复核" : "提示"
        }))
      }
    ]
  };
}

export function refineProject(project: CanvasProject, instruction = "自动微调", mode: RefineMode = "auto"): RefineResult {
  const clean = ensureProjectQuality(cleanProject(project));
  const changes: string[] = [];
  const instructionText = cleanText(instruction);
  const inferredMode: RefineMode = /文案|精简|压缩|标题/.test(instructionText)
    ? "copy"
    : /来源|资料|证据|引用/.test(instructionText)
      ? "evidence"
      : /排版|布局|版式|错乱|美化/.test(instructionText)
        ? "layout"
        : mode;

  let previousLayout: SlideLayout | undefined;
  const refinedSlides = clean.slides.map((slide, index) => {
    const refined = refineSlide(clean, slide, index, previousLayout, changes, inferredMode);
    previousLayout = refined.layout;
    return refined;
  });

  let refined = ensureProjectQuality({
    ...clean,
    prompt: instructionText ? `${clean.prompt}\n微调指令：${instructionText}` : clean.prompt,
    slides: refinedSlides,
    plan: clean.plan.map((item, index) => ({
      ...item,
      layout: refinedSlides[index + 1]?.layout || item.layout,
      elements: refinedSlides[index + 1]?.bullets?.slice(0, 5) || item.elements
    }))
  });

  if (shouldAddQualitySlide(refined, inferredMode)) {
    refined = ensureProjectQuality({
      ...refined,
      slides: [...refined.slides, qualitySlide(refined)]
    });
    changes.push("新增交付自检页");
  }

  return {
    project: refined,
    changes: [...new Set(changes)].slice(0, 12)
  };
}
