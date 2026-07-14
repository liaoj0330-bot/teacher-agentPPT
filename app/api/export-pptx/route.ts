import { NextResponse } from "next/server";
import pptxgen from "pptxgenjs";
import { getCurrentUser } from "@/lib/auth";
import { defaultProject, type CanvasProject, type DesignSlide, type ResearchItem, type SlideLayout, type SlideSection } from "@/lib/canvas-data";
import { spendCredits } from "@/lib/credits";
import { evaluateExportQualityGate } from "@/lib/export-quality-gate";
import { getDesignProfile, type DeckDesignProfile, type DesignPalette } from "@/lib/ppt-design-system";
import { ensureProjectQuality } from "@/lib/project-quality";
import { cleanProject } from "@/lib/text-sanitize";
import { createTopicVisualDataUri } from "@/lib/visual-assets";
import { loadExportSource, writeCoursewareArtifact } from "@/lib/courseware-version";
import { computeDeckSpecHash } from "@/lib/deck-spec";
import { buildExportVisualTruth } from "@/lib/visual-compiler/export-visual-truth";
import { addRenderScenesToPptx } from "@/lib/visual-compiler/pptx-scene-renderer";
import type { RenderScene } from "@/lib/visual-compiler/contracts";

const W = 13.333;
const H = 7.5;

// The teacher-math route is intentionally self-sufficient: every visual below is
// a native, editable PowerPoint object.  Images may enrich a page, never complete it.
const teacherMathTokens = {
  background: "F6FAF8",
  surface: "FFFFFF",
  softSurface: "EAF5F2",
  grid: "C9DDD7",
  safeLeft: 0.78,
  safeRight: 11.9,
  contentTop: 2.12,
  footerY: 6.78,
  mathLine: 1.65
} as const;

const palettes = [
  { ink: "171719", muted: "667085", line: "E7EAF1", soft: "F7F8FC", pale: "EEF4FF", accent: "2F7CFF", accent2: "6D5DFC", good: "12B76A", warm: "F97316" },
  { ink: "111827", muted: "64748B", line: "E2E8F0", soft: "F8FAFC", pale: "ECFDF3", accent: "0F766E", accent2: "2563EB", good: "16A34A", warm: "F59E0B" },
  { ink: "1F2937", muted: "6B7280", line: "E5E7EB", soft: "FAFAFA", pale: "FFF7ED", accent: "E9503F", accent2: "F97316", good: "059669", warm: "D97706" },
  { ink: "18181B", muted: "71717A", line: "E4E4E7", soft: "FAFAFF", pale: "F5F3FF", accent: "6D5DFC", accent2: "2F7CFF", good: "10B981", warm: "F59E0B" }
];

type Palette = (typeof palettes)[number];

type ExportVisuals = {
  cover?: string;
  slides?: Record<string, string>;
};

function paletteFor(profile: DeckDesignProfile, index = 0): Palette {
  const base = profile.palette;
  const alternates = [
    base,
    { ...base, pale: base.soft, accent: base.accent2, accent2: base.accent },
    { ...base, soft: "FFFFFF", pale: base.pale },
    { ...base, pale: base.paper, accent2: base.warm }
  ] satisfies DesignPalette[];
  const selected = alternates[index % alternates.length];
  return {
    ink: selected.ink,
    muted: selected.muted,
    line: selected.line,
    soft: selected.soft,
    pale: selected.pale,
    accent: selected.accent,
    accent2: selected.accent2,
    good: selected.good,
    warm: selected.warm
  };
}

function addDeckChrome(pptx: pptxgen, slide: pptxgen.Slide, profile: DeckDesignProfile, palette: Palette, page?: number) {
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.08, fill: { color: palette.accent }, line: { color: palette.accent } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.08, w: W, h: 0.08, fill: { color: palette.line }, line: { color: palette.line } });
  addText(slide, profile.label, { x: 0.76, y: 6.94, w: 3.5, h: 0.16, fontSize: 5.8, bold: true, color: palette.muted });
  if (page) {
    addText(slide, String(page).padStart(2, "0"), { x: 11.72, y: 6.88, w: 0.72, h: 0.22, fontSize: 7.2, bold: true, color: palette.muted, align: "right" });
  }
}

function cleanFileName(value: string) {
  return (value || "AI-PPT-Agent").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "AI-PPT-Agent";
}

function shortText(value: string | undefined, max = 80) {
  const clean = (value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function fontByLength(text: string, base: number, min: number, threshold: number) {
  const len = [...(text || "")].length;
  if (len <= threshold) {
    return base;
  }
  return Math.max(min, base - Math.ceil((len - threshold) / 10));
}

function addText(slide: pptxgen.Slide, text: string, options: pptxgen.TextPropsOptions) {
  slide.addText(text || "", {
    fontFace: "Microsoft YaHei",
    breakLine: false,
    fit: "shrink",
    margin: 0,
    ...options
  });
}

function addTopBar(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, label: string, page?: number) {
  addText(slide, label, { x: 0.66, y: 0.34, w: 3.2, h: 0.23, fontSize: 7.5, bold: true, color: palette.accent });
  if (page) {
    addText(slide, String(page).padStart(2, "0"), { x: 11.7, y: 0.27, w: 0.72, h: 0.34, fontSize: 12, bold: true, color: palette.ink, align: "right" });
  }
  slide.addShape(pptx.ShapeType.line, { x: 0.66, y: 0.72, w: 12.0, h: 0, line: { color: palette.line, width: 1 } });
}

function addPageTitle(slide: pptxgen.Slide, palette: Palette, title: string, subtitle?: string) {
  addText(slide, title, {
    x: 0.78,
    y: 0.94,
    w: 9.4,
    h: 0.56,
    fontSize: fontByLength(title, 23, 17, 20),
    bold: true,
    color: palette.ink
  });
  if (subtitle) {
    addText(slide, shortText(subtitle, 92), { x: 0.8, y: 1.57, w: 10.2, h: 0.32, fontSize: 10.2, color: palette.muted });
  }
}

function addPill(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, text: string, x: number, y: number, w: number, color = palette.accent) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h: 0.34,
    rectRadius: 0.06,
    fill: { color: "FFFFFF", transparency: 5 },
    line: { color, transparency: 45, width: 1 }
  });
  addText(slide, text, { x: x + 0.12, y: y + 0.08, w: w - 0.24, h: 0.16, fontSize: 7.2, bold: true, color, align: "center" });
}

function addSourceNote(slide: pptxgen.Slide, palette: Palette, source?: ResearchItem) {
  if (!source) {
    return;
  }
  const label = `来源：${source.sourceName || source.source}${source.url ? ` · ${source.url}` : ""}`;
  addText(slide, shortText(label, 150), { x: 0.78, y: 6.97, w: 11.7, h: 0.18, fontSize: 6.3, color: palette.muted });
}

function addCard(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, x: number, y: number, w: number, h: number, fill = "FFFFFF") {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    fill: { color: fill },
    line: { color: palette.line, width: 1 }
  });
}

function addBullets(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, bullets: string[], x: number, y: number, w: number, gap = 0.46, fontSize = 10.2) {
  bullets.slice(0, 6).forEach((bullet, index) => {
    const top = y + index * gap;
    slide.addShape(pptx.ShapeType.ellipse, { x, y: top + 0.12, w: 0.1, h: 0.1, fill: { color: index % 2 ? palette.accent2 : palette.accent }, line: { color: index % 2 ? palette.accent2 : palette.accent } });
    addText(slide, shortText(bullet, 62), { x: x + 0.25, y: top, w, h: 0.3, fontSize: fontByLength(bullet, fontSize, 8.2, 34), color: palette.ink });
  });
}

function metricCard(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, x: number, y: number, title: string, value: string, color = palette.accent) {
  addCard(pptx, slide, palette, x, y, 3.22, 1.05);
  addText(slide, title, { x: x + 0.22, y: y + 0.2, w: 2.5, h: 0.2, fontSize: 7.8, color: palette.muted });
  addText(slide, value, { x: x + 0.22, y: y + 0.52, w: 2.6, h: 0.34, fontSize: fontByLength(value, 14.5, 10, 12), bold: true, color });
}

function visualForSlide(project: CanvasProject, item: DesignSlide, index: number, visuals?: ExportVisuals) {
  if (index === 0 && visuals?.cover) {
    return visuals.cover;
  }
  const slideImage = visuals?.slides?.[String(index)] || visuals?.slides?.[item.id];
  if (slideImage) {
    return slideImage;
  }
  return createTopicVisualDataUri({
    title: item.title || project.title,
    subtitle: item.subtitle,
    index,
    topic: project.title
  });
}

function sourceFor(project: CanvasProject, item: DesignSlide, index: number) {
  if (item.sourceIds?.length) {
    const matched = project.research.find((source) => item.sourceIds?.includes(source.id));
    if (matched) {
      return matched;
    }
  }
  return project.research[index % Math.max(1, project.research.length)];
}

type SectionOf<T extends SlideSection["type"]> = Extract<SlideSection, { type: T }>;

function sectionOf<T extends SlideSection["type"]>(sections: SlideSection[] | undefined, type: T): SectionOf<T> | undefined {
  return sections?.find((section): section is SectionOf<T> => section.type === type);
}

function sectionsOf<T extends SlideSection["type"]>(sections: SlideSection[] | undefined, type: T): SectionOf<T>[] {
  return (sections || []).filter((section): section is SectionOf<T> => section.type === type);
}

function addSmallLabel(slide: pptxgen.Slide, palette: Palette, text: string, x: number, y: number, w = 1.4) {
  addText(slide, shortText(text, 24), { x, y, w, h: 0.18, fontSize: 6.7, bold: true, color: palette.accent });
}

function addSectionTitle(slide: pptxgen.Slide, palette: Palette, text: string | undefined, x: number, y: number, w: number) {
  if (!text) return;
  addText(slide, shortText(text, 36), { x, y, w, h: 0.24, fontSize: 10.8, bold: true, color: palette.ink });
}

function addTagRowSection(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, section: SectionOf<"tag-row"> | undefined, x: number, y: number, maxWidth = 10.6) {
  const tags = section?.tags?.length ? section.tags : [];
  let cursor = x;
  tags.slice(0, 6).forEach((tag, index) => {
    const w = Math.min(1.7, Math.max(0.9, [...tag].length * 0.12 + 0.46));
    if (cursor + w > x + maxWidth) return;
    addPill(pptx, slide, palette, tag, cursor, y, w, index % 2 ? palette.accent2 : palette.accent);
    cursor += w + 0.12;
  });
}

function addHeroImageSection(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, project: CanvasProject, item: DesignSlide, index: number, section: SectionOf<"hero-image"> | undefined, visuals: ExportVisuals | undefined, x: number, y: number, w: number, h: number) {
  addCard(pptx, slide, palette, x, y, w, h, palette.pale);
  slide.addImage({
    data: visualForSlide(
      { ...project, title: section?.title || project.title },
      { ...item, title: section?.title || item.title, subtitle: section?.caption || item.subtitle },
      index,
      visuals
    ),
    x: x + 0.12,
    y: y + 0.12,
    w: w - 0.24,
    h: h - 0.24
  });
  if (section?.caption) {
    addText(slide, shortText(section.caption, 54), { x: x + 0.24, y: y + h - 0.42, w: w - 0.48, h: 0.18, fontSize: 6.8, color: palette.muted });
  }
}

