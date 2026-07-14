"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Download, FileText, History, ImagePlus, LayoutTemplate, Loader2, MessageCircle, MessageSquareText, MonitorPlay, PanelRightClose, PanelRightOpen, Plus, RefreshCw, RotateCcw, Save, Send, Sparkles, Upload, Wand2, X } from "lucide-react";
import { SlideCanvas } from "@/components/PresentationEditor";
import { TeacherSectionEditor } from "@/components/TeacherSectionEditor";
import type { CanvasProject, DesignSlide, SlideLayout } from "@/lib/canvas-data";
import {
  teacherWorkspaceBootstrapKey,
  teacherWorkspaceIdentityKey,
  type WorkspaceIdentity,
} from "@/lib/teacher-courseware-task";
import { cn } from "@/lib/utils";
import type { TeacherChatRow, TeacherExportMeta, TeacherGeneratedVisuals, TeacherMaterialRow, TeacherVersionRow } from "@/lib/teacher-workspace-contract";

type ToolTab = "content" | "design" | "materials" | "classroom" | "chat" | "check";

type TeacherSandunStudioProps = {
  project: CanvasProject;
  workspaceIdentity: WorkspaceIdentity | null;
  isExporting: boolean;
  isRefining: boolean;
  isGeneratingVisuals: boolean;
  isApplyingReviewFixes: boolean;
  isPresenting: boolean;
  generatedVisuals: TeacherGeneratedVisuals;
  onExport: () => void;
  onPresent: () => void;
  onClosePresent: () => void;
  onProjectChange: (project: CanvasProject) => void;
  onRefine: (instruction?: string, kind?: "page" | "deck" | "classroom", targetSlideId?: string) => void;
  onManualSave: (slideId: string, patch: { title?: string; subtitle?: string; bullets?: string[]; speakerNote?: string; layout?: string; sections?: DesignSlide["sections"] }) => void;
  isSavingSlide: boolean;
  teacherExportMeta: TeacherExportMeta | null;
  onGenerateVisuals: () => void;
  onApplyReviewFixes: () => void;
  onApplyPageReviewFixes: (pageIndex: number, slideId?: string) => void;
  teacherVersions: TeacherVersionRow[];
  teacherMaterials: TeacherMaterialRow[];
  isViewingCurrentVersion: boolean;
  onSelectVersion: (versionId: string) => void;
  teacherChat: TeacherChatRow[];
  isChatSending: boolean;
  onSendChat: (content: string) => void;
  isApplyingChatSuggestion: boolean;
  onApplyChatSuggestion: (message: TeacherChatRow) => void;
  isAttachingMaterial: boolean;
  onAttachMaterial: (material: { title: string; content: string; source?: string }) => void;
  isSubmittingReview: boolean;
  onSubmitReview: () => void;
};

function versionTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

const layouts: SlideLayout[] = ["cover", "agenda", "cards", "comparison", "stats", "timeline", "process", "checklist", "source"];

function courseSection(role = "", title = "", index = 0) {
  const text = `${role} ${title}`;
  if (/导入|情境|已有知识|背景/.test(text)) return "导入";
  if (/目标|学习目标/.test(text)) return "学习目标";
  if (/练习|作业|检测|巩固/.test(text)) return "课堂练习";
  if (/小结|总结|回顾|延伸/.test(text)) return "小结与作业";
  if (/例题|互动|活动|探究/.test(text)) return "例题与互动";
  return index === 0 ? "导入" : "新知讲解";
}

function engineering(identity: WorkspaceIdentity | null) {
  switch (identity?.engineeringStatus) {
    case "passed": return { label: "工程检查通过", tone: "text-[#027a48]", summary: "页面结构和文件生成状态已检查。此状态不等同于教师审核。" };
    case "failed": return { label: "工程检查未通过", tone: "text-[#b42318]", summary: "页面结构或文件生成存在问题，请查看建议处理项。" };
    default: return { label: "工程检查进行中", tone: "text-[#667085]", summary: "页面结构和文件生成状态尚在核对中。此状态不等同于教师审核。" };
  }
}

