import {
  buildProjectFromPrompt,
  type CanvasProject,
  type DesignSlide,
  type ResearchItem,
  type SlideSection,
  type SlideLayout,
  type UploadedAsset
} from "@/lib/canvas-data";
import type { DocumentAnalysis, DocumentBlock } from "@/lib/document-analysis";
import { cleanProject, cleanText } from "@/lib/text-sanitize";
import type { BeautifyPlan } from "@/lib/ppt-agent/beautify-plan";

const layoutCycle: SlideLayout[] = ["section", "split", "matrix", "timeline", "evidence", "stats", "comparison", "process", "checklist", "quote"];

function pickAnalysis(uploadedFile: unknown): DocumentAnalysis | undefined {
  if (!uploadedFile || typeof uploadedFile !== "object") {
    return undefined;
  }
  const asset = uploadedFile as UploadedAsset & { analysis?: DocumentAnalysis };
  return asset.analysis;
}

function meaningfulBlocks(analysis: DocumentAnalysis) {
  return analysis.blocks
    .filter((block) => block.text && block.text.length >= 6)
    .filter((block) => !/^图片素材/.test(block.text))
    .slice(0, 60);
}

function chunkBlocks(blocks: DocumentBlock[], count: number) {
  const chunks: DocumentBlock[][] = Array.from({ length: count }, () => []);
  blocks.forEach((block, index) => {
    chunks[index % count].push(block);
  });
  return chunks;
}

function titleFromBlock(block: DocumentBlock | undefined, fallback: string) {
  if (!block) {
    return fallback;
  }
  const firstLine = block.text.split(/\n|。|；|;/)[0]?.trim();
  if (!firstLine) {
    return fallback;
  }
  return firstLine.length > 24 ? `${firstLine.slice(0, 24)}…` : firstLine;
}

function bulletsFromBlocks(blocks: DocumentBlock[]) {
  const lines = blocks.flatMap((block) =>
    block.text
      .split(/\n|。|；|;/)
      .map((line) => line.trim())
      .filter((line) => line.length >= 8)
  );
  return lines.slice(0, 5).map((line) => (line.length > 48 ? `${line.slice(0, 48)}…` : line));
}

function sectionsFromBlocks(title: string, blocks: DocumentBlock[], layout: SlideLayout, fileName: string): SlideSection[] {
  const bullets = bulletsFromBlocks(blocks);
  const tableBlock = blocks.find((block) => block.type === "table");
  const imageBlocks = blocks.filter((block) => block.type === "image").slice(0, 3);
  const sections: SlideSection[] = [
    {
      type: "callout",
      title,
      body: blocks[0]?.text ? cleanText(blocks[0].text).slice(0, 110) : "从上传资料中提取本页核心观点，并映射到可编辑页面模块。",
      accent: layout === "stats" ? "green" : "blue"
    },
    {
      type: "tips-grid",
      title: "证据内容块",
      items: (bullets.length ? bullets : ["提取核心结论", "保留来源证据", "转化为可演示页面"]).slice(0, 4).map((bullet, index) => ({
        title: `内容块 ${index + 1}`,
        body: bullet,
        tag: blocks[index]?.sourceRef || `Page ${blocks[index]?.page || 1}`
      }))
    }
  ];

  if (tableBlock) {
    const rows = tableBlock.text
      .split(/\n/)
      .map((line) => line.split(/\s{2,}|\t|,|，/).map((cell) => cleanText(cell)).filter(Boolean))
      .filter((row) => row.length >= 2)
      .slice(0, 4);
    sections.push({
      type: "table",
      title: "资料表格摘录",
      columns: ["字段", "内容", "说明"],
      rows: rows.length ? rows.map((row) => [row[0], row.slice(1).join(" / "), "来自上传资料"]) : [["表格内容", cleanText(tableBlock.text).slice(0, 60), "来自上传资料"]],
      note: `来源：${fileName}`
    });
  }

  if (imageBlocks.length) {
    sections.push({
      type: "image-strip",
      title: "图片 / 图表占位",
      items: imageBlocks.map((block, index) => ({
        title: `图像证据 ${index + 1}`,
        caption: block.text || `来自 ${fileName} 第 ${block.page} 页`,
        imagePrompt: `${fileName} 中的图像证据，转化为 PPT 可编辑信息图占位`
      }))
    });
  }

  if (layout === "stats" || layout === "evidence") {
    sections.push({
      type: "bar-chart",
      title: "内容权重",
      unit: "%",
      bars: blocks.slice(0, 4).map((block, index) => ({
        label: block.type === "table" ? "表格" : block.type === "image" ? "图像" : `文本 ${index + 1}`,
        value: Math.max(42, Math.min(92, block.confidence || 68)),
        note: block.sourceRef
      }))
    });
  }

  sections.push({ type: "source-note", text: `已保留资料来源编号，可回溯到《${fileName}》中的对应内容块。` });
  return sections;
}