function addTipsGridSection(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, section: SectionOf<"tips-grid"> | undefined, x: number, y: number, w: number, h: number, columns = 2) {
  if (!section?.items?.length) return;
  addSectionTitle(slide, palette, section.title, x, y, w);
  const items = section.items.slice(0, 6);
  const cardW = (w - (columns - 1) * 0.18) / columns;
  const rows = Math.ceil(items.length / columns);
  const cardH = Math.min(0.82, (h - 0.42 - (rows - 1) * 0.18) / Math.max(1, rows));
  items.forEach((tip, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const cx = x + col * (cardW + 0.18);
    const cy = y + 0.42 + row * (cardH + 0.18);
    addCard(pptx, slide, palette, cx, cy, cardW, cardH, i % 2 ? "FFFFFF" : palette.soft);
    addText(slide, shortText(tip.title, 18), { x: cx + 0.16, y: cy + 0.13, w: cardW - 0.32, h: 0.2, fontSize: 8.4, bold: true, color: palette.ink });
    addText(slide, shortText(tip.body, 48), { x: cx + 0.16, y: cy + 0.39, w: cardW - 0.32, h: 0.26, fontSize: 6.8, color: palette.muted, breakLine: true });
    if (tip.tag) {
      addText(slide, shortText(tip.tag, 10), { x: cx + cardW - 0.82, y: cy + 0.13, w: 0.62, h: 0.16, fontSize: 5.8, bold: true, color: palette.accent, align: "right" });
    }
  });
}

function addDayCardsSection(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, section: SectionOf<"day-card">, x: number, y: number, w: number, h: number) {
  addSectionTitle(slide, palette, section.title || "路线卡", x, y, w);
  const cards = section.cards.slice(0, 5);
  const cardW = (w - 0.32) / 2;
  cards.forEach((card, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const cx = x + col * (cardW + 0.32);
    const cy = y + 0.42 + row * 1.2;
    addCard(pptx, slide, palette, cx, cy, cardW, 1.0, index % 2 ? "FFFFFF" : palette.pale);
    addText(slide, card.day || `Day ${index + 1}`, { x: cx + 0.18, y: cy + 0.14, w: 0.72, h: 0.18, fontSize: 7.6, bold: true, color: index % 2 ? palette.accent2 : palette.accent });
    addText(slide, shortText(card.title, 20), { x: cx + 0.96, y: cy + 0.13, w: cardW - 1.18, h: 0.22, fontSize: 9.3, bold: true, color: palette.ink });
    addText(slide, shortText(card.route || "", 46), { x: cx + 0.18, y: cy + 0.46, w: cardW - 0.36, h: 0.18, fontSize: 6.8, color: palette.muted });
    addText(slide, shortText((card.highlights || []).join(" / "), 34), { x: cx + 0.18, y: cy + 0.72, w: cardW - 0.36, h: 0.16, fontSize: 6.2, bold: true, color: palette.accent });
  });
}

function addRouteCardSection(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, section: SectionOf<"route-card">, x: number, y: number, w: number, h: number) {
  addCard(pptx, slide, palette, x, y, w, h, palette.pale);
  addSmallLabel(slide, palette, section.title || "ROUTE", x + 0.24, y + 0.22, 1.8);
  addText(slide, shortText(`${section.origin || "起点"} -> ${section.destination || "目的地"}`, 34), { x: x + 0.24, y: y + 0.55, w: w - 0.48, h: 0.3, fontSize: 13, bold: true, color: palette.ink });
  const steps = section.steps.slice(0, 5);
  slide.addShape(pptx.ShapeType.line, { x: x + 0.38, y: y + 1.25, w: 0, h: Math.min(2.3, steps.length * 0.46), line: { color: palette.accent, width: 2 } });
  steps.forEach((step, index) => {
    const sy = y + 1.08 + index * 0.48;
    slide.addShape(pptx.ShapeType.ellipse, { x: x + 0.27, y: sy + 0.08, w: 0.22, h: 0.22, fill: { color: index === 0 ? palette.accent : "FFFFFF" }, line: { color: palette.accent, width: 1.2 } });
    addText(slide, shortText(step, 44), { x: x + 0.68, y: sy, w: w - 0.95, h: 0.26, fontSize: 8.3, color: palette.ink });
  });
  if (section.note) {
    addText(slide, shortText(section.note, 62), { x: x + 0.24, y: y + h - 0.44, w: w - 0.48, h: 0.2, fontSize: 6.6, color: palette.muted });
  }
}

function addTimelineSection(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, section: SectionOf<"timeline">, x: number, y: number, w: number, h: number) {
  addSectionTitle(slide, palette, section.title || "流程", x, y, w);
  const steps = section.steps.slice(0, 6);
  const lineY = y + h * 0.48;
  slide.addShape(pptx.ShapeType.line, { x: x + 0.22, y: lineY, w: w - 0.44, h: 0, line: { color: "C7D7FE", width: 2.4, endArrowType: "triangle" } });
  steps.forEach((step, index) => {
    const tx = x + 0.12 + index * ((w - 0.76) / Math.max(1, steps.length - 1));
    slide.addShape(pptx.ShapeType.ellipse, { x: tx, y: lineY - 0.13, w: 0.26, h: 0.26, fill: { color: index === 0 ? palette.accent : "FFFFFF" }, line: { color: palette.accent, width: 1.2 } });
    addText(slide, step.label, { x: tx - 0.24, y: lineY - 0.54, w: 0.74, h: 0.16, fontSize: 6.2, bold: true, color: palette.accent, align: "center" });
    addText(slide, shortText(step.title, 18), { x: tx - 0.54, y: lineY + 0.28, w: 1.32, h: 0.28, fontSize: 7.5, bold: true, color: palette.ink, align: "center" });
    if (step.body) {
      addText(slide, shortText(step.body, 28), { x: tx - 0.58, y: lineY + 0.64, w: 1.4, h: 0.24, fontSize: 5.8, color: palette.muted, align: "center", breakLine: true });
    }
  });
}

function addStatsSection(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, section: SectionOf<"stat-card"> | undefined, x: number, y: number, w: number) {
  if (!section?.stats?.length) return;
  addSectionTitle(slide, palette, section.title || "关键指标", x, y, w);
  const stats = section.stats.slice(0, 4);
  const cardW = (w - (stats.length - 1) * 0.16) / stats.length;
  stats.forEach((stat, index) => {
    const cx = x + index * (cardW + 0.16);
    addCard(pptx, slide, palette, cx, y + 0.4, cardW, 1.0, index % 2 ? "FFFFFF" : palette.soft);
    addText(slide, shortText(stat.label, 16), { x: cx + 0.16, y: y + 0.58, w: cardW - 0.32, h: 0.18, fontSize: 6.7, color: palette.muted });
    addText(slide, shortText(stat.value, 16), { x: cx + 0.16, y: y + 0.86, w: cardW - 0.32, h: 0.3, fontSize: fontByLength(stat.value, 12.4, 8.8, 8), bold: true, color: index % 2 ? palette.accent2 : palette.accent });
    if (stat.note) {
      addText(slide, shortText(stat.note, 24), { x: cx + 0.16, y: y + 1.2, w: cardW - 0.32, h: 0.14, fontSize: 5.6, color: palette.muted });
    }
  });
}

function addBarChartSection(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, section: SectionOf<"bar-chart"> | undefined, x: number, y: number, w: number, h: number) {
  if (!section?.bars?.length) return;
  addCard(pptx, slide, palette, x, y, w, h, "FFFFFF");
  addText(slide, section.title || "分布", { x: x + 0.22, y: y + 0.2, w: w - 0.44, h: 0.22, fontSize: 10, bold: true, color: palette.ink });
  section.bars.slice(0, 5).forEach((bar, index) => {
    const by = y + 0.7 + index * 0.48;
    const value = Math.max(0, Math.min(100, Number(bar.value) || 0));
    addText(slide, shortText(bar.label, 16), { x: x + 0.24, y: by, w: 1.28, h: 0.18, fontSize: 6.7, color: palette.ink });
    slide.addShape(pptx.ShapeType.roundRect, { x: x + 1.65, y: by + 0.04, w: w - 2.55, h: 0.15, rectRadius: 0.03, fill: { color: "EEF2F7" }, line: { color: "EEF2F7" } });
    slide.addShape(pptx.ShapeType.roundRect, { x: x + 1.65, y: by + 0.04, w: (w - 2.55) * (value / 100), h: 0.15, rectRadius: 0.03, fill: { color: index % 2 ? palette.accent2 : palette.accent }, line: { color: index % 2 ? palette.accent2 : palette.accent } });
    addText(slide, `${value}${section.unit || ""}`, { x: x + w - 0.72, y: by - 0.02, w: 0.44, h: 0.18, fontSize: 6.5, bold: true, color: palette.muted, align: "right" });
  });
}

function addDonutChartSection(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, section: SectionOf<"donut-chart"> | undefined, x: number, y: number, w: number, h: number) {
  if (!section?.segments?.length) return;
  addCard(pptx, slide, palette, x, y, w, h, palette.soft);
  addText(slide, section.title || "权重", { x: x + 0.22, y: y + 0.18, w: w - 0.44, h: 0.22, fontSize: 10, bold: true, color: palette.ink });
  const cx = x + 0.36;
  const cy = y + 0.76;
  slide.addShape(pptx.ShapeType.ellipse, { x: cx, y: cy, w: 1.55, h: 1.55, fill: { color: "FFFFFF" }, line: { color: "D8E3FF", width: 10 } });
  section.segments.slice(0, 4).forEach((segment, index) => {
    const color = segment.color || (index % 2 ? palette.accent2 : palette.accent);
    slide.addShape(pptx.ShapeType.arc, { x: cx + index * 0.06, y: cy + index * 0.06, w: 1.55 - index * 0.12, h: 1.55 - index * 0.12, line: { color, width: 3.8, transparency: index * 5 } });
  });
  addText(slide, shortText(section.centerLabel || "模型", 10), { x: cx + 0.36, y: cy + 0.62, w: 0.82, h: 0.2, fontSize: 7.2, bold: true, color: palette.ink, align: "center" });
  section.segments.slice(0, 4).forEach((segment, index) => {
    const ly = y + 0.72 + index * 0.4;
    const color = segment.color || (index % 2 ? palette.accent2 : palette.accent);
    slide.addShape(pptx.ShapeType.roundRect, { x: x + 2.22, y: ly + 0.05, w: 0.18, h: 0.12, rectRadius: 0.02, fill: { color }, line: { color } });
    addText(slide, `${shortText(segment.label, 14)} ${segment.value}%`, { x: x + 2.5, y: ly, w: w - 2.76, h: 0.18, fontSize: 6.7, color: palette.ink });
  });
  if (section.note) {
    addText(slide, shortText(section.note, 48), { x: x + 0.22, y: y + h - 0.34, w: w - 0.44, h: 0.16, fontSize: 5.8, color: palette.muted });
  }
}

function addTableSection(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, section: SectionOf<"table"> | undefined, x: number, y: number, w: number, h: number) {
  if (!section?.rows?.length) return;
  addCard(pptx, slide, palette, x, y, w, h, "FFFFFF");
  addText(slide, section.title || "表格", { x: x + 0.22, y: y + 0.17, w: w - 0.44, h: 0.22, fontSize: 10, bold: true, color: palette.ink });
  const cols = section.columns.slice(0, 4);
  const rows = section.rows.slice(0, 5);
  const colW = (w - 0.44) / Math.max(1, cols.length);
  const startY = y + 0.58;
  cols.forEach((col, colIndex) => {
    const cx = x + 0.22 + colIndex * colW;
    slide.addShape(pptx.ShapeType.rect, { x: cx, y: startY, w: colW, h: 0.32, fill: { color: palette.pale }, line: { color: palette.line, width: 0.7 } });
    addText(slide, shortText(col, 14), { x: cx + 0.08, y: startY + 0.09, w: colW - 0.16, h: 0.14, fontSize: 6.4, bold: true, color: palette.accent });
  });
  rows.forEach((row, rowIndex) => {
    const ry = startY + 0.32 + rowIndex * 0.44;
    cols.forEach((_, colIndex) => {
      const cx = x + 0.22 + colIndex * colW;
      slide.addShape(pptx.ShapeType.rect, { x: cx, y: ry, w: colW, h: 0.44, fill: { color: rowIndex % 2 ? "FFFFFF" : palette.soft }, line: { color: palette.line, width: 0.5 } });
      addText(slide, shortText(row[colIndex] || "", 22), { x: cx + 0.08, y: ry + 0.11, w: colW - 0.16, h: 0.18, fontSize: 6.2, color: palette.ink });
    });
  });
  if (section.note) {
    addText(slide, shortText(section.note, 54), { x: x + 0.22, y: y + h - 0.28, w: w - 0.44, h: 0.14, fontSize: 5.8, color: palette.muted });
  }
}