function readiness(identity: WorkspaceIdentity | null) {
  switch (identity?.lifecycleStatus) {
    case "ready_for_teacher": return { label: "教师审核通过版本", tone: "text-[#027a48] bg-[#ecfdf3] border-[#abefc6]", summary: "工程检查通过，教师审核已通过。" };
    case "review_required": return { label: "待教师审核", tone: "text-[#175cd3] bg-[#eff8ff] border-[#b2ddff]", summary: "工程检查已完成，建议教师确认教学内容后使用。" };
    case "failed": return { label: "教学内容未通过审核", tone: "text-[#b42318] bg-[#fff1f3] border-[#fecdca]", summary: "请先处理课前检查中的问题。" };
    default: return { label: "教师审核尚未完成", tone: "text-[#667085] bg-[#f8fafc] border-[#dfe5ee]", summary: "当前版本仍在准备中。" };
  }
}

function Thumbnail({ index, slide, active, onClick }: { index: number; slide: DesignSlide; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn("w-full border bg-white p-2 text-left transition", active ? "border-[#2f7cff] shadow-[0_6px_18px_rgba(47,124,255,0.12)]" : "border-[#e0e6ef] hover:border-[#a8c9ff]")}><div className="aspect-video bg-[#edf4ff] p-2"><div className="flex h-full flex-col justify-between border border-white/80 bg-white/75 p-2"><span className="text-[10px] font-bold text-[#2f7cff]">{String(index + 1).padStart(2, "0")}</span><span className="line-clamp-2 text-[10px] font-semibold leading-4 text-ink">{slide.title}</span></div></div><span className="mt-2 block line-clamp-1 text-[11px] text-[#667085]">{slide.title}</span></button>;
}

