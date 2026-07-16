"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, BookOpen, Bot, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Download, FileClock, ImagePlus, Loader2, MonitorPlay, PanelRightClose, PanelRightOpen, Plus, RefreshCw, Settings2, Sparkles, Wand2, X } from "lucide-react";
import type { CanvasProject, DesignSlide, QualityStatus, SlideLayout } from "@/lib/canvas-data";
import type { WorkspaceIdentity } from "@/lib/teacher-courseware-task";
import { getDesignProfile } from "@/lib/ppt-design-system";
import { summarizeEvidenceAuthenticity, summarizeSlideEvidence } from "@/lib/ppt-agent/evidence-authenticity";
import type { ExportGateResult } from "@/lib/export-quality-gate";
import { layoutLabel } from "@/lib/ppt-labels";
import { cn } from "@/lib/utils";
import { BrowserSceneRenderer } from "@/components/BrowserSceneRenderer";
import { buildProjectVisualTruth, mapGeneratedVisualsToSlides } from "@/lib/visual-compiler/project-visual-truth";

type GeneratedVisuals = {
  cover?: string;
  slides?: Record<string, string>;
};

type PresentationEditorProps = {
  project: CanvasProject;
  isExporting: boolean;
  isRefining: boolean;
  isPresenting: boolean;
  lastExportGate?: Pick<ExportGateResult, "ok" | "score" | "qualityBar" | "pptType" | "pptTypeLabel" | "issues" | "explanation"> | null;
  onExport: () => void;
  onRefine: () => void;
  onPresent: () => void;
  onClosePresent: () => void;
  onProjectChange: (project: CanvasProject) => void;
  generatedVisuals: GeneratedVisuals;
  isGeneratingVisuals: boolean;
  onGenerateVisuals: () => void;
  onApplyReviewFixes: () => void;
  onApplyPageReviewFixes: (pageIndex: number, slideId?: string) => void;
  onAddManualSource: (source: { title: string; url: string; summary: string }) => Promise<void>;
  isApplyingReviewFixes: boolean;
  workspaceType: "general" | "teacher_courseware";
  workspaceIdentity: WorkspaceIdentity | null;
  assistantPanel: ReactNode;
  onNewGeneral: () => void;
  onNewTeacher: () => void;
};

type EditorPanel = "assistant" | "page" | "visual" | "review" | "version";

const layoutOptions: SlideLayout[] = ["cover", "agenda", "day-route", "cards", "comparison", "stats", "timeline", "process", "checklist", "source"];

function visualForSlide(visuals: GeneratedVisuals | undefined, slide: DesignSlide, index: number) {
  if (index === 0 && visuals?.cover) return visuals.cover;
  return visuals?.slides?.[String(index)] || visuals?.slides?.[slide.id || ""] || "";
}

function isTravelProject(project: CanvasProject) {
  return project.reviewCenter?.pptType === "travel_guide" || /旅行|旅游|攻略|路线|景点|北京|杭州/.test(`${project.title} ${project.prompt}`);
}

function useSlideTheme(project: CanvasProject, index: number) {
  return useMemo(() => {
    const profile = getDesignProfile(project);
    const palette = profile.palette;
    const accents = [palette.accent, palette.accent2, palette.warm, palette.good];
    return {
      frameStyle: { backgroundColor: index % 2 ? palette.paper : palette.soft },
      accentStyle: { backgroundColor: accents[index % accents.length] },
      softStyle: { backgroundColor: index % 2 ? palette.pale : palette.soft },
      textStyle: { color: palette.ink },
      accentTextStyle: { color: accents[index % accents.length] },
      label: profile.coverLabel,
      name: profile.name
    };
  }, [project, index]);
}

function BulletCards({ slide, theme }: { slide: DesignSlide; theme: ReturnType<typeof useSlideTheme> }) {
  const bullets = slide.bullets?.length ? slide.bullets : ["核心观点", "支撑资料", "行动建议"];
  return (
    <section className="grid content-center gap-4">
      {bullets.slice(0, 4).map((bullet, index) => (
        <div key={`${bullet}-${index}`} className="rounded-[20px] border border-white/80 bg-white/82 p-5 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-xl text-xs font-bold text-white" style={theme.accentStyle}>{index + 1}</span>
            <span className="line-clamp-2 text-base font-semibold text-[#1f2937]">{bullet}</span>
          </div>
          <div className="mt-4 h-3 rounded-full" style={theme.softStyle}>
            <div className="h-full rounded-full" style={{ ...theme.accentStyle, width: `${74 - index * 9}%` }} />
          </div>
        </div>
      ))}
    </section>
  );
}