function addWarningSection(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, section: SectionOf<"warning"> | undefined, x: number, y: number, w: number) {
  if (!section) return;
  const fill = section.severity === "high" ? "FFF1F3" : section.severity === "warn" ? "FFF7ED" : "EEF4FF";
  const color = section.severity === "high" ? "E11D48" : section.severity === "warn" ? palette.warm : palette.accent;
  addCard(pptx, slide, palette, x, y, w, 0.72, fill);
  slide.addShape(pptx.ShapeType.roundRect, { x: x + 0.18, y: y + 0.18, w: 0.1, h: 0.36, rectRadius: 0.02, fill: { color }, line: { color } });
  addText(slide, shortText(section.title, 22), { x: x + 0.42, y: y + 0.14, w: 1.7, h: 0.2, fontSize: 8.2, bold: true, color });
  addText(slide, shortText(section.body, 92), { x: x + 2.0, y: y + 0.14, w: w - 2.25, h: 0.3, fontSize: 6.8, color: palette.ink, breakLine: true });
}

function addImageStripSection(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, section: SectionOf<"image-strip"> | undefined, project: CanvasProject, item: DesignSlide, index: number, x: number, y: number, w: number, h: number) {
  if (!section?.items?.length) return;
  addSectionTitle(slide, palette, section.title || "视觉素材", x, y, w);
  const items = section.items.slice(0, 3);
  const cardW = (w - 0.24 * (items.length - 1)) / items.length;
  items.forEach((image, imageIndex) => {
    const cx = x + imageIndex * (cardW + 0.24);
    addCard(pptx, slide, palette, cx, y + 0.42, cardW, h - 0.42, palette.pale);
    slide.addImage({
      data: createTopicVisualDataUri({
        title: image.title,
        subtitle: image.caption,
        index: index + imageIndex,
        topic: project.title
      }),
      x: cx + 0.08,
      y: y + 0.5,
      w: cardW - 0.16,
      h: h - 0.78
    });
    addText(slide, shortText(image.title, 18), { x: cx + 0.12, y: y + h - 0.28, w: cardW - 0.24, h: 0.14, fontSize: 5.8, bold: true, color: palette.ink });
  });
}

function addSourceNoteSection(slide: pptxgen.Slide, palette: Palette, section: SectionOf<"source-note"> | undefined, source?: ResearchItem) {
  const text = section?.text || (source ? `来源：${source.sourceName || source.source}${source.url ? ` · ${source.url}` : ""}` : "");
  if (!text) return;
  addText(slide, shortText(text, 150), { x: 0.78, y: 6.94, w: 11.7, h: 0.18, fontSize: 6.2, color: palette.muted });
}

function addSectionBasedSlide(pptx: pptxgen, project: CanvasProject, profile: DeckDesignProfile, item: DesignSlide, index: number, source?: ResearchItem, visuals?: ExportVisuals) {
  const palette = paletteFor(profile, index);
  const sections = item.sections || [];
  const slide = pptx.addSlide();
  slide.background = { color: index % 2 ? profile.palette.paper : palette.soft };
  addDeckChrome(pptx, slide, profile, palette, index + 1);
  addTopBar(pptx, slide, palette, item.tone || "PLANNED PAGE", index + 1);
  addPageTitle(slide, palette, item.title, item.subtitle);
  addTagRowSection(pptx, slide, palette, sectionOf(sections, "tag-row"), 0.8, 1.86, 9.5);

  const dayCards = sectionOf(sections, "day-card");
  const routeCard = sectionOf(sections, "route-card");
  const statCard = sectionOf(sections, "stat-card");
  const table = sectionOf(sections, "table");
  const donut = sectionOf(sections, "donut-chart");
  const bar = sectionOf(sections, "bar-chart");
  const timeline = sectionOf(sections, "timeline");
  const warning = sectionOf(sections, "warning");
  const hero = sectionOf(sections, "hero-image");
  const imageStrip = sectionOf(sections, "image-strip");
  const tips = sectionOf(sections, "tips-grid");
  const quote = sectionOf(sections, "quote");
  const callout = sectionOf(sections, "callout");

  if (dayCards) {
    addDayCardsSection(pptx, slide, palette, dayCards, 0.86, 2.14, 7.05, 3.55);
    addHeroImageSection(pptx, slide, palette, project, item, index, hero, visuals, 8.28, 2.14, 3.72, 2.18);
    addWarningSection(pptx, slide, palette, warning, 8.28, 4.58, 3.72);
    addSourceNoteSection(slide, palette, sectionOf(sections, "source-note"), source);
    return;
  }

  if (routeCard) {
    addRouteCardSection(pptx, slide, palette, routeCard, 0.86, 2.12, 5.25, 3.75);
    addTipsGridSection(pptx, slide, palette, tips, 6.42, 2.12, 5.55, 3.75, 1);
    addWarningSection(pptx, slide, palette, warning, 0.86, 6.02, 11.1);
    addSourceNoteSection(slide, palette, sectionOf(sections, "source-note"), source);
    return;
  }

  if (table && donut) {
    addTableSection(pptx, slide, palette, table, 0.86, 2.08, 6.45, 3.72);
    addDonutChartSection(pptx, slide, palette, donut, 7.62, 2.08, 4.35, 2.72);
    addWarningSection(pptx, slide, palette, warning, 7.62, 5.08, 4.35);
    addSourceNoteSection(slide, palette, sectionOf(sections, "source-note"), source);
    return;
  }

  if (statCard || bar || donut) {
    addStatsSection(pptx, slide, palette, statCard, 0.86, 2.08, 11.05);
    addBarChartSection(pptx, slide, palette, bar, 0.86, 3.72, 6.25, 2.1);
    addDonutChartSection(pptx, slide, palette, donut, 7.42, 3.72, 4.55, 2.1);
    addSourceNoteSection(slide, palette, sectionOf(sections, "source-note"), source);
    return;
  }

  if (timeline) {
    addTimelineSection(pptx, slide, palette, timeline, 0.86, 2.18, 11.05, 2.35);
    addTipsGridSection(pptx, slide, palette, tips, 0.86, 4.78, 11.05, 1.22, 3);
    addSourceNoteSection(slide, palette, sectionOf(sections, "source-note"), source);
    return;
  }

  if (imageStrip) {
    addImageStripSection(pptx, slide, palette, imageStrip, project, item, index, 0.86, 2.08, 11.1, 2.25);
    addTipsGridSection(pptx, slide, palette, tips, 0.86, 4.65, 11.1, 1.42, 3);
    addSourceNoteSection(slide, palette, sectionOf(sections, "source-note"), source);
    return;
  }

  if (quote) {
    addText(slide, "“", { x: 0.86, y: 2.05, w: 0.52, h: 0.56, fontSize: 34, bold: true, color: palette.accent });
    addText(slide, shortText(quote.text, 92), { x: 1.36, y: 2.28, w: 8.6, h: 0.95, fontSize: fontByLength(quote.text, 22, 15, 35), bold: true, color: palette.ink, breakLine: true });
    if (quote.author) {
      addText(slide, quote.author, { x: 1.4, y: 3.42, w: 2.4, h: 0.2, fontSize: 8.2, color: palette.muted });
    }
    addTipsGridSection(pptx, slide, palette, tips, 1.0, 4.1, 10.9, 1.55, 3);
    addSourceNoteSection(slide, palette, sectionOf(sections, "source-note"), source);
    return;
  }

  if (callout) {
    addCard(pptx, slide, palette, 0.86, 2.1, 4.8, 3.35, palette.pale);
    addSmallLabel(slide, palette, "PAGE CLAIM", 1.16, 2.4, 1.5);
    addText(slide, shortText(callout.title, 30), { x: 1.16, y: 2.78, w: 4.08, h: 0.52, fontSize: 17, bold: true, color: palette.ink, breakLine: true });
    addText(slide, shortText(callout.body, 118), { x: 1.16, y: 3.62, w: 4.05, h: 0.86, fontSize: 9.2, color: palette.muted, breakLine: true });
    addTipsGridSection(pptx, slide, palette, tips, 6.02, 2.1, 5.98, 3.35, 2);
    addSourceNoteSection(slide, palette, sectionOf(sections, "source-note"), source);
    return;
  }

  if (tips) {
    addTipsGridSection(pptx, slide, palette, tips, 0.86, 2.08, 7.0, 3.82, 2);
    addHeroImageSection(pptx, slide, palette, project, item, index, hero, visuals, 8.35, 2.08, 3.62, 2.6);
    addWarningSection(pptx, slide, palette, warning, 8.35, 4.95, 3.62);
    addSourceNoteSection(slide, palette, sectionOf(sections, "source-note"), source);
    return;
  }

  addHeroImageSection(pptx, slide, palette, project, item, index, hero, visuals, 0.86, 2.08, 4.5, 3.2);
  addBullets(pptx, slide, palette, item.bullets || [], 5.95, 2.38, 5.6, 0.5, 10.2);
  addSourceNoteSection(slide, palette, sectionOf(sections, "source-note"), source);
}

function resolveLayout(item: DesignSlide, index: number): SlideLayout {
  if (item.layout) {
    return item.layout;
  }
  const text = `${item.title} ${item.subtitle} ${(item.bullets || []).join(" ")}`;
  if (/目录|总览|路线/.test(text)) return "agenda";
  if (/预算|指标|数据|收入|成本|页数/.test(text)) return "stats";
  if (/阶段|路径|时间|里程碑/.test(text)) return "timeline";
  if (/对比|选择|方案/.test(text)) return "comparison";
  if (/来源|资料|证据|引用/.test(text)) return "evidence";
  if (/清单|避坑|注意|下一步/.test(text)) return "checklist";
  return ["split", "matrix", "process", "cards"][index % 4] as SlideLayout;
}

