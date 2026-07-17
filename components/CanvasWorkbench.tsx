"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node
} from "@xyflow/react";
import { BookOpen, ChevronDown, Crosshair, Eye, Loader2, Maximize2, Plus, Sparkles, Wand2, ZoomIn, ZoomOut } from "lucide-react";
import { AgentChatPanel, type AgentMessage, type AgentStage } from "@/components/AgentChatPanel";
import { AuthModal, type AuthUser } from "@/components/AuthModal";
import { AssetsNode, BriefNode, DesignNode, OutlineNode, PlanNode, ResearchNode } from "@/components/CanvasNodes";
import { PresentationEditor } from "@/components/PresentationEditor";
import { TeacherSandunStudio } from "@/components/TeacherSandunStudio";
import { UploadPPTCard, type UploadedFile } from "@/components/UploadPPTCard";
import {
  buildProjectFromPrompt,
  defaultProject,
  samplePrompts,
  type CanvasProject,
  type ResearchItem,
  type SearchGroup,
  type UploadedAsset
} from "@/lib/canvas-data";
import { getDesignProfile, planVisualAsset, visualPromptForSlide } from "@/lib/ppt-design-system";
import { summarizeEvidenceAuthenticity } from "@/lib/ppt-agent/evidence-authenticity";
import type { ExportGateResult } from "@/lib/export-quality-gate";
import { ensureProjectQuality } from "@/lib/project-quality";
import { cn, sleep } from "@/lib/utils";
import { getWorkbenchModeContract, modeForUploadedFile, type WorkbenchMode } from "@/lib/workbench-mode";
import { teacherWorkspaceBootstrapKey, teacherWorkspaceIdentityKey, type WorkspaceBootstrapPayload, type WorkspaceIdentity } from "@/lib/teacher-courseware-task";
import type { TeacherChatRow, TeacherExportMeta, TeacherMaterialRow, TeacherVersionRow } from "@/lib/teacher-workspace-contract";
import { commitTeacherWorkspaceVersion, readTeacherChat, readTeacherVersion, readTeacherVersions } from "@/lib/teacher-workspace-client";

import "@xyflow/react/dist/style.css";

type Toast = {
  type: "success" | "error" | "info" | "warning";
  message: string;
} | null;

type GeneratedVisuals = {
  cover?: string;
  slides?: Record<string, string>;
};

type ExportGatePayload = Pick<ExportGateResult, "ok" | "score" | "qualityBar" | "pptType" | "pptTypeLabel" | "issues" | "explanation">;

const nodeTypes = {
  brief: BriefNode,
  outline: OutlineNode,
  research: ResearchNode,
  plan: PlanNode,
  design: DesignNode,
  assets: AssetsNode
};

const STORAGE_KEY = "ai-ppt-agent-canvas-state-v5";

type EmptySample = {
  title: string;
  prompt: string;
  mode: WorkbenchMode;
};

const agentSamples: EmptySample[] = samplePrompts.map((sample) => ({
  title: sample.title,
  prompt: sample.prompt,
  mode: "agent"
}));

const beautifySamples: EmptySample[] = [
  {
    title: "上传已有 PPT 进行美化",
    prompt: "上传已有 PPT 后，保留原有结构，统一为商务简约风，并优化排版、层级和留白。",
    mode: "beautify"
  },
  {
    title: "根据 PDF 生成可编辑版",
    prompt: "根据上传的 PDF 资料生成一份可编辑 PPT，保留证据、图表和关键结论。",
    mode: "reference"
  },
  {
    title: "需求文档转 PPT",
    prompt: "上传需求文档，按每页要求自动拆分内容、策划页面并生成可导出的 PPT。",
    mode: "reference"
  },
  {
    title: "重排版与压缩文案",
    prompt: "把现有 PPT 重新排版，压缩冗长文案，强化视觉层级和页面节奏。",
    mode: "beautify"
  }
];

type SavedCanvasState = {
  project: CanvasProject;
  assets: UploadedAsset[];
  stage: AgentStage;
  searchGroups: SearchGroup[];
  provider: "openai" | "local" | null;
  generatedVisuals?: GeneratedVisuals;
  messages?: AgentMessage[];
};

type CloudSessionPayload = SavedCanvasState & {
  id: string;
  messages?: AgentMessage[];
};

type CloudSessionSummary = {
  id: string;
  title: string;
  stage: string;
  updatedAt: string;
};

function timeNow() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function firstMessage(): AgentMessage[] {
  return [
    {
      id: "assistant-welcome",
      role: "assistant",
      content: "下午好，有什么 PPT 需要我做？我会先做公开资料调研，也可以解析你上传的 PDF、Word、PPTX 或需求文档，再生成大纲、策划稿和可导出的 PPTX。",
      time: timeNow()
    }
  ];
}

function fallbackSearchGroups(queries: string[]): SearchGroup[] {
  return queries.slice(0, 4).map((query, index) => ({
    query,
    provider: "provider_unconfigured",
    status: "provider_unconfigured",
    warnings: ["未配置真实搜索 provider，未返回公开检索结果。"],
    results: []
  }));
}

function deriveSearchQueries(prompt: string, project?: CanvasProject, assets: UploadedAsset[] = []) {
  const base = prompt
    .replace(/帮我(做|生成|制作)?一份?/g, "")
    .replace(/PPTX?/gi, "")
    .replace(/[，。！？?.]/g, " ")
    .trim()
    .slice(0, 42);
  const assetHints = assets
    .filter((asset) => asset.analysis?.summary)
    .slice(0, 2)
    .map((asset) => `${base || project?.title || "PPT 主题"} ${asset.analysis?.outlineSuggestions?.[0] || asset.name} 公开资料`);
  const outlineQueries = project?.outline?.slice(0, 4).map((item) => `${base || project.title} ${item.title} 公开资料`) ?? [];

  return [`${base || "PPT 主题"} 背景资料`, `${base || "PPT 主题"} 官方信息`, `${base || "PPT 主题"} 数据 案例`, ...assetHints, ...outlineQueries]
    .filter(Boolean)
    .slice(0, 6);
}

function researchFromSearchGroups(groups: SearchGroup[]): ResearchItem[] {
  return groups.filter((group) => group.results.length > 0).slice(0, 8).map((group, index) => {
    const first = group.results[0];
    const confidence = group.results.length > 0 ? Math.round(group.results.reduce((sum, item) => sum + item.confidence, 0) / group.results.length) : 68;
    return {
      id: `research-search-${index + 1}`,
      title: group.query,
      source: first?.sourceName || (group.provider.includes("official") ? "官方公开资料" : group.provider.includes("web") ? "Web 检索" : "公开资料入口"),
      summary: first?.snippet || "已归纳为当前 PPT 页面可使用的参考资料。",
      confidence: Math.max(42, Math.min(96, confidence)),
      url: first?.url,
      sourceName: first?.sourceName,
      sourceType: first?.sourceType,
      providerTier: first?.providerTier,
      status: first?.status
    };
  });
}

function buildStageNodes(
  stage: AgentStage,
  sharedData: {
    project: CanvasProject;
    assets: UploadedAsset[];
    collapsedNodeIds: string[];
    focusNodeId: string | null;
    onProjectChange: (project: CanvasProject) => void;
    onSearchMore: () => void;
    onRemoveAsset: (id: string) => void;
    onToggleNodeCollapse: (id: string) => void;
    onFocusNode: (id: string | null) => void;
  }
): Node[] {
  if (stage === "idle" || stage === "researching" || stage === "requirements" || stage === "editor") {
    return [];
  }
  const nodes: Node[] = [
    { id: "brief", type: "brief", position: { x: 80, y: 120 }, data: sharedData },
    { id: "outline", type: "outline", position: { x: 520, y: 70 }, data: sharedData }
  ];
  if (stage === "searching" || stage === "planning" || stage === "planReady" || stage === "designing") {
    nodes.push({ id: "research", type: "research", position: { x: 1010, y: 80 }, data: sharedData });
    nodes.push({ id: "assets", type: "assets", position: { x: 80, y: 480 }, data: sharedData });
  }
  if (stage === "planning" || stage === "planReady" || stage === "designing") {
    nodes.push({ id: "plan", type: "plan", position: { x: 1510, y: 80 }, data: sharedData });
  }
  if (stage === "designing") {
    nodes.push({ id: "design", type: "design", position: { x: 2010, y: 80 }, data: sharedData });
  }
  return nodes;
}

function buildStageEdges(stage: AgentStage): Edge[] {
  if (stage === "idle" || stage === "researching" || stage === "requirements" || stage === "editor") {
    return [];
  }
  const edges: Edge[] = [{ id: "brief-outline", source: "brief", target: "outline", animated: true }];
  if (stage === "searching" || stage === "planning" || stage === "planReady" || stage === "designing") {
    edges.push({ id: "outline-research", source: "outline", target: "research", animated: true });
    edges.push({ id: "assets-research", source: "assets", target: "research", animated: false });
  }
  if (stage === "planning" || stage === "planReady" || stage === "designing") {
    edges.push({ id: "research-plan", source: "research", target: "plan", animated: true });
  }
  if (stage === "designing") {
    edges.push({ id: "plan-design", source: "plan", target: "design", animated: true });
  }
  return edges;
}

const workflowSteps: Array<{ key: AgentStage | "review" | "export"; label: string }> = [
  { key: "researching", label: "理解/检索" },
  { key: "requirements", label: "类型识别" },
  { key: "review", label: "评审规则" },
  { key: "outlining", label: "便签大纲" },
  { key: "planning", label: "内容策划" },
  { key: "designing", label: "设计生成" },
  { key: "editor", label: "评分/导出" }
];

const canvasStageLabels: Record<AgentStage, string> = {
  idle: "等待需求",
  researching: "背景调研中",
  requirements: "需求确认",
  outlining: "生成大纲中",
  outlineReady: "大纲已生成",
  searching: "逐页检索中",
  planning: "内容策划中",
  planReady: "策划已完成",
  designing: "设计生成中",
  editor: "可编辑预览"
};

function stageProgressIndex(stage: AgentStage) {
  const order: AgentStage[] = ["idle", "researching", "requirements", "outlining", "outlineReady", "searching", "planning", "planReady", "designing", "editor"];
  return order.indexOf(stage);
}