function RouteSketch({
  cards,
  theme,
  compact = false
}: {
  cards: Array<{ day?: string; title: string; route?: string; highlights?: string[]; note?: string }>;
  theme: ReturnType<typeof useSlideTheme>;
  compact?: boolean;
}) {
  const visibleCards = cards.slice(0, compact ? 4 : 5);
  return (
    <div className="relative h-full min-h-[230px] overflow-hidden rounded-[24px] border border-white/80 bg-[linear-gradient(140deg,#ffffff_0%,#edf7ff_55%,#f4fffb_100%)] p-5 shadow-sm">
      <div className="absolute right-[-40px] top-[-44px] size-36 rounded-full bg-[#d9f1ff]" />
      <div className="absolute bottom-[-52px] left-[-38px] size-44 rounded-full bg-[#dff8ef]" />
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#667085]">ROUTE MAP</div>
          <div className="mt-2 text-lg font-bold text-[#111827]">路线动线</div>
        </div>
        <div className="relative my-5 flex-1">
          <div className="absolute left-6 top-2 h-[calc(100%-10px)] w-1 rounded-full bg-[#dbeafe]" />
          {visibleCards.map((card, index) => (
            <div key={`${card.title}-${index}`} className="relative z-10 mb-3 flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-[3px] border-white text-[10px] font-bold text-white shadow-sm" style={theme.accentStyle}>
                {index + 1}
              </span>
              <div className="min-w-0 rounded-2xl bg-white/88 px-3 py-2 shadow-sm">
                <div className="truncate text-xs font-bold text-[#111827]">{card.day || `Stop ${index + 1}`} · {card.title}</div>
                {card.route ? <div className="mt-0.5 line-clamp-1 text-[10px] text-[#667085]">{card.route}</div> : null}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {["少绕路", "留缓冲", "先预约"].map((item, index) => (
            <span key={item} className="rounded-full bg-white/86 px-2 py-1 text-center text-[10px] font-bold text-[#344054] shadow-sm">
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeroVisualPanel({
  title,
  subtitle,
  src,
  theme,
  travel
}: {
  title: string;
  subtitle?: string;
  src?: string;
  theme: ReturnType<typeof useSlideTheme>;
  travel: boolean;
}) {
  if (src) {
    return (
      <div className="aspect-[4/3] overflow-hidden rounded-[28px] border border-white/80 bg-white/72 p-3 shadow-sm">
        <img src={src} alt="" className="h-full w-full rounded-[22px] object-cover" />
      </div>
    );
  }

  return (
    <div className="aspect-[4/3] overflow-hidden rounded-[28px] border border-white/80 bg-white/72 p-5 shadow-sm">
      <div className="relative h-full overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#eef7ff_0%,#ffffff_46%,#effcf7_100%)] p-5">
        <div className="absolute right-[-34px] top-[-36px] size-36 rounded-full bg-[#cfeaff]" />
        <div className="absolute bottom-[-48px] left-[-34px] size-44 rounded-full bg-[#dcfce7]" />
        <div className="relative z-10 flex h-full flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-white/92 px-3 py-1 text-xs font-bold text-[#344054] shadow-sm">{travel ? "CITY GUIDE" : "KEY VISUAL"}</span>
            <span className="size-10 rounded-2xl shadow-sm" style={theme.accentStyle} />
          </div>
          {travel ? (
            <div className="space-y-3">
              <div className="h-2 w-4/5 rounded-full bg-[#bfdbfe]" />
              <div className="flex items-center gap-3">
                {[0, 1, 2, 3].map((item) => (
                  <span key={item} className="size-5 rounded-full border-4 border-white shadow-sm" style={item % 2 ? { backgroundColor: "#12B8A6" } : theme.accentStyle} />
                ))}
              </div>
              <div className="h-2 w-3/5 rounded-full bg-[#bbf7d0]" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((item) => (
                <span key={item} className="h-20 rounded-2xl bg-white/88 shadow-sm" />
              ))}
            </div>
          )}
          <div>
            <div className="line-clamp-1 text-xl font-bold text-[#111827]">{title}</div>
            {subtitle ? <div className="mt-2 line-clamp-2 text-xs leading-5 text-[#667085]">{subtitle}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionPreview({ slide, activeIndex, project, generatedVisuals }: { slide: DesignSlide; activeIndex: number; project: CanvasProject; generatedVisuals?: GeneratedVisuals }) {
  const theme = useSlideTheme(project, activeIndex);
  const sections = slide.sections || [];
  const dayCard = sections.find((section) => section.type === "day-card");
  const stats = sections.find((section) => section.type === "stat-card");
  const table = sections.find((section) => section.type === "table");
  const tips = sections.find((section) => section.type === "tips-grid");
  const timeline = sections.find((section) => section.type === "timeline");
  const warning = sections.find((section) => section.type === "warning");
  const hero = sections.find((section) => section.type === "hero-image");
  const tags = sections.find((section) => section.type === "tag-row");
  const callout = sections.find((section) => section.type === "callout");
  const quote = sections.find((section) => section.type === "quote");
  const aiVisual = visualForSlide(generatedVisuals, slide, activeIndex);
  const travel = isTravelProject(project);

  if (hero || tags || callout || quote) {
    const tagItems = tags && "tags" in tags ? tags.tags.slice(0, 5) : [theme.name, project.reviewCenter?.pptTypeLabel || layoutLabel(slide.layout), "可编辑 PPTX"].filter(Boolean);
    const heroTitle = hero && "title" in hero ? hero.title || slide.title : slide.title;
    const heroCaption = hero && "caption" in hero ? hero.caption || slide.subtitle : slide.subtitle;
    const calloutTitle = callout && "title" in callout ? callout.title : quote && "text" in quote ? "核心判断" : "页面主张";
    const calloutBody = callout && "body" in callout ? callout.body : quote && "text" in quote ? quote.text : heroCaption;

    return (
      <div className="mt-8 grid flex-1 grid-cols-[1fr_0.9fr] gap-7">
        <section className="flex flex-col justify-center">
          <div className="flex flex-wrap gap-2">
            {tagItems.map((tag) => (
              <span key={tag} className="rounded-full bg-white/78 px-3 py-1 text-xs font-bold text-[#2f7cff] shadow-sm">{tag}</span>
            ))}
          </div>
          <h1 className="mt-8 text-[46px] font-bold leading-tight text-[#111827]">{heroTitle || project.title}</h1>
          <p className="mt-5 text-base leading-8 text-[#667085]">{heroCaption || project.prompt}</p>
          <div className="mt-8 flex items-center gap-3">
            <span className="h-2 w-20 rounded-full" style={theme.accentStyle} />
            <span className="h-2 w-10 rounded-full bg-white/80" />
            <span className="h-2 w-6 rounded-full bg-white/60" />
          </div>
        </section>
        <section className="flex flex-col justify-center gap-4">
          <HeroVisualPanel title={heroTitle || project.title} subtitle={heroCaption || project.prompt} src={aiVisual} theme={theme} travel={travel} />
          <div className="rounded-[24px] bg-white/84 p-5 shadow-sm">
            <div className="text-sm font-bold text-[#111827]">{calloutTitle}</div>
            <div className="mt-2 line-clamp-3 text-xs leading-5 text-[#667085]">{calloutBody}</div>
          </div>
        </section>
      </div>
    );
  }

  if (dayCard && "cards" in dayCard) {
    return (
      <div className="mt-8 grid flex-1 grid-cols-[1.25fr_0.75fr] gap-6">
        <div className="grid grid-cols-2 gap-4">
          {dayCard.cards.slice(0, 4).map((card, index) => (
            <div key={`${card.title}-${index}`} className="rounded-[22px] border border-white/80 bg-white/88 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-[#2f7cff]">{card.day || `Day ${index + 1}`}</div>
                <span className="size-2 rounded-full" style={index % 2 ? { backgroundColor: "#12B8A6" } : theme.accentStyle} />
              </div>
              <div className="mt-3 line-clamp-1 text-base font-bold text-[#111827]">{card.title}</div>
              <div className="mt-2 line-clamp-2 text-xs leading-5 text-[#475467]">{card.route}</div>
              {card.highlights?.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {card.highlights.slice(0, 2).map((item) => (
                    <span key={item} className="rounded-full bg-[#eef6ff] px-2 py-0.5 text-[10px] font-bold text-[#1462ff]">{item}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="grid gap-4">
          <RouteSketch cards={dayCard.cards} theme={theme} />
          {warning && "body" in warning ? (
            <div className="rounded-[22px] border border-[#fed7aa] bg-[#fff7ed] p-4 shadow-sm">
              <div className="text-sm font-bold text-[#c2410c]">{warning.title}</div>
              <div className="mt-2 line-clamp-3 text-xs leading-5 text-[#7c2d12]">{warning.body}</div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (stats && "stats" in stats) {
    const chart = sections.find((section) => section.type === "bar-chart" || section.type === "donut-chart");
    return (
      <div className="mt-8 grid flex-1 grid-cols-[1fr_1fr] gap-6">
        <div className="grid grid-cols-2 gap-4">
          {stats.stats.slice(0, 4).map((stat, index) => (
            <div key={`${stat.label}-${index}`} className="rounded-[22px] bg-white/84 p-5 shadow-sm">
              <div className="text-xs font-semibold text-[#667085]">{stat.label}</div>
              <div className="mt-3 text-2xl font-bold" style={theme.textStyle}>{stat.value}</div>
              <div className="mt-2 line-clamp-1 text-xs text-[#667085]">{stat.note}</div>
            </div>
          ))}
        </div>
        <div className="rounded-[24px] bg-white/84 p-6 shadow-sm">
          <div className="text-sm font-bold text-[#111827]">{chart && "title" in chart ? chart.title || "图表模块" : "图表模块"}</div>
          <div className="mt-6 space-y-4">
            {[0.82, 0.68, 0.54, 0.42].map((width, index) => (
              <div key={width}>
                <div className="h-2 rounded-full bg-[#eef2f7]">
                  <div className="h-full rounded-full" style={{ ...(index % 2 ? { backgroundColor: "#6d5dfc" } : theme.accentStyle), width: `${width * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (table && "columns" in table) {
    return (
      <div className="mt-8 grid flex-1 grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="overflow-hidden rounded-[24px] bg-white/86 shadow-sm">
          <div className="grid bg-[#eef4ff] text-xs font-bold text-[#2f7cff]" style={{ gridTemplateColumns: `repeat(${Math.min(table.columns.length, 3)}, minmax(0, 1fr))` }}>
            {table.columns.slice(0, 3).map((column) => <div key={column} className="p-3">{column}</div>)}
          </div>
          {table.rows.slice(0, 4).map((row, rowIndex) => (
            <div key={`${row.join("-")}-${rowIndex}`} className="grid border-t border-[#eef2f7] text-xs text-[#344054]" style={{ gridTemplateColumns: `repeat(${Math.min(table.columns.length, 3)}, minmax(0, 1fr))` }}>
              {row.slice(0, 3).map((cell, cellIndex) => <div key={`${cell}-${cellIndex}`} className="line-clamp-2 p-3">{cell}</div>)}
            </div>
          ))}
        </div>
        {tips && "items" in tips ? <BulletCards slide={{ ...slide, bullets: tips.items.map((item) => item.title) }} theme={theme} /> : <BulletCards slide={slide} theme={theme} />}
      </div>
    );
  }

  if (timeline && "steps" in timeline) {
    return (
      <div className="mt-16 flex-1">
        <div className="relative mt-16 h-1 rounded-full bg-[#c7d7fe]">
          {timeline.steps.slice(0, 6).map((step, index) => (
            <div key={`${step.title}-${index}`} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${(index / Math.max(1, timeline.steps.slice(0, 6).length - 1)) * 92}%` }}>
              <span className="block size-7 rounded-full border-4 border-white shadow-sm" style={theme.accentStyle} />
              <div className={cn("mt-5 w-28 rounded-2xl bg-white/82 p-3 text-xs font-semibold leading-5 shadow-sm", index % 2 ? "translate-y-8" : "")}>{step.title}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tips && "items" in tips) {
    return (
      <div className="mt-8 grid flex-1 grid-cols-[0.85fr_1.15fr] gap-6">
        <section className="flex flex-col justify-center">
          <h1 className="text-[40px] font-bold leading-tight" style={theme.textStyle}>{slide.title || project.title}</h1>
          <p className="mt-5 text-base leading-8 text-[#667085]">{slide.subtitle || project.prompt}</p>
        </section>
        <BulletCards slide={{ ...slide, bullets: tips.items.map((item) => `${item.title}：${item.body}`) }} theme={theme} />
      </div>
    );
  }

  return null;
}

function slideSpecFor(project: CanvasProject, slide: DesignSlide, index: number) {
  return project.deckSpec?.slideSpecs.find((item) => item.slideId === slide.id || item.title === slide.title) || project.deckSpec?.slideSpecs[index];
}

function LayoutPreview({ slide, activeIndex, project, generatedVisuals }: { slide: DesignSlide; activeIndex: number; project: CanvasProject; generatedVisuals?: GeneratedVisuals }) {
  const theme = useSlideTheme(project, activeIndex);
  const layout = slide.layout || "cards";
  const bullets = slide.bullets?.length ? slide.bullets : ["核心观点", "支撑资料", "行动建议"];

  if (slide.sections?.length) {
    return <SectionPreview slide={slide} activeIndex={activeIndex} project={project} generatedVisuals={generatedVisuals} />;
  }

  if (layout === "timeline" || layout === "day-route" || layout === "process") {
    return (
      <div className="mt-16 flex-1">
        <div className="relative mt-16 h-1 rounded-full bg-[#c7d7fe]">
          {bullets.slice(0, 5).map((bullet, index) => (
            <div key={`${bullet}-${index}`} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${(index / Math.max(1, bullets.slice(0, 5).length - 1)) * 92}%` }}>
              <span className="block size-7 rounded-full border-4 border-white shadow-sm" style={theme.accentStyle} />
              <div className={cn("mt-5 w-28 rounded-2xl bg-white/82 p-3 text-xs font-semibold leading-5 shadow-sm", index % 2 ? "translate-y-8" : "")}>{bullet}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (layout === "stats" || layout === "budget") {
    return (
      <div className="mt-10 grid flex-1 grid-cols-2 gap-5">
        {bullets.slice(0, 4).map((bullet, index) => (
          <div key={`${bullet}-${index}`} className="rounded-[22px] bg-white/84 p-5 shadow-sm">
            <div className="text-xs font-semibold text-[#667085]">指标 {index + 1}</div>
            <div className="mt-3 text-2xl font-bold" style={theme.textStyle}>{bullet}</div>
            <div className="mt-4 h-2 rounded-full" style={theme.softStyle}>
              <div className="h-full rounded-full" style={{ ...theme.accentStyle, width: `${62 + index * 8}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (layout === "comparison") {
    return (
      <div className="mt-10 grid flex-1 grid-cols-2 gap-6">
        {["推荐路径", "备选路径"].map((title, col) => (
          <div key={title} className="rounded-[24px] bg-white/84 p-6 shadow-sm">
            <div className={cn("text-sm font-bold", col ? "text-[#6d5dfc]" : "text-[#2f7cff]")}>{title}</div>
            <div className="mt-5 space-y-4">
              {bullets.slice(col * 2, col * 2 + 2).map((bullet, index) => (
                <div key={`${bullet}-${index}`} className="rounded-2xl bg-[#f8fafc] p-4 text-sm font-semibold text-[#1f2937]">{bullet}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (layout === "evidence" || layout === "source") {
    return (
      <div className="mt-10 grid flex-1 grid-cols-[0.78fr_1.22fr] gap-6">
        <div className="rounded-[24px] p-6" style={theme.softStyle}>
          <div className="text-sm font-bold text-[#1f2937]">资料证据</div>
          <p className="mt-5 text-sm leading-7 text-[#475467]">{slide.speakerNote || "本页保留来源和内容块，方便回溯。"} </p>
          {slide.evidenceBlockIds?.length ? <div className="mt-5 text-xs font-semibold text-[#2f7cff]">{slide.evidenceBlockIds.slice(0, 3).join(" / ")}</div> : null}
        </div>
        <BulletCards slide={slide} theme={theme} />
      </div>
    );
  }

  return (
    <div className="mt-12 grid flex-1 grid-cols-[1.04fr_0.96fr] gap-8 max-md:grid-cols-1">
      <section className="flex flex-col justify-center">
        <h1 className="text-[44px] font-bold leading-tight max-md:text-3xl" style={theme.textStyle}>{slide.title || project.title}</h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-[#667085] max-md:text-base">{slide.subtitle || project.prompt}</p>
        <div className="mt-8 flex gap-3">
          <span className="h-2 w-16 rounded-full" style={theme.accentStyle} />
          <span className="h-2 w-10 rounded-full bg-[#cbd5e1]" />
          <span className="h-2 w-6 rounded-full bg-[#e2e8f0]" />
        </div>
      </section>
      <BulletCards slide={slide} theme={theme} />
    </div>
  );
}

export function SlideCanvas({ project, activeIndex, generatedVisuals, compact = false }: { project: CanvasProject; activeIndex: number; generatedVisuals?: GeneratedVisuals; compact?: boolean }) {
  const slide = project.slides[activeIndex] ?? project.slides[0];
  const theme = useSlideTheme(project, activeIndex);
  const spec = slide ? slideSpecFor(project, slide, activeIndex) : undefined;
  const pageLabel = spec?.role || layoutLabel(slide?.layout);
  const isTeacherCourseware = Boolean(project.deckSpec && (project.teacherStyle || project.contentPlan?.pptType === "courseware"));
  const visualTruth = useMemo(() => {
    if (!isTeacherCourseware || !project.deckSpec) return null;
    try {
      return buildProjectVisualTruth(project.deckSpec, project.slides, mapGeneratedVisualsToSlides(project.slides, generatedVisuals));
    } catch {
      return null;
    }
  }, [generatedVisuals, isTeacherCourseware, project.deckSpec, project.slides]);
  const scene = visualTruth?.scenes.find((item) => item.slideId === slide?.id) || visualTruth?.scenes[activeIndex];

  return (
    <div className={cn("flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#eef1f6] p-4 md:p-8", compact && "bg-transparent p-0")}>
      <div className={cn("aspect-video w-full max-w-[1040px] rounded-[22px] bg-white p-3 shadow-[0_28px_90px_rgba(15,23,42,0.16)]", compact && "max-w-none rounded-none bg-transparent p-0 shadow-none")}>
        <div className={cn("relative h-full overflow-hidden rounded-[18px]", !scene && "p-10", compact && (scene ? "rounded-[28px]" : "rounded-[28px] p-12"))} style={scene ? undefined : theme.frameStyle}>
          {scene ? <BrowserSceneRenderer scene={scene} /> : <>
          <div className="absolute right-[-70px] top-[-70px] size-56 rounded-full bg-white/70" />
          <div className="absolute bottom-8 right-10 h-2 w-48 rounded-full bg-black/10" />
          <div className="relative z-10 flex h-full flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-2xl text-sm font-bold text-white" style={theme.accentStyle}>{String(activeIndex + 1).padStart(2, "0")}</span>
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#667085]">{theme.label}</span>
              </div>
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[#667085] shadow-sm">{pageLabel}</span>
            </div>
            <LayoutPreview slide={slide} activeIndex={activeIndex} project={project} generatedVisuals={generatedVisuals} />
          </div>
          </>}
        </div>
      </div>
    </div>
  );
}

function SlideInspector({
  project,
  activeIndex,
  onProjectChange
}: {
  project: CanvasProject;
  activeIndex: number;
  onProjectChange: (project: CanvasProject) => void;
}) {
  const slide = project.slides[activeIndex] ?? project.slides[0];
  const bullets = slide.bullets?.length ? slide.bullets : [""];

  const updateSlide = (patch: Partial<DesignSlide>) => {
    onProjectChange({
      ...project,
      slides: project.slides.map((item, index) => (index === activeIndex ? { ...item, ...patch } : item))
    });
  };

  const updateBullet = (bulletIndex: number, value: string) => {
    const nextBullets = bullets.map((bullet, index) => (index === bulletIndex ? value : bullet)).filter((bullet) => bullet.trim());
    updateSlide({ bullets: nextBullets });
  };

  const addBullet = () => {
    updateSlide({ bullets: [...bullets.filter(Boolean), "新要点"] });
  };

  const removeBullet = (bulletIndex: number) => {
    updateSlide({ bullets: bullets.filter((_, index) => index !== bulletIndex) });
  };

  return (
    <section className="mt-4 rounded-[18px] border border-line bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-ink">当前页编辑</span>
        <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[11px] font-semibold text-[#1462ff]">P{activeIndex + 1}</span>
      </div>
      <label className="mt-3 block text-[11px] font-semibold text-[#667085]">标题</label>
      <input value={slide.title} onChange={(event) => updateSlide({ title: event.target.value })} className="mt-1 h-9 w-full rounded-xl border-line bg-[#fbfcff] px-3 text-xs font-semibold text-ink focus:border-[#82b7ff] focus:ring-[#82b7ff]" />
      <label className="mt-3 block text-[11px] font-semibold text-[#667085]">副标题</label>
      <textarea value={slide.subtitle} onChange={(event) => updateSlide({ subtitle: event.target.value })} className="mt-1 min-h-16 w-full resize-none rounded-xl border-line bg-[#fbfcff] px-3 py-2 text-xs leading-5 text-ink focus:border-[#82b7ff] focus:ring-[#82b7ff]" />
      <label className="mt-3 block text-[11px] font-semibold text-[#667085]">版式</label>
      <select value={slide.layout || "cards"} onChange={(event) => updateSlide({ layout: event.target.value as SlideLayout })} className="mt-1 h-9 w-full rounded-xl border-line bg-[#fbfcff] px-3 text-xs font-semibold text-ink focus:border-[#82b7ff] focus:ring-[#82b7ff]">
        {layoutOptions.map((layout) => (
          <option key={layout} value={layout}>{layoutLabel(layout)}</option>
        ))}
      </select>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#667085]">正文要点</span>
        <button type="button" onClick={addBullet} className="flex h-7 items-center gap-1 rounded-xl bg-[#eef4ff] px-2 text-[11px] font-semibold text-[#1462ff]">
          <Plus className="size-3" />
          添加
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {bullets.map((bullet, bulletIndex) => (
          <div key={`${bulletIndex}-${bullet}`} className="flex gap-2">
            <input value={bullet} onChange={(event) => updateBullet(bulletIndex, event.target.value)} className="h-9 min-w-0 flex-1 rounded-xl border-line bg-[#fbfcff] px-3 text-xs text-ink focus:border-[#82b7ff] focus:ring-[#82b7ff]" />
            <button type="button" onClick={() => removeBullet(bulletIndex)} className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[#98a2b3] transition hover:bg-[#f8fafc] hover:text-ink" aria-label="删除要点">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      {project.research.length ? (
        <>
          <label className="mt-3 block text-[11px] font-semibold text-[#667085]">来源绑定</label>
          <select value={slide.sourceIds?.[0] || ""} onChange={(event) => updateSlide({ sourceIds: event.target.value ? [event.target.value] : [] })} className="mt-1 h-9 w-full rounded-xl border-line bg-[#fbfcff] px-3 text-xs font-semibold text-ink focus:border-[#82b7ff] focus:ring-[#82b7ff]">
            <option value="">不绑定</option>
            {project.research.map((source) => (
              <option key={source.id} value={source.id}>{source.title}</option>
            ))}
          </select>
        </>
      ) : null}
    </section>
  );
}

function Thumbnail({ index, title, active, onClick }: { index: number; title: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("group rounded-[18px] border bg-white p-2 text-left transition", active ? "border-[#2f7cff] shadow-sm" : "border-line hover:border-[#b7d5ff]")}>
      <div className="aspect-video rounded-xl bg-[linear-gradient(135deg,#f8fafc,#eaf3ff)] p-2">
        <div className="flex h-full flex-col justify-between rounded-lg bg-white/78 p-2">
          <span className="text-[10px] font-bold text-[#2f7cff]">{String(index + 1).padStart(2, "0")}</span>
          <span className="line-clamp-2 text-[11px] font-semibold leading-4 text-ink">{title}</span>
        </div>
      </div>
      <div className="mt-2 line-clamp-1 text-xs font-medium text-[#667085]">{title}</div>
    </button>
  );
}

function qualityTone(status: QualityStatus | undefined) {
  if (status === "ready") {
    return {
      label: "可交付",
      icon: CheckCircle2,
      box: "border-[#bbf7d0] bg-[#f0fdf4] text-[#027a48]",
      bar: "bg-[#12b76a]"
    };
  }
  if (status === "risky") {
    return {
      label: "有风险",
      icon: AlertTriangle,
      box: "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]",
      bar: "bg-[#f97316]"
    };
  }
  return {
    label: "需复核",
    icon: AlertTriangle,
    box: "border-[#bfdbfe] bg-[#eff6ff] text-[#1462ff]",
    bar: "bg-[#2f7cff]"
  };
}

function QualityBanner({ project }: { project: CanvasProject }) {
  const quality = project.quality;
  if (!quality) {
    return null;
  }
  const tone = qualityTone(quality.status);
  const Icon = tone.icon;
  const topIssues = quality.issues.filter((issue) => issue.severity !== "info").slice(0, 2);

  return (
    <section className="shrink-0 border-b border-line bg-white/92 px-4 py-3 backdrop-blur md:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className={cn("flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold", tone.box)}>
          <Icon className="size-4" />
          交付成熟度 {quality.score} · {tone.label}
        </div>
        <div className="h-2 w-32 overflow-hidden rounded-full bg-[#eef2f7]">
          <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${quality.score}%` }} />
        </div>
        <div className="min-w-[220px] flex-1 truncate text-xs text-[#667085]">{quality.summary}</div>
        <div className="hidden gap-2 xl:flex">
          {quality.metrics.slice(0, 3).map((metric) => (
            <span key={metric.label} className="rounded-full bg-[#f8fafc] px-2.5 py-1 text-[11px] font-semibold text-[#475467]">
              {metric.label} {metric.score}
            </span>
          ))}
        </div>
      </div>
      {topIssues.length ? (
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#667085]">
          {topIssues.map((issue) => (
            <span key={issue.id} className="rounded-full bg-[#f8fafc] px-2.5 py-1">
              {issue.title}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function QualityDetail({ project }: { project: CanvasProject }) {
  const quality = project.quality;
  if (!quality) {
    return null;
  }

  return (
    <section className="mt-4 rounded-[18px] border border-line bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-ink">质量详情</span>
        <span className="rounded-full bg-[#f8fafc] px-2 py-0.5 text-[11px] font-semibold text-[#667085]">{quality.score}</span>
      </div>
      <div className="mt-3 space-y-2">
        {quality.metrics.map((metric) => (
          <div key={metric.label}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[#475467]">{metric.label}</span>
              <span className={cn("font-bold", metric.status === "good" ? "text-[#027a48]" : metric.status === "warn" ? "text-[#1462ff]" : "text-[#c2410c]")}>{metric.score}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#eef2f7]">
              <div className={cn("h-full rounded-full", metric.status === "good" ? "bg-[#12b76a]" : metric.status === "warn" ? "bg-[#2f7cff]" : "bg-[#f97316]")} style={{ width: `${metric.score}%` }} />
            </div>
          </div>
        ))}
      </div>
      {quality.issues.length ? (
        <div className="mt-3 space-y-2">
          {quality.issues.slice(0, 3).map((issue) => (
            <div key={issue.id} className="rounded-2xl bg-[#f8fafc] p-2">
              <div className="line-clamp-1 text-[11px] font-bold text-[#344054]">{issue.title}</div>
              <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#667085]">{issue.action || issue.detail}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl bg-[#f0fdf4] p-2 text-[11px] font-semibold text-[#027a48]">暂无明显交付风险</div>
      )}
    </section>
  );
}

function ReviewDeliveryPanel({
  project,
  activeIndex,
  onApplyReviewFixes,
  onApplyPageReviewFixes,
  isApplyingReviewFixes
}: {
  project: CanvasProject;
  activeIndex: number;
  onApplyReviewFixes: () => void;
  onApplyPageReviewFixes: (pageIndex: number, slideId?: string) => void;
  isApplyingReviewFixes: boolean;
}) {
  const center = project.reviewCenter;
  const review = center?.postReview;
  const fixSummary = center?.lastFixSummary;
  const pageFixSummary = center?.lastPageFixSummary?.page === activeIndex + 1 ? center.lastPageFixSummary : undefined;
  if (!center) {
    return (
      <section className="mt-4 rounded-[18px] border border-line bg-white p-3 shadow-sm">
        <div className="text-xs font-bold text-ink">评审中枢</div>
        <div className="mt-2 rounded-2xl bg-[#f8fafc] p-3 text-[11px] leading-5 text-[#667085]">
          当前稿件还没有评审规则。请先启动 Agent，让系统完成类型识别、评分规则和策划审核。
        </div>
      </section>
    );
  }

  const slide = project.slides[activeIndex];
  const pageReview = review?.pageReviews.find((item) => item.slideId === slide?.id || item.page === activeIndex + 1);
  const slideDeductions = review?.deductions.filter((item) => item.slideId === slide?.id || item.slideTitle === slide?.title).slice(0, 3) || [];
  const evidence = summarizeEvidenceAuthenticity(project);
  const slideEvidence = summarizeSlideEvidence(project, slide?.id, activeIndex + 1);
  const evidenceClass =
    evidence.tone === "good"
      ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#027a48]"
      : evidence.tone === "warn"
        ? "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]"
        : "border-[#fecdd3] bg-[#fff1f3] text-[#b42318]";

  return (
    <section className="mt-4 rounded-[18px] border border-[#cfe2ff] bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-ink">评审中枢验收</span>
        <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[11px] font-bold text-[#1462ff]">
          {center.pptTypeLabel}{review ? ` · ${review.totalScore}` : ""}
        </span>
      </div>
      <div className="mt-3 rounded-2xl bg-[#f8fafc] p-3">
        <div className="text-[11px] font-semibold text-[#667085]">当前页角色</div>
        <div className="mt-1 text-xs font-bold leading-5 text-ink">{pageReview?.role || center.planningAudit.pageRoles[activeIndex]?.role || "页面论证"}</div>
        <div className="mt-2 text-[11px] leading-5 text-[#667085]">
          要证明：{pageReview?.shouldProve || center.planningAudit.pageRoles[activeIndex]?.mustProve || "本页观点有清晰证据支撑。"}
        </div>
      </div>
      <div className={cn("mt-3 rounded-2xl border p-3 text-[11px] leading-5", evidenceClass)}>
        <div className="flex items-center justify-between gap-2 font-bold">
          <span>证据真实性</span>
          <span>{evidence.score} · {evidence.label}</span>
        </div>
        <div className="mt-1">{evidence.headline}</div>
        {slideEvidence ? (
          <div className="mt-2 rounded-xl bg-white/70 p-2 text-[#344054]">
            本页覆盖率 {slideEvidence.coverage}%，来源置信度 {slideEvidence.confidence}%。
            {slideEvidence.weak ? " 需要补真实来源或降低确定性表述。" : " 可进入导出复核。"}
          </div>
        ) : null}
      </div>
      {fixSummary ? (
        <div className="mt-3 rounded-2xl bg-[#eef6ff] p-3 text-[11px] leading-5 text-[#1462ff]">
          <div className="font-bold">本次修复摘要</div>
          <div className="mt-1">{fixSummary.message}</div>
          <div className="mt-1 font-semibold">
            {fixSummary.beforeScore} → {fixSummary.afterScore} 分，仍有 {fixSummary.unresolvedCount} 个未解决项。
          </div>
        </div>
      ) : null}
      {pageFixSummary ? (
        <div className="mt-3 rounded-2xl bg-[#f0fdf4] p-3 text-[11px] leading-5 text-[#027a48]">
          <div className="font-bold">本页修复摘要</div>
          <div className="mt-1">{pageFixSummary.message}</div>
          <div className="mt-1 font-semibold">
            本页 {pageFixSummary.beforePageScore ?? "-"} → {pageFixSummary.afterPageScore ?? "-"} 分，剩余 {pageFixSummary.remainingPageDeductions} 个扣分项。
          </div>
          {pageFixSummary.applied?.length ? <div className="mt-1 text-[#344054]">{pageFixSummary.applied.slice(0, 2).join("；")}</div> : null}
        </div>
      ) : null}
      {review?.priorityFixes.length ? (
        <div className="mt-3">
          <div className="text-[11px] font-bold text-[#667085]">优先修改</div>
          <div className="mt-2 space-y-2">
            {review.priorityFixes.slice(0, 3).map((fix) => (
              <div key={fix.id} className="rounded-2xl bg-[#fff7ed] p-2 text-[11px] leading-5 text-[#c2410c]">
                <div className="font-bold">{fix.where}</div>
                <div className="mt-1">{fix.suggestion}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {slideDeductions.length ? (
        <div className="mt-3">
          <div className="text-[11px] font-bold text-[#667085]">本页扣分</div>
          <div className="mt-2 space-y-2">
            {slideDeductions.map((item) => (
              <div key={item.id} className="rounded-2xl bg-[#f8fafc] p-2 text-[11px] leading-5 text-[#667085]">
                <span className="font-bold text-ink">-{item.points}</span>
                <span className="ml-1">{item.reason}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-2xl bg-[#f0fdf4] p-2 text-[11px] font-semibold text-[#027a48]">
          当前页没有明显可自动修复扣分。
          {review?.priorityFixes.length ? <div className="mt-1 text-[#c2410c]">但整套 PPT 仍有优先修改项，需要继续处理。</div> : null}
        </div>
      )}
      <button
        type="button"
        onClick={() => onApplyPageReviewFixes(activeIndex, slide?.id)}
        disabled={!review || isApplyingReviewFixes}
        className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-xs font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isApplyingReviewFixes ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
        只修当前页并重新评分
      </button>
      <button
        type="button"
        onClick={onApplyReviewFixes}
        disabled={!review || isApplyingReviewFixes}
        className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-white text-xs font-semibold text-ink transition hover:border-[#b7d5ff] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isApplyingReviewFixes ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        修复整套优先项
      </button>
    </section>
  );
}

function ExportGatePanel({
  gate,
  onApplyReviewFixes,
  onAddManualSource,
  isApplyingReviewFixes
}: {
  gate?: Pick<ExportGateResult, "ok" | "score" | "qualityBar" | "pptType" | "pptTypeLabel" | "issues" | "explanation"> | null;
  onApplyReviewFixes: () => void;
  onAddManualSource: (source: { title: string; url: string; summary: string }) => Promise<void>;
  isApplyingReviewFixes: boolean;
}) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceSummary, setSourceSummary] = useState("");
  const [isAddingSource, setIsAddingSource] = useState(false);
  if (!gate || gate.ok) return null;
  const explanation = gate.explanation;
  const primaryIssue = explanation.primaryIssue || gate.issues[0];
  const statusClass = explanation.missingRealSources
    ? "border-[#fecdd3] bg-[#fff1f3] text-[#b42318]"
    : "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]";

  return (
    <section className={cn("mt-4 rounded-[18px] border p-3 shadow-sm", statusClass)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold">导出闸门</span>
        <span className="rounded-full bg-white/75 px-2 py-0.5 text-[11px] font-bold">
          {gate.score}/{gate.qualityBar}
        </span>
      </div>
      <div className="mt-2 text-[12px] font-bold leading-5">{explanation.headline}</div>
      <div className="mt-1 text-[11px] leading-5 opacity-90">{explanation.summary}</div>
      {primaryIssue ? (
        <div className="mt-3 rounded-2xl bg-white/72 p-3 text-[11px] leading-5 text-[#344054]">
          <div className="font-bold text-ink">{primaryIssue.title}</div>
          <div className="mt-1">{primaryIssue.detail}</div>
          {primaryIssue.action ? <div className="mt-1 font-semibold text-[#1462ff]">怎么处理：{primaryIssue.action}</div> : null}
        </div>
      ) : null}
      {explanation.topActions.length ? (
        <div className="mt-3 space-y-1.5">
          {explanation.topActions.slice(0, 3).map((action) => (
            <div key={action} className="rounded-xl bg-white/58 px-2 py-1.5 text-[11px] font-semibold leading-4 text-[#344054]">
              {action}
            </div>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onApplyReviewFixes}
        disabled={!explanation.canAutoFix || isApplyingReviewFixes}
        className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-xs font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isApplyingReviewFixes ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
        {explanation.canAutoFix ? "先应用可自动修复项" : "需要先补真实资料"}
      </button>
      {explanation.missingRealSources ? (
        <div className="mt-3 rounded-2xl bg-white/80 p-3">
          <div className="text-[11px] font-bold text-ink">补充真实来源后重新评分</div>
          <input
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://... 公开网页 / 官方资料链接"
            className="mt-2 h-9 w-full rounded-xl border border-line bg-white px-3 text-[11px] text-ink outline-none focus:border-[#82b7ff]"
          />
          <input
            value={sourceTitle}
            onChange={(event) => setSourceTitle(event.target.value)}
            placeholder="来源标题，例如：教育部政策文件 / 官方产品文档"
            className="mt-2 h-9 w-full rounded-xl border border-line bg-white px-3 text-[11px] text-ink outline-none focus:border-[#82b7ff]"
          />
          <textarea
            value={sourceSummary}
            onChange={(event) => setSourceSummary(event.target.value)}
            placeholder="粘贴与当前 PPT 相关的摘要、数据、政策依据或原文片段"
            className="mt-2 h-16 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-[11px] leading-4 text-ink outline-none focus:border-[#82b7ff]"
          />
          <button
            type="button"
            onClick={async () => {
              setIsAddingSource(true);
              try {
                await onAddManualSource({ title: sourceTitle, url: sourceUrl, summary: sourceSummary });
                setSourceUrl("");
                setSourceTitle("");
                setSourceSummary("");
              } finally {
                setIsAddingSource(false);
              }
            }}
            disabled={isAddingSource || (!sourceUrl.trim() && !sourceSummary.trim())}
            className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-2xl border border-[#cfe2ff] bg-[#eef6ff] text-xs font-semibold text-[#1462ff] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAddingSource ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            补充来源并重新评分
          </button>
        </div>
      ) : null}
    </section>
  );
}

function PresenterOverlay({
  project,
  activeIndex,
  onActiveIndexChange,
  onClose
}: {
  project: CanvasProject;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const prev = () => onActiveIndexChange(Math.max(0, activeIndex - 1));
  const next = () => onActiveIndexChange(Math.min(project.slides.length - 1, activeIndex + 1));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") prev();
      if (event.key === "ArrowRight" || event.key === " ") next();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#080b12] p-4 text-white">
      <header className="flex h-14 shrink-0 items-center justify-between">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{project.title}</div>
          <div className="text-xs text-white/55">{activeIndex + 1} / {project.slides.length}</div>
        </div>
        <button type="button" onClick={onClose} className="flex size-10 items-center justify-center rounded-2xl bg-white/10 text-white transition hover:bg-white/18" aria-label="退出放映">
          <X className="size-5" />
        </button>
      </header>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <button type="button" onClick={prev} disabled={activeIndex === 0} className="absolute left-2 z-10 flex size-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-30" aria-label="上一页">
          <ChevronLeft className="size-6" />
        </button>
        <div className="w-full max-w-6xl">
          <SlideCanvas project={project} activeIndex={activeIndex} compact />
        </div>
        <button type="button" onClick={next} disabled={activeIndex === project.slides.length - 1} className="absolute right-2 z-10 flex size-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-30" aria-label="下一页">
          <ChevronRight className="size-6" />
        </button>
      </div>
    </div>
  );
}

export function PresentationEditor({ project, isExporting, isRefining, isPresenting, lastExportGate, onExport, onRefine, onPresent, onClosePresent, onProjectChange, generatedVisuals, isGeneratingVisuals, onGenerateVisuals, onApplyReviewFixes, onApplyPageReviewFixes, onAddManualSource, isApplyingReviewFixes, workspaceType, workspaceIdentity, assistantPanel, onNewGeneral, onNewTeacher }: PresentationEditorProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [activePanel, setActivePanel] = useState<EditorPanel>(workspaceType === "teacher_courseware" ? "review" : "assistant");
  const [panelOpen, setPanelOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const visualCount = (generatedVisuals.cover ? 1 : 0) + Object.keys(generatedVisuals.slides || {}).length;
  const issueCount = project.quality?.issues.filter((issue) => issue.severity !== "info").length ?? 0;
  const teacherProject = workspaceType === "teacher_courseware";

  useEffect(() => {
    setPanelOpen(window.matchMedia("(min-width: 1280px)").matches);
  }, []);

  const openPanel = (panel: EditorPanel) => {
    setActivePanel(panel);
    setPanelOpen(true);
  };

  const panelItems: Array<{ id: EditorPanel; label: string; icon: typeof Bot; teacherOnly?: boolean }> = [
    { id: "assistant", label: "AI 助手", icon: Bot },
    { id: "page", label: "页面设置", icon: Settings2 },
    { id: "visual", label: "素材与视觉", icon: ImagePlus },
    { id: "review", label: teacherProject ? "教学检查" : "质量检查", icon: CheckCircle2 },
    { id: "version", label: "版本记录", icon: FileClock }
  ];

  const lifecycleLabel = workspaceIdentity?.lifecycleStatus === "ready_for_teacher"
    ? "可供教师复核"
    : workspaceIdentity?.lifecycleStatus === "review_required"
      ? "需要复核"
      : workspaceIdentity?.lifecycleStatus === "failed"
        ? "交付受阻"
        : workspaceIdentity?.lifecycleStatus === "generated"
          ? "已生成"
          : "编辑中";

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-[#eef1f3]">
      {isPresenting ? <PresenterOverlay project={project} activeIndex={activeIndex} onActiveIndexChange={setActiveIndex} onClose={onClosePresent} /> : null}
      <header className="flex h-[68px] shrink-0 items-center gap-3 border-b border-[#dfe4e1] bg-white px-3 md:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#17211f] text-white"><Sparkles className="size-4" /></span>
          <div className="hidden shrink-0 text-sm font-semibold sm:block">BNSR</div>
          <span className="hidden h-5 w-px bg-[#dfe4e1] sm:block" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="max-w-[340px] truncate text-sm font-semibold text-[#17211f]">{project.title}</div>
              <span className={cn("hidden shrink-0 rounded px-2 py-1 text-[10px] font-semibold md:inline-flex", teacherProject ? "bg-[#e8f3ef] text-[#11756d]" : "bg-[#edf1f8] text-[#3c66a6]")}>{teacherProject ? "教师课件" : "通用演示"}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#74817d]">
              <span>{project.slides.length} 页</span>
              <span>·</span>
              <span>{workspaceIdentity ? `V${workspaceIdentity.versionNumber}` : "自动保存"}</span>
              <span className="hidden sm:inline">· {lifecycleLabel}</span>
            </div>
          </div>
        </div>
        <div className="relative hidden sm:block">
          <button type="button" onClick={() => setNewMenuOpen((current) => !current)} className="flex h-9 items-center gap-1.5 rounded-md border border-[#d8dfdc] bg-white px-3 text-xs font-semibold text-[#34413f] hover:bg-[#f6f8f7]">
            <Plus className="size-4" />新建<ChevronDown className="size-3.5" />
          </button>
          {newMenuOpen ? <div className="absolute right-0 top-11 z-50 w-48 rounded-md border border-[#d8dfdc] bg-white p-1.5 shadow-[0_16px_40px_rgba(23,33,31,0.14)]"><button type="button" onClick={onNewGeneral} className="flex w-full items-center gap-2 rounded px-3 py-2.5 text-left text-sm hover:bg-[#f3f5f3]"><Sparkles className="size-4 text-[#3c66a6]" />通用 PPT</button><button type="button" onClick={onNewTeacher} className="flex w-full items-center gap-2 rounded px-3 py-2.5 text-left text-sm hover:bg-[#f3f5f3]"><BookOpen className="size-4 text-[#11756d]" />教师课件</button></div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => openPanel("review")} className={cn("hidden h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold md:flex", issueCount ? "border-[#efc2b6] bg-[#fff4f0] text-[#b4472c]" : "border-[#c9ddd6] bg-[#f0f7f4] text-[#11756d]")}>
            {issueCount ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}检查{issueCount ? ` ${issueCount}` : ""}
          </button>
          <button type="button" onClick={onRefine} disabled={isRefining} className="hidden h-9 items-center gap-1.5 rounded-md border border-[#d8dfdc] bg-white px-3 text-xs font-semibold text-[#34413f] hover:bg-[#f6f8f7] disabled:opacity-50 lg:flex">
            {isRefining ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            优化当前稿
          </button>
          <button type="button" onClick={onPresent} className="hidden h-9 items-center gap-1.5 rounded-md border border-[#d8dfdc] bg-white px-3 text-xs font-semibold text-[#34413f] hover:bg-[#f6f8f7] md:flex">
            <MonitorPlay className="size-4" />
            预览
          </button>
          <button type="button" onClick={onExport} disabled={isExporting} className="flex h-9 items-center gap-1.5 rounded-md bg-[#17211f] px-3.5 text-xs font-semibold text-white hover:bg-[#2a3835] disabled:opacity-50">
            {isExporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            导出
          </button>
          <button type="button" onClick={() => setPanelOpen((current) => !current)} className="flex size-9 items-center justify-center rounded-md border border-[#d8dfdc] text-[#52615d] xl:hidden" title={panelOpen ? "收起工具面板" : "打开工具面板"}>{panelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}</button>
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1">
        <aside className="thin-scrollbar hidden w-[196px] shrink-0 overflow-y-auto border-r border-[#dfe4e1] bg-[#f8faf9] p-3 md:block">
          <div className="mb-3 flex items-center justify-between px-1 text-xs font-semibold text-[#62706c]">
            <span>页面</span><span>{project.slides.length}</span>
          </div>
          <div className="space-y-3">
            {project.slides.map((slide, index) => (
              <Thumbnail key={slide.id || `thumb-${index}`} index={index} title={slide.title} active={activeIndex === index} onClick={() => setActiveIndex(index)} />
            ))}
          </div>
        </aside>
        <SlideCanvas project={project} activeIndex={activeIndex} generatedVisuals={generatedVisuals} />
        {panelOpen ? <button type="button" onClick={() => setPanelOpen(false)} className="absolute inset-0 z-20 bg-[#17211f]/20 xl:hidden" aria-label="关闭工具面板" /> : null}
        <aside className={cn("absolute bottom-0 right-0 top-0 z-30 flex w-[min(380px,92vw)] flex-col border-l border-[#dfe4e1] bg-white shadow-[-18px_0_46px_rgba(23,33,31,0.12)] transition-transform xl:static xl:w-[370px] xl:shrink-0 xl:translate-x-0 xl:shadow-none", panelOpen ? "translate-x-0" : "translate-x-full")}>
          <div className="flex h-12 shrink-0 items-center border-b border-[#e7ebe9] px-2">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {panelItems.map((item) => {
                const Icon = item.icon;
                return <button key={item.id} type="button" onClick={() => setActivePanel(item.id)} title={item.label} className={cn("flex size-9 shrink-0 items-center justify-center rounded-md transition", activePanel === item.id ? "bg-[#e8f3ef] text-[#11756d]" : "text-[#74817d] hover:bg-[#f3f5f3] hover:text-[#34413f]")}><Icon className="size-4" /></button>;
              })}
            </div>
            <div className="ml-2 border-l border-[#e7ebe9] pl-3 text-xs font-semibold text-[#34413f]">{panelItems.find((item) => item.id === activePanel)?.label}</div>
            <button type="button" onClick={() => setPanelOpen(false)} className="ml-2 flex size-8 items-center justify-center rounded-md text-[#74817d] hover:bg-[#f3f5f3] xl:hidden" aria-label="关闭工具面板"><X className="size-4" /></button>
          </div>

          <div className="min-h-0 flex-1">
            {activePanel === "assistant" ? assistantPanel : null}
            {activePanel === "page" ? <div className="thin-scrollbar h-full overflow-y-auto p-4"><SlideInspector project={project} activeIndex={activeIndex} onProjectChange={onProjectChange} /></div> : null}
            {activePanel === "visual" ? <div className="thin-scrollbar h-full overflow-y-auto p-4"><div className="rounded-md border border-[#d8dfdc] bg-[#f8faf9] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-[#17211f]"><ImagePlus className="size-4 text-[#3c66a6]" />素材与视觉</div><p className="mt-2 text-xs leading-5 text-[#74817d]">为封面和关键页补充视觉内容，生成结果会用于当前预览和通用路径导出。</p><button type="button" onClick={onGenerateVisuals} disabled={isGeneratingVisuals} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#3c66a6] text-sm font-semibold text-white disabled:opacity-50">{isGeneratingVisuals ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}生成视觉{visualCount ? ` · 已有 ${visualCount}` : ""}</button></div></div> : null}
            {activePanel === "review" ? <div className="thin-scrollbar h-full overflow-y-auto p-4"><QualityBanner project={project} /><QualityDetail project={project} /><ExportGatePanel gate={lastExportGate} onApplyReviewFixes={onApplyReviewFixes} onAddManualSource={onAddManualSource} isApplyingReviewFixes={isApplyingReviewFixes} /><ReviewDeliveryPanel project={project} activeIndex={activeIndex} onApplyReviewFixes={onApplyReviewFixes} onApplyPageReviewFixes={onApplyPageReviewFixes} isApplyingReviewFixes={isApplyingReviewFixes} /></div> : null}
            {activePanel === "version" ? <div className="thin-scrollbar h-full overflow-y-auto p-4"><div className="rounded-md border border-[#d8dfdc] bg-[#f8faf9] p-4"><div className="flex items-center gap-2 text-sm font-semibold"><FileClock className="size-4 text-[#11756d]" />当前版本</div><div className="mt-4 grid grid-cols-[92px_1fr] gap-y-3 text-xs"><span className="text-[#74817d]">项目类型</span><span className="font-semibold">{teacherProject ? "教师课件" : "通用演示"}</span><span className="text-[#74817d]">版本</span><span className="font-semibold">{workspaceIdentity ? `V${workspaceIdentity.versionNumber}` : "本地编辑稿"}</span><span className="text-[#74817d]">状态</span><span className="font-semibold">{lifecycleLabel}</span>{workspaceIdentity ? <><span className="text-[#74817d]">版本 ID</span><span className="truncate font-mono text-[10px]" title={workspaceIdentity.versionId}>{workspaceIdentity.versionId}</span></> : null}</div></div>{teacherProject ? <div className="mt-3 rounded-md border border-[#c9ddd6] bg-[#f0f7f4] p-3 text-xs leading-5 text-[#315b52]">教师课件导出会读取服务器冻结版本，不使用浏览器中的页面副本作为交付事实。</div> : null}</div> : null}
          </div>
        </aside>
      </div>
      <footer className="flex h-8 shrink-0 items-center justify-between border-t border-[#dfe4e1] bg-white px-4 text-[11px] text-[#74817d]"><span>{workspaceIdentity ? `服务器版本 V${workspaceIdentity.versionNumber}` : "本地自动保存"}</span><span>当前第 {activeIndex + 1} 页 · 共 {project.slides.length} 页</span></footer>
    </section>
  );
}