function addCover(pptx: pptxgen, project: CanvasProject, profile: DeckDesignProfile, slides: DesignSlide[], visuals?: ExportVisuals) {
  const palette = paletteFor(profile, 0);
  const coverSlide = slides[0];
  const coverStats = sectionOf(coverSlide?.sections, "stat-card");
  const coverTags = sectionOf(coverSlide?.sections, "tag-row");
  const coverHero = sectionOf(coverSlide?.sections, "hero-image");
  const cover = pptx.addSlide();
  cover.background = { color: palette.soft };
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: palette.soft }, line: { color: palette.soft } });
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.22, h: H, fill: { color: palette.accent }, line: { color: palette.accent } });
  cover.addShape(pptx.ShapeType.roundRect, { x: 7.18, y: 0.82, w: 4.78, h: 4.15, rectRadius: 0.09, fill: { color: palette.pale }, line: { color: palette.line, transparency: 20 } });
  cover.addImage({ data: visualForSlide(project, { ...slides[0], title: coverHero?.title || slides[0]?.title, subtitle: coverHero?.caption || slides[0]?.subtitle }, 0, visuals), x: 7.34, y: 0.98, w: 4.46, h: 3.84 });
  addText(cover, profile.coverLabel, { x: 0.92, y: 0.84, w: 2.9, h: 0.2, fontSize: 7.6, bold: true, color: palette.accent });
  const displayTitle = shortText((coverSlide?.title || project.title || "AI PPT Agent").replace(/\s*[，,].*$/g, ""), 42);
  addText(cover, displayTitle, { x: 0.9, y: 1.48, w: 5.95, h: 1.26, fontSize: fontByLength(displayTitle, 34, 22, 16), bold: true, color: palette.ink, breakLine: true });
  addText(cover, shortText(coverSlide?.subtitle || project.prompt, 104), { x: 0.94, y: 2.94, w: 5.78, h: 0.62, fontSize: 11.2, color: palette.muted, breakLine: true });
  const stats = coverStats?.stats?.length
    ? coverStats.stats
    : [
        { label: "页数", value: `${slides.length} 页` },
        { label: "风格", value: "商务简约" },
        { label: "状态", value: "可编辑" }
      ];
  stats.slice(0, 3).forEach((stat, index) => metricCard(pptx, cover, palette, 0.94 + index * 2.04, 4.28, stat.label, stat.value, index === 2 ? palette.good : index === 1 ? palette.ink : palette.accent));
  addTagRowSection(pptx, cover, palette, coverTags, 0.94, 5.62, 6.4);
  addText(cover, "Review Center -> Planning -> Design -> Editable PPTX", { x: 0.94, y: 6.18, w: 6.4, h: 0.24, fontSize: 8.2, bold: true, color: palette.accent });
  addText(cover, profile.name, { x: 9.04, y: 6.18, w: 2.9, h: 0.2, fontSize: 7.2, bold: true, color: palette.muted, align: "right" });
}

function addAgendaSlide(pptx: pptxgen, project: CanvasProject, profile: DeckDesignProfile, slides: DesignSlide[]) {
  const palette = paletteFor(profile, 1);
  const slide = pptx.addSlide();
  slide.background = { color: profile.palette.paper };
  addDeckChrome(pptx, slide, profile, palette, 2);
  addTopBar(pptx, slide, palette, "CONTENT MAP", 2);
  addPageTitle(slide, palette, "目录与叙事线", "先看结构，再进入逐页内容和证据。");
  slides.slice(1, 10).forEach((item, index) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    const x = 0.86 + col * 4.05;
    const y = 2.1 + row * 1.18;
    addCard(pptx, slide, palette, x, y, 3.55, 0.92, index % 2 ? palette.soft : palette.pale);
    addText(slide, String(index + 1).padStart(2, "0"), { x: x + 0.2, y: y + 0.18, w: 0.5, h: 0.22, fontSize: 8.5, bold: true, color: palette.accent });
    addText(slide, shortText(item.title, 26), { x: x + 0.78, y: y + 0.15, w: 2.5, h: 0.26, fontSize: 9.8, bold: true, color: palette.ink });
    addText(slide, shortText(item.subtitle, 34), { x: x + 0.78, y: y + 0.49, w: 2.5, h: 0.2, fontSize: 6.8, color: palette.muted });
  });
  addText(slide, `${project.research.length} 条资料源进入资料模块`, { x: 0.88, y: 6.32, w: 4.2, h: 0.24, fontSize: 9.5, bold: true, color: palette.accent });
}

function addSectionSlide(pptx: pptxgen, profile: DeckDesignProfile, item: DesignSlide, index: number) {
  const palette = paletteFor(profile, index);
  const slide = pptx.addSlide();
  slide.background = { color: palette.ink };
  addText(slide, String(index + 1).padStart(2, "0"), { x: 0.82, y: 0.62, w: 1, h: 0.42, fontSize: 18, bold: true, color: "FFFFFF" });
  slide.addShape(pptx.ShapeType.line, { x: 0.82, y: 1.18, w: 2.0, h: 0, line: { color: palette.accent, width: 5 } });
  addText(slide, item.title, { x: 0.82, y: 2.1, w: 8.8, h: 0.92, fontSize: fontByLength(item.title, 34, 24, 15), bold: true, color: "FFFFFF" });
  addText(slide, shortText(item.subtitle, 90), { x: 0.86, y: 3.22, w: 7.0, h: 0.54, fontSize: 13, color: "D1D5DB" });
  (item.bullets || []).slice(0, 3).forEach((bullet, bulletIndex) => {
    addPill(pptx, slide, palette, shortText(bullet, 16), 0.86 + bulletIndex * 2.2, 4.58, 1.88, bulletIndex % 2 ? palette.accent2 : palette.accent);
  });
  slide.addShape(pptx.ShapeType.arc, { x: 9.3, y: 1.28, w: 3.2, h: 3.2, line: { color: palette.accent, transparency: 20, width: 3 } });
  slide.addShape(pptx.ShapeType.arc, { x: 9.85, y: 1.84, w: 2.1, h: 2.1, line: { color: palette.accent2, transparency: 20, width: 3 } });
}

function addSplitSlide(pptx: pptxgen, project: CanvasProject, profile: DeckDesignProfile, item: DesignSlide, index: number, source?: ResearchItem, visuals?: ExportVisuals) {
  const palette = paletteFor(profile, index);
  const slide = pptx.addSlide();
  slide.background = { color: index % 2 ? palette.soft : "FFFFFF" };
  addDeckChrome(pptx, slide, profile, palette, index + 1);
  addTopBar(pptx, slide, palette, "INSIGHT", index + 1);
  addPageTitle(slide, palette, item.title, item.subtitle);
  addCard(pptx, slide, palette, 0.86, 2.15, 5.35, 3.66);
  addText(slide, "关键判断", { x: 1.16, y: 2.45, w: 1.6, h: 0.3, fontSize: 11.5, bold: true, color: palette.ink });
  addBullets(pptx, slide, palette, item.bullets || [], 1.16, 3.02, 4.38, 0.48, 10.5);
  addCard(pptx, slide, palette, 6.62, 2.15, 5.3, 3.66, palette.pale);
  slide.addImage({ data: visualForSlide(project, item, index, visuals), x: 6.78, y: 2.31, w: 4.98, h: 2.35 });
  addText(slide, source ? `${source.sourceName || source.source} · 置信度 ${source.confidence}%` : "资料待补充", { x: 6.88, y: 5.05, w: 4.8, h: 0.24, fontSize: 7.4, bold: true, color: source?.confidence && source.confidence >= 80 ? palette.good : palette.accent });
  addSourceNote(slide, palette, source);
}

function addMatrixSlide(pptx: pptxgen, profile: DeckDesignProfile, item: DesignSlide, index: number, source?: ResearchItem) {
  const palette = paletteFor(profile, index);
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  addDeckChrome(pptx, slide, profile, palette, index + 1);
  addTopBar(pptx, slide, palette, "STRUCTURE", index + 1);
  addPageTitle(slide, palette, item.title, item.subtitle);
  const bullets = item.bullets?.length ? item.bullets : ["核心模块", "支撑资源", "交付成果", "风险控制"];
  bullets.slice(0, 6).forEach((bullet, i) => {
    const x = 0.88 + (i % 3) * 4.05;
    const y = 2.14 + Math.floor(i / 3) * 1.58;
    addCard(pptx, slide, palette, x, y, 3.55, 1.16, i % 2 ? palette.soft : palette.pale);
    addText(slide, `0${i + 1}`, { x: x + 0.2, y: y + 0.18, w: 0.52, h: 0.22, fontSize: 8.5, bold: true, color: palette.accent });
    addText(slide, shortText(bullet, 42), { x: x + 0.2, y: y + 0.52, w: 3.05, h: 0.34, fontSize: fontByLength(bullet, 10.6, 8.2, 24), bold: true, color: palette.ink });
  });
  addSourceNote(slide, palette, source);
}

function addTimelineSlide(pptx: pptxgen, profile: DeckDesignProfile, item: DesignSlide, index: number, source?: ResearchItem) {
  const palette = paletteFor(profile, index);
  const slide = pptx.addSlide();
  slide.background = { color: palette.soft };
  addDeckChrome(pptx, slide, profile, palette, index + 1);
  addTopBar(pptx, slide, palette, "TIMELINE", index + 1);
  addPageTitle(slide, palette, item.title, item.subtitle);
  const bullets = item.bullets?.length ? item.bullets.slice(0, 5) : ["启动准备", "资料确认", "内容策划", "视觉生成", "导出复核"];
  slide.addShape(pptx.ShapeType.line, { x: 1.08, y: 3.35, w: 10.95, h: 0, line: { color: "C7D7FE", width: 3, endArrowType: "triangle" } });
  bullets.forEach((bullet, i) => {
    const x = 1.02 + i * (10.2 / Math.max(1, bullets.length - 1));
    slide.addShape(pptx.ShapeType.ellipse, { x, y: 3.2, w: 0.28, h: 0.28, fill: { color: i === 0 ? palette.accent : "FFFFFF" }, line: { color: palette.accent, width: 1.5 } });
    addText(slide, shortText(bullet, 24), { x: x - 0.45, y: i % 2 ? 3.72 : 2.42, w: 1.36, h: 0.54, fontSize: 8.5, bold: true, color: palette.ink, align: "center" });
  });
  addSourceNote(slide, palette, source);
}

function addStatsSlide(pptx: pptxgen, profile: DeckDesignProfile, item: DesignSlide, index: number, source?: ResearchItem) {
  const palette = paletteFor(profile, index);
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  addDeckChrome(pptx, slide, profile, palette, index + 1);
  addTopBar(pptx, slide, palette, "DATA VIEW", index + 1);
  addPageTitle(slide, palette, item.title, item.subtitle);
  const bullets = item.bullets?.length ? item.bullets : ["资料置信度", "页面完成度", "可编辑状态"];
  bullets.slice(0, 4).forEach((bullet, i) => {
    metricCard(pptx, slide, palette, 0.9 + i * 3.02, 2.15, `指标 ${i + 1}`, shortText(bullet, 18), i % 2 ? palette.accent2 : palette.accent);
  });
  const bars = bullets.slice(0, 4);
  bars.forEach((bullet, i) => {
    const y = 4.2 + i * 0.42;
    addText(slide, shortText(bullet, 20), { x: 1.0, y, w: 2.3, h: 0.18, fontSize: 7.8, color: palette.ink });
    slide.addShape(pptx.ShapeType.roundRect, { x: 3.35, y: y + 0.04, w: 7.2, h: 0.12, rectRadius: 0.03, fill: { color: "EEF2F7" }, line: { color: "EEF2F7" } });
    slide.addShape(pptx.ShapeType.roundRect, { x: 3.35, y: y + 0.04, w: 4.2 + i * 0.75, h: 0.12, rectRadius: 0.03, fill: { color: i % 2 ? palette.accent2 : palette.accent }, line: { color: i % 2 ? palette.accent2 : palette.accent } });
  });
  addSourceNote(slide, palette, source);
}