export function buildProjectFromDocument(prompt: string, mode: CanvasProject["mode"], uploadedFile: unknown, research: ResearchItem[] = []) {
  const analysis = pickAnalysis(uploadedFile);
  if (!analysis || analysis.blockCount === 0) {
    const base = buildProjectFromPrompt(prompt, mode);
    return cleanProject({
      ...base,
      research: research.length ? research : base.research
    });
  }

  const base = buildProjectFromPrompt(prompt, mode);
  const blocks = meaningfulBlocks(analysis);
  const slideCount = Math.min(12, Math.max(8, analysis.outlineSuggestions.length + 4, Math.ceil(blocks.length / 3) + 3));
  const chunks = chunkBlocks(blocks, slideCount - 3);
  const title = cleanText(base.title, prompt.slice(0, 28) || "基于资料生成的 PPT");
  const documentResearch: ResearchItem = {
    id: "research-uploaded-document",
    title: `上传资料：${analysis.fileName}`,
    source: analysis.fileName,
    sourceName: analysis.fileName,
    sourceType: "document",
    status: "verified",
    summary: analysis.summary,
    confidence: Math.max(60, Math.min(92, analysis.blockCount > 8 ? 86 : 72))
  };

  const contentSlides: DesignSlide[] = chunks.map((chunk, index) => {
    const suggestion = analysis.outlineSuggestions[index];
    const fallbackTitle = index === 0 ? "资料核心结论" : `资料拆解 ${index + 1}`;
    const layout = layoutCycle[index % layoutCycle.length];
    const bullets = bulletsFromBlocks(chunk);
    return {
      id: `slide-${index + 3}`,
      title: cleanText(suggestion, titleFromBlock(chunk[0], fallbackTitle)),
      subtitle: chunk[0] ? `引用 ${analysis.fileName} 第 ${chunk[0].page} 页内容块，形成页面级策划` : "基于上传资料自动整理",
      tone: chunk.some((item) => item.type === "table") ? "数据分析" : chunk.some((item) => item.type === "image") ? "视觉复刻" : "内容策划",
      layout,
      bullets: bullets.length ? bullets : ["提取核心观点", "挂载资料证据", "转化为可编辑页面"],
      evidenceBlockIds: chunk.map((item) => item.id),
      sourceIds: ["research-uploaded-document"],
      pageIntent: "把上传资料中的内容块映射为可演示、可编辑的一页 PPT。",
      visualPrompt: `${title}，根据上传资料 ${analysis.fileName} 生成 ${layout} 版式，干净高级，中文可读，避免模板化。`,
      speakerNote: `本页引用资料来源：${chunk.map((item) => item.sourceRef || `第 ${item.page} 页内容块`).join("、")}`,
      sections: sectionsFromBlocks(cleanText(suggestion, titleFromBlock(chunk[0], fallbackTitle)), chunk, layout, analysis.fileName)
    };
  });

  const slides: DesignSlide[] = [
    {
      id: "slide-1",
      title,
      subtitle: `基于上传资料《${analysis.fileName}》自动生成，已解析 ${analysis.pageCount} 页 / ${analysis.blockCount} 个内容块`,
      tone: "资料转 PPT",
      layout: "cover",
      bullets: ["解析资料", "生成大纲", "映射证据", "输出可编辑 PPTX"],
      sourceIds: ["research-uploaded-document"],
      visualPrompt: `${title}，资料转 PPT 封面，浅色高级，文档证据和页面策划感`,
      sections: [
        { type: "tag-row", tags: ["上传解析", "证据映射", "内容策划", "PPTX 导出"] },
        { type: "hero-image", title, caption: `来自 ${analysis.fileName}`, imagePrompt: `${title} 文档转 PPT 封面，资料、证据、页面策划视觉` },
        {
          type: "stat-card",
          stats: [
            { label: "页数", value: `${analysis.pageCount} 页`, note: "上传资料" },
            { label: "内容块", value: `${analysis.blockCount} 个`, note: "可映射到页面" },
            { label: "生成页", value: `${Math.min(12, slideCount)} 页`, note: "当前 PPT 规划" }
          ]
        }
      ]
    },
    {
      id: "slide-2",
      title: "资料结构与生成逻辑",
      subtitle: "先解析内容块，再生成便签化大纲，最后映射到页面设计",
      tone: "流程总览",
      layout: "process",
      bullets: [
        `文件类型：${analysis.sourceKind.toUpperCase()}`,
        `页数 / 内容块：${analysis.pageCount} / ${analysis.blockCount}`,
        "大纲来自标题、段落、表格和图片占位",
        "每页保留资料来源编号，便于回溯原始材料"
      ],
      sourceIds: ["research-uploaded-document"],
      sections: [
        {
          type: "timeline",
          title: "资料转 PPT 流程",
          steps: [
            { label: "01", title: "解析", body: "读取文本、表格、图片占位" },
            { label: "02", title: "分块", body: "保留页码和内容块编号" },
            { label: "03", title: "映射", body: "把证据挂载到对应页面" },
            { label: "04", title: "设计", body: "生成页面级结构与版式" }
          ]
        },
        { type: "source-note", text: `资料来源：${analysis.fileName}` }
      ]
    },
    ...contentSlides,
    {
      id: `slide-${contentSlides.length + 3}`,
      title: "结论与下一步完善",
      subtitle: "把资料内容转成可汇报版本后，继续补充图表、案例和视觉素材",
      tone: "行动建议",
      layout: "closing",
      bullets: ["核对关键数据和引用", "补充真实图片或图表", "微调页面顺序和删减信息密度", "导出 PPTX 后可继续在 PowerPoint 编辑"],
      sourceIds: ["research-uploaded-document"],
      sections: [
        {
          type: "tips-grid",
          title: "下一步完善",
          items: [
            { title: "复核引用", body: "检查页码、数据口径和关键结论。", tag: "必须" },
            { title: "补充视觉", body: "用真实图片、图表或截图替换占位视觉。", tag: "建议" },
            { title: "压缩文字", body: "把长段落改成结论句、表格或流程图。", tag: "排版" },
            { title: "导出编辑", body: "PPTX 中保留文字、图形和表格，便于继续修改。", tag: "交付" }
          ]
        }
      ]
    }
  ];

  return cleanProject({
    title,
    prompt,
    mode,
    research: [documentResearch, ...research].slice(0, 12),
    outline: slides.slice(1, Math.min(slides.length, 10)).map((slide, index) => ({
      id: `outline-${index + 1}`,
      page: index + 1,
      title: slide.title,
      note: slide.subtitle,
      evidenceBlockIds: slide.evidenceBlockIds
    })),
    plan: slides.slice(1).map((slide, index) => ({
      id: `plan-${index + 1}`,
      page: index + 1,
      title: slide.title,
      layout: slide.layout || "cards",
      elements: slide.bullets?.slice(0, 5) || [],
      evidenceBlockIds: slide.evidenceBlockIds
    })),
    slides: slides.slice(0, 12)
  });
}