export function TeacherSandunStudio({ project, workspaceIdentity, isExporting, isRefining, isGeneratingVisuals, isApplyingReviewFixes, isPresenting, generatedVisuals, onExport, onPresent, onClosePresent, onProjectChange, onRefine, onManualSave, isSavingSlide, teacherExportMeta, onGenerateVisuals, onApplyReviewFixes, onApplyPageReviewFixes, teacherVersions, teacherMaterials, isViewingCurrentVersion, onSelectVersion, teacherChat, isChatSending, onSendChat, isApplyingChatSuggestion, onApplyChatSuggestion, isAttachingMaterial, onAttachMaterial, isSubmittingReview, onSubmitReview }: TeacherSandunStudioProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [tool, setTool] = useState<ToolTab>("content");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialContent, setMaterialContent] = useState("");
  const [materialSource, setMaterialSource] = useState("");
  const projectRef = useRef(project);
  projectRef.current = project;
  const currentVersion = teacherVersions.find((row) => row.isCurrent);
  const activeSlide = project.slides[activeIndex] || project.slides[0];
  const displayTitle = /^请为|^为/.test(project.title) || project.title.length > 48
    ? project.slides[0]?.title || project.contentPlan?.teacherContext?.topic || project.title
    : project.title;
  const status = readiness(workspaceIdentity);
  const engineeringStatus = engineering(workspaceIdentity);
  const reviewFixes = project.reviewCenter?.postReview?.priorityFixes || [];
  const sections = useMemo(() => {
    const groups: Array<{ label: string; pages: Array<{ slide: DesignSlide; index: number }> }> = [];
    project.slides.forEach((slide, index) => {
      const role = project.contentPlan?.slidePlan[index]?.role || slide.pageIntent || "";
      const label = courseSection(role, slide.title, index);
      // Keep server slide order; merge section labels only when adjacent.
      const group = groups.at(-1);
      if (group?.label === label) group.pages.push({ slide, index }); else groups.push({ label, pages: [{ slide, index }] });
    });
    return groups;
  }, [project.contentPlan?.slidePlan, project.slides]);

  const patchActive = (patch: Partial<DesignSlide>) => {
    const current = projectRef.current;
    const nextProject = { ...current, slides: current.slides.map((slide, index) => index === activeIndex ? { ...slide, ...patch } : slide) };
    // Keep the latest user input available to an immediately-following Save click.
    projectRef.current = nextProject;
    onProjectChange(nextProject);
  };
  const saveActiveSlide = () => {
    const latest = projectRef.current.slides[activeIndex];
    if (!latest?.id) return;
    onManualSave(latest.id, { title: latest.title, subtitle: latest.subtitle, bullets: latest.bullets, speakerNote: latest.speakerNote, layout: latest.layout });
  };
  const addBullet = () => patchActive({ bullets: [...(activeSlide?.bullets || []), "新要点"] });
  const updateBullet = (bulletIndex: number, value: string) => patchActive({ bullets: (activeSlide?.bullets || []).map((bullet, index) => index === bulletIndex ? value : bullet).filter(Boolean) });
  const tabs: Array<{ id: ToolTab; label: string; icon: typeof FileText }> = [
    { id: "content", label: "内容", icon: FileText }, { id: "design", label: "设计", icon: LayoutTemplate }, { id: "materials", label: "教材素材", icon: ImagePlus }, { id: "classroom", label: "课堂", icon: MessageSquareText }, { id: "chat", label: "对话", icon: MessageCircle }, { id: "check", label: "课前检查", icon: ClipboardCheck }
  ];

  const prev = () => setActiveIndex((current) => Math.max(0, current - 1));
  const next = () => setActiveIndex((current) => Math.min(project.slides.length - 1, current + 1));

  return <>
    {isPresenting ? <div className="fixed inset-0 z-[120] flex flex-col bg-[#0b1019] p-4 text-white"><header className="flex h-14 items-center justify-between"><div><div className="text-sm font-semibold">{project.title}</div><div className="mt-1 text-xs text-white/60">课堂预览 · {activeIndex + 1} / {project.slides.length}</div></div><button type="button" onClick={onClosePresent} className="flex size-10 items-center justify-center bg-white/10 hover:bg-white/20" aria-label="退出课堂预览"><X className="size-5" /></button></header><div className="relative flex min-h-0 flex-1 items-center justify-center"><button type="button" onClick={prev} disabled={activeIndex === 0} className="absolute left-1 z-10 flex size-11 items-center justify-center bg-white/10 disabled:opacity-30"><ChevronLeft className="size-5" /></button><div className="w-full max-w-6xl"><SlideCanvas project={project} activeIndex={activeIndex} compact /></div><button type="button" onClick={next} disabled={activeIndex === project.slides.length - 1} className="absolute right-1 z-10 flex size-11 items-center justify-center bg-white/10 disabled:opacity-30"><ChevronRight className="size-5" /></button></div></div> : null}
  <main className="flex h-dvh overflow-hidden bg-[#f3f5f9] text-ink">
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[#e0e6ef] bg-white px-3 md:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#171719] text-white"><Sparkles className="size-4" /></span><span className="hidden text-sm font-semibold sm:block">Sandun</span><span className="hidden h-5 w-px bg-[#dfe5ee] sm:block" /><div className="min-w-0"><div className="truncate text-sm font-semibold">{displayTitle}</div><div className="mt-0.5 flex gap-2 text-[11px] text-[#667085]"><span>{project.contentPlan?.teacherContext?.subject || "教师课件"}</span><span>·</span><span>{workspaceIdentity ? `V${workspaceIdentity.versionNumber}` : "草稿"}</span><span className="hidden md:inline">· {status.label}</span></div></div></div>
        <div className="relative hidden sm:block">
          <button type="button" onClick={() => setVersionMenuOpen((current) => !current)} disabled={!teacherVersions.length} className="flex h-9 items-center gap-1.5 border border-[#dfe5ee] px-3 text-xs font-semibold text-[#344054] hover:bg-[#f8fafc] disabled:opacity-50"><History className="size-4" />版本{workspaceIdentity ? ` V${workspaceIdentity.versionNumber}` : ""}<ChevronDown className="size-3.5" /></button>
          {versionMenuOpen ? <><button type="button" onClick={() => setVersionMenuOpen(false)} className="fixed inset-0 z-40" aria-label="关闭版本列表" /><div className="thin-scrollbar absolute right-0 top-11 z-50 max-h-[60vh] w-72 overflow-y-auto border border-[#e0e6ef] bg-white p-2 shadow-[0_16px_40px_rgba(20,32,52,0.16)]"><div className="px-2 py-1.5 text-[11px] font-semibold text-[#667085]">版本历史</div>{teacherVersions.length ? teacherVersions.map((row) => { const isActive = row.versionId === workspaceIdentity?.versionId; return <button key={row.versionId} type="button" onClick={() => { onSelectVersion(row.versionId); setVersionMenuOpen(false); }} className={cn("flex w-full items-center justify-between gap-2 border px-3 py-2 text-left text-xs", isActive ? "border-[#2f7cff] bg-[#f3f8ff]" : "border-transparent hover:bg-[#f8fafc]")}><span className="min-w-0"><span className="block font-semibold text-[#344054]">V{row.versionNumber}{row.isCurrent ? " · 当前版本" : ""}</span><span className="mt-0.5 block truncate text-[#667085]">{versionTime(row.createdAt)}</span></span>{isActive ? <CheckCircle2 className="size-4 shrink-0 text-[#2f7cff]" /> : null}</button>; }) : <div className="px-3 py-2 text-xs text-[#667085]">暂无版本记录</div>}</div></> : null}
        </div>
        <button type="button" onClick={() => { window.sessionStorage.removeItem(teacherWorkspaceBootstrapKey); window.sessionStorage.removeItem(teacherWorkspaceIdentityKey); window.location.assign("/teacher-ai-ppt"); }} className="hidden h-9 items-center gap-1.5 border border-[#dfe5ee] px-3 text-xs font-semibold text-[#344054] hover:bg-[#f8fafc] md:flex"><Plus className="size-4" />新建课件</button>
        <button type="button" onClick={onPresent} className="hidden h-9 items-center gap-1.5 border border-[#dfe5ee] px-3 text-xs font-semibold text-[#344054] hover:bg-[#f8fafc] sm:flex"><MonitorPlay className="size-4" />课堂预览</button>
        <button type="button" onClick={onExport} disabled={isExporting} className="flex h-9 items-center gap-1.5 rounded-md bg-[#171719] px-3.5 text-xs font-semibold text-white hover:bg-[#2c3440] disabled:opacity-50">{isExporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}导出课件</button>
        <button type="button" onClick={() => setToolsOpen((current) => !current)} className="flex size-9 items-center justify-center border border-[#dfe5ee] text-[#475467] xl:hidden" title="打开工具箱">{toolsOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}</button>
      </header>
      {!isViewingCurrentVersion ? <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#fed7aa] bg-[#fffaf0] px-4 py-2 text-xs text-[#92400e]"><span className="flex items-center gap-2"><AlertTriangle className="size-4" />正在查看历史版本，为只读状态。返回当前版本后即可编辑。</span>{currentVersion ? <button type="button" onClick={() => onSelectVersion(currentVersion.versionId)} className="flex h-7 shrink-0 items-center gap-1.5 border border-[#f0ba7a] bg-white px-2.5 font-semibold text-[#92400e] hover:bg-[#fff4e6]"><RotateCcw className="size-3.5" />返回当前版本</button> : null}</div> : null}
      <div className="flex min-h-0 flex-1">
        <aside className="thin-scrollbar hidden w-[208px] shrink-0 overflow-y-auto border-r border-[#e0e6ef] bg-white px-3 py-4 md:block"><div className="flex items-center justify-between px-1 text-xs font-semibold text-[#475467]"><span>课程结构</span><span>{project.slides.length} 页</span></div><div className="mt-4 space-y-5">{sections.map((group) => <section key={`${group.label}-${group.pages[0]?.index ?? 0}` }><div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold text-[#667085]"><ChevronDown className="size-3.5" />{group.label}</div><div className="space-y-2">{group.pages.map(({ slide, index }) => <Thumbnail key={slide.id || index} index={index} slide={slide} active={index === activeIndex} onClick={() => setActiveIndex(index)} />)}</div></section>)}</div></aside>
        <SlideCanvas project={project} activeIndex={activeIndex} generatedVisuals={generatedVisuals} />
        {toolsOpen ? <button type="button" onClick={() => setToolsOpen(false)} className="absolute inset-0 z-20 bg-[#171719]/25 xl:hidden" aria-label="关闭工具箱" /> : null}
        <aside className={cn("absolute bottom-0 right-0 top-16 z-30 flex w-[min(380px,92vw)] flex-col border-l border-[#e0e6ef] bg-white shadow-[-16px_0_40px_rgba(20,32,52,0.12)] transition-transform xl:static xl:top-auto xl:w-[350px] xl:shrink-0 xl:translate-x-0 xl:shadow-none", toolsOpen ? "translate-x-0" : "translate-x-full")}>
          <div className="flex h-12 shrink-0 items-center border-b border-[#e7ebf1] px-2">{tabs.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setTool(item.id)} title={item.label} className={cn("flex h-9 min-w-9 items-center justify-center px-1.5 text-[10px] font-semibold", tool === item.id ? "border-b-2 border-[#2f7cff] text-[#175cd3]" : "text-[#667085] hover:text-ink")}><Icon className="mr-1 size-3.5" /><span>{item.label}</span></button>; })}<button type="button" onClick={() => setToolsOpen(false)} className="ml-auto flex size-8 items-center justify-center text-[#667085] xl:hidden"><PanelRightClose className="size-4" /></button></div>
          <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            {tool === "content" ? <div><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">本页内容</h2><p className="mt-1 text-xs text-muted">编辑课堂表达与教师讲稿。</p></div><span className="text-xs text-[#667085]">第 {activeIndex + 1} 页</span></div><label className="mt-5 block text-xs font-semibold text-[#475467]">标题<input value={activeSlide?.title || ""} onChange={(event) => patchActive({ title: event.target.value })} className="mt-2 h-10 w-full border border-[#dfe5ee] px-3 text-sm focus:border-[#2f7cff] focus:ring-[#2f7cff]/10" /></label><label className="mt-4 block text-xs font-semibold text-[#475467]">副标题<textarea value={activeSlide?.subtitle || ""} onChange={(event) => patchActive({ subtitle: event.target.value })} className="mt-2 min-h-20 w-full border border-[#dfe5ee] p-3 text-sm leading-6 focus:border-[#2f7cff] focus:ring-[#2f7cff]/10" /></label><div className="mt-4 flex items-center justify-between"><span className="text-xs font-semibold text-[#475467]">页面要点</span><button type="button" onClick={addBullet} className="flex h-7 items-center gap-1 text-xs font-semibold text-[#175cd3]"><Plus className="size-3.5" />添加</button></div><div className="mt-2 space-y-2">{(activeSlide?.bullets || []).map((bullet, index) => <input key={`${index}-${bullet}`} value={bullet} onChange={(event) => updateBullet(index, event.target.value)} className="h-9 w-full border border-[#e0e6ef] px-3 text-xs focus:border-[#2f7cff] focus:ring-[#2f7cff]/10" />)}</div><label className="mt-4 block text-xs font-semibold text-[#475467]">教师讲稿<textarea value={activeSlide?.speakerNote || ""} onChange={(event) => patchActive({ speakerNote: event.target.value })} placeholder="写下讲解提示、提问方式或板书要点" className="mt-2 min-h-24 w-full border border-[#dfe5ee] p-3 text-sm leading-6 focus:border-[#2f7cff] focus:ring-[#2f7cff]/10" /></label>{activeSlide ? <TeacherSectionEditor slide={activeSlide} disabled={isSavingSlide || !isViewingCurrentVersion} onPersist={(sections) => { patchActive({ sections }); if (activeSlide.id) onManualSave(activeSlide.id, { sections }); }} /> : null}<button type="button" onClick={saveActiveSlide} disabled={isSavingSlide || !activeSlide?.id} className="mt-4 flex h-10 w-full items-center justify-center gap-2 bg-[#171719] text-sm font-semibold text-white disabled:opacity-50">{isSavingSlide ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}保存本页</button><button type="button" onClick={() => onRefine("请压缩当前页文字，保留关键教学表达，并使其更适合投影讲授。", "page", activeSlide?.id) } disabled={isRefining} className="mt-2 flex h-10 w-full items-center justify-center gap-2 border border-[#bed5ff] bg-[#f3f8ff] text-sm font-semibold text-[#175cd3] disabled:opacity-50">{isRefining ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}优化本页表达</button></div> : null}
            {tool === "design" ? <div><h2 className="text-sm font-semibold">页面设计</h2><p className="mt-1 text-xs leading-5 text-muted">调整本页版式，或用 Sandun 补充关键视觉。</p><label className="mt-5 block text-xs font-semibold text-[#475467]">页面版式<select value={activeSlide?.layout || "cards"} onChange={(event) => patchActive({ layout: event.target.value as SlideLayout })} className="mt-2 h-10 w-full border border-[#dfe5ee] bg-white px-3 text-sm focus:border-[#2f7cff] focus:ring-[#2f7cff]/10">{layouts.map((layout) => <option key={layout} value={layout}>{layout}</option>)}</select></label><button type="button" onClick={() => activeSlide?.id && onManualSave(activeSlide.id, { layout: activeSlide.layout })} disabled={isSavingSlide || !isViewingCurrentVersion || !activeSlide?.id} className="mt-3 flex h-10 w-full items-center justify-center gap-2 border border-[#bed5ff] bg-[#f3f8ff] text-sm font-semibold text-[#175cd3] disabled:opacity-50">{isSavingSlide ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}保存本页版式</button><div className="mt-5 border border-[#dfe5ee] bg-[#f8fafc] p-4"><div className="flex items-center gap-2 text-sm font-semibold"><ImagePlus className="size-4 text-[#2f7cff]" />配图与版式</div><p className="mt-2 text-xs leading-5 text-[#667085]">为封面和关键页生成视觉内容，保持整套课件的层级和节奏。</p><button type="button" onClick={onGenerateVisuals} disabled={isGeneratingVisuals} className="mt-4 flex h-10 w-full items-center justify-center gap-2 bg-[#2f7cff] text-sm font-semibold text-white disabled:opacity-50">{isGeneratingVisuals ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}生成页面视觉</button></div><button type="button" onClick={() => onRefine("请统一整套课件的标题层级、留白和视觉节奏，保留教学内容。", "deck") } disabled={isRefining} className="mt-3 flex h-10 w-full items-center justify-center gap-2 border border-[#dfe5ee] text-sm font-semibold text-[#344054] disabled:opacity-50"><RefreshCw className="size-4" />统一整套版式</button></div> : null}
            {tool === "materials" ? <div><h2 className="text-sm font-semibold">教材与素材</h2><p className="mt-1 text-xs leading-5 text-muted">当前课件已关联的教材、教案和来源。</p><div className="mt-5 space-y-2">{project.sourceDocuments?.length ? project.sourceDocuments.map((source, index) => <div key={`${source.title}-${index}`} className="border border-[#e0e6ef] p-3"><div className="text-sm font-semibold">{source.title || `资料 ${index + 1}`}</div><div className="mt-1 text-xs text-muted">已解析并用于当前课件</div></div>) : <div className="border border-dashed border-[#ccd7e6] bg-[#f8fafc] p-4 text-xs leading-5 text-[#667085]">当前没有已关联的教材资料。新资料可在“从教案生成”入口重新建立版本。</div>}</div>{teacherMaterials.length ? <div className="mt-4 space-y-2"><div className="text-xs font-semibold text-[#475467]">已附加材料</div>{teacherMaterials.map((material, index) => <div key={`${material.name || material.title || "material"}-${index}`} className="border border-[#e0e6ef] p-3"><div className="text-sm font-semibold">{material.name || material.title || `材料 ${index + 1}`}</div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted"><span>{material.origin === "teacher_upload" ? "教师上传" : material.origin === "chat" ? "对话补充" : material.origin === "classroom" ? "课堂互动" : "已附加"}</span>{material.addedAt ? <span>{versionTime(material.addedAt)}</span> : null}</div></div>)}</div> : null}<div className="mt-5 border border-[#dfe5ee] bg-[#f8fafc] p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Upload className="size-4 text-[#2f7cff]" />补充材料</div><p className="mt-2 text-xs leading-5 text-[#667085]">粘贴补充教材或素材，附加后会生成新的服务器版本。</p><input value={materialTitle} onChange={(event) => setMaterialTitle(event.target.value)} placeholder="材料标题" disabled={!isViewingCurrentVersion || isAttachingMaterial} className="mt-3 h-9 w-full border border-[#dfe5ee] bg-white px-3 text-xs focus:border-[#2f7cff] focus:ring-[#2f7cff]/10 disabled:opacity-50" /><input value={materialSource} onChange={(event) => setMaterialSource(event.target.value)} placeholder="来源（可选）" disabled={!isViewingCurrentVersion || isAttachingMaterial} className="mt-2 h-9 w-full border border-[#dfe5ee] bg-white px-3 text-xs focus:border-[#2f7cff] focus:ring-[#2f7cff]/10 disabled:opacity-50" /><textarea value={materialContent} onChange={(event) => setMaterialContent(event.target.value)} placeholder="粘贴材料内容" disabled={!isViewingCurrentVersion || isAttachingMaterial} className="mt-2 min-h-20 w-full border border-[#dfe5ee] bg-white p-3 text-xs leading-5 focus:border-[#2f7cff] focus:ring-[#2f7cff]/10 disabled:opacity-50" /><button type="button" onClick={() => { onAttachMaterial({ title: materialTitle, content: materialContent, source: materialSource }); setMaterialTitle(""); setMaterialContent(""); setMaterialSource(""); }} disabled={!isViewingCurrentVersion || isAttachingMaterial || (!materialTitle.trim() && !materialContent.trim())} className="mt-3 flex h-10 w-full items-center justify-center gap-2 bg-[#2f7cff] text-sm font-semibold text-white disabled:opacity-50">{isAttachingMaterial ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}附加材料并生成新版本</button></div><div className="mt-5 border-t border-[#e7ebf1] pt-4"><div className="text-xs font-semibold text-[#475467]">页面来源</div><div className="mt-2 space-y-2">{project.research.slice(0, 4).map((source) => <a key={source.id} href={source.url || "#"} target="_blank" rel="noreferrer" className="block border border-[#e0e6ef] p-3 text-xs text-[#175cd3]"><b className="block text-[#344054]">{source.title}</b><span className="mt-1 block line-clamp-2 text-[#667085]">{source.summary}</span></a>)}</div></div></div> : null}
            {tool === "classroom" ? <div><h2 className="text-sm font-semibold">课堂互动</h2><p className="mt-1 text-xs leading-5 text-muted">用已有的 Sandun 优化能力补足课堂提问、例题和练习。</p><div className="mt-5 space-y-2">{[{ label: "为本页增加课堂提问", prompt: "请为当前页增加一个适合课堂互动的提问，并给出学生可能的回答方向。" }, { label: "生成随堂练习", prompt: "请根据本页内容补充一项可在课堂内完成的随堂练习，并提供答案提示。" }, { label: "补一页课堂小结", prompt: "请在课件末尾补一页课堂小结，回扣学习目标并给出课后思考。" }].map((action) => <button key={action.label} type="button" onClick={() => onRefine(action.prompt, "classroom", activeSlide?.id)} disabled={isRefining} className="flex min-h-12 w-full items-center justify-between border border-[#dfe5ee] px-3 text-left text-sm font-semibold text-[#344054] hover:border-[#a8c9ff] disabled:opacity-50"><span>{action.label}</span><ChevronRight className="size-4 text-[#2f7cff]" /></button>)}</div></div> : null}
            {tool === "chat" ? <div className="flex h-full min-h-0 flex-col"><h2 className="text-sm font-semibold">与 Sandun 对话</h2><p className="mt-1 text-xs leading-5 text-muted">描述你想调整的页面。建议不会直接改动课件，确认后才生成新版本。</p><div className="thin-scrollbar mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">{teacherChat.length ? teacherChat.map((message) => <div key={message.id} className={cn("border p-3 text-xs leading-5", message.role === "user" ? "border-[#bed5ff] bg-[#f3f8ff]" : "border-[#e0e6ef] bg-white")}><div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-[#667085]"><span>{message.role === "user" ? "教师" : "Sandun"}</span><span>{versionTime(message.createdAt)}</span></div><div className={cn(message.status === "failed" ? "text-[#b42318]" : "text-[#344054]")}>{message.content}</div>{message.status === "failed" ? <div className="mt-1 text-[10px] font-semibold text-[#b42318]">助理响应失败，请稍后重试</div> : null}{message.role === "assistant" && message.suggestedPatch?.slideId && message.suggestedPatch?.patch ? <button type="button" onClick={() => onApplyChatSuggestion(message)} disabled={Boolean(message.appliedVersionId) || isApplyingChatSuggestion || !isViewingCurrentVersion} className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 border border-[#bed5ff] bg-[#eff8ff] text-xs font-semibold text-[#175cd3] disabled:opacity-50">{isApplyingChatSuggestion ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}{message.appliedVersionId ? "已应用到新版本" : "应用建议并生成新版本"}</button> : null}</div>) : <div className="border border-dashed border-[#ccd7e6] bg-[#f8fafc] p-4 text-xs leading-5 text-[#667085]">还没有对话记录。可以说“把第 2 页标题改为……”开始。</div>}</div><div className="mt-3 shrink-0 border-t border-[#e7ebf1] pt-3"><textarea value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder="例如：把第 2 页标题改为函数的表示方法" disabled={isChatSending} className="min-h-16 w-full border border-[#dfe5ee] p-3 text-xs leading-5 focus:border-[#2f7cff] focus:ring-[#2f7cff]/10 disabled:opacity-50" /><button type="button" onClick={() => { const text = chatDraft.trim(); if (!text) return; onSendChat(text); setChatDraft(""); }} disabled={isChatSending || !chatDraft.trim()} className="mt-2 flex h-10 w-full items-center justify-center gap-2 bg-[#171719] text-sm font-semibold text-white disabled:opacity-50">{isChatSending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}发送</button></div></div> : null}
            {tool === "check" ? <div><h2 className="text-sm font-semibold">课前检查</h2><p className="mt-1 text-xs leading-5 text-muted">先处理课堂使用风险，再查看系统依据。</p><div className={cn("mt-5 border p-4", status.tone)}><div className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4" />{status.label}</div><p className="mt-2 text-xs leading-5">{status.summary}</p></div><div className="mt-4 border border-[#dfe5ee] p-4"><div className="text-xs font-semibold text-[#475467]">工程检查</div><div className={cn("mt-2 flex items-center gap-2 text-sm font-semibold", engineeringStatus.tone)}>{workspaceIdentity?.engineeringStatus === "failed" ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}{engineeringStatus.label}</div><p className="mt-1 text-xs leading-5 text-[#667085]">{engineeringStatus.summary}</p>{teacherExportMeta ? <dl className="mt-3 space-y-1 border-t border-[#eef1f6] pt-3 text-[11px] leading-5 text-[#667085]">{teacherExportMeta.artifactId ? <div className="flex justify-between gap-3"><dt>产物 ID</dt><dd className="truncate font-mono text-[#344054]">{teacherExportMeta.artifactId}</dd></div> : null}{teacherExportMeta.deliveryClass ? <div className="flex justify-between gap-3"><dt>交付类型</dt><dd className="font-mono text-[#344054]">{teacherExportMeta.deliveryClass}</dd></div> : null}{teacherExportMeta.deckSpecHash ? <div className="flex justify-between gap-3"><dt>结构校验</dt><dd className="font-mono text-[#344054]">{teacherExportMeta.deckSpecHash}</dd></div> : null}{teacherExportMeta.pageCount ? <div className="flex justify-between gap-3"><dt>页数</dt><dd className="font-mono text-[#344054]">{teacherExportMeta.pageCount}</dd></div> : null}<div className="flex justify-between gap-3"><dt>商业可用</dt><dd className="font-mono text-[#344054]">否（待教师审核）</dd></div></dl> : null}</div>{reviewFixes.length ? <div className="mt-4"><div className="text-xs font-semibold text-[#475467]">建议处理</div><div className="mt-2 space-y-2">{reviewFixes.slice(0, 3).map((fix) => <div key={fix.id} className="border border-[#fed7aa] bg-[#fffaf0] p-3 text-xs leading-5 text-[#92400e]"><b className="block">{fix.where}</b><span>{fix.suggestion}</span></div>)}</div></div> : <div className="mt-4 border border-[#dfe5ee] bg-[#f8fafc] p-3 text-xs leading-5 text-[#667085]">当前没有发现可自动处理的课前问题。</div>}<button type="button" onClick={() => onApplyPageReviewFixes(activeIndex, activeSlide?.id)} disabled={isApplyingReviewFixes || !reviewFixes.length} className="mt-4 flex h-10 w-full items-center justify-center gap-2 border border-[#bed5ff] bg-[#f3f8ff] text-sm font-semibold text-[#175cd3] disabled:opacity-50">{isApplyingReviewFixes ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}修复当前页建议</button><button type="button" onClick={onApplyReviewFixes} disabled={isApplyingReviewFixes || !reviewFixes.length} className="mt-2 flex h-10 w-full items-center justify-center gap-2 bg-[#171719] text-sm font-semibold text-white disabled:opacity-50">{isApplyingReviewFixes ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}处理整套课件建议</button><div className="mt-5 border-t border-[#e7ebf1] pt-4"><div className="text-xs font-semibold text-[#475467]">提交教师审核</div><p className="mt-1 text-xs leading-5 text-[#667085]">确认教学内容后提交审核，系统会生成新版本并标记为“待教师审核”。此操作不代表商业可用。</p><button type="button" onClick={onSubmitReview} disabled={isSubmittingReview || !isViewingCurrentVersion} className="mt-3 flex h-10 w-full items-center justify-center gap-2 border border-[#b2ddff] bg-[#eff8ff] text-sm font-semibold text-[#175cd3] disabled:opacity-50">{isSubmittingReview ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}提交教师审核</button></div></div> : null}
          </div>
        </aside>
      </div>
      <footer className="flex h-8 shrink-0 items-center justify-between border-t border-[#e0e6ef] bg-white px-4 text-[11px] text-[#667085]"><span>{workspaceIdentity ? `当前服务器版本 V${workspaceIdentity.versionNumber}` : "本地编辑中"}</span><span>第 {activeIndex + 1} 页 / 共 {project.slides.length} 页</span></footer>
    </section>
  </main></>;
}