function addComparisonSlide(pptx: pptxgen, profile: DeckDesignProfile, item: DesignSlide, index: number, source?: ResearchItem) {
  const palette = paletteFor(profile, index);
  const slide = pptx.addSlide();
  slide.background = { color: palette.soft };
  addDeckChrome(pptx, slide, profile, palette, index + 1);
  addTopBar(pptx, slide, palette, "COMPARISON", index + 1);
  addPageTitle(slide, palette, item.title, item.subtitle);
  const bullets = item.bullets?.length ? item.bullets : ["方案 A", "方案 B", "选择建议", "执行提示"];
  [["推荐路径", bullets.slice(0, 2)], ["备选路径", bullets.slice(2, 4)]].forEach(([heading, items], col) => {
    const x = 0.9 + col * 6.0;
    addCard(pptx, slide, palette, x, 2.12, 5.35, 3.55, col ? "FFFFFF" : palette.pale);
    addText(slide, heading as string, { x: x + 0.3, y: 2.42, w: 2.2, h: 0.3, fontSize: 12, bold: true, color: col ? palette.accent2 : palette.accent });
    addBullets(pptx, slide, palette, items as string[], x + 0.3, 3.05, 4.55, 0.62, 11);
  });
  addSourceNote(slide, palette, source);
}

function addChecklistSlide(pptx: pptxgen, profile: DeckDesignProfile, item: DesignSlide, index: number, source?: ResearchItem) {
  const palette = paletteFor(profile, index);
  const slide = pptx.addSlide();
  slide.background = { color: palette.soft };
  addDeckChrome(pptx, slide, profile, palette, index + 1);
  addTopBar(pptx, slide, palette, "CHECKLIST", index + 1);
  addPageTitle(slide, palette, item.title, item.subtitle);
  const bullets = item.bullets?.length ? item.bullets : ["确认资料", "确认版式", "确认来源", "导出复核"];
  bullets.slice(0, 5).forEach((bullet, i) => {
    const y = 2.05 + i * 0.74;
    addCard(pptx, slide, palette, 0.96, y, 10.95, 0.52);
    slide.addShape(pptx.ShapeType.ellipse, { x: 1.24, y: y + 0.16, w: 0.2, h: 0.2, fill: { color: palette.good }, line: { color: palette.good } });
    addText(slide, shortText(bullet, 78), { x: 1.68, y: y + 0.15, w: 9.6, h: 0.22, fontSize: 10.2, bold: true, color: palette.ink });
  });
  addSourceNote(slide, palette, source);
}

function addEvidenceSlide(pptx: pptxgen, profile: DeckDesignProfile, item: DesignSlide, index: number, source?: ResearchItem) {
  const palette = paletteFor(profile, index);
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  addDeckChrome(pptx, slide, profile, palette, index + 1);
  addTopBar(pptx, slide, palette, "EVIDENCE", index + 1);
  addPageTitle(slide, palette, item.title, item.subtitle);
  addCard(pptx, slide, palette, 0.9, 2.1, 4.05, 3.6, palette.pale);
  addText(slide, "资料证据", { x: 1.2, y: 2.42, w: 1.8, h: 0.3, fontSize: 12, bold: true, color: palette.ink });
  addText(slide, shortText(source?.summary || item.speakerNote || "本页保留来源与证据块，便于后续核验。", 180), { x: 1.2, y: 2.98, w: 3.28, h: 1.46, fontSize: 11.2, color: palette.ink, breakLine: true });
  addText(slide, source ? `${source.confidence}%` : "N/A", { x: 1.2, y: 4.78, w: 1.2, h: 0.38, fontSize: 18, bold: true, color: palette.accent });
  addText(slide, "置信度", { x: 2.48, y: 4.88, w: 1.0, h: 0.18, fontSize: 7.5, color: palette.muted });
  addCard(pptx, slide, palette, 5.28, 2.1, 6.65, 3.6);
  addBullets(pptx, slide, palette, item.bullets || [], 5.62, 2.55, 5.65, 0.48, 10.5);
  if (item.evidenceBlockIds?.length) {
    addText(slide, "资料来源已挂载，可在工作台回溯原始内容。", { x: 5.62, y: 5.28, w: 5.8, h: 0.2, fontSize: 6.3, color: palette.muted });
  }
  addSourceNote(slide, palette, source);
}

function addProcessSlide(pptx: pptxgen, profile: DeckDesignProfile, item: DesignSlide, index: number, source?: ResearchItem) {
  const palette = paletteFor(profile, index);
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  addDeckChrome(pptx, slide, profile, palette, index + 1);
  addTopBar(pptx, slide, palette, "PROCESS", index + 1);
  addPageTitle(slide, palette, item.title, item.subtitle);
  const bullets = item.bullets?.length ? item.bullets.slice(0, 5) : ["解析", "大纲", "策划", "设计", "导出"];
  bullets.forEach((bullet, i) => {
    const x = 0.82 + i * 2.42;
    addCard(pptx, slide, palette, x, 2.72, 1.88, 1.52, i % 2 ? palette.soft : palette.pale);
    addText(slide, String(i + 1), { x: x + 0.24, y: 3.0, w: 0.38, h: 0.26, fontSize: 11, bold: true, color: palette.accent });
    addText(slide, shortText(bullet, 18), { x: x + 0.24, y: 3.42, w: 1.36, h: 0.3, fontSize: 9.5, bold: true, color: palette.ink, align: "center" });
    if (i < bullets.length - 1) {
      slide.addShape(pptx.ShapeType.line, { x: x + 1.9, y: 3.48, w: 0.48, h: 0, line: { color: palette.accent, width: 1.5, endArrowType: "triangle" } });
    }
  });
  addSourceNote(slide, palette, source);
}

function addQuoteSlide(pptx: pptxgen, profile: DeckDesignProfile, item: DesignSlide, index: number, source?: ResearchItem) {
  const palette = paletteFor(profile, index);
  const slide = pptx.addSlide();
  slide.background = { color: palette.pale };
  addDeckChrome(pptx, slide, profile, palette, index + 1);
  addTopBar(pptx, slide, palette, "KEY MESSAGE", index + 1);
  const quote = item.bullets?.[0] || item.subtitle || item.title;
  addText(slide, "“", { x: 0.88, y: 1.45, w: 0.8, h: 0.8, fontSize: 44, bold: true, color: palette.accent });
  addText(slide, shortText(quote, 88), { x: 1.46, y: 1.78, w: 8.8, h: 1.35, fontSize: fontByLength(quote, 26, 18, 32), bold: true, color: palette.ink, breakLine: true });
  addText(slide, shortText(item.title, 60), { x: 1.5, y: 3.55, w: 6.2, h: 0.36, fontSize: 12, bold: true, color: palette.accent });
  addBullets(pptx, slide, palette, (item.bullets || []).slice(1), 1.52, 4.28, 8.8, 0.44, 9.8);
  addSourceNote(slide, palette, source);
}

function addClosingSlide(pptx: pptxgen, profile: DeckDesignProfile, item: DesignSlide, index: number) {
  const palette = paletteFor(profile, index);
  const slide = pptx.addSlide();
  slide.background = { color: palette.ink };
  addText(slide, item.title || "下一步", { x: 0.92, y: 1.1, w: 8.2, h: 0.78, fontSize: fontByLength(item.title, 30, 22, 18), bold: true, color: "FFFFFF" });
  addText(slide, shortText(item.subtitle, 96), { x: 0.95, y: 2.04, w: 7.0, h: 0.46, fontSize: 12, color: "D1D5DB" });
  (item.bullets || []).slice(0, 4).forEach((bullet, i) => {
    addCard(pptx, slide, { ...palette, line: "374151" }, 0.96 + (i % 2) * 5.4, 3.1 + Math.floor(i / 2) * 1.0, 4.8, 0.72, "1F2937");
    addText(slide, shortText(bullet, 46), { x: 1.22 + (i % 2) * 5.4, y: 3.34 + Math.floor(i / 2) * 1.0, w: 4.1, h: 0.22, fontSize: 9.6, bold: true, color: "FFFFFF" });
  });
  addText(slide, "AI PPT Agent · editable PPTX", { x: 0.96, y: 6.48, w: 3.5, h: 0.22, fontSize: 8, bold: true, color: palette.accent });
}

function addSourcesSlide(pptx: pptxgen, profile: DeckDesignProfile, research: ResearchItem[]) {
  const palette = paletteFor(profile, 0);
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  addTopBar(pptx, slide, palette, "SOURCES");
  addPageTitle(slide, palette, "资料检索与真实来源", "以下来源已进入资料模块，后续可以继续核验和替换。");
  research.slice(0, 8).forEach((item, index) => {
    const x = 0.86 + (index % 2) * 5.95;
    const y = 2.05 + Math.floor(index / 2) * 1.14;
    const fill = item.confidence < 60 ? "FFF7ED" : item.confidence < 80 ? "EFF6FF" : "ECFDF3";
    addCard(pptx, slide, palette, x, y, 5.32, 0.88, fill);
    addText(slide, shortText(item.title, 32), { x: x + 0.2, y: y + 0.14, w: 3.7, h: 0.22, fontSize: 9.1, bold: true, color: palette.ink });
    addText(slide, `${item.confidence}%`, { x: x + 4.34, y: y + 0.14, w: 0.58, h: 0.2, fontSize: 9.2, bold: true, color: item.confidence < 60 ? palette.warm : palette.good, align: "right" });
    addText(slide, shortText(item.url || item.sourceName || item.source, 64), { x: x + 0.2, y: y + 0.5, w: 4.7, h: 0.16, fontSize: 6.2, color: palette.accent });
  });
}

function addGenericSlide(pptx: pptxgen, project: CanvasProject, profile: DeckDesignProfile, item: DesignSlide, index: number, source?: ResearchItem, visuals?: ExportVisuals) {
  if (item.sections?.length) {
    return addSectionBasedSlide(pptx, project, profile, item, index, source, visuals);
  }
  const layout = resolveLayout(item, index);
  if (layout === "section") return addSectionSlide(pptx, profile, item, index);
  if (layout === "timeline" || layout === "day-route") return addTimelineSlide(pptx, profile, item, index, source);
  if (layout === "matrix" || layout === "cards") return addMatrixSlide(pptx, profile, item, index, source);
  if (layout === "stats" || layout === "budget") return addStatsSlide(pptx, profile, item, index, source);
  if (layout === "comparison") return addComparisonSlide(pptx, profile, item, index, source);
  if (layout === "checklist") return addChecklistSlide(pptx, profile, item, index, source);
  if (layout === "evidence" || layout === "source") return addEvidenceSlide(pptx, profile, item, index, source);
  if (layout === "process" || layout === "map") return addProcessSlide(pptx, profile, item, index, source);
  if (layout === "quote") return addQuoteSlide(pptx, profile, item, index, source);
  if (layout === "closing") return addClosingSlide(pptx, profile, item, index);
  return addSplitSlide(pptx, project, profile, item, index, source, visuals);
}

function teacherMathText(item: DesignSlide, label: string) {
  const block = (item.bullets || []).find((bullet) => new RegExp(`^${label}[：:]\\s*`).test(bullet));
  return block ? block.replace(new RegExp(`^${label}[：:]\\s*`), "").trim() : "";
}

function teacherMathBlock(item: DesignSlide, labels: string[]) {
  for (const label of labels) {
    const text = teacherMathText(item, label);
    if (text) return text;
  }
  return "";
}

function teacherMathBulletBodies(item: DesignSlide) {
  return (item.bullets || [])
    .map((bullet) => bullet.replace(/^[^：:]{1,12}[：:]\s*/, "").trim())
    .filter(Boolean);
}