/** P0: preserve the uploaded deck's page identity while optimizing each page. */
export function buildProjectFromBeautifySource(prompt: string, mode: CanvasProject["mode"], uploadedFile: unknown, plan: BeautifyPlan, research: ResearchItem[] = []) {
  const analysis = pickAnalysis(uploadedFile);
  if (!analysis?.pages?.length) return buildProjectFromDocument(prompt, mode, uploadedFile, research);
  const sourceSlides: DesignSlide[] = analysis.pages.slice(0, 14).map((page, index) => {
    const diagnosis = plan.pageDiagnoses.find((item) => item.page === page.page);
    const blocks = bulletsFromBlocks(page.blocks).slice(0, 5);
    return {
      id: `beautify-original-slide-${page.page}`,
      title: cleanText(page.title, `第 ${page.page} 页`),
      subtitle: cleanText(page.summary, blocks[0] || "保留原页核心信息并优化表达"),
      tone: diagnosis?.role || "原课件优化",
      layout: (diagnosis?.recommendedLayout || "card_grid") as SlideLayout,
      bullets: blocks.length ? blocks : ["保留原页内容", "压缩文字密度", "统一版式层级"],
      sourceIds: ["research-uploaded-document"],
      evidenceBlockIds: page.blocks.map((block) => block.id),
      pageIntent: `优化原课件第 ${page.page} 页：${diagnosis?.role || "内容层级优化"}`,
      visualPrompt: `原课件第 ${page.page} 页的优化视觉：保留原始教学意图，优化信息层级、留白和可读性，不重写为全新主题。`,
      speakerNote: `原页保留：${diagnosis?.preserve?.join("；") || "保留原页标题和核心内容"}。优化：${diagnosis?.rewriteActions?.join("；") || "统一层级与版式"}。`,
      sections: sectionsFromBlocks(cleanText(page.title, `第 ${page.page} 页`), page.blocks, (diagnosis?.recommendedLayout || "card_grid") as SlideLayout, analysis.fileName)
    };
  });
  for (const diagnosis of plan.pageDiagnoses) {
    const optimized = sourceSlides.find((slide) => slide.id === `beautify-original-slide-${diagnosis.page}`);
    if (!optimized) continue;
    diagnosis.optimizedTitle = optimized.title;
    diagnosis.optimizedBullets = optimized.bullets;
    diagnosis.diffSummary = [
      `保留原页第 ${diagnosis.page} 页的主题和证据块`,
      `将原页信息重排为 ${diagnosis.recommendedLayout} 版式`,
      `执行：${diagnosis.rewriteActions.join("；") || "统一层级、留白和可读性"}`
    ];
  }
  const riskCount = plan.pageDiagnoses.filter((page) => page.detectedIssues.some((issue) => issue.severity === "risk")).length;
  const reportSlide: DesignSlide = {
    id: "beautify-analysis-report",
    title: "原课件逐页优化报告",
    subtitle: `${analysis.fileName} · ${analysis.pages.length}页原稿 · 保留页面顺序与教学意图`,
    tone: "原课件诊断总览",
    layout: "comparison",
    bullets: [
      `原稿页数：${analysis.pages.length}页`,
      `重点风险页：${riskCount}页`,
      `逐页诊断：${plan.pageDiagnoses.length}页`,
      "优化原则：保留原内容 → 定位问题 → 局部重排 → 对照复核",
    ],
    sourceIds: ["research-uploaded-document"],
    evidenceBlockIds: analysis.pages.flatMap((page) => page.blocks.map((block) => block.id)).slice(0, 20),
    pageIntent: "原课件分析报告",
    visualPrompt: "原课件优化总览：页面缩略图、问题分布和逐页优化流程，不生成全新课件。",
    speakerNote: "这是原课件逐页优化的总览页；后续每一页都对应原稿中的同一页。",
    sections: [{ type: "tips-grid", title: "优化闭环", items: [
      { title: "保留", body: "原页主题、顺序与教学证据", tag: "原稿" },
      { title: "诊断", body: "文字密度、层级、节奏与视觉问题", tag: "问题" },
      { title: "优化", body: "局部改写、重排与视觉补强", tag: "修改" },
      { title: "复核", body: "逐页前后对照并保留追溯", tag: "验收" },
    ] }],
  };
  const slides = [reportSlide, ...sourceSlides];
  const base = buildProjectFromPrompt(prompt, mode);
  return cleanProject({
    ...base,
    title: cleanText(analysis.fileName, base.title),
    slides,
    research: research.length ? research : [{ id: "research-uploaded-document", title: analysis.fileName, source: analysis.fileName, sourceName: analysis.fileName, sourceType: "document", status: "verified", summary: analysis.summary, confidence: 86 }]
  });
}