function WorkflowRail({
  stage,
  project,
  assets,
  searchGroups
}: {
  stage: AgentStage;
  project: CanvasProject;
  assets: UploadedAsset[];
  searchGroups: SearchGroup[];
}) {
  if (stage === "idle") {
    return null;
  }

  const progress = stageProgressIndex(stage);
  const completed = (step: AgentStage | "review" | "export") => {
    if (step === "review") return Boolean(project.reviewCenter);
    if (step === "export") return stage === "editor";
    return progress >= stageProgressIndex(step);
  };
  const active = (step: AgentStage | "review" | "export") => {
    if (step === "review") return stage === "requirements" && Boolean(project.reviewCenter);
    if (step === "export") return stage === "editor";
    if (step === "planning") return stage === "searching" || stage === "planning" || stage === "planReady";
    return stage === step;
  };
  const evidence = summarizeEvidenceAuthenticity(project);
  const modeContract = getWorkbenchModeContract(project.mode);
  const evidenceClass =
    evidence.tone === "good"
      ? "bg-[#f0fdf4] text-[#027a48]"
      : evidence.tone === "warn"
        ? "bg-[#fff7ed] text-[#c2410c]"
        : "bg-[#fff1f3] text-[#b42318]";

  return (
    <div className="absolute left-4 top-[92px] z-20 hidden w-[360px] rounded-[24px] border border-line bg-white/92 p-4 shadow-sm backdrop-blur-xl xl:block">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Sparkles className="size-4 text-[#2f7cff]" />
          Agent 执行链路
        </div>
        <span className="rounded-full bg-[#eef4ff] px-2.5 py-1 text-xs font-bold text-[#1462ff]">{modeContract.label}</span>
      </div>
      <div className="mt-2 text-xs font-medium text-muted">{modeContract.tagline}</div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-2xl bg-[#f8fafc] p-2">
          <div className="text-muted">资料</div>
          <div className="mt-1 font-bold text-ink">{assets.length} 个</div>
        </div>
        <div className="rounded-2xl bg-[#f8fafc] p-2">
          <div className="text-muted">来源</div>
          <div className="mt-1 font-bold text-ink">{project.sourceDocuments?.length || searchGroups.length} 组</div>
        </div>
        <div className="rounded-2xl bg-[#f8fafc] p-2">
          <div className="text-muted">评分</div>
          <div className="mt-1 font-bold text-ink">{project.reviewCenter?.postReview?.totalScore ?? "--"}</div>
        </div>
      </div>
      <div className={cn("mt-3 rounded-2xl px-3 py-2 text-xs leading-5", evidenceClass)}>
        <div className="flex items-center justify-between gap-3 font-bold">
          <span>证据状态</span>
          <span>{evidence.label}</span>
        </div>
        <div className="mt-1 line-clamp-2 opacity-90">{evidence.headline}</div>
      </div>
      <div className="mt-4 space-y-2">
        {workflowSteps.map((step, index) => (
          <div key={`${step.key}-${index}`} className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                active(step.key) ? "bg-[#2f7cff] text-white" : completed(step.key) ? "bg-[#dcfce7] text-[#027a48]" : "bg-[#eef2f7] text-[#98a2b3]"
              )}
            >
              {index + 1}
            </span>
            <div className={cn("h-9 flex-1 rounded-2xl px-3 py-2 text-xs font-semibold", active(step.key) ? "bg-[#eef4ff] text-[#1462ff]" : completed(step.key) ? "bg-[#f0fdf4] text-[#027a48]" : "bg-[#f8fafc] text-muted")}>
              {step.label}
            </div>
          </div>
        ))}
      </div>
      {project.reviewCenter ? (
        <div className="mt-3 rounded-2xl bg-[#fff7ed] px-3 py-2 text-xs leading-5 text-[#c2410c]">
          最易扣分：{project.reviewCenter.planningAudit.likelyDeductions.slice(0, 2).join("；")}
        </div>
      ) : null}
    </div>
  );
}

function CanvasEmptyState({
  stage,
  draft,
  mode,
  uploadedFile,
  onUploaded,
  onSample
}: {
  stage: AgentStage;
  draft: string;
  mode: WorkbenchMode;
  uploadedFile: UploadedFile | null;
  onUploaded: (file: UploadedFile | null) => void;
  onSample: (sample: EmptySample) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, x: 0, y: 0 });

  if (stage !== "idle" && stage !== "researching" && stage !== "requirements") {
    return null;
  }
  const busy = stage === "researching";
  const modeContract = getWorkbenchModeContract(mode);
  const samples =
    mode === "agent"
      ? agentSamples
      : [
          ...beautifySamples.filter((sample) => sample.mode === mode),
          ...beautifySamples.filter((sample) => sample.mode !== mode)
        ];

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button,input,textarea,a")) return;
    dragRef.current.dragging = true;
    dragRef.current.startX = event.clientX - dragRef.current.x;
    dragRef.current.startY = event.clientY - dragRef.current.y;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging || !panelRef.current) return;
    const nextX = event.clientX - dragRef.current.startX;
    const nextY = event.clientY - dragRef.current.startY;
    dragRef.current.x = Math.max(-360, Math.min(360, nextX));
    dragRef.current.y = Math.max(-220, Math.min(260, nextY));
    panelRef.current.style.transform = `translate(${dragRef.current.x}px, ${dragRef.current.y}px)`;
  };

  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current.dragging = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be released by the browser when the pointer leaves the window.
    }
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center overflow-y-auto px-5 pb-6 pt-24 md:items-center md:overflow-visible md:py-10">
      <div
        ref={panelRef}
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        className="pointer-events-auto w-full max-w-[760px] cursor-grab select-none text-center active:cursor-grabbing"
      >
        <div className="mx-auto hidden size-24 items-center justify-center rounded-[28px] border border-line bg-white text-ink shadow-[0_24px_80px_rgba(47,124,255,0.14)] sm:flex">
          {busy ? <Loader2 className="size-12 animate-spin text-[#2f7cff]" /> : <Wand2 className="size-12" />}
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-normal text-ink sm:mt-5 md:text-5xl">
          {busy ? "AI 正在调研公开资料" : mode === "agent" ? "下午好，有什么 PPT 需要我做？" : mode === "beautify" ? "上传 PPT，我来重排美化" : "上传资料，我来生成 PPT"}
        </h1>
        {!busy ? <div className="mx-auto mt-3 max-w-[520px] text-sm font-medium text-muted">{modeContract.tagline}</div> : null}
        {!busy && mode !== "agent" ? (
          <div className="mx-auto mt-5 max-w-[520px]">
            <UploadPPTCard uploadedFile={uploadedFile} onUploaded={onUploaded} />
          </div>
        ) : null}
        {!busy ? (
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {samples.slice(0, 4).map((sample) => (
              <button key={sample.title} type="button" onClick={() => onSample(sample)} className="rounded-[20px] border border-line bg-white/88 px-4 py-3 text-left text-sm font-semibold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-[#b7d5ff]">
                <span className="block">{sample.title}</span>
                <span className="mt-1 block truncate text-xs font-normal text-muted">{sample.prompt}</span>
              </button>
            ))}
          </div>
        ) : null}
        {draft ? <div className="mt-5 text-xs text-muted">已填入右侧输入框，可直接发送。</div> : null}
      </div>
    </div>
  );
}

function CanvasControlBar({
  stage,
  nodeCount,
  collapsedCount,
  focusNodeId,
  compareMode,
  onExpandAll,
  onCollapseSecondary,
  onFocusActive,
  onToggleCompare
}: {
  stage: AgentStage;
  nodeCount: number;
  collapsedCount: number;
  focusNodeId: string | null;
  compareMode: boolean;
  onExpandAll: () => void;
  onCollapseSecondary: () => void;
  onFocusActive: () => void;
  onToggleCompare: () => void;
}) {
  if (nodeCount === 0) return null;

  return (
    <div className="absolute right-4 top-4 z-30 hidden items-center gap-2 rounded-[22px] border border-line bg-white/92 p-2 text-xs font-semibold text-ink shadow-sm backdrop-blur-xl md:flex">
      <button type="button" onClick={onExpandAll} className="flex h-9 items-center gap-1.5 rounded-2xl px-3 transition hover:bg-[#f2f4f7]">
        <Maximize2 className="size-4" />
        全部展开
      </button>
      <button type="button" onClick={onCollapseSecondary} className="flex h-9 items-center gap-1.5 rounded-2xl px-3 transition hover:bg-[#f2f4f7]">
        <ChevronDown className="size-4" />
        折叠资料
      </button>
      <button type="button" onClick={onFocusActive} className="flex h-9 items-center gap-1.5 rounded-2xl px-3 transition hover:bg-[#f2f4f7]">
        <Crosshair className="size-4" />
        {focusNodeId ? "取消聚焦" : "聚焦当前阶段"}
      </button>
      <button
        type="button"
        onClick={onToggleCompare}
        className={cn("flex h-9 items-center gap-1.5 rounded-2xl px-3 transition", compareMode ? "bg-[#eef4ff] text-[#1462ff]" : "hover:bg-[#f2f4f7]")}
      >
        <Eye className="size-4" />
        对比状态
      </button>
      <span className="rounded-full bg-[#f8fafc] px-2.5 py-1 text-[11px] text-muted">
        {canvasStageLabels[stage]} · {nodeCount} 节点{collapsedCount ? ` · ${collapsedCount} 折叠` : ""}
      </span>
    </div>
  );
}

type CanvasWorkbenchProps = { entryMode?: "general" | "teacher" };

type VisualGenerationProgress = {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  failedTargets: Array<{ key: string; index: number; title: string }>;
  active: boolean;
};