function addTeacherHeader(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, project: CanvasProject, item: DesignSlide, page: number, role: string) {
  slide.background = { color: page % 2 ? teacherMathTokens.background : teacherMathTokens.surface };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.1, fill: { color: palette.accent }, line: { color: palette.accent } });
  addText(slide, role, { x: 0.72, y: 0.34, w: 3.4, h: 0.24, fontSize: 8, bold: true, color: palette.accent });
  addText(slide, String(page).padStart(2, "0"), { x: 11.75, y: 0.28, w: 0.7, h: 0.28, fontSize: 11, bold: true, color: palette.ink, align: "right" });
  addText(slide, item.title, { x: teacherMathTokens.safeLeft, y: 0.82, w: 10.8, h: 0.58, fontSize: fontByLength(item.title, 27, 21, 18), bold: true, color: palette.ink });
  addText(slide, item.subtitle, { x: 0.74, y: 1.45, w: 10.8, h: 0.35, fontSize: 12, color: palette.muted });
  slide.addShape(pptx.ShapeType.line, { x: teacherMathTokens.safeLeft, y: 1.9, w: 11.9, h: 0, line: { color: palette.line, width: 1 } });
  const context = project.contentPlan?.teacherContext;
  const modeLabel = context?.generationMode === "chapter_prep" ? "章节备课" : context?.generationMode === "lesson_plan" ? "教案生成" : context?.generationMode === "optimize_existing" ? "课件优化" : "课堂课件";
  const footer = [context?.schoolStage, context?.grade, context?.subject, modeLabel].filter(Boolean).join(" · ");
  const source = [context?.textbook, context?.chapter].filter(Boolean).join(" · ");
  addText(slide, footer || "BNSR · 教师课件", { x: 0.74, y: 7.02, w: 5.2, h: 0.14, fontSize: 5.8, color: palette.muted });
  if (source) addText(slide, `教材来源  ${source}`, { x: 7.1, y: 7.0, w: 5.1, h: 0.16, fontSize: 6.2, bold: true, color: palette.accent, align: "right" });
}

function addMathGraph(pptx: pptxgen, slide: pptxgen.Slide, palette: Palette, x: number, y: number, w: number, h: number, lines: Array<{ k: number; b: number; color: string; label: string }>, range = 4) {
  addCard(pptx, slide, palette, x, y, w, h, "FFFFFF");
  const gx = x + 0.42, gy = y + 0.3, gw = w - 0.72, gh = h - 0.62;
  for (let i = -range; i <= range; i++) {
    const px = gx + ((i + range) / (range * 2)) * gw;
    const py = gy + ((range - i) / (range * 2)) * gh;
    slide.addShape(pptx.ShapeType.line, { x: px, y: gy, w: 0, h: gh, line: { color: i === 0 ? palette.ink : "DDE9E6", width: i === 0 ? 1.3 : 0.5 } });
    slide.addShape(pptx.ShapeType.line, { x: gx, y: py, w: gw, h: 0, line: { color: i === 0 ? palette.ink : "DDE9E6", width: i === 0 ? 1.3 : 0.5 } });
    if (i !== 0) {
      addText(slide, String(i), { x: px - 0.12, y: gy + gh / 2 + 0.05, w: 0.24, h: 0.12, fontSize: 5.2, color: palette.muted, align: "center" });
      addText(slide, String(i), { x: gx + gw / 2 + 0.06, y: py - 0.06, w: 0.24, h: 0.12, fontSize: 5.2, color: palette.muted });
    }
  }
  addText(slide, "x", { x: gx + gw - 0.08, y: gy + gh / 2 + 0.08, w: 0.2, h: 0.14, fontSize: 7, bold: true, color: palette.ink });
  addText(slide, "y", { x: gx + gw / 2 + 0.08, y: gy - 0.08, w: 0.2, h: 0.14, fontSize: 7, bold: true, color: palette.ink });
  lines.forEach((fn, index) => {
    const points: Array<{ x: number; y: number }> = [];
    for (let xv = -range; xv <= range; xv += 0.2) {
      const yv = fn.k * xv + fn.b;
      if (yv >= -range && yv <= range) points.push({ x: gx + ((xv + range) / (range * 2)) * gw, y: gy + ((range - yv) / (range * 2)) * gh });
    }
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      slide.addShape(pptx.ShapeType.line, {
        x: points[i - 1].x,
        y: Math.min(points[i - 1].y, points[i].y),
        w: Math.abs(dx),
        h: Math.abs(dy),
        flipV: dy < 0,
        line: { color: fn.color, width: 2 }
      });
    }
    addText(slide, fn.label, { x: x + 0.2, y: y + h - 0.23 - index * 0.18, w: 1.45, h: 0.14, fontSize: 5.8, bold: true, color: fn.color });
  });
}

function addTeacherMathCover(pptx: pptxgen, project: CanvasProject, profile: DeckDesignProfile, item: DesignSlide, visuals?: ExportVisuals) {
  const palette = paletteFor(profile, 1);
  const slide = pptx.addSlide();
  slide.background = { color: "F4FAF8" };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: "F4FAF8" }, line: { color: "F4FAF8" } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: H, fill: { color: palette.accent }, line: { color: palette.accent } });
  if (visuals?.cover) {
    slide.addImage({ data: visuals.cover, x: 7.18, y: 0.52, w: 5.72, h: 6.38, sizing: { type: "cover", x: 7.18, y: 0.52, w: 5.72, h: 6.38 } });
    slide.addShape(pptx.ShapeType.rect, { x: 7.18, y: 0.52, w: 5.72, h: 6.38, fill: { color: "FFFFFF", transparency: 76 }, line: { color: palette.line, transparency: 45, width: 1 } });
  } else {
    if (project.mode === "beautify") {
      addCard(pptx, slide, palette, 7.34, 1.08, 2.35, 4.75, "FFF7ED");
      addCard(pptx, slide, palette, 10.04, 1.08, 2.35, 4.75, "EAF5F2");
      addText(slide, "原课件", { x: 7.7, y: 1.45, w: 1.65, h: 0.28, fontSize: 13, bold: true, color: palette.warm, align: "center" });
      addText(slide, "逐页保留\n标题 · 内容 · 顺序\n教学意图 · 证据", { x: 7.7, y: 2.35, w: 1.65, h: 1.8, fontSize: 14, bold: true, color: palette.ink, align: "center", valign: "middle", breakLine: true });
      addText(slide, "优化后", { x: 10.4, y: 1.45, w: 1.65, h: 0.28, fontSize: 13, bold: true, color: palette.accent, align: "center" });
      addText(slide, "问题诊断\n局部改写 · 重排\n视觉补强 · 复核", { x: 10.4, y: 2.35, w: 1.65, h: 1.8, fontSize: 14, bold: true, color: palette.ink, align: "center", valign: "middle", breakLine: true });
      addText(slide, "→", { x: 9.68, y: 3.02, w: 0.36, h: 0.45, fontSize: 22, bold: true, color: palette.accent, align: "center" });
    } else {
      // Native fallback visual when an external image provider is unavailable.
      slide.addShape(pptx.ShapeType.rect, { x: 7.18, y: 0.52, w: 5.72, h: 6.38, fill: { color: "FFFFFF" }, line: { color: teacherMathTokens.grid, width: 1 } });
      slide.addShape(pptx.ShapeType.line, { x: 7.48, y: 6.18, w: 4.98, h: 0, line: { color: palette.line, width: 1 } });
      addText(slide, "坐标 · 关系 · 图像", { x: 7.6, y: 6.34, w: 3.2, h: 0.2, fontSize: 8, bold: true, color: palette.accent });
      addText(slide, "y = kx + b", { x: 10.58, y: 6.28, w: 1.45, h: 0.22, fontSize: 9, bold: true, color: palette.ink, align: "right" });
    }
  }
  const courseLabel = [
    project.contentPlan?.teacherContext?.schoolStage || "高中",
    project.contentPlan?.teacherContext?.subject || "数学"
  ].join("") + " · 概念建构课";
  addText(slide, courseLabel, { x: 0.86, y: 0.75, w: 3.2, h: 0.25, fontSize: 9, bold: true, color: palette.accent });
  addText(slide, item.title || project.title, { x: 0.86, y: 1.45, w: 6.2, h: 1.15, fontSize: 34, bold: true, color: palette.ink, breakLine: true });
  addText(slide, item.subtitle, { x: 0.9, y: 2.88, w: 5.8, h: 0.6, fontSize: 14, color: palette.muted, breakLine: true });
  addText(slide, "核心问题", { x: 0.9, y: 4.12, w: 1.2, h: 0.2, fontSize: 8, bold: true, color: palette.accent });
  const coreQuestion = teacherMathBlock(item, ["核心问题", "课堂主问题", "章节定位", "优化原则"]) || item.bullets?.[0]?.replace(/^[^:：]{1,12}[:：]\s*/, "") || "围绕本课目标完成观察、解释、练习与反馈。";
  addText(slide, shortText(coreQuestion, 72), { x: 0.9, y: 4.52, w: 5.9, h: 0.72, fontSize: 16, bold: true, color: palette.ink, breakLine: true });
  if (!visuals?.cover && project.mode !== "beautify") {
    addMathGraph(pptx, slide, palette, 7.45, 0.86, 4.85, 4.95, [{ k: 1, b: 1, color: palette.accent, label: "关系的图像表达" }]);
  }
  const coverMeta = [
    project.contentPlan?.teacherContext?.schoolStage,
    project.contentPlan?.teacherContext?.grade,
    project.contentPlan?.teacherContext?.subject,
    project.contentPlan?.teacherContext?.duration
  ].filter(Boolean).join(" · ") || "高中数学 · 概念建构课";
  addText(slide, coverMeta, { x: 0.9, y: 6.45, w: 4.8, h: 0.22, fontSize: 8, bold: true, color: palette.accent });
}