export function CanvasWorkbench({ entryMode = "general" }: CanvasWorkbenchProps = {}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [cloudSessions, setCloudSessions] = useState<CloudSessionSummary[]>([]);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [project, setProject] = useState<CanvasProject>(defaultProject);
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [searchGroups, setSearchGroups] = useState<SearchGroup[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [stage, setStage] = useState<AgentStage>("idle");
  const [isBusy, setIsBusy] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isApplyingReviewFixes, setIsApplyingReviewFixes] = useState(false);
  const [isPresenting, setIsPresenting] = useState(false);
  const [isGeneratingVisuals, setIsGeneratingVisuals] = useState(false);
  const [visualGenerationProgress, setVisualGenerationProgress] = useState<VisualGenerationProgress | null>(null);
  const [generatedVisuals, setGeneratedVisuals] = useState<GeneratedVisuals>({ slides: {} });
  const [lastExportGate, setLastExportGate] = useState<ExportGatePayload | null>(null);
  const [provider, setProvider] = useState<"openai" | "local" | null>(null);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<string[]>([]);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [points, setPoints] = useState(500);
  const [toast, setToast] = useState<Toast>(null);
  const [workspaceType, setWorkspaceType] = useState<"general" | "teacher_courseware">("general");
  const [workspaceIdentity, setWorkspaceIdentity] = useState<WorkspaceIdentity | null>(null);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [isSavingSlide, setIsSavingSlide] = useState(false);
  const [teacherExportMeta, setTeacherExportMeta] = useState<TeacherExportMeta | null>(null);

  const [teacherRenderArtifactId, setTeacherRenderArtifactId] = useState<string | null>(null);
  const [teacherVersions, setTeacherVersions] = useState<TeacherVersionRow[]>([]);
  const [isViewingCurrentVersion, setIsViewingCurrentVersion] = useState(true);
  const [isRestoringVersion, setIsRestoringVersion] = useState(false);
  const [teacherChat, setTeacherChat] = useState<TeacherChatRow[]>([]);
  const [teacherMaterials, setTeacherMaterials] = useState<TeacherMaterialRow[]>([]);
  const [isChatSending, setIsChatSending] = useState(false);
  const [isApplyingChatSuggestion, setIsApplyingChatSuggestion] = useState(false);
  const [isAttachingMaterial, setIsAttachingMaterial] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const showToast = useCallback((nextToast: Toast) => {
    setToast(nextToast);
    const duration = nextToast?.message && nextToast.message.length > 42 ? 6200 : 2600;
    window.setTimeout(() => setToast(null), duration);
  }, []);

  const pushMessage = useCallback((role: AgentMessage["role"], content: string) => {
    setMessages((current) => [...current, { id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`, role, content, time: timeNow() }]);
  }, []);

  const applyProjectChange = useCallback((nextProject: CanvasProject) => {
    setProject(ensureProjectQuality(nextProject));
  }, []);

  const persistIdentity = useCallback((identity: WorkspaceIdentity | null) => {
    if (identity) {
      window.sessionStorage.setItem(teacherWorkspaceIdentityKey, JSON.stringify(identity));
    } else {
      window.sessionStorage.removeItem(teacherWorkspaceIdentityKey);
    }
  }, []);

  // Re-read the authoritative server version snapshot (deckSpec + slides + statuses)
  // and fold it back into local React state. This is the single source of truth for
  // the teacher workspace; local edits are never treated as canonical.
  const reloadTeacherVersion = useCallback(async (projectId: string, versionId: string) => {
    const data = await readTeacherVersion(projectId, versionId);
    // Fold the version's attached materials into a type-safe view for the studio's
    // "已附加材料" list. The backend meta shape (name/origin/addedAt) differs from the
    // frontend SourceDocument type, so we read only the display fields defensively.
    setTeacherMaterials(Array.isArray(data.sourceDocuments)
      ? data.sourceDocuments.map((doc) => {
          const meta = (doc ?? {}) as Record<string, unknown>;
          return {
            name: typeof meta.name === "string" ? meta.name : undefined,
            title: typeof meta.title === "string" ? meta.title : undefined,
            origin: typeof meta.origin === "string" ? meta.origin : undefined,
            addedAt: typeof meta.addedAt === "string" ? meta.addedAt : undefined
          };
        })
      : []);
    // Viewing a non-current version is read-only: the backend rejects commits whose
    // base is stale (409), so editing must happen from the current version. This flag
    // drives the read-only banner + disabled edit affordances in the studio.
    setIsViewingCurrentVersion(data.isCurrent !== false);
    setGeneratedVisuals({ slides: data.renderManifest ?? {} });
    setTeacherRenderArtifactId(data.renderManifestArtifactId ?? null);
    setProject((current) => ensureProjectQuality({
      ...current,
      title: data.contentPlan?.teacherContext?.topic || data.slides?.[0]?.title || current.title,
      deckSpec: data.deckSpec,
      slides: data.slides || current.slides,
      contentPlan: data.contentPlan || current.contentPlan,
      sourceDocuments: Array.isArray(data.sourceDocuments) ? data.sourceDocuments as CanvasProject["sourceDocuments"] : current.sourceDocuments,
      reviewCenter: data.teacherScoreV3
        ? { ...(current.reviewCenter || {}), teacherScoreV3: data.teacherScoreV3 } as CanvasProject["reviewCenter"]
        : current.reviewCenter
    }));
    setWorkspaceIdentity((current) => {
      if (!current) return current;
      const next: WorkspaceIdentity = {
        ...current,
        versionId: data.versionId ?? current.versionId,
        versionNumber: data.versionNumber ?? current.versionNumber,
        lifecycleStatus: data.lifecycleStatus ?? current.lifecycleStatus,
        engineeringStatus: data.engineeringStatus ?? current.engineeringStatus,
        teacherReadiness: data.teacherReadiness ?? current.teacherReadiness
      };
      persistIdentity(next);
      return next;
    });
    return data;
  }, [persistIdentity]);

  // Load the immutable version history for the version picker (newest first).
  const loadTeacherVersions = useCallback(async (projectId: string) => {
    try {
      setTeacherVersions(await readTeacherVersions(projectId));
    } catch {
      /* non-fatal: picker just stays empty */
    }
  }, []);

  // Load the persisted chat transcript for this project (all versions).
  const loadTeacherChat = useCallback(async (projectId: string) => {
    try {
      setTeacherChat(await readTeacherChat(projectId));
    } catch {
      /* non-fatal */
    }
  }, []);

  // Switch the workspace to view a specific version. If it is the current version
  // the studio stays editable; older versions load read-only (see isViewingCurrentVersion).
  const selectTeacherVersion = useCallback(async (versionId: string) => {
    const identity = workspaceIdentity;
    if (!identity?.projectId || !versionId) return;
    try {
      await reloadTeacherVersion(identity.projectId, versionId);
    } catch (error) {
      showToast({ type: "error", message: `版本读取失败：${error instanceof Error ? error.message : "未知错误"}` });
    }
  }, [workspaceIdentity, reloadTeacherVersion, showToast]);

  // Commit a single content-changing teacher action to the versioned backend. The
  // server reads the baseVersionId snapshot, applies the restricted payload, and
  // writes a NEW immutable version. On success we advance to and re-read that
  // version. A stale base yields 409 version_conflict -> surface + reload current.
  const commitTeacherVersion = useCallback(async (
    operation: string,
    payload: Record<string, unknown> = {}
  ): Promise<string | null> => {
    const identity = workspaceIdentity;
    if (!identity?.projectId || !identity.versionId) {
      showToast({ type: "error", message: "当前教师课件缺少服务器版本身份，无法保存" });
      return null;
    }
    if (!isViewingCurrentVersion) {
      showToast({ type: "error", message: "当前查看的是历史版本，请先切回最新版本再编辑" });
      return null;
    }
    try {
      const data = await commitTeacherWorkspaceVersion({
        projectId: identity.projectId,
        baseVersionId: identity.versionId,
        operation,
        payload,
      });
      if (data.kind === "conflict") {
        showToast({ type: "error", message: "版本冲突：当前课件已在别处更新，正在重新加载最新服务器版本" });
        // Refresh the version list and jump to whichever version is now current so
        // the teacher lands on an editable base instead of a stale one.
        try {
          const versions = await readTeacherVersions(identity.projectId);
          setTeacherVersions(versions);
          const current = versions.find((row) => row.isCurrent);
          await reloadTeacherVersion(identity.projectId, current?.versionId || identity.versionId);
        } catch {
          await reloadTeacherVersion(identity.projectId, identity.versionId).catch(() => undefined);
        }
        return null;
      }
      if (operation === "generate_visuals" && data.artifactId) {
        setTeacherRenderArtifactId(data.artifactId);
      }
      // Advance to the freshly written version, then re-read it as canonical truth.
      await reloadTeacherVersion(identity.projectId, data.versionId);
      // Keep the version picker in sync with the new immutable version.
      await loadTeacherVersions(identity.projectId);
      return data.versionId;
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      showToast({ type: "error", message: `保存失败：${message}` });
      return null;
    }
  }, [workspaceIdentity, isViewingCurrentVersion, reloadTeacherVersion, loadTeacherVersions, showToast]);

  const restoreTeacherVersion = useCallback(async (restoreVersionId: string) => {
    const identity = workspaceIdentity;
    const currentVersion = teacherVersions.find((row) => row.isCurrent);
    if (!identity?.projectId || !currentVersion?.versionId || !restoreVersionId || isRestoringVersion) return;
    if (!window.confirm("将此历史版本恢复为一个新的当前版本？原有版本不会被覆盖。")) return;
    setIsRestoringVersion(true);
    showToast({ type: "info", message: "正在从历史快照创建新的当前版本" });
    try {
      const data = await commitTeacherWorkspaceVersion({
        projectId: identity.projectId,
        baseVersionId: currentVersion.versionId,
        operation: "restore_version",
        payload: { restoreVersionId },
      });
      if (data.kind === "conflict") {
        showToast({ type: "error", message: "版本已更新，请重新选择需要恢复的历史版本" });
        await loadTeacherVersions(identity.projectId);
        return;
      }
      await reloadTeacherVersion(identity.projectId, data.versionId);
      await loadTeacherVersions(identity.projectId);
      showToast({ type: "success", message: "历史版本已恢复，并保存为新的不可变版本" });
    } catch (error) {
      showToast({ type: "error", message: `恢复失败：${error instanceof Error ? error.message : "未知错误"}` });
    } finally {
      setIsRestoringVersion(false);
    }
  }, [workspaceIdentity, teacherVersions, isRestoringVersion, reloadTeacherVersion, loadTeacherVersions, showToast]);

  // Explicit manual save for the teacher workspace: commit the active slide's
  // edited fields as a manual_edit version. Not per-keystroke — the studio calls
  // this only when the teacher presses save.
  const saveTeacherSlide = useCallback(async (slideId: string, patch: {
    title?: string;
    subtitle?: string;
    bullets?: string[];
    speakerNote?: string;
    layout?: string;
  }) => {
    if (isSavingSlide) return;
    if (!slideId) {
      showToast({ type: "error", message: "无法定位当前页，保存失败" });
      return;
    }
    setIsSavingSlide(true);
    showToast({ type: "info", message: "正在保存本页并生成新版本" });
    try {
      const ok = await commitTeacherVersion("manual_edit", { slideId, patch });
      if (ok) {
        showToast({ type: "success", message: "本页已保存为新服务器版本" });
      }
    } finally {
      setIsSavingSlide(false);
    }
  }, [isSavingSlide, commitTeacherVersion, showToast]);

  // Chat records a transcript and returns a patch suggestion; applying that patch
  // is a separate immutable version commit below.
  const sendTeacherChat = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    const identity = workspaceIdentity;
    if (!identity?.projectId) {
      showToast({ type: "error", message: "缺少课件身份，无法发送消息" });
      return;
    }
    setIsChatSending(true);
    // Optimistically show the user's message; the reload below replaces it with the
    // authoritative persisted transcript (including the failed-turn record on 503).
    const optimisticId = `local-user-${Date.now()}`;
    setTeacherChat((current) => [...current, {
      id: optimisticId,
      role: "user",
      content: trimmed,
      status: "sending",
      suggestedPatch: null,
      appliedVersionId: null,
      createdAt: new Date().toISOString()
    }]);
    try {
      const response = await fetch("/api/courseware-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: identity.projectId,
          versionId: identity.versionId,
          message: trimmed,
          context: {
            topic: project.title,
            slides: project.slides.map((slide, index) => ({
              id: slide.id,
              index,
              title: slide.title,
              subtitle: slide.subtitle,
              bullets: slide.bullets,
            })),
          },
        })
      });
      const data = await response.json().catch(() => null) as {
        code?: string;
        message?: string;
      } | null;
      // Always re-read the persisted transcript: the backend stores both the user
      // message and (on failure) the failed-turn assistant record.
      await loadTeacherChat(identity.projectId);
      if (!response.ok) {
        showToast({ type: "error", message: data?.message || "消息发送失败" });
      }
    } catch (error) {
      showToast({ type: "error", message: `消息发送失败：${error instanceof Error ? error.message : "未知错误"}` });
    } finally {
      setIsChatSending(false);
    }
  }, [workspaceIdentity, project, loadTeacherChat, showToast]);

  const applyTeacherChatSuggestion = useCallback(async (message: TeacherChatRow) => {
    const patch = message.suggestedPatch;
    const identity = workspaceIdentity;
    const slideId = typeof patch?.slideId === "string" ? patch.slideId : "";
    const slidePatch = patch?.patch && typeof patch.patch === "object"
      ? patch.patch as Record<string, unknown>
      : null;
    if (!identity?.projectId || !identity.versionId || !slideId || !slidePatch) {
      showToast({ type: "error", message: "这条消息没有可应用的课件修改建议" });
      return;
    }
    setIsApplyingChatSuggestion(true);
    try {
      const appliedVersionId = await commitTeacherVersion("manual_edit", {
        slideId,
        patch: slidePatch,
      });
      if (!appliedVersionId) return;
      const response = await fetch("/api/courseware-chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: identity.projectId, messageId: message.id, appliedVersionId }),
      });
      if (!response.ok) throw new Error("建议应用记录失败");
      await loadTeacherChat(identity.projectId);
      showToast({ type: "success", message: "建议已应用，并生成了新的课件版本" });
    } catch (error) {
      showToast({ type: "error", message: error instanceof Error ? error.message : "建议应用失败" });
    } finally {
      setIsApplyingChatSuggestion(false);
    }
  }, [workspaceIdentity, commitTeacherVersion, loadTeacherChat, showToast]);

  // Attach supplementary material as a new immutable version. The backend stamps
  // origin="teacher_upload" + addedAt; on success we advance to the new version.
  const attachTeacherMaterial = useCallback(async (material: { title: string; content: string; source?: string }) => {
    const title = material.title.trim();
    const body = material.content.trim();
    if (!title && !body) {
      showToast({ type: "error", message: "请填写材料标题或内容" });
      return;
    }
    setIsAttachingMaterial(true);
    showToast({ type: "info", message: "正在附加材料并生成新版本" });
    try {
      const ok = await commitTeacherVersion("attach_material", {
        sourceDocuments: [{
          title: title || "补充材料",
          content: body,
          source: material.source?.trim() || "教师上传"
        }]
      });
      if (ok) {
        showToast({ type: "success", message: "材料已附加并生成新服务器版本" });
      }
    } finally {
      setIsAttachingMaterial(false);
    }
  }, [commitTeacherVersion, showToast]);

  // Submit the current version for teacher review. This is the only path that can
  // move readiness toward ready_for_teacher; the backend recomputes readiness with
  // submitted=true. We do NOT claim "可交付"/"商业可用" — the server status governs.
  const submitTeacherReview = useCallback(async () => {
    setIsSubmittingReview(true);
    showToast({ type: "info", message: "正在提交教师审核" });
    try {
      const ok = await commitTeacherVersion("teacher_submit_for_review");
      if (ok) {
        showToast({ type: "success", message: "已提交教师审核，状态以服务器为准" });
      }
    } finally {
      setIsSubmittingReview(false);
    }
  }, [commitTeacherVersion, showToast]);

  const changeWorkbenchMode = useCallback((mode: WorkbenchMode) => {
    setProject((current) => ensureProjectQuality({ ...current, mode }));
  }, []);

  const toggleNodeCollapse = useCallback((id: string) => {
    setCollapsedNodeIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }, []);

  useEffect(() => {
    const bootstrapRaw = window.sessionStorage.getItem(teacherWorkspaceBootstrapKey);
    const identityRaw = window.sessionStorage.getItem(teacherWorkspaceIdentityKey);
    let bootstrap: WorkspaceBootstrapPayload | null = null;
    let identity: WorkspaceIdentity | null = null;
    try {
      if (bootstrapRaw) {
        bootstrap = JSON.parse(bootstrapRaw) as WorkspaceBootstrapPayload;
        identity = {
          projectType: "teacher_courseware",
          projectId: bootstrap.projectId,
          requestId: bootstrap.requestId,
          versionId: bootstrap.versionId,
          versionNumber: bootstrap.versionNumber,
          lifecycleStatus: bootstrap.lifecycleStatus
        };
        window.sessionStorage.setItem(teacherWorkspaceIdentityKey, JSON.stringify(identity));
      } else if (identityRaw) {
        identity = JSON.parse(identityRaw) as WorkspaceIdentity;
      }
    } catch {
      window.sessionStorage.removeItem(teacherWorkspaceBootstrapKey);
      window.sessionStorage.removeItem(teacherWorkspaceIdentityKey);
      bootstrap = null;
      identity = null;
    }

    if (identity?.projectId && identity.versionId) {
      setWorkspaceType("teacher_courseware");
      setWorkspaceIdentity(identity);
      setAssets([]);
      setSearchGroups([]);
      setProvider("local");
      setStage("editor");
      setGeneratedVisuals({ slides: {} });
      setMessages(firstMessage());
      if (bootstrap) {
        setProject(ensureProjectQuality({
          ...bootstrap.project,
          contentPlan: bootstrap.contentPlan,
          slidePagePlans: bootstrap.slidePagePlan,
          layoutPlans: bootstrap.layoutPlan,
          slides: bootstrap.slides,
          sourceDocuments: bootstrap.sourceDocuments
        }));
      }
      window.sessionStorage.removeItem(teacherWorkspaceBootstrapKey);

      void reloadTeacherVersion(identity.projectId, identity.versionId)
        .catch((error) => showToast({ type: "error", message: `服务器版本读取失败：${error instanceof Error ? error.message : "未知错误"}` }));
      // Populate the version picker + chat transcript for this project (non-fatal).
      void loadTeacherVersions(identity.projectId);
      void loadTeacherChat(identity.projectId);
      return;
    }

    if (entryMode === "teacher") {
      // The new teacher entry never restores legacy local projects or sessions.
      setMessages(firstMessage());
      return;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setMessages(firstMessage());
      return;
    }
    try {
      const saved = JSON.parse(raw) as SavedCanvasState;
      const savedProject = ensureProjectQuality(saved.project ?? defaultProject);
      setProject(savedProject);
      setAssets(Array.isArray(saved.assets) ? saved.assets : []);
      setStage(saved.stage ?? "idle");
      setSearchGroups(Array.isArray(saved.searchGroups) ? saved.searchGroups : []);
      setProvider(saved.provider ?? null);
      setGeneratedVisuals(saved.generatedVisuals ?? { slides: {} });
      setMessages(firstMessage());
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      setMessages(firstMessage());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast, reloadTeacherVersion, loadTeacherVersions, loadTeacherChat]);

  const refreshUser = useCallback(async () => {
    const response = await fetch("/api/auth/me").catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json()) as { user: AuthUser | null };
    setUser(data.user);
    if (data.user) {
      setPoints(data.user.credits);
    }
  }, []);

  const refreshCloudSessions = useCallback(async () => {
    const response = await fetch("/api/sessions").catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json()) as { sessions?: CloudSessionSummary[] };
    setCloudSessions(data.sessions || []);
  }, []);

  useEffect(() => {
    if (entryMode !== "general") return;
    void refreshUser();
    void refreshCloudSessions();
  }, [entryMode, refreshCloudSessions, refreshUser]);

  useEffect(() => {
    // Teacher entry is isolated before async bootstrap promotes workspaceType.
    if (entryMode === "teacher" || workspaceType === "teacher_courseware") {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const handle = window.setTimeout(() => {
      const state: SavedCanvasState = { project, assets, stage, searchGroups, provider, generatedVisuals };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, 500);
    return () => window.clearTimeout(handle);
  }, [assets, entryMode, generatedVisuals, project, provider, searchGroups, stage, workspaceType]);

  const saveCloudSession = useCallback(async () => {
    if (!user || isSavingSession) return;
    setIsSavingSession(true);
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeSessionId,
          project,
          assets,
          searchGroups,
          generatedVisuals,
          messages,
          stage,
          provider
        })
      });
      if (!response.ok) throw new Error("save failed");
      const data = (await response.json()) as { session?: { id: string } };
      if (data.session?.id) {
        setActiveSessionId(data.session.id);
      }
      await refreshCloudSessions();
      showToast({ type: "success", message: "会话已保存到本地数据库" });
    } catch {
      showToast({ type: "error", message: "保存会话失败，请稍后重试" });
    } finally {
      setIsSavingSession(false);
    }
  }, [activeSessionId, assets, generatedVisuals, isSavingSession, messages, project, provider, refreshCloudSessions, searchGroups, showToast, stage, user]);

  useEffect(() => {
    // Teacher projects persist only through immutable courseware versions.
    if (entryMode === "teacher" || workspaceType === "teacher_courseware" || !user || stage === "idle") return;
    const handle = window.setTimeout(() => {
      void saveCloudSession();
    }, 2200);
    return () => window.clearTimeout(handle);
  }, [entryMode, project, stage, user, workspaceType]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchSearchGroups(queries: string[]) {
    try {
      const response = await fetch("/api/search-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries })
      });
      if (!response.ok) {
        throw new Error("search failed");
      }
      const data = (await response.json()) as { groups?: SearchGroup[]; status?: string };
      return data.groups?.length ? data.groups : fallbackSearchGroups(queries);
    } catch {
      return fallbackSearchGroups(queries);
    }
  }

  async function initializeReviewCenter(prompt: string, baseProject: CanvasProject, groups: SearchGroup[]) {
    const response = await fetch("/api/review-center", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "initialize",
        prompt,
        project: baseProject,
        uploadedAssets: assets,
        researchSources: groups
      })
    });
    if (!response.ok) {
      throw new Error("review center initialize failed");
    }
    const data = (await response.json()) as { reviewCenter?: CanvasProject["reviewCenter"] };
    return data.reviewCenter;
  }

  async function applyReviewFixes() {
    if (isApplyingReviewFixes) return;
    // Teacher courseware: versioned deck-level review fix commit.
    if (workspaceType === "teacher_courseware") {
      setIsApplyingReviewFixes(true);
      showToast({ type: "info", message: "正在处理整套课件建议并生成新版本" });
      try {
        const ok = await commitTeacherVersion("apply_review_fixes", { instruction: "处理整套课件的课前检查建议，保留教学内容。" });
        if (ok) {
          pushMessage("assistant", "已按新版本处理整套课件建议，服务器已写入不可变版本。");
          showToast({ type: "success", message: "整套课件建议已处理，已生成新服务器版本" });
        }
      } finally {
        setIsApplyingReviewFixes(false);
      }
      return;
    }
    if (!project.reviewCenter) return;
    setIsApplyingReviewFixes(true);
    showToast({ type: "info", message: "正在应用评审中枢修改建议并重新评分" });
    try {
      const response = await fetch("/api/review-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply-fixes",
          project,
          reviewCenter: project.reviewCenter,
          uploadedAssets: assets
        })
      });
      if (!response.ok) {
        throw new Error("review fixes failed");
      }
      const data = (await response.json()) as { project?: CanvasProject; applied?: string[]; summary?: {
        beforeScore: number;
        afterScore: number;
        scoreDelta: number;
        status: "improved" | "partial" | "needs_sources" | "no_change";
        message: string;
        unresolvedBlockers?: Array<{ where: string; reason: string; suggestion: string; autoFixable: boolean }>;
      } };
      const nextProject = ensureProjectQuality(data.project ?? project);
      setProject(nextProject);
      const summary = data.summary;
      const appliedText = data.applied?.length ? data.applied.slice(0, 4).join("；") : "已重新评分并更新扣分项";
      const nextReview = nextProject.reviewCenter?.postReview;
      const afterScore = summary?.afterScore ?? nextReview?.totalScore ?? 0;
      const afterLevel = nextReview?.level ?? (afterScore >= 85 ? "可交付" : afterScore >= 70 ? "需要修改" : "不建议交付");
      const reviewPassed = afterLevel === "优秀" || afterLevel === "可交付";
      const scoreText = summary ? `${summary.beforeScore} → ${summary.afterScore} 分` : `${afterScore || "-"} 分`;
      const topBlockers = summary?.unresolvedBlockers?.slice(0, 3) || [];
      const blockerText = topBlockers.length
        ? `未解决项：${topBlockers.map((item) => `${item.where}：${item.suggestion}`).join("；")}`
        : "";
      pushMessage(
        "assistant",
        [
          `${reviewPassed ? "已通过交付线" : "重新评分后仍未通过交付线"}：评分变化 ${scoreText}，当前等级「${afterLevel}」。`,
          `已自动处理：${appliedText}。`,
          summary?.message || "",
          blockerText,
          summary?.status === "needs_sources" ? "判断：当前主要卡在证据中枢，不能只靠改文案提分，需要补充公开链接、上传资料或改写为待确认判断。" : ""
        ].filter(Boolean).join("\n")
      );
      showToast({
        type: reviewPassed ? "success" : summary?.status === "needs_sources" || summary?.status === "no_change" ? "warning" : "info",
        message: summary
          ? `${reviewPassed ? "已通过交付线" : "仍未通过交付线"}：${summary.message}\n评分：${summary.beforeScore} → ${summary.afterScore} 分 · ${afterLevel}${topBlockers[0] ? `\n优先处理：${topBlockers[0].where}，${topBlockers[0].suggestion}` : ""}`
          : `${reviewPassed ? "重新评分已达标" : "重新评分后仍未达标"}：${afterScore || "-"} 分 · ${afterLevel}`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      showToast({ type: "error", message: `自动优化失败：${message}` });
    } finally {
      setIsApplyingReviewFixes(false);
    }
  }

  async function applyPageReviewFixes(pageIndex: number, slideId?: string) {
    if (isApplyingReviewFixes) return;
    // Teacher courseware: versioned page-level review fix commit.
    if (workspaceType === "teacher_courseware") {
      const targetSlideId = slideId || project.slides[pageIndex]?.id;
      setIsApplyingReviewFixes(true);
      showToast({ type: "info", message: `正在修复第 ${pageIndex + 1} 页并生成新版本` });
      try {
        const ok = await commitTeacherVersion("apply_page_review_fixes", {
          targetSlideId,
          instruction: `处理第 ${pageIndex + 1} 页的课前检查建议，保留教学内容。`
        });
        if (ok) {
          pushMessage("assistant", `第 ${pageIndex + 1} 页建议已按新版本处理，服务器已写入不可变版本。`);
          showToast({ type: "success", message: `第 ${pageIndex + 1} 页已修复，已生成新服务器版本` });
        }
      } finally {
        setIsApplyingReviewFixes(false);
      }
      return;
    }
    if (!project.reviewCenter) return;
    setIsApplyingReviewFixes(true);
    showToast({ type: "info", message: `正在修复第 ${pageIndex + 1} 页并重新评分` });
    try {
      const response = await fetch("/api/review-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply-page-fixes",
          project,
          reviewCenter: project.reviewCenter,
          uploadedAssets: assets,
          pageIndex,
          slideId
        })
      });
      if (!response.ok) {
        throw new Error("page review fixes failed");
      }
      const data = (await response.json()) as {
        project?: CanvasProject;
        applied?: string[];
        summary?: {
          page: number;
          slideTitle: string;
          beforeTotalScore: number;
          afterTotalScore: number;
          beforePageScore?: number;
          afterPageScore?: number;
          status: "improved" | "updated" | "needs_sources" | "no_page_fix";
          message: string;
          remainingPageDeductions: number;
          remainingBlockers?: Array<{ where: string; suggestion: string; reason: string }>;
        };
      };
      const nextProject = ensureProjectQuality(data.project ?? project);
      setProject(nextProject);
      setLastExportGate(null);
      const summary = data.summary;
      const appliedText = data.applied?.length ? data.applied.slice(0, 3).join("；") : "没有找到可自动处理项";
      const pageScoreText = summary?.beforePageScore !== undefined && summary.afterPageScore !== undefined
        ? `本页 ${summary.beforePageScore} → ${summary.afterPageScore} 分`
        : `整套 ${summary?.beforeTotalScore ?? "-"} → ${summary?.afterTotalScore ?? "-"} 分`;
      pushMessage(
        "assistant",
        [
          `第 ${summary?.page ?? pageIndex + 1} 页已执行页级修复：${appliedText}。`,
          `${pageScoreText}。${summary?.message || ""}`,
          summary?.remainingBlockers?.length ? `仍需处理：${summary.remainingBlockers.slice(0, 2).map((item) => `${item.where}（${item.suggestion}）`).join("；")}` : ""
        ].filter(Boolean).join("\n")
      );
      showToast({
        type: summary?.status === "needs_sources" || summary?.status === "no_page_fix" ? "info" : "success",
        message: summary
          ? `${summary.message}\n${pageScoreText}\n剩余本页扣分：${summary.remainingPageDeductions}`
          : "当前页已重新评分"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      showToast({ type: "error", message: `当前页修复失败：${message}` });
    } finally {
      setIsApplyingReviewFixes(false);
    }
  }

  async function addManualSourceAndReview(source: { title: string; url: string; summary: string }) {
    if (!project.reviewCenter) {
      showToast({ type: "error", message: "请先完成生成流程，再补充来源并重新评分" });
      return;
    }
    const hasUrl = source.url.trim().length > 0;
    const hasSummary = source.summary.trim().length > 0;
    if (!hasUrl && !hasSummary) {
      showToast({ type: "error", message: "请先填写公开链接或资料摘要" });
      return;
    }
    setIsApplyingReviewFixes(true);
    showToast({ type: "info", message: "正在补充来源、重建证据链并重新评分" });
    try {
      const response = await fetch("/api/review-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-sources",
          project,
          reviewCenter: project.reviewCenter,
          sources: [source]
        })
      });
      if (!response.ok) {
        throw new Error("manual source refresh failed");
      }
      const data = (await response.json()) as {
        project?: CanvasProject;
        summary?: {
          beforeScore: number;
          afterScore: number;
          beforeRealSourceCount: number;
          afterRealSourceCount: number;
          beforeEvidenceCoverage: number;
          afterEvidenceCoverage: number;
          addedSources: number;
          addedEvidenceBlocks: number;
          status: "improved" | "updated" | "needs_more_sources" | "no_valid_source";
          message: string;
          remainingBlockers?: string[];
        };
      };
      const nextProject = ensureProjectQuality(data.project ?? project);
      setProject(nextProject);
      setLastExportGate(null);
      const summary = data.summary;
      if (summary) {
        pushMessage(
          "assistant",
          [
            `已补充来源并重新评分：${summary.beforeScore} -> ${summary.afterScore} 分。`,
            `真实来源：${summary.beforeRealSourceCount} -> ${summary.afterRealSourceCount}；证据覆盖率：${summary.beforeEvidenceCoverage}% -> ${summary.afterEvidenceCoverage}%。`,
            `新增证据块：${summary.addedEvidenceBlocks}。${summary.message}`,
            summary.remainingBlockers?.length ? `仍需处理：${summary.remainingBlockers.slice(0, 3).join("；")}` : ""
          ].filter(Boolean).join("\n")
        );
        showToast({
          type: summary.status === "needs_more_sources" || summary.status === "no_valid_source" ? "info" : "success",
          message: `${summary.message}\n评分：${summary.beforeScore} -> ${summary.afterScore} 分`
        });
      } else {
        pushMessage("assistant", "已补充来源并重新评分。请再次点击导出查看新的质量闸门结果。");
        showToast({ type: "success", message: "来源已补充，评审已刷新" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      showToast({ type: "error", message: `补充来源失败：${message}` });
    } finally {
      setIsApplyingReviewFixes(false);
    }
  }

  const handleSearchMore = useCallback(async () => {
    const queries = deriveSearchQueries(project.prompt, project, assets).slice(0, 4);
    showToast({ type: "info", message: "正在补充检索资料" });
    const groups = await fetchSearchGroups(queries);
    setSearchGroups(groups);
    setProject((current) => ensureProjectQuality({ ...current, research: researchFromSearchGroups(groups) }));
    showToast({ type: "success", message: "资料置信度已更新" });
  }, [assets, project, showToast]);

  const sharedData = useMemo(
    () => ({
      project,
      assets,
      collapsedNodeIds,
      focusNodeId,
      onProjectChange: applyProjectChange,
      onSearchMore: () => void handleSearchMore(),
      onRemoveAsset: (id: string) => {
        setAssets((current) => current.filter((asset) => asset.id !== id));
        showToast({ type: "info", message: "资料已从画布移除" });
      },
      onToggleNodeCollapse: toggleNodeCollapse,
      onFocusNode: setFocusNodeId
    }),
    [applyProjectChange, assets, collapsedNodeIds, focusNodeId, handleSearchMore, project, showToast, toggleNodeCollapse]
  );

  const stageNodes = useMemo(() => buildStageNodes(stage, sharedData), [sharedData, stage]);
  const stageEdges = useMemo(() => buildStageEdges(stage), [stage]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]));
      return stageNodes.map((node) => {
        const previous = currentById.get(node.id);
        return {
          ...node,
          position: previous?.position || node.position,
          selected: previous?.selected || node.id === focusNodeId,
          data: node.data
        };
      });
    });
    setEdges(stageEdges);
  }, [focusNodeId, setEdges, setNodes, stageEdges, stageNodes]);

  useEffect(() => {
    const ids = new Set(stageNodes.map((node) => node.id));
    setCollapsedNodeIds((current) => {
      const next = current.filter((id) => ids.has(id));
      return next.length === current.length ? current : next;
    });
    setFocusNodeId((current) => (current && ids.has(current) ? current : null));
  }, [stageNodes]);

  const onConnect = useCallback((connection: Connection) => setEdges((currentEdges) => addEdge({ ...connection, animated: true }, currentEdges)), [setEdges]);

  const focusCurrentStageNode = useCallback(() => {
    if (focusNodeId) {
      setFocusNodeId(null);
      return;
    }
    const candidate =
      stage === "designing"
        ? "design"
        : stage === "planning" || stage === "planReady"
          ? "plan"
          : stage === "searching"
            ? "research"
            : stage === "outlineReady" || stage === "outlining"
              ? "outline"
              : "brief";
    setFocusNodeId(nodes.some((node) => node.id === candidate) ? candidate : nodes[0]?.id || null);
  }, [focusNodeId, nodes, stage]);

  const collapseSecondaryNodes = useCallback(() => {
    const ids = nodes.map((node) => node.id).filter((id) => id === "assets" || id === "research");
    setCollapsedNodeIds(ids);
    showToast({ type: "info", message: ids.length ? "已折叠资料相关节点，画布更便于看主线" : "当前阶段没有可折叠的资料节点" });
  }, [nodes, showToast]);

  async function generateProject(prompt: string) {
    const response = await fetch("/api/generate-ppt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        mode: project.mode,
        uploadedFile: assets[0] ?? null,
        uploadedAssets: assets,
        researchSources: searchGroups
      })
    });
    if (!response.ok) {
      throw new Error("generate failed");
    }
    const data = (await response.json()) as { project?: CanvasProject; provider?: "openai" | "local" };
    await refreshUser();
    return {
      nextProject: ensureProjectQuality(data.project ?? buildProjectFromPrompt(prompt, project.mode)),
      nextProvider: data.provider ?? "local"
    };
  }

  async function refineCurrentProject(
    instruction = "自动微调页面级排版、文案密度和资料映射。",
    kind: "page" | "deck" | "classroom" = "deck",
    targetSlideId?: string
  ) {
    if (isRefining) return;
    // Teacher courseware: route through the versioned commit endpoint instead of
    // the non-versioned /api/refine-project. Each action writes a new server version.
    if (workspaceType === "teacher_courseware") {
      setIsRefining(true);
      const opLabel = kind === "page" ? "AI 单页优化" : kind === "classroom" ? "课堂互动补充" : "AI 整体优化";
      showToast({ type: "info", message: `正在执行${opLabel}并生成新版本` });
      try {
        let ok: string | null = null;
        if (kind === "page") {
          ok = await commitTeacherVersion("ai_refine_page", { targetSlideId, instruction });
        } else if (kind === "classroom") {
          ok = await commitTeacherVersion("classroom_interaction", { targetSlideId, interactionNote: instruction });
        } else {
          ok = await commitTeacherVersion("ai_refine_deck", { instruction });
        }
        if (ok) {
          pushMessage("assistant", `已按新版本完成${opLabel}，服务器已写入不可变版本。`);
          showToast({ type: "success", message: `${opLabel}完成，已生成新服务器版本` });
        }
      } finally {
        setIsRefining(false);
      }
      return;
    }
    setIsRefining(true);
    showToast({ type: "info", message: "正在微调页面排版和交付质量" });
    try {
      const response = await fetch("/api/refine-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, instruction, mode: "auto" })
      });
      if (!response.ok) {
        throw new Error("refine failed");
      }
      const data = (await response.json()) as { project?: CanvasProject; changes?: string[] };
      const nextProject = ensureProjectQuality(data.project ?? project);
      setProject(nextProject);
      setPoints((current) => Math.max(0, current - 6));
      const changeText = data.changes?.length ? data.changes.slice(0, 4).join("；") : "已重新检查页面结构";
      pushMessage("assistant", `已完成页面级微调：${changeText}。当前交付成熟度 ${nextProject.quality?.score ?? "-"}。`);
      showToast({ type: "success", message: `微调完成：交付成熟度 ${nextProject.quality?.score ?? "-"}` });
    } catch {
      showToast({ type: "error", message: "微调失败，请稍后重试" });
    } finally {
      setIsRefining(false);
    }
  }

  const startAgent = async (prompt: string) => {
    const normalized = prompt.trim();
    if (!normalized) {
      showToast({ type: "error", message: "请先输入 PPT 需求" });
      return;
    }
    const modeContract = getWorkbenchModeContract(project.mode);
    if (modeContract.requiresUpload && assets.length === 0) {
      showToast({ type: "error", message: modeContract.uploadMissingMessage });
      return;
    }
    setIsBusy(true);
    setDraft("");
    setSearchGroups([]);
    setProvider(null);
    const seededProject = ensureProjectQuality(buildProjectFromPrompt(normalized, project.mode));
    setProject(seededProject);
    pushMessage("user", normalized);
    setStage("researching");
    try {
      await sleep(450);
      const groups = await fetchSearchGroups(deriveSearchQueries(normalized, seededProject, assets));
      setSearchGroups(groups);
      const research = researchFromSearchGroups(groups);
      const reviewCenter = await initializeReviewCenter(normalized, seededProject, groups).catch(() => undefined);
      setProject((current) => ensureProjectQuality({ ...current, prompt: normalized, research, reviewCenter }));
      await sleep(550);
      setStage("requirements");
      pushMessage("assistant", reviewCenter ? `评审中枢已前置完成：识别为「${reviewCenter.pptTypeLabel}」，已生成评分规则和策划审核稿。下一步会按这套规则反推大纲和页面策划。` : assets.length ? "资料和公开调研已完成。我会把上传内容块、真实来源和置信度一起用于后续大纲。" : "背景调研已完成，我已经把真实来源和置信度放进资料模块。确认后可以继续生成大纲。");
    } catch {
      showToast({ type: "error", message: "Agent 前置识别失败，请稍后重试" });
    } finally {
      setIsBusy(false);
    }
  };

  const continueFlow = async () => {
    if (isBusy) return;
    if (stage === "idle") {
      await startAgent(draft);
      return;
    }
    if (stage === "requirements") {
      setIsBusy(true);
      pushMessage("user", "继续");
      setStage("outlining");
      try {
        const { nextProject, nextProvider } = await generateProject(project.prompt);
        const mergedProject = ensureProjectQuality({ ...nextProject, reviewCenter: nextProject.reviewCenter || project.reviewCenter, research: searchGroups.length ? [...(nextProject.research || []), ...researchFromSearchGroups(searchGroups)].slice(0, 12) : nextProject.research });
        setProject(mergedProject);
        setProvider(nextProvider);
        setPoints((current) => Math.max(0, current - 24));
        await sleep(350);
        setStage("outlineReady");
        pushMessage("assistant", `${nextProvider === "openai" ? "模型已参与生成" : "模型未通过或不可用，已切换本地策划引擎兜底"}。大纲已生成。下一步我会为每页继续补资料，并生成内容策划稿。`);
      } catch {
        const localProject = buildProjectFromPrompt(project.prompt, project.mode);
        const fallbackProject = ensureProjectQuality({ ...localProject, research: searchGroups.length ? researchFromSearchGroups(searchGroups) : localProject.research });
        setProject(fallbackProject);
        setProvider("local");
        setStage("outlineReady");
        pushMessage("assistant", "模型接口暂时不可用，已使用本地策划引擎生成大纲，真实来源仍会保留。");
      } finally {
        setIsBusy(false);
      }
      return;
    }
    if (stage === "outlineReady") {
      setIsBusy(true);
      pushMessage("user", "继续");
      setStage("searching");
      try {
        await sleep(450);
        const groups = await fetchSearchGroups(deriveSearchQueries(project.prompt, project, assets));
        setSearchGroups(groups);
        setProject((current) => ensureProjectQuality({ ...current, research: [...current.research, ...researchFromSearchGroups(groups)].slice(0, 12) }));
        await sleep(700);
        setStage("planning");
        pushMessage("assistant", "逐页检索已完成，正在把资料转成内容策划稿。");
        await sleep(1000);
        setStage("planReady");
        pushMessage("assistant", "内容策划已完成，可以继续生成初版设计。");
      } finally {
        setIsBusy(false);
      }
      return;
    }
    if (stage === "planReady") {
      setIsBusy(true);
      pushMessage("user", "继续");
      setStage("designing");
      try {
        await sleep(1600);
        setStage("editor");
        pushMessage("assistant", "初版设计已完成。可以在左侧预览页面，也可以直接导出 PPTX。");
      } finally {
        setIsBusy(false);
      }
    }
  };

  const autoRunFlow = async () => {
    if (isBusy) return;
    if (stage === "idle") {
      await startAgent(draft);
      return;
    }
    if (stage !== "requirements" && stage !== "outlineReady" && stage !== "planReady") {
      showToast({ type: "info", message: "当前阶段正在处理中，完成后可以继续自动跑完整流程" });
      return;
    }

    setIsBusy(true);
    pushMessage("user", "自动跑完整流程");
    try {
      let workingProject = project;
      if (stage === "requirements") {
        setStage("outlining");
        const { nextProject, nextProvider } = await generateProject(workingProject.prompt);
        workingProject = ensureProjectQuality({
          ...nextProject,
          reviewCenter: nextProject.reviewCenter || workingProject.reviewCenter,
          research: searchGroups.length ? [...(nextProject.research || []), ...researchFromSearchGroups(searchGroups)].slice(0, 12) : nextProject.research
        });
        setProject(workingProject);
        setProvider(nextProvider);
        setPoints((current) => Math.max(0, current - 24));
        await sleep(350);
        setStage("outlineReady");
        pushMessage("assistant", nextProvider === "openai" ? "模型已参与生成大纲，后续继续做逐页检索和策划。" : "模型未通过或不可用，已用本地策划引擎兜底生成，后续仍会使用真实检索资料。");
      }

      if (stage === "requirements" || stage === "outlineReady") {
        setStage("searching");
        await sleep(450);
        const groups = await fetchSearchGroups(deriveSearchQueries(workingProject.prompt, workingProject, assets));
        setSearchGroups(groups);
        workingProject = ensureProjectQuality({ ...workingProject, research: [...(workingProject.research || []), ...researchFromSearchGroups(groups)].slice(0, 12) });
        setProject(workingProject);
        await sleep(650);
        setStage("planning");
        await sleep(850);
        setStage("planReady");
      }

      setStage("designing");
      await sleep(1200);
      setStage("editor");
      pushMessage("assistant", "完整流程已跑完：类型识别、评分规则、策划审核、大纲、逐页策划、设计稿和生成后评分都已完成。");
      showToast({ type: "success", message: "已生成可编辑 PPT 初稿" });
    } catch {
      showToast({ type: "error", message: "自动流程失败，已保留当前结果，可分步继续" });
    } finally {
      setIsBusy(false);
    }
  };

  const sendDraft = async () => {
    const content = draft.trim();
    if (!content) return;
    if (isBusy || isRefining || isApplyingReviewFixes) {
      showToast({ type: "info", message: "当前正在处理，请稍后再发送修改指令" });
      return;
    }
    if (stage === "idle") {
      await startAgent(content);
      return;
    }
    setDraft("");
    if (content === "继续" && (stage === "requirements" || stage === "outlineReady" || stage === "planReady")) {
      await continueFlow();
      return;
    }
    pushMessage("user", content);
    if (stage === "editor") {
      setDraft("");
      await refineCurrentProject(content);
      return;
    }
    await sleep(320);
    pushMessage("assistant", "已记录补充需求，我会把它并入后续大纲和页面策划。");
    setProject((current) => ensureProjectQuality({ ...current, prompt: `${current.prompt}\n补充需求：${content}` }));
  };

  const resetSession = () => {
    if (entryMode === "teacher") {
      window.sessionStorage.removeItem(teacherWorkspaceBootstrapKey);
      window.sessionStorage.removeItem(teacherWorkspaceIdentityKey);
      window.location.assign("/teacher-ai-ppt");
      return;
    }
    setProject(ensureProjectQuality({ ...defaultProject, mode: project.mode }));
    setWorkspaceType("general");
    setWorkspaceIdentity(null);
    setAssets([]);
    setUploadedFile(null);
    setSearchGroups([]);
    setMessages(firstMessage());
    setDraft("");
    setStage("idle");
    setIsBusy(false);
    setIsPresenting(false);
    setGeneratedVisuals({ slides: {} });
    setProvider(null);
    setPoints(user?.credits ?? 500);
    setActiveSessionId(null);
    window.localStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(teacherWorkspaceBootstrapKey);
    window.sessionStorage.removeItem(teacherWorkspaceIdentityKey);
    showToast({ type: "info", message: "已新建会话" });
  };

  const applySample = (sample: EmptySample) => {
    const nextMode = sample.mode;
    setDraft(sample.prompt);
    setProject(ensureProjectQuality(buildProjectFromPrompt(sample.prompt, nextMode)));
    showToast({ type: "info", message: nextMode === "agent" ? "Agent 案例已填入右侧输入框" : "资料/美化案例已填入，建议先上传文件" });
  };

  const openPreview = () => {
    setStage("editor");
    setIsPresenting(true);
    showToast({ type: "info", message: "已进入放映预览，按 Esc 退出" });
  };

  const continueEditing = () => {
    setStage("editor");
    setIsPresenting(false);
    showToast({ type: "info", message: "可以在左侧编辑当前页，也可以在右侧输入修改指令" });
  };

  const copyShareLink = async () => {
    const link = window.location.href;
    try {
      await navigator.clipboard.writeText(link);
      showToast({ type: "success", message: "访问链接已复制" });
    } catch {
      showToast({ type: "info", message: link });
    }
  };

  const applyRequirement = (requirement: string) => {
    setProject((current) => ensureProjectQuality({ ...current, prompt: `${current.prompt}\n${requirement}` }));
    pushMessage("assistant", `已写入内容侧重：${requirement.replace(/^内容侧重：/, "")}`);
    showToast({ type: "success", message: "内容侧重已写入需求" });
  };

  const loadCloudSession = async (id: string) => {
    try {
      const response = await fetch(`/api/sessions/${id}`);
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as { session?: CloudSessionPayload };
      const session = data.session;
      if (!session?.project) throw new Error("empty session");
      setActiveSessionId(session.id);
      setProject(ensureProjectQuality(session.project));
      setAssets(Array.isArray(session.assets) ? session.assets : []);
      setSearchGroups(Array.isArray(session.searchGroups) ? session.searchGroups : []);
      setGeneratedVisuals(session.generatedVisuals ?? { slides: {} });
      setMessages(Array.isArray(session.messages) && session.messages.length ? session.messages : firstMessage());
      setStage((session.stage as AgentStage) || "editor");
      setProvider(session.provider ?? null);
      showToast({ type: "success", message: "会话已恢复" });
    } catch {
      showToast({ type: "error", message: "恢复会话失败" });
    }
  };

  const handleUploaded = (file: UploadedFile | null) => {
    setUploadedFile(file);
    if (file?.status === "uploaded") {
      const asset: UploadedAsset = {
        id: `asset-${Date.now()}`,
        name: file.name,
        size: file.size,
        type: file.name.split(".").pop()?.toUpperCase() || "FILE",
        status: "ready",
        mimeType: file.mimeType,
        analysis: file.analysis
      };
      setAssets((current) => [asset, ...current.filter((item) => item.name !== file.name)].slice(0, 5));
      const nextMode = modeForUploadedFile({ name: file.name, mimeType: file.mimeType });
      const modeContract = getWorkbenchModeContract(nextMode);
      setProject((current) => ensureProjectQuality({ ...current, mode: nextMode }));
      showToast({ type: "success", message: file.analysis ? `${modeContract.label}已就绪：解析到 ${file.analysis.blockCount} 个内容块` : `${modeContract.label}已就绪，文件已加入画布` });
      if (file.analysis?.summary && !draft.trim()) {
        setDraft(nextMode === "beautify" ? `请美化上传的 PPT《${file.name}》，保留原有内容结构，统一视觉风格并提升排版层级。` : `请基于上传资料《${file.name}》生成一份结构清晰、可编辑的 PPT，保留资料来源和页面证据。`);
      }
    } else if (!file) {
      setUploadedFile(null);
      setAssets([]);
    }
  };

  const generateVisuals = async (options?: { maxSlideVisuals?: number; reason?: "manual" | "export"; retryOnlyFailed?: boolean }): Promise<GeneratedVisuals> => {
    if (isGeneratingVisuals) return generatedVisuals;
    setIsGeneratingVisuals(true);
    const isTeacherCourseware = workspaceType === "teacher_courseware";
    showToast({ type: "info", message: isTeacherCourseware ? "正在按页面规划逐页调用 image2 生成课堂视觉" : options?.reason === "export" ? "导出前正在调用 image2 准备封面和关键页视觉" : "正在调用 image2 生成封面和关键页视觉" });
    try {
      const profile = getDesignProfile(project);
      const maxSlideVisuals = Math.max(1, Math.min(options?.maxSlideVisuals ?? (profile.pptType === "product_proposal" ? 5 : 3), 5));
      let targets = isTeacherCourseware
        ? project.slides.map((slide, index) => ({ key: index === 0 ? "cover" : slide.id || String(index), slide, index }))
        : [
            { key: "cover", slide: project.slides[0], index: 0 },
            ...project.slides
          .slice(1)
          .filter((slide) => {
            if (!planVisualAsset(slide, project.slides.indexOf(slide)).shouldGenerate) return false;
            const layout = slide.layout || "";
            const productLayouts = ["process", "matrix", "timeline", "comparison", "evidence", "stats", "checklist", "split"];
            const travelLayouts = ["day-route", "comparison", "map", "stats", "cards", "split"];
            return profile.pptType === "product_proposal" ? productLayouts.includes(layout) : travelLayouts.includes(layout);
          })
          .slice(0, maxSlideVisuals)
          .map((slide) => ({ key: slide.id || String(project.slides.indexOf(slide)), slide, index: project.slides.indexOf(slide) }))
          ];

      if (options?.retryOnlyFailed && visualGenerationProgress?.failedTargets.length) {
        const failedKeys = new Set(visualGenerationProgress.failedTargets.map((target) => target.key));
        targets = targets.filter((target) => failedKeys.has(target.key));
      }
      if (!targets.length) return generatedVisuals;
      const initialProgress = options?.retryOnlyFailed && visualGenerationProgress
        ? { ...visualGenerationProgress, completed: 0, succeeded: 0, failed: 0, failedTargets: [], active: true }
        : { total: targets.length, completed: 0, succeeded: 0, failed: 0, failedTargets: [], active: true };
      setVisualGenerationProgress(initialProgress);

      const nextVisuals: GeneratedVisuals = { ...generatedVisuals, slides: { ...(generatedVisuals.slides || {}) } };
      const results = await Promise.allSettled(targets.map(async (target) => {
        let requestSucceeded = false;
        try {
        const assetPlan = target.slide ? planVisualAsset(target.slide, target.index) : undefined;
        const profilePrompt = target.slide ? visualPromptForSlide(profile, project, target.slide, target.index) : profile.imageStyle;
        const scenePrompt = target.index === 0
          ? "主视觉必须是明确的真实课堂学科情境：教师在明亮教室白板前讲解，学生或学习材料作为环境元素，现代教育摄影/插画风；禁止坐标系、函数曲线、公式、数学图表、文字和界面截图，右侧或上方留出干净留白用于叠加标题。"
          : "";
        const visualPrompt = [
          "生成一张适合放进 16:9 PPT 的高级干净视觉图，不要出现文字，不要出现水印，不要生成 UI 截图。",
          `风格：${profile.mood}。${profile.imageStyle}`,
          `PPT主题：${project.title}`,
          `页面标题：${target.slide?.title || project.title}`,
          `页面说明：${target.slide?.subtitle || project.prompt}`,
          `设计系统：${profile.name} / ${profile.coverLabel}`,
          profilePrompt,
          scenePrompt,
          assetPlan ? `Visual planning contract: ${assetPlan.reason}; ${assetPlan.promptGuardrails.join("; ")}` : "",
          `设计提示：${target.slide?.visualPrompt || "干净信息图背景"}`
        ].join("\n");

        const response = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: isTeacherCourseware ? "teacher_courseware" : undefined,
            slideRole: target.index === 0 ? "cover" : target.slide?.pageIntent || "content",
            title: target.slide?.title || project.title,
            prompt: visualPrompt,
            size: "1536x1024"
          })
        });

        const data = await response.json().catch(() => null) as { image?: string; message?: string } | null;
        if (!response.ok || !data?.image) {
          throw new Error(data?.message || `image generation failed (${response.status})`);
        }
        requestSucceeded = true;
        return { target, image: data.image };
        } finally {
          setVisualGenerationProgress((current) => current ? {
            ...current,
            completed: Math.min(current.total, current.completed + 1),
            succeeded: current.succeeded + (requestSucceeded ? 1 : 0),
            failed: current.failed + (requestSucceeded ? 0 : 1)
          } : current);
        }
      }));

      let generatedCount = 0;
      let failedCount = 0;
      const failedTargets: VisualGenerationProgress["failedTargets"] = [];
      results.forEach((result, resultIndex) => {
        if (result.status === "rejected") {
          failedCount += 1;
          const target = targets[resultIndex];
          failedTargets.push({ key: target.key, index: target.index, title: target.slide?.title || project.title });
          return;
        }
        generatedCount += 1;
        const { target, image } = result.value;
        if (target.key === "cover") nextVisuals.cover = image;
        else nextVisuals.slides = { ...(nextVisuals.slides || {}), [String(target.index)]: image, [target.slide?.id || String(target.index)]: image };
      });

      setVisualGenerationProgress((current) => ({
        total: targets.length,
        completed: targets.length,
        succeeded: generatedCount,
        failed: failedCount,
        failedTargets,
        active: false
      }));

      if (!generatedCount) throw new Error("all image requests failed");

      setGeneratedVisuals(nextVisuals);
      // Teacher courseware: record a real render_manifest artifact + new version on the
      // server. Client images remain for immediate preview, but the server version is truth.
      if (isTeacherCourseware && options?.reason !== "export") {
        const renderManifest = Object.fromEntries(project.slides.flatMap((slide, index) => {
          const image = index === 0
            ? nextVisuals.cover
            : nextVisuals.slides?.[String(index)] || nextVisuals.slides?.[slide.id];
          return slide.id && image ? [[slide.id, image]] : [];
        }));
        const committed = await commitTeacherVersion("generate_visuals", { renderManifest });
        showToast({
          type: committed ? (failedCount ? "info" : "success") : "error",
          message: committed
            ? (failedCount ? `已生成 ${generatedCount} 张课堂视觉，${failedCount} 张失败未写入；成功项已写入服务器版本` : `已并发生成 ${generatedCount} 张课堂视觉，并写入服务器版本 render_manifest`)
            : "视觉已生成，但服务器版本写入失败"
        });
        return nextVisuals;
      }
      showToast({ type: failedCount ? "info" : "success", message: failedCount ? `已并发生成 ${generatedCount} 张 AI 视觉，${failedCount} 张失败未写入` : `已并发生成 ${generatedCount} 张 AI 视觉，导出 PPTX 会自动使用` });
      return nextVisuals;
    } catch {
      showToast({ type: "error", message: "AI视觉生成失败，已保留当前可编辑版式" });
      return generatedVisuals;
    } finally {
      setIsGeneratingVisuals(false);
    }
  };

  const downloadPptx = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      if (project.quality?.status === "risky") {
        showToast({ type: "info", message: "自检仍有风险，先继续导出，建议验收前复核来源和排版" });
      } else if (project.quality?.status === "needs-review") {
        showToast({ type: "info", message: "自检建议复核，正在继续导出 PPTX" });
      }
      let exportVisuals = generatedVisuals;
      const existingVisualCount = project.slides.reduce((count, slide, index) => count + (index === 0 ? (exportVisuals.cover ? 1 : 0) : (exportVisuals.slides?.[String(index)] || exportVisuals.slides?.[slide.id || ""] ? 1 : 0)), 0);
      if (workspaceType === "teacher_courseware" && !workspaceIdentity) {
        throw new Error("当前教师课件缺少服务器版本身份，不能导出");
      }
      if (workspaceType === "general" && project.slides.length && existingVisualCount === 0) {
        exportVisuals = await generateVisuals({ maxSlideVisuals: 2, reason: "export" });
        const preparedVisualCount = (exportVisuals.cover ? 1 : 0) + Object.keys(exportVisuals.slides || {}).length;
        pushMessage(
          "assistant",
          preparedVisualCount
            ? `导出前已自动调用 image2 准备 ${preparedVisualCount} 张封面/关键页视觉，并写入本次 PPTX 导出。`
            : "导出前尝试调用 image2，但未获得可用视觉，将继续使用本地可编辑占位视觉。"
        );
      }
      const response = await fetch("/api/export-pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          workspaceType === "teacher_courseware" && workspaceIdentity
            ? { projectId: workspaceIdentity.projectId, versionId: workspaceIdentity.versionId, artifactType: "pptx" }
            : { project, visuals: exportVisuals }
        )
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as (ExportGatePayload & { message?: string; reason?: string }) | null;
        if (response.status === 422 && !detail?.issues?.length && (detail?.message || detail?.reason)) {
          const reasonText = detail?.reason ? `（原因：${detail.reason}）` : "";
          showToast({ type: "error", message: `导出被就绪度闸门拦截：${detail?.message || "当前版本尚未满足导出条件"}${reasonText}` });
          pushMessage("assistant", `导出被就绪度闸门拦截：${detail?.message || ""}${detail?.reason ? `\n原因：${detail.reason}` : ""}`);
          return;
        }
        if (response.status === 422 && detail?.issues?.length) {
          setLastExportGate(detail);
          const explanation = detail.explanation;
          const firstIssue = explanation?.primaryIssue || detail.issues[0];
          const actions = explanation?.topActions?.length ? explanation.topActions : detail.issues.map((item) => item.action).filter(Boolean).slice(0, 3);
          showToast({
            type: "error",
            message: `${explanation?.headline || "导出被质量闸门拦截"}\n${explanation?.summary || firstIssue.title}\n下一步：${actions[0] || firstIssue.action || "先按评审中枢修复后再导出"}`
          });
          pushMessage(
            "assistant",
            [
              `导出前质量闸门未通过：${explanation?.summary || firstIssue.title}`,
              firstIssue ? `首要问题：${firstIssue.title}。${firstIssue.detail || ""}` : "",
              actions.length ? `建议动作：${actions.slice(0, 3).join("；")}` : "建议先点击「一键应用可自动修复项」或补充真实资料后再重新评分。",
              explanation?.missingRealSources ? "注意：这是证据/真实来源问题，不能只靠改文案绕过。" : ""
            ].filter(Boolean).join("\n")
          );
          return;
        }
        throw new Error(detail?.message || "export failed");
      }
      setLastExportGate(null);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${project.title.replace(/[\\/:*?"<>|]/g, "_") || "AI-PPT-Agent"}.pptx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Allow the browser to start consuming the blob before releasing it.
      // Immediate revocation can cancel downloads in headless Chromium.
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      const latestCredits = response.headers.get("X-AI-PPT-Credits");
      if (latestCredits) {
        setPoints(Number(latestCredits));
      } else {
        await refreshUser();
      }
      const deliveryClass = response.headers.get("X-Delivery-Class");
      const artifactId = response.headers.get("X-Artifact-Id");
      const deckSpecHash = response.headers.get("X-Deck-Spec-Hash");
      const pageCount = response.headers.get("X-Page-Count");
      const commercialReady = response.headers.get("X-Commercial-Ready");
      const visualQA = response.headers.get("X-Visual-QA");
      if (workspaceType === "teacher_courseware") {
        setTeacherExportMeta({
          artifactId: artifactId ?? undefined,
          deliveryClass: deliveryClass ?? undefined,
          deckSpecHash: deckSpecHash ?? undefined,
          pageCount: pageCount ?? undefined,
          visualQA: visualQA ?? undefined,
          commercialReady: commercialReady ?? undefined
        });
      }
      const reviewNote = deliveryClass === "engineering_preview" ? "（审核稿 · 请教师确认后使用）" : "";
      const qaNote = visualQA === "passed" ? "，视觉检查通过" : visualQA === "review_required" ? "，视觉检查建议复核" : "";
      showToast({ type: "success", message: deliveryClass === "teacher_approved" ? `教师批准稿已按当前服务器版本导出${qaNote}` : deliveryClass === "teacher_review_copy" ? `教师复核稿已按当前服务器版本导出${qaNote}` : deliveryClass === "engineering_preview" ? `工程预览稿已按当前服务器版本导出${reviewNote}${qaNote}` : `PPTX 已开始下载${qaNote}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      showToast({ type: "error", message: `导出失败：${message}` });
    } finally {
      setIsExporting(false);
    }
  };

  const canContinue = (stage === "requirements" || stage === "outlineReady" || stage === "planReady") && !isBusy;
  const visualCount = (generatedVisuals.cover ? 1 : 0) + Object.keys(generatedVisuals.slides || {}).length;
  const composerBusy = isBusy || isRefining || isApplyingReviewFixes;

  const renderAgentPanel = (embedded = false) => (
    <AgentChatPanel
      stage={stage}
      project={project}
      messages={messages}
      searchGroups={searchGroups}
      assets={assets}
      draft={draft}
      points={points}
      user={user}
      cloudSessions={cloudSessions}
      activeSessionId={activeSessionId}
      isSavingSession={isSavingSession}
      provider={provider}
      visualCount={visualCount}
      isBusy={composerBusy}
      canContinue={canContinue}
      onDraftChange={setDraft}
      onModeChange={changeWorkbenchMode}
      uploadedFile={uploadedFile}
      onUploaded={handleUploaded}
      onSend={sendDraft}
      onContinue={continueFlow}
      onAutoRun={autoRunFlow}
      onNewSession={resetSession}
      onPreview={openPreview}
      onContinueEdit={continueEditing}
      onCopyLink={copyShareLink}
      onRequirementSelect={applyRequirement}
      onOpenAuth={() => setIsAuthOpen(true)}
      onSaveSession={() => void saveCloudSession()}
      onLoadSession={(id) => void loadCloudSession(id)}
      onExport={downloadPptx}
      onApplyReviewFixes={() => void applyReviewFixes()}
      isApplyingReviewFixes={isApplyingReviewFixes}
      embedded={embedded}
    />
  );

  return (
    <ReactFlowProvider>
      <main className="flex h-dvh overflow-hidden bg-[#eef1f6] text-ink max-lg:flex-col">
        <section className="relative min-h-0 flex-1 overflow-hidden">
          {stage === "editor" ? (
            workspaceType === "teacher_courseware" ? (
              <TeacherSandunStudio
                project={project}
                workspaceIdentity={workspaceIdentity}
                isExporting={isExporting}
                isRefining={isRefining}
                isGeneratingVisuals={isGeneratingVisuals}
                isApplyingReviewFixes={isApplyingReviewFixes}
                isPresenting={isPresenting}
                generatedVisuals={generatedVisuals}
                onExport={downloadPptx}
                onPresent={openPreview}
                onClosePresent={() => setIsPresenting(false)}
                onProjectChange={applyProjectChange}
                onRefine={(instruction, kind, targetSlideId) => void refineCurrentProject(instruction, kind, targetSlideId)}
                onManualSave={(slideId, patch) => void saveTeacherSlide(slideId, patch)}
                isSavingSlide={isSavingSlide}
                teacherExportMeta={teacherExportMeta}
                onGenerateVisuals={generateVisuals}
                visualGenerationProgress={visualGenerationProgress}
                onApplyReviewFixes={() => void applyReviewFixes()}
                onApplyPageReviewFixes={(pageIndex, slideId) => void applyPageReviewFixes(pageIndex, slideId)}
                teacherVersions={teacherVersions}
                teacherMaterials={teacherMaterials}
                isViewingCurrentVersion={isViewingCurrentVersion}
                onSelectVersion={(versionId) => void selectTeacherVersion(versionId)}
                onRestoreVersion={(versionId) => void restoreTeacherVersion(versionId)}
                isRestoringVersion={isRestoringVersion}
                teacherChat={teacherChat}
                isChatSending={isChatSending}
                onSendChat={(content) => void sendTeacherChat(content)}
                isApplyingChatSuggestion={isApplyingChatSuggestion}
                onApplyChatSuggestion={(message) => void applyTeacherChatSuggestion(message)}
                isAttachingMaterial={isAttachingMaterial}
                onAttachMaterial={(material) => void attachTeacherMaterial(material)}
                isSubmittingReview={isSubmittingReview}
                onSubmitReview={() => void submitTeacherReview()}
              />
            ) : <PresentationEditor
              project={project}
              isExporting={isExporting}
              isRefining={isRefining}
              isPresenting={isPresenting}
              onExport={downloadPptx}
              onRefine={() => void refineCurrentProject()}
              onPresent={openPreview}
              onClosePresent={() => setIsPresenting(false)}
              onProjectChange={applyProjectChange}
              generatedVisuals={generatedVisuals}
              isGeneratingVisuals={isGeneratingVisuals}
              lastExportGate={lastExportGate}
              onGenerateVisuals={generateVisuals}
              onApplyReviewFixes={() => void applyReviewFixes()}
              onApplyPageReviewFixes={(pageIndex, slideId) => void applyPageReviewFixes(pageIndex, slideId)}
              onAddManualSource={(source) => addManualSourceAndReview(source)}
              isApplyingReviewFixes={isApplyingReviewFixes}
              workspaceType={workspaceType}
              workspaceIdentity={workspaceIdentity}
              assistantPanel={renderAgentPanel(true)}
              onNewGeneral={resetSession}
              onNewTeacher={resetSession}
            />
          ) : (
            <>
              <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} fitView minZoom={0.18} maxZoom={1.6} proOptions={{ hideAttribution: true }} className="canvas-flow">
                <Background variant={BackgroundVariant.Dots} gap={26} size={1.5} color="#cfd5df" />
                <MiniMap pannable zoomable className="!hidden !rounded-2xl !border !border-line !bg-white/90 xl:!block" />
                <Controls className="!rounded-2xl !border !border-line !bg-white/90 !shadow-sm" />
              </ReactFlow>
              <CanvasControlBar
                stage={stage}
                nodeCount={nodes.length}
                collapsedCount={collapsedNodeIds.length}
                focusNodeId={focusNodeId}
                compareMode={compareMode}
                onExpandAll={() => {
                  setCollapsedNodeIds([]);
                  showToast({ type: "info", message: "画布节点已全部展开" });
                }}
                onCollapseSecondary={collapseSecondaryNodes}
                onFocusActive={focusCurrentStageNode}
                onToggleCompare={() => {
                  setCompareMode((current) => !current);
                  showToast({ type: "info", message: compareMode ? "已关闭对比状态" : "已开启对比状态：可对照资料、策划和设计节点" });
                }}
              />
              {compareMode && nodes.length ? (
                <div className="absolute right-4 top-[74px] z-20 hidden w-[320px] rounded-[22px] border border-[#cfe2ff] bg-white/92 p-4 text-xs leading-5 text-[#344054] shadow-sm backdrop-blur-xl md:block">
                  <div className="font-bold text-ink">对比状态已开启</div>
                  <div className="mt-2">当前可横向核对：任务简报 → 便签大纲 → 资料模块 → 内容策划稿 → 设计预览。</div>
                  <div className="mt-2 rounded-2xl bg-[#eef6ff] px-3 py-2 text-[#1462ff]">
                    聚焦节点：{focusNodeId || "未选择"} · 折叠节点：{collapsedNodeIds.length}
                  </div>
                </div>
              ) : null}
              <CanvasEmptyState
                stage={stage}
                draft={draft}
                mode={project.mode}
                uploadedFile={uploadedFile}
                onUploaded={handleUploaded}
                onSample={applySample}
              />
              <div className="absolute left-4 right-4 top-4 z-20 flex items-center gap-3 rounded-[24px] border border-line bg-white/90 px-3 py-3 shadow-sm backdrop-blur-xl sm:left-4 sm:right-auto sm:px-4">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-ink text-white sm:size-11"><Wand2 className="size-5" /></div>
                <div>
                  <div className="text-sm font-semibold">AI PPT Agent</div>
                  <div className="hidden text-xs text-muted sm:block">画布式 PPT Agent</div>
                </div>
                <div className="relative ml-auto sm:ml-2">
                <button type="button" onClick={() => setIsNewMenuOpen((current) => !current)} className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-white px-3 text-xs font-semibold text-ink transition hover:border-[#b7d5ff]">
                  <Plus className="size-4" />
                  新建<ChevronDown className="size-3.5" />
                </button>
                {isNewMenuOpen ? <div className="absolute right-0 top-11 w-48 rounded-md border border-line bg-white p-1.5 shadow-panel"><button type="button" onClick={() => { setIsNewMenuOpen(false); resetSession(); }} className="flex w-full items-center gap-2 rounded px-3 py-2.5 text-left text-sm hover:bg-[#f3f5f3]"><Sparkles className="size-4 text-[#3c66a6]" />通用 PPT</button><a href="/teacher-ai-ppt" className="flex w-full items-center gap-2 rounded px-3 py-2.5 text-left text-sm hover:bg-[#f3f5f3]"><BookOpen className="size-4 text-[#11756d]" />教师课件</a></div> : null}
                </div>
              </div>
              <div className="absolute bottom-4 left-4 z-20 hidden rounded-[22px] border border-line bg-white/90 px-4 py-3 text-xs text-muted shadow-sm backdrop-blur-xl md:block">
                <div className="flex items-center gap-3">
                  <ZoomOut className="size-4" />
                  <span>拖拽空白区移动画布</span>
                  <span className="h-4 w-px bg-line" />
                  <span>鼠标滚轮缩放</span>
                  <ZoomIn className="size-4" />
                </div>
              </div>
              <WorkflowRail stage={stage} project={project} assets={assets} searchGroups={searchGroups} />
            </>
          )}
        </section>
        {stage !== "editor" ? <div className="h-[52dvh] shrink-0 overflow-hidden border-t border-line bg-white lg:h-full lg:border-l lg:border-t-0">{renderAgentPanel()}</div> : null}
        {toast ? (
          <div
            className={cn(
              "fixed bottom-5 left-1/2 z-[80] w-[min(760px,calc(100vw-32px))] -translate-x-1/2 whitespace-pre-line rounded-2xl border bg-white px-4 py-3 text-left text-sm font-medium leading-6 text-ink shadow-panel",
              toast.type === "error"
                ? "border-[#fecdd3]"
                : toast.type === "success"
                  ? "border-[#bbf7d0]"
                  : toast.type === "warning"
                    ? "border-[#fed7aa] bg-[#fff8f0]"
                    : "border-[#cfe2ff]"
            )}
          >
            {toast.message}
          </div>
        ) : null}
        <AuthModal
          open={isAuthOpen}
          user={user}
          onClose={() => setIsAuthOpen(false)}
          onAuthed={(nextUser) => {
            setUser(nextUser);
            setPoints(nextUser?.credits ?? 500);
            void refreshCloudSessions();
            showToast({ type: nextUser ? "success" : "info", message: nextUser ? "已登录，本地历史已启用" : "已退出登录" });
          }}
        />
      </main>
    </ReactFlowProvider>
  );
}