function addTeacherMathSlide(pptx: pptxgen, project: CanvasProject, profile: DeckDesignProfile, item: DesignSlide, slideIndex: number, visuals?: ExportVisuals) {
  const palette = paletteFor(profile, slideIndex + 1);
  const pageNum = slideIndex + 2;
  const slide = pptx.addSlide();
  addTeacherHeader(pptx, slide, palette, project, item, pageNum, item.pageIntent || "TEACHING PAGE");
  const sectionList = item.sections || [];
  const bullets = (item.bullets || []).map((b) => b.replace(/^[^:：]{1,10}[:：]/, ""));
  const visual = visuals?.slides?.[String(slideIndex + 1)] || visuals?.slides?.[item.id];
  // timeline section (e.g. worked example steps)
  const timelineSection = sectionList.find((s) => s.type === "timeline");
  const tipsGrid = sectionList.find((s) => s.type === "tips-grid");
  const callout = sectionList.find((s) => s.type === "callout");
  const tableSection = sectionList.find((s) => s.type === "table");
  const quoteSection = sectionList.find((s) => s.type === "quote");
  const tagRow = sectionList.find((s) => s.type === "tag-row");

  if (project.mode === "beautify" && item.id.startsWith("beautify-original-slide-")) {
    const originalPage = Number(item.id.replace("beautify-original-slide-", ""));
    const diagnosis = project.beautifyPlan?.pageDiagnoses.find((page) => page.page === originalPage);
    const columns = [
      { x: 0.76, w: 3.72, label: `原第 ${originalPage} 页`, color: "F8FAFC" },
      { x: 4.69, w: 3.72, label: "问题诊断", color: "FFF7ED" },
      { x: 8.62, w: 3.72, label: "优化后", color: "EAF5F2" },
    ];
    columns.forEach((column) => {
      addCard(pptx, slide, palette, column.x, 2.08, column.w, 3.95, column.color);
      addText(slide, column.label, { x: column.x + 0.26, y: 2.34, w: column.w - 0.52, h: 0.25, fontSize: 10, bold: true, color: palette.accent });
    });
    addText(slide, diagnosis?.originalTitle || item.title, { x: 1.02, y: 2.86, w: 3.2, h: 0.52, fontSize: 15, bold: true, color: palette.ink, breakLine: true });
    addBullets(pptx, slide, palette, (item.bullets || []).slice(0, 4), 1.02, 3.62, 3.0, 0.47, 9.5);
    const issues = diagnosis?.detectedIssues.map((issue) => `${issue.title}：${issue.detail}`) || ["结构可保留：统一层级、留白和视觉节奏。"];
    addBullets(pptx, slide, palette, issues.slice(0, 4), 4.95, 2.88, 3.0, 0.61, 9.2);
    addText(slide, diagnosis?.optimizedTitle || item.title, { x: 8.9, y: 2.86, w: 3.15, h: 0.52, fontSize: 15, bold: true, color: palette.ink, breakLine: true });
    addBullets(pptx, slide, palette, (diagnosis?.optimizedBullets || item.bullets || []).slice(0, 4), 8.9, 3.62, 3.0, 0.47, 9.5);
    addText(slide, `保留：${diagnosis?.preserve.slice(0, 2).join("；") || "原页主题与教学意图"}  ·  修改：${diagnosis?.rewriteActions.slice(0, 2).join("；") || "优化层级与可读性"}`, { x: 0.84, y: 6.32, w: 11.4, h: 0.34, fontSize: 8.2, bold: true, color: palette.accent, align: "center" });
    return;
  }

  if (timelineSection && "steps" in timelineSection && Array.isArray(timelineSection.steps)) {
    // Teaching process layout: problem first, then a visible reasoning chain.
    const steps = (timelineSection.steps as Array<{ label?: string; title: string; body: string }>).slice(0, 5);
    const question = (item.bullets || [])[0]?.replace(/^[^:：]{1,12}[:：]\s*/, "") || item.subtitle;
    addCard(pptx, slide, palette, 0.82, 2.1, 11.08, 0.72, "FFFFFF");
    addText(slide, "课堂任务", { x: 1.08, y: 2.31, w: 1.0, h: 0.18, fontSize: 8, bold: true, color: palette.accent });
    addText(slide, shortText(question, 72), { x: 2.02, y: 2.24, w: 9.45, h: 0.32, fontSize: 13, bold: true, color: palette.ink });
    const gap = 0.16;
    const stepW = (11.08 - gap * (steps.length - 1)) / Math.max(1, steps.length);
    steps.forEach((step, i) => {
      const x = 0.82 + i * (stepW + gap);
      addCard(pptx, slide, palette, x, 3.14, stepW, 1.65, i === 0 || i === steps.length - 1 ? "EAF5F2" : "FFFFFF");
      addText(slide, step.label || String(i + 1).padStart(2, "0"), { x: x + 0.2, y: 3.38, w: 0.62, h: 0.18, fontSize: 8, bold: true, color: palette.accent });
      addText(slide, step.title, { x: x + 0.2, y: 3.72, w: stepW - 0.4, h: 0.3, fontSize: 12, bold: true, color: palette.ink, align: "center" });
      addText(slide, step.body, { x: x + 0.2, y: 4.18, w: stepW - 0.4, h: 0.36, fontSize: 8.5, color: palette.muted, align: "center", breakLine: true });
      if (i < steps.length - 1) addText(slide, "→", { x: x + stepW - 0.02, y: 3.82, w: gap + 0.04, h: 0.3, fontSize: 15, bold: true, color: palette.accent, align: "center" });
    });
    if (callout) {
      addCard(pptx, slide, palette, 0.82, 5.12, 11.08, 0.82, "EAF5F2");
      addText(slide, callout.title || "学生试一试", { x: 1.08, y: 5.38, w: 1.2, h: 0.18, fontSize: 8, bold: true, color: palette.accent });
      addText(slide, callout.body || "", { x: 2.18, y: 5.28, w: 9.25, h: 0.34, fontSize: 11.5, bold: true, color: palette.ink, align: "center" });
    }
  } else if (tipsGrid && "items" in tipsGrid && Array.isArray(tipsGrid.items)) {
    // Tips grid layout
    const items = (tipsGrid.items as Array<{ title: string; body: string; tag?: string }>).slice(0, 6);
    const nativeGraph = !visual && /参数|图像/.test(item.title);
    const gridWidth = visual || nativeGraph ? 7.12 : callout ? 7.35 : 11.08;
    addTipsGridSection(pptx, slide, palette, tipsGrid, 0.82, 2.12, gridWidth, 3.78, visual || nativeGraph || callout ? 2 : 3);
    if (visual) {
      slide.addImage({ data: visual, x: 8.22, y: 2.12, w: 3.68, h: 3.78, sizing: { type: "cover", x: 8.22, y: 2.12, w: 3.68, h: 3.78 } });
      slide.addShape(pptx.ShapeType.rect, { x: 8.22, y: 2.12, w: 3.68, h: 3.78, fill: { color: "FFFFFF", transparency: 100 }, line: { color: palette.line, width: 1 } });
    } else if (nativeGraph) {
      addMathGraph(pptx, slide, palette, 8.22, 2.12, 3.68, 3.78, [
        { k: 1.25, b: 0.5, color: palette.accent, label: "k > 0" },
        { k: -0.8, b: 1.2, color: palette.warm, label: "k < 0" },
      ]);
    }
    if (callout && !visual && !nativeGraph) {
      addCard(pptx, slide, palette, 8.48, 2.12, 3.42, 3.78, "EAF5F2");
      addText(slide, callout.title || "学生输出", { x: 8.82, y: 2.52, w: 2.75, h: 0.25, fontSize: 10, bold: true, color: palette.accent, align: "center" });
      addText(slide, callout.body || "", { x: 8.82, y: 3.08, w: 2.75, h: 1.35, fontSize: 14, bold: true, color: palette.ink, align: "center", valign: "middle", breakLine: true });
    }
  } else if (tableSection && "columns" in tableSection) {
    // Table + callout layout
    addTableSection(pptx, slide, palette, tableSection, 0.78, 2.2, 3.15, 3.45);
    if (callout) {
      addCard(pptx, slide, palette, 4.18, 2.2, 2.15, 3.45, "EAF5F2");
      addText(slide, callout.title || "解析式", { x: 4.55, y: 2.65, w: 1.4, h: 0.25, fontSize: 10, bold: true, color: palette.accent, align: "center" });
      addText(slide, callout.body || "", { x: 4.42, y: 3.25, w: 1.7, h: 0.75, fontSize: 18, bold: true, color: palette.ink, align: "center" });
    }
    if (visual) {
      slide.addImage({ data: visual, x: 6.62, y: 2.2, w: 5.28, h: 3.45, sizing: { type: "cover", x: 6.62, y: 2.2, w: 5.28, h: 3.45 } });
      slide.addShape(pptx.ShapeType.rect, { x: 6.62, y: 2.2, w: 5.28, h: 3.45, fill: { color: "FFFFFF", transparency: 100 }, line: { color: palette.line, width: 1 } });
    } else {
      addMathGraph(pptx, slide, palette, 6.62, 2.2, 5.28, 3.45, [{ k: 1.2, b: 0.4, color: palette.accent, label: "表 · 式 · 图" }]);
    }
  } else if (callout) {
    // Callout-dominant layout
    addCard(pptx, slide, palette, 0.82, 2.18, 11.08, 3.65, "EAF5F2");
    addText(slide, callout.title || "核心内容", { x: 1.12, y: 2.48, w: 2.0, h: 0.22, fontSize: 10, bold: true, color: palette.accent });
    addText(slide, callout.body || "", { x: 1.12, y: 2.9, w: 10.0, h: 2.5, fontSize: 16, bold: true, color: palette.ink, breakLine: true });
  } else if (quoteSection) {
    // Quote layout (cover-like content)
    addCard(pptx, slide, palette, 0.82, 2.18, 11.08, 2.0, "EAF5F2");
    addText(slide, "type" in quoteSection && quoteSection.type === "quote" ? (quoteSection as { type: string; text: string }).text : "", { x: 1.12, y: 2.68, w: 10.0, h: 1.0, fontSize: 20, bold: true, color: palette.ink, align: "center" });
    if (tagRow && "tags" in tagRow && Array.isArray(tagRow.tags)) {
      const tags = tagRow.tags as string[];
      tags.forEach((tag, i) => {
        addCard(pptx, slide, palette, 0.82 + i * 2.88, 4.62, 2.52, 0.52, i % 2 ? "FFFFFF" : "EAF5F2");
        addText(slide, tag, { x: 0.82 + i * 2.88 + 0.2, y: 4.76, w: 2.12, h: 0.24, fontSize: 10, bold: true, color: palette.accent, align: "center" });
      });
    }
  } else {
    // Generic bullet fallback
    bullets.slice(0, 5).forEach((text, i) => {
      const y = 2.18 + i * 0.72;
      addCard(pptx, slide, palette, 0.82, y, 7.35, 0.55, i % 2 ? "FFFFFF" : "EAF5F2");
      addText(slide, text, { x: 1.08, y: y + 0.15, w: 6.8, h: 0.24, fontSize: 11, color: palette.ink });
    });
    addCard(pptx, slide, palette, 8.48, 2.12, 3.42, 3.78, "EAF5F2");
    addText(slide, "学生输出", { x: 8.82, y: 2.52, w: 2.75, h: 0.25, fontSize: 10, bold: true, color: palette.accent, align: "center" });
    addText(slide, item.subtitle || "说出判断依据，用表、式或图完成表达。", { x: 8.82, y: 3.08, w: 2.75, h: 1.35, fontSize: 14, bold: true, color: palette.ink, align: "center", valign: "middle", breakLine: true });
  }
  if (item.speakerNote) {
    addText(slide, shortText(item.speakerNote.replace(/^.*学生活动：/, "学生活动："), 80), { x: 0.82, y: 6.35, w: 11.1, h: 0.3, fontSize: 8.5, bold: true, color: palette.accent });
  }
}


/**
 * Render a CanvasProject into a PPTX node buffer. This is the single rendering
 * path shared by the (legacy) client-payload export and the server-side
 * versioned export, so both produce byte-identical decks for the same input.
 * Returns the buffer plus the page count actually emitted.
 */
async function renderDeckToBuffer(
  project: CanvasProject,
  profile: DeckDesignProfile,
  slides: DesignSlide[],
  research: ResearchItem[],
  visuals?: ExportVisuals,
  visualScenes?: RenderScene[]
): Promise<{ buffer: Buffer; pageCount: number }> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "AI PPT Agent";
  pptx.subject = "Generated by AI PPT Agent";
  pptx.title = project.title || "AI PPT Agent";
  pptx.company = "AI PPT Agent";
  pptx.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei" };
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: W, height: H });

  let pageCount = 0;
  if (visualScenes?.length) {
    addRenderScenesToPptx(pptx, visualScenes);
    pageCount = visualScenes.length;
  } else if (project.contentPlan?.playbookId === "teacher_math_science_v1") {
    addTeacherMathCover(pptx, project, profile, slides[0], visuals);
    slides.slice(1).forEach((item, slideIndex) => addTeacherMathSlide(pptx, project, profile, item, slideIndex, visuals));
    pageCount = slides.length;
  } else {
    addCover(pptx, project, profile, slides, visuals);
    addAgendaSlide(pptx, project, profile, slides);
    slides.slice(1).forEach((item, slideIndex) => {
      const absoluteIndex = slideIndex + 1;
      const source = sourceFor({ ...project, research }, item, slideIndex);
      addGenericSlide(pptx, project, profile, item, absoluteIndex, source, visuals);
    });
    addSourcesSlide(pptx, profile, research);
    // cover + agenda + (slides-1 generic) + sources
    pageCount = slides.length + 2;
  }

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return { buffer, pageCount };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  // Server-side versioned export: the request only supplies identifiers. The
  // frozen DeckSpec + DesignSlide[] are read back from the DB and are the sole
  // source of truth — the client-submitted project / slides / DeckSpec are
  // never trusted for content here.
  if (body?.projectId && body?.versionId) {
    return handleVersionedExport(body);
  }

  const project = ensureProjectQuality(cleanProject(((body?.project as CanvasProject | undefined) ?? defaultProject) as CanvasProject));
  const profile = getDesignProfile(project);
  const visuals = body?.visuals as ExportVisuals | undefined;
  const research = project.research?.length ? project.research : defaultProject.research;
  const slides = project.slides?.length ? project.slides : defaultProject.slides;
  const gate = evaluateExportQualityGate(project);
  if (!gate.ok) {
    return NextResponse.json(
      {
        message: "导出前质量闸门未通过",
        score: gate.score,
        qualityBar: gate.qualityBar,
        pptType: gate.pptType,
        pptTypeLabel: gate.pptTypeLabel,
        explanation: gate.explanation,
        issues: gate.issues.slice(0, 8).map((issue) => ({
          id: issue.id,
          severity: issue.severity,
          title: issue.title,
          detail: issue.detail,
          action: issue.action,
          slideId: issue.slideId,
          slideTitle: issue.slideTitle
        }))
      },
      { status: 422 }
    );
  }

  const user = await getCurrentUser();
  let nextCredits: number | null = null;
  if (user) {
    try {
      nextCredits = await spendCredits(user.id, 8, "导出 PPTX", "api", "export-pptx");
    } catch (error) {
      if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") {
        return NextResponse.json({ message: "积分不足，无法导出 PPTX" }, { status: 402 });
      }
      throw error;
    }
  }

  const { buffer } = await renderDeckToBuffer(project, profile, slides, research, visuals);
  const fileName = `${cleanFileName(project.title || "AI-PPT-Agent")}.pptx`;

  return new NextResponse(buffer as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="AI-PPT-Agent.pptx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      ...(nextCredits === null ? {} : { "X-AI-PPT-Credits": String(nextCredits) })
    }
  });
}

// ── Server-side versioned export (069 Blocker 2) ────────────────────────────
// Delivery classes reflect the Teacher Readiness gate (Blocker 3). commercialReady
// is ALWAYS false in this round regardless of class.
type DeliveryClass = "engineering_preview" | "teacher_review_copy" | "teacher_approved";

type ReadinessDecision =
  | { allowed: true; deliveryClass: DeliveryClass }
  | { allowed: false; status: number; reason: string; failureReason: string };

// The gate matrix. Engineering failure or teacher failure blocks export with an
// explicit failure that still gets recorded as a failed CoursewareArtifact.
function resolveDeliveryClass(engineeringStatus: string, teacherReadiness: string): ReadinessDecision {
  if (engineeringStatus !== "passed") {
    return {
      allowed: false,
      status: 422,
      reason: "engineering_not_passed",
      failureReason: `工程评分未通过（engineeringStatus=${engineeringStatus}），禁止导出。`
    };
  }
  // Engineering passed below this point.
  switch (teacherReadiness) {
    case "ready_for_teacher":
      return { allowed: true, deliveryClass: "teacher_approved" };
    case "review_required":
      // May generate a review copy, but it is labeled a review copy — never a deliverable.
      return { allowed: true, deliveryClass: "teacher_review_copy" };
    case "failed":
      return {
        allowed: false,
        status: 422,
        reason: "teacher_readiness_failed",
        failureReason: "教师就绪度评估失败（teacherReadiness=failed），禁止导出正式教师版本。"
      };
    case "pending":
    default:
      // Engineering passed but teacher review has not happened: NOT ready_for_teacher.
      // We only permit an engineering preview, never a teacher-usable deliverable.
      return { allowed: true, deliveryClass: "engineering_preview" };
  }
}

async function handleVersionedExport(body: {
  projectId?: unknown;
  versionId?: unknown;
  artifactType?: unknown;
  visuals?: unknown;
}) {
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const versionId = typeof body.versionId === "string" ? body.versionId : "";
  const artifactType = body.artifactType === "pdf" ? "pdf" : "pptx";
  if (!projectId || !versionId) {
    return NextResponse.json({ message: "projectId 与 versionId 均为必填" }, { status: 400 });
  }

  // 1. Authenticate.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  // 2. Load the frozen source. This checks ownership + project scope and returns
  //    the frozen DeckSpec + DesignSlide[] — the sole source of truth.
  const source = await loadExportSource(versionId, user.id, projectId);
  if (!source.ok) {
    const status = source.reason === "forbidden" ? 403 : source.reason === "not_found" ? 404 : 422;
    return NextResponse.json({ message: `无法读取版本：${source.reason}`, reason: source.reason }, { status });
  }

  // A frozen export must describe the same teacher task at every layer. This
  // prevents a correctly named artifact from silently rendering another
  // lesson because a stale ContentPlan/version snapshot was selected.
  const taskContext = source.teacherTask;
  const planContext = source.contentPlan?.teacherContext;
  const contextFields = ["topic", "schoolStage", "grade", "subject"] as const;
  const mismatches = contextFields.filter((field) => {
    const taskValue = String(taskContext?.[field] || "").trim();
    const planValue = String(planContext?.[field] || "").trim();
    return !taskValue || !planValue || taskValue !== planValue;
  });
  if (mismatches.length) {
    await writeCoursewareArtifact({
      projectId: source.projectId,
      versionId: source.versionId,
      artifactType,
      status: "failed",
      sourceDeckSpecHash: source.deckSpecHash,
      errorDetail: `teacher_context_mismatch:${mismatches.join(",")}`,
      manifestJson: { mismatches, teacherTask: taskContext, teacherContext: planContext, commercialReady: false }
    });
    return NextResponse.json(
      { message: "教师任务与课件版本上下文不一致，已阻止导出", reason: "teacher_context_mismatch", mismatches },
      { status: 422 }
    );
  }
  // 3. Validate the DeckSpec content hash: recompute from the frozen slideSpecs
  //    and compare against the hash persisted with the version. A mismatch means
  //    the frozen snapshot was mutated after freezing — fail explicitly.
  const recomputedHash = computeDeckSpecHash(source.deckSpec.slideSpecs);
  const storedContentHash = source.deckSpec.contentHash ?? "";
  if (storedContentHash && storedContentHash !== recomputedHash) {
    await writeCoursewareArtifact({
      projectId: source.projectId,
      versionId: source.versionId,
      artifactType,
      status: "failed",
      sourceDeckSpecHash: source.deckSpecHash,
      errorDetail: `DeckSpec contentHash 不一致：stored=${storedContentHash} recomputed=${recomputedHash}`
    });
    return NextResponse.json(
      { message: "DeckSpec 内容哈希校验失败，快照可能被篡改", reason: "content_hash_mismatch" },
      { status: 422 }
    );
  }

  // 4. Apply the Teacher Readiness gate (Blocker 3).
  const decision = resolveDeliveryClass(source.engineeringStatus, source.teacherReadiness);
  if (!decision.allowed) {
    await writeCoursewareArtifact({
      projectId: source.projectId,
      versionId: source.versionId,
      artifactType,
      status: "failed",
      sourceDeckSpecHash: source.deckSpecHash,
      errorDetail: decision.failureReason,
      manifestJson: {
        reason: decision.reason,
        engineeringStatus: source.engineeringStatus,
        teacherReadiness: source.teacherReadiness,
        commercialReady: false
      }
    });
    return NextResponse.json(
      {
        message: decision.failureReason,
        reason: decision.reason,
        engineeringStatus: source.engineeringStatus,
        teacherReadiness: source.teacherReadiness,
        commercialReady: false
      },
      { status: decision.status }
    );
  }

  // 5. Reconstruct a render input from the FROZEN data only. The client-submitted
  //    project / slides / DeckSpec are never consulted here. contentPlan is a
  //    render hint (playbook routing + teacherContext labels); deckSpec + slides
  //    are authoritative.
  const renderProject: CanvasProject = {
    ...defaultProject,
    title: source.contentPlan?.teacherContext?.topic || source.deckSpec.coreMessage || source.slides[0]?.title || "AI PPT Agent",
    slides: source.slides,
    research: [],
    contentPlan: source.contentPlan ?? undefined,
    deckSpec: source.deckSpec
  };
  const profile = getDesignProfile(renderProject);

  // Build renderer-independent visual truth from the same frozen DeckSpec and
  // slides used by the PPTX renderer. Hard geometry/editability failures block
  // delivery before a misleading artifact can be recorded as ready.
  const visualTruth = buildExportVisualTruth(source.deckSpec, source.slides);
  if (visualTruth.qa.status === "failed") {
    await writeCoursewareArtifact({
      projectId: source.projectId,
      versionId: source.versionId,
      artifactType,
      status: "failed",
      sourceDeckSpecHash: source.deckSpecHash,
      errorDetail: `visual_qa_failed:${visualTruth.qa.errorCount}`,
      manifestJson: { visualTruth, deliveryClass: decision.deliveryClass, commercialReady: false }
    });
    return NextResponse.json({ message: "视觉编译检查失败，已阻止导出", reason: "visual_qa_failed", visualQA: visualTruth.qa }, { status: 422 });
  }

  // 6. Render + record. Any render failure is recorded as a failed artifact.
  let buffer: Buffer;
  let pageCount: number;
  try {
    const visuals = body.visuals as ExportVisuals | undefined;
    const rendered = await renderDeckToBuffer(renderProject, profile, source.slides, [], visuals, visualTruth.scenes);
    buffer = rendered.buffer;
    pageCount = rendered.pageCount;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await writeCoursewareArtifact({
      projectId: source.projectId,
      versionId: source.versionId,
      artifactType,
      status: "failed",
      sourceDeckSpecHash: source.deckSpecHash,
      errorDetail: `渲染失败：${detail}`,
      manifestJson: { visualTruth, deliveryClass: decision.deliveryClass, commercialReady: false }
    });
    return NextResponse.json({ message: "PPTX 渲染失败", reason: "render_failed", detail }, { status: 500 });
  }

  // 7. Write the real CoursewareArtifact for the successful PPTX.
  const fileName = `${cleanFileName(renderProject.title || "AI-PPT-Agent")}.pptx`;
  const pptxArtifact = await writeCoursewareArtifact({
    projectId: source.projectId,
    versionId: source.versionId,
    artifactType: "pptx",
    status: "ready",
    sourceDeckSpecHash: source.deckSpecHash,
    storagePath: fileName,
    manifestJson: {
      pageCount,
      deliveryClass: decision.deliveryClass,
      engineeringStatus: source.engineeringStatus,
      teacherReadiness: source.teacherReadiness,
      deckSpecHash: source.deckSpecHash,
      versionNumber: source.versionNumber,
      visualTruth,
      commercialReady: false
    }
  });

  // For a derived pdf request, record a pdf artifact tracing to the same DeckSpec
  // hash and pointing at the parent pptx artifact.
  if (artifactType === "pdf") {
    await writeCoursewareArtifact({
      projectId: source.projectId,
      versionId: source.versionId,
      artifactType: "pdf",
      status: "ready",
      sourceDeckSpecHash: source.deckSpecHash,
      sourceArtifactId: pptxArtifact.artifactId,
      manifestJson: { pageCount, visualTruth, deliveryClass: decision.deliveryClass, commercialReady: false }
    });
  }

  return new NextResponse(buffer as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="AI-PPT-Agent.pptx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "X-Delivery-Class": decision.deliveryClass,
      "X-Commercial-Ready": "false",
      "X-Artifact-Id": pptxArtifact.artifactId,
      "X-Deck-Spec-Hash": source.deckSpecHash,
      "X-Visual-QA": visualTruth.qa.status,
      "X-Page-Count": String(pageCount)
    }
  });
}
