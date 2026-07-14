"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, History, Layers3, Link2, Loader2, MessageSquare, PanelRight, Send, Sparkles, Wand2 } from "lucide-react";
import type { CanvasProject, SearchGroup, UploadedAsset } from "@/lib/canvas-data";
import type { AuthUser } from "@/components/AuthModal";
import { UploadPPTCard, type UploadedFile } from "@/components/UploadPPTCard";
import { summarizeEvidenceAuthenticity } from "@/lib/ppt-agent/evidence-authenticity";
import { layoutLabel } from "@/lib/ppt-labels";
import { cn, formatFileSize } from "@/lib/utils";
import { getWorkbenchModeContract, type WorkbenchMode } from "@/lib/workbench-mode";

export type AgentStage =
  | "idle"
  | "researching"
  | "requirements"
  | "outlining"
  | "outlineReady"
  | "searching"
  | "planning"
  | "planReady"
  | "designing"
  | "editor";

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
};

type PanelTab = "chat" | "structure" | "history";
type ReviewTab = "audit" | "rules" | "deductions" | "optimize";

type AgentChatPanelProps = {
  stage: AgentStage;
  project: CanvasProject;
  messages: AgentMessage[];
  searchGroups: SearchGroup[];
  assets: UploadedAsset[];
  draft: string;
  points: number;
  user: AuthUser | null;
  cloudSessions: Array<{ id: string; title: string; stage: string; updatedAt: string }>;
  activeSessionId: string | null;
  isSavingSession: boolean;
  provider: "openai" | "local" | null;
  visualCount: number;
  isBusy: boolean;
  canContinue: boolean;
  onDraftChange: (value: string) => void;
  onModeChange: (mode: CanvasProject["mode"]) => void;
  uploadedFile: UploadedFile | null;
  onUploaded: (file: UploadedFile | null) => void;
  onSend: () => void;
  onContinue: () => void;
  onAutoRun: () => void;
  onNewSession: () => void;
  onPreview: () => void;
  onContinueEdit: () => void;
  onCopyLink: () => void;
  onRequirementSelect: (requirement: string) => void;
  onOpenAuth: () => void;
  onSaveSession: () => void;
  onLoadSession: (id: string) => void;
  onExport: () => void;
  onApplyReviewFixes: () => void;
  isApplyingReviewFixes: boolean;
  embedded?: boolean;
};

const stageLabels: Record<AgentStage, string> = {
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

function SpinnerLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm font-medium text-[#344054]">
      <span className="flex size-8 items-center justify-center rounded-full bg-[#eef4ff] text-[#2f7cff]">
        <Loader2 className="size-4 animate-spin" />
      </span>
      {children}
    </div>
  );
}

function BeautifyPlanPanel({ project }: { project: CanvasProject }) {
  const plan = project.beautifyPlan;
  if (!plan) return null;

  const levelClass =
    plan.level === "可直接美化"
      ? "bg-[#ecfdf3] text-[#027a48]"
      : plan.level === "需要补资料"
        ? "bg-[#fff1f3] text-[#b42318]"
        : "bg-[#fff7ed] text-[#c2410c]";
  const priorityPages = plan.pageDiagnoses
    .filter((page) => page.detectedIssues.some((issue) => issue.severity === "risk" || issue.severity === "warn"))
    .slice(0, 5);

  return (
    <section className="rounded-[22px] border border-[#d6bbfb] bg-white shadow-sm">
      <div className="rounded-t-[22px] border-b border-[#eadcff] bg-[#f7f0ff] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#6941c6]">
            <Wand2 className="size-5" />
            PPT 美化诊断
          </div>
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", levelClass)}>{plan.diagnosisScore} 分 · {plan.level}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-2xl bg-white/80 p-3">
            <div className="text-muted">原稿页数</div>
            <div className="mt-1 font-bold text-ink">{plan.originalPageCount || "--"}</div>
          </div>
          <div className="rounded-2xl bg-white/80 p-3">
            <div className="text-muted">内容块</div>
            <div className="mt-1 font-bold text-ink">{plan.originalBlockCount || "--"}</div>
          </div>
          <div className="rounded-2xl bg-white/80 p-3">
            <div className="text-muted">逐页诊断</div>
            <div className="mt-1 font-bold text-ink">{plan.pageDiagnoses.length}</div>
          </div>
        </div>
      </div>
      <div className="max-h-[360px] space-y-3 overflow-y-auto p-4">
        {plan.globalIssues.length ? (
          <div className="rounded-2xl bg-[#fff7ed] p-3 text-xs leading-5 text-[#c2410c]">
            {plan.globalIssues.slice(0, 3).join("；")}
          </div>
        ) : null}
        <div className="rounded-2xl bg-[#f8fafc] p-3">
          <div className="text-xs font-bold text-[#6941c6]">保留策略</div>
          <div className="mt-1 text-xs leading-5 text-muted">{plan.preserveStrategy.slice(0, 3).join("；")}</div>
        </div>
        <div className="rounded-2xl bg-[#f8fafc] p-3">
          <div className="text-xs font-bold text-[#6941c6]">重排策略</div>
          <div className="mt-1 text-xs leading-5 text-muted">{plan.redesignStrategy.slice(0, 4).join("；")}</div>
        </div>
        <div className="space-y-2">
          {(priorityPages.length ? priorityPages : plan.pageDiagnoses.slice(0, 5)).map((page) => (
            <div key={`${page.page}-${page.originalTitle}`} className="rounded-2xl border border-line bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-ink">P{page.page} {page.originalTitle}</div>
                <span className="rounded-full bg-[#f4ebff] px-2 py-0.5 text-[10px] font-bold text-[#6941c6]">{page.recommendedLayout}</span>
              </div>
              <div className="mt-1 text-xs leading-5 text-muted">{page.role}</div>
              <div className="mt-2 rounded-xl bg-[#f8fafc] p-2 text-[11px] leading-5 text-[#667085]">
                问题：{page.detectedIssues.slice(0, 2).map((issue) => issue.title).join(" / ")}
              </div>
              <div className="mt-1 text-[11px] leading-5 text-[#1462ff]">
                动作：{page.rewriteActions.slice(0, 3).join(" / ")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ResearchCard({ stage, searchGroups }: { stage: AgentStage; searchGroups: SearchGroup[] }) {
  if (!["researching", "requirements", "searching", "planning", "planReady"].includes(stage)) {
    return null;
  }

  return (
    <section className="rounded-[22px] border border-[#cfe2ff] bg-white shadow-sm">
      <div className="flex items-center gap-2 rounded-t-[22px] border-b border-[#cfe2ff] bg-[#eef6ff] px-4 py-3 text-sm font-semibold text-[#1462ff]">
        <Sparkles className="size-4" />
        公开资料调研
      </div>
      <div className="space-y-2 p-4">
        {searchGroups.length === 0 ? (
          <div className="flex min-h-24 flex-col items-center justify-center gap-3 text-sm text-muted">
            <Loader2 className="size-7 animate-spin text-[#2f7cff]" />
            正在检索公开信息源...
          </div>
        ) : (
          searchGroups.slice(0, 4).map((group, index) => (
            <div key={`${group.query}-${index}`} className="rounded-2xl border border-line bg-[#fbfcff] p-3">
              <div className="flex items-center gap-3">
                {group.results.length ? <CheckCircle2 className="size-4 shrink-0 text-[#2f7cff]" /> : <AlertTriangle className="size-4 shrink-0 text-[#c2410c]" />}
                <span className={cn("rounded-xl px-2.5 py-1 text-xs font-semibold", group.results.length ? "bg-[#eef4ff] text-[#1462ff]" : "bg-[#fff7ed] text-[#c2410c]")}>
                  {group.results.length ? group.provider.includes("official") ? "官方+检索" : "网页检索" : group.status === "provider_unconfigured" ? "未配置真实检索" : "无结果"}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#475467]">{group.query}</span>
                <span className="text-sm font-semibold text-[#1462ff]">{group.results.length} 条</span>
              </div>
              {group.results.length === 0 ? (
                <div className="mt-3 rounded-2xl bg-[#fff7ed] px-3 py-2 text-xs leading-5 text-[#c2410c]">
                  {group.warnings?.[0] || group.error || "当前没有真实 provider 返回的可追溯 URL，系统不会伪造搜索结果。"}
                </div>
              ) : null}
              <div className="mt-3 space-y-2">
                {group.results.slice(0, 3).map((result, resultIndex) => (
                  <a key={`${result.url}-${resultIndex}`} href={result.url} target="_blank" rel="noreferrer" className="block rounded-2xl bg-white px-3 py-2 text-left transition hover:bg-[#f2f6ff]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="line-clamp-1 text-xs font-semibold text-ink">{result.title}</span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", result.sourceType === "official" ? "bg-[#ecfdf3] text-[#027a48]" : "bg-[#eef4ff] text-[#1462ff]")}>
                        {result.status === "verified" ? "已验证" : "搜索结果"}
                      </span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{result.snippet}</div>
                    <div className="mt-1 truncate text-[11px] text-[#98a2b3]">{result.sourceName || result.url}</div>
                  </a>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function RequirementCard({ onSelect }: { onSelect: (requirement: string) => void }) {
  const [selected, setSelected] = useState("B");
  const options = [
    ["A", "资料复刻", "内容侧重：严格基于上传资料或公开资料进行复刻，不主动扩写未经证实的信息。"],
    ["B", "经典+实用", "内容侧重：优先保证真实可执行，路线、预算、步骤和避坑信息要清晰。"],
    ["C", "商务汇报", "内容侧重：使用结论先行、数据支撑、风险预案和行动清单的汇报结构。"],
    ["D", "视觉设计", "内容侧重：强化页面层级、图表化表达、卡片式布局和统一视觉风格。"]
  ];

  return (
    <section className="rounded-[22px] border border-[#cfe2ff] bg-white shadow-sm">
      <div className="flex items-center justify-between rounded-t-[22px] border-b border-[#cfe2ff] bg-[#eef6ff] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#1462ff]">
          <CheckCircle2 className="size-5" />
          内容需求单
        </div>
        <span className="text-sm font-semibold text-[#1462ff]">4/6</span>
      </div>
      <div className="p-4">
        <div className="text-sm font-semibold text-[#1462ff]">问题 4</div>
        <div className="mt-1 text-base font-semibold text-ink">希望这份 PPT 的内容侧重是什么？</div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {options.map(([key, label, requirement]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setSelected(key);
                onSelect(requirement);
              }}
              className={cn("flex h-12 items-center gap-3 rounded-2xl border px-4 text-sm font-semibold transition", selected === key ? "border-[#82b7ff] bg-[#eef6ff] text-[#1462ff]" : "border-line bg-white text-[#667085] hover:border-[#b7d5ff]")}
            >
              <span>{key}</span>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[#dbeafe] px-4 py-3">
        <span className="text-sm text-muted">选择会写入当前 PPT 需求</span>
        <span className="rounded-2xl bg-[#8fc5ff] px-4 py-2 text-sm font-semibold text-white">已记录 {selected}</span>
      </div>
    </section>
  );
}

function OutlineSummary({ project }: { project: CanvasProject }) {
  return (
    <section className="rounded-[22px] border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-ink">PPT 大纲</div>
        <span className="rounded-full bg-[#eef4ff] px-2.5 py-1 text-xs font-semibold text-[#1462ff]">{project.outline.length} 页内容骨架</span>
      </div>
      <div className="mt-3 space-y-2">
        {project.outline.slice(0, 5).map((item, index) => (
          <div key={item.id || `outline-chat-${index}`} className="rounded-2xl bg-[#f8fafc] px-3 py-2">
            <div className="text-sm font-semibold text-ink">
              {item.page}. {item.title}
            </div>
            <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{item.note}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlanningCard({ project, stage }: { project: CanvasProject; stage: AgentStage }) {
  if (stage !== "planning" && stage !== "planReady") {
    return null;
  }
  const done = stage === "planReady" ? project.plan.length : Math.max(1, Math.floor(project.plan.length / 2));
  return (
    <section className="rounded-[22px] border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-ink">内容策划稿</div>
        <span className="text-sm font-semibold text-[#1462ff]">{done}/{project.plan.length}</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-[#eef2f7]">
        <div className="h-full rounded-full bg-[#2f7cff] transition-all" style={{ width: `${Math.min(100, (done / Math.max(1, project.plan.length)) * 100)}%` }} />
      </div>
      <div className="mt-3 space-y-2">
        {project.plan.slice(0, 3).map((item, index) => (
          <div key={item.id || `plan-chat-${index}`} className="rounded-2xl bg-[#f8fafc] px-3 py-2 text-sm">
            <span className="font-semibold text-ink">P{item.page}</span>
            <span className="ml-2 text-muted">{layoutLabel(item.layout)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewCenterPanel({
  project,
  onApplyReviewFixes,
  isApplyingReviewFixes
}: {
  project: CanvasProject;
  onApplyReviewFixes: () => void;
  isApplyingReviewFixes: boolean;
}) {
  const [tab, setTab] = useState<ReviewTab>("audit");
  const center = project.reviewCenter;

  if (!center) {
    return (
      <section className="rounded-[22px] border border-line bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ClipboardCheck className="size-4 text-[#2f7cff]" />
          PPT 评审中枢
        </div>
        <div className="mt-3 rounded-2xl bg-[#f8fafc] p-4 text-sm leading-6 text-muted">
          输入需求后，系统会先识别 PPT 类型、生成评分规则和策划审核稿，再进入大纲与页面生成。
        </div>
      </section>
    );
  }

  const fixSummary = center.lastFixSummary;
  const review = center.postReview;
  const evidence = summarizeEvidenceAuthenticity(project);
  const levelClass =
    review?.level === "优秀" || review?.level === "可交付"
      ? "bg-[#ecfdf3] text-[#027a48]"
      : review?.level === "不建议交付"
        ? "bg-[#fff1f3] text-[#b42318]"
        : "bg-[#fff7ed] text-[#c2410c]";
  const evidenceClass =
    evidence.tone === "good"
      ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#027a48]"
      : evidence.tone === "warn"
        ? "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]"
        : "border-[#fecdd3] bg-[#fff1f3] text-[#b42318]";

  return (
    <section className="rounded-[22px] border border-[#cfe2ff] bg-white shadow-sm">
      <div className="rounded-t-[22px] border-b border-[#cfe2ff] bg-[#eef6ff] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1462ff]">
            <ClipboardCheck className="size-5" />
            PPT 评审中枢
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#1462ff]">
            {center.pptTypeLabel} · {center.confidence}%
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-2xl bg-white/80 p-3">
            <div className="text-muted">受众</div>
            <div className="mt-1 font-semibold text-ink">{center.audience}</div>
          </div>
          <div className="rounded-2xl bg-white/80 p-3">
            <div className="text-muted">生成目标</div>
            <div className="mt-1 font-semibold text-ink">{center.goal}</div>
          </div>
        </div>
        {review ? (
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-white px-3 py-2">
            <span className="text-xs font-semibold text-muted">生成后评分</span>
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", levelClass)}>{review.totalScore} 分 · {review.level}</span>
          </div>
        ) : null}
        <div className={cn("mt-3 rounded-2xl border px-3 py-3 text-xs", evidenceClass)}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold">证据真实性</span>
            <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 font-bold">{evidence.score} · {evidence.label}</span>
          </div>
          <div className="mt-1 leading-5">{evidence.headline}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {evidence.badges.map((badge) => (
              <span key={badge.label} className="rounded-full bg-white/75 px-2 py-0.5 font-semibold">
                {badge.label} {badge.count}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="border-b border-line p-2">
        <div className="grid grid-cols-4 gap-1 rounded-2xl bg-[#f8fafc] p-1">
          {[
            ["audit", "策划审核"],
            ["rules", "评分规则"],
            ["deductions", "扣分项"],
            ["optimize", "自动优化"]
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key as ReviewTab)}
              className={cn("h-9 rounded-xl text-xs font-semibold transition", tab === key ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[520px] space-y-3 overflow-y-auto p-4">
        {tab === "audit" ? (
          <>
            {evidence.blockers.length || evidence.warnings.length ? (
              <div className={cn("rounded-2xl border p-3 text-xs leading-5", evidenceClass)}>
                <div className="font-bold">证据链判断：{evidence.label}</div>
                <div className="mt-1">{evidence.headline}</div>
                {evidence.blockers.length ? (
                  <div className="mt-2">
                    <span className="font-bold">阻断：</span>
                    {evidence.blockers.slice(0, 2).join("；")}
                  </div>
                ) : null}
                {evidence.suggestedFixes.length ? (
                  <div className="mt-1">
                    <span className="font-bold">下一步：</span>
                    {evidence.suggestedFixes.slice(0, 2).join("；")}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="rounded-2xl bg-[#f8fafc] p-3">
              <div className="text-xs font-semibold text-[#1462ff]">核心观点一句话</div>
              <div className="mt-1 text-sm font-semibold leading-6 text-ink">{center.planningAudit.coreMessage}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-2xl bg-[#f8fafc] p-3">
                <div className="text-muted">推荐页数</div>
                <div className="mt-1 text-sm font-semibold text-ink">{center.planningAudit.recommendedSlideCount} 页</div>
              </div>
              <div className="rounded-2xl bg-[#f8fafc] p-3">
                <div className="text-muted">看完要判断</div>
                <div className="mt-1 text-sm font-semibold text-ink">{center.planningAudit.expectedDecision}</div>
              </div>
            </div>
            <div className="space-y-2">
              {center.planningAudit.pageRoles.slice(0, 8).map((page) => (
                <div key={`${page.page}-${page.title}`} className="rounded-2xl border border-line bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-ink">P{page.page} {page.title}</div>
                    <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[10px] font-semibold text-[#1462ff]">{page.role}</span>
                  </div>
                  <div className="mt-2 rounded-xl bg-[#f8fafc] p-2 text-xs font-semibold leading-5 text-ink">
                    主张：{page.claim || page.mustProve}
                  </div>
                  <div className="mt-2 text-xs leading-5 text-muted">要证明：{page.mustProve}</div>
                  {page.evidencePlan?.length ? (
                    <div className="mt-2 text-[11px] leading-5 text-[#1462ff]">证据计划：{page.evidencePlan.slice(0, 3).join("；")}</div>
                  ) : (
                    <div className="mt-2 text-[11px] text-[#98a2b3]">证据：{page.evidenceNeeded.slice(0, 4).join(" / ")}</div>
                  )}
                  {page.contentBlocks?.length ? (
                    <div className="mt-2 grid grid-cols-1 gap-1.5">
                      {page.contentBlocks.slice(0, 3).map((block) => (
                        <div key={`${page.page}-${block.title}`} className="rounded-xl border border-[#eef2f7] bg-white px-2.5 py-2 text-[11px] leading-4 text-[#475467]">
                          <span className="font-semibold text-ink">{block.title}</span>
                          <span className="ml-1">{block.body}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] leading-5">
                    <div className="rounded-xl bg-[#f8fafc] p-2 text-muted">
                      版式理由：{page.layoutReason || layoutLabel(page.suggestedLayout)}
                    </div>
                    <div className="rounded-xl bg-[#fff7ed] p-2 text-[#c2410c]">
                      风险：{page.riskIfWeak || "证据不足会扣分"}
                    </div>
                  </div>
                  {page.whatToCut?.length ? (
                    <div className="mt-2 text-[11px] leading-5 text-[#98a2b3]">舍弃：{page.whatToCut.slice(0, 2).join("；")}</div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-2xl bg-[#ecfdf3] p-3 text-[#027a48]">
                应使用：{center.planningAudit.materialsToUse.slice(0, 4).join(" / ")}
              </div>
              <div className="rounded-2xl bg-[#fff7ed] p-3 text-[#c2410c]">
                应舍弃：{center.planningAudit.materialsToDiscard.slice(0, 3).join(" / ")}
              </div>
            </div>
            <div className="rounded-2xl bg-[#fff7ed] p-3 text-xs leading-5 text-[#c2410c]">
              最容易扣分：{center.planningAudit.likelyDeductions.slice(0, 3).join("；")}
            </div>
          </>
        ) : null}

        {tab === "rules" ? (
          <>
            {center.ruleSet.dimensions.map((dimension) => (
              <div key={dimension.key} className="rounded-2xl border border-line bg-white p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-ink">{dimension.name}</div>
                  <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-xs font-bold text-[#1462ff]">{dimension.weight} 分</span>
                </div>
                <div className="mt-1 text-xs leading-5 text-muted">{dimension.why}</div>
                <div className="mt-2 text-[11px] leading-5 text-[#667085]">扣分：{dimension.deductionRules.slice(0, 2).join(" / ")}</div>
                <div className="mt-1 text-[11px] leading-5 text-[#667085]">证据：{dimension.evidenceRequired.slice(0, 3).join(" / ")}</div>
              </div>
            ))}
            <div className="rounded-2xl bg-[#f8fafc] p-3 text-xs leading-5 text-muted">
              必须出现：{center.ruleSet.requiredPages.map((page) => page.title).slice(0, 8).join(" / ")}
            </div>
          </>
        ) : null}

        {tab === "deductions" ? (
          review ? (
            <>
              {evidence.tone !== "good" ? (
                <div className={cn("rounded-2xl border p-3 text-xs leading-5", evidenceClass)}>
                  <div className="font-bold">证据扣分不是文案问题</div>
                  <div className="mt-1">{evidence.headline}</div>
                  {evidence.blockers[0] ? <div className="mt-1">主要阻断：{evidence.blockers[0]}</div> : null}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                {review.dimensionScores.map((item) => (
                  <div key={item.key} className="rounded-2xl bg-[#f8fafc] p-3">
                    <div className="text-xs text-muted">{item.name}</div>
                    <div className="mt-1 text-sm font-bold text-ink">{item.score}/{item.weight}</div>
                    <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted">{item.comment}</div>
                  </div>
                ))}
              </div>
              {review.deductions.length ? (
                review.deductions.slice(0, 10).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-line bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-ink">{item.where}</div>
                      <span className="rounded-full bg-[#fff7ed] px-2 py-0.5 text-xs font-bold text-[#c2410c]">-{item.points}</span>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-muted">为什么扣：{item.reason}</div>
                    <div className="mt-1 text-xs leading-5 text-[#1462ff]">怎么改：{item.suggestion}</div>
                    <div className="mt-2 text-[11px] font-semibold text-muted">{item.autoFixable ? "可自动修复" : "需要补充资料后修复"}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-[#ecfdf3] p-4 text-sm font-semibold text-[#027a48]">当前没有明显扣分项。</div>
              )}
            </>
          ) : (
            <div className="rounded-2xl bg-[#f8fafc] p-4 text-sm leading-6 text-muted">PPT 生成后会在这里显示 100 分评分、逐页反馈和扣分项。</div>
          )
        ) : null}

        {tab === "optimize" ? (
          <>
            {fixSummary ? (
              <div className="rounded-2xl bg-[#eef6ff] p-3 text-[11px] leading-5 text-[#1462ff]">
                <div className="font-bold">本次修复摘要</div>
                <div className="mt-1">{fixSummary.message}</div>
                <div className="mt-1 font-semibold">
                  {fixSummary.beforeScore} → {fixSummary.afterScore} 分，仍有 {fixSummary.unresolvedCount} 个未解决项。
                </div>
                {fixSummary.unresolvedBlockers?.length ? (
                  <div className="mt-2 rounded-xl bg-white/70 p-2 text-[#344054]">
                    仍需人工/资料处理：{fixSummary.unresolvedBlockers.slice(0, 2).map((item) => item.where).join("；")}
                  </div>
                ) : null}
              </div>
            ) : null}
            {review?.priorityFixes.length ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-ink">最优先修改的 3 个问题</div>
                {review.priorityFixes.map((item) => (
                  <div key={item.id} className="rounded-2xl bg-[#f8fafc] p-3">
                    <div className="text-sm font-semibold text-ink">{item.where}</div>
                    <div className="mt-1 text-xs leading-5 text-muted">{item.suggestion}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-[#f8fafc] p-4 text-sm leading-6 text-muted">生成后会自动列出优先修复项。</div>
            )}
            <button
              type="button"
              onClick={onApplyReviewFixes}
              disabled={!review || isApplyingReviewFixes}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isApplyingReviewFixes ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              一键应用修改建议并重新评分
            </button>
            {review?.pageReviews.length ? (
              <div className="space-y-2 pt-2">
                <div className="text-sm font-semibold text-ink">逐页反馈</div>
                {review.pageReviews.slice(0, 8).map((page) => (
                  <div key={page.slideId} className="rounded-2xl border border-line bg-white p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-ink">P{page.page} {page.title}</div>
                      <span className="text-xs font-bold text-[#1462ff]">{page.score}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted">角色：{page.role}</div>
                    <div className="mt-1 text-xs leading-5 text-muted">应证明：{page.shouldProve}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

function ResultCard({
  project,
  provider,
  visualCount,
  onPreview,
  onContinueEdit,
  onExport
}: {
  project: CanvasProject;
  provider: "openai" | "local" | null;
  visualCount: number;
  onPreview: () => void;
  onContinueEdit: () => void;
  onExport: () => void;
}) {
  const quality = project.quality;
  const qualityLabel = quality?.status === "ready" ? "可交付" : quality?.status === "risky" ? "有风险" : "需复核";
  const qualityClass =
    quality?.status === "ready"
      ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#027a48]"
      : quality?.status === "risky"
        ? "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]"
        : "border-[#bfdbfe] bg-[#eff6ff] text-[#1462ff]";

  return (
    <section className="rounded-[22px] border border-line bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-ink">生成完成</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-2xl bg-[#f8fafc] p-3">
          <div className="text-xs text-muted">PPT 标题</div>
          <div className="mt-1 line-clamp-2 font-semibold text-ink">{project.title}</div>
        </div>
        <div className="rounded-2xl bg-[#f8fafc] p-3">
          <div className="text-xs text-muted">页数</div>
          <div className="mt-1 font-semibold text-ink">{project.slides.length} 页</div>
        </div>
        <div className="rounded-2xl bg-[#f8fafc] p-3">
          <div className="text-xs text-muted">风格</div>
          <div className="mt-1 font-semibold text-ink">商务简约</div>
        </div>
        <div className="rounded-2xl bg-[#f8fafc] p-3">
          <div className="text-xs text-muted">来源</div>
          <div className="mt-1 font-semibold text-ink">{provider === "openai" ? "API 生成" : "本地兜底"}</div>
        </div>
        <div className="rounded-2xl bg-[#f8fafc] p-3">
          <div className="text-xs text-muted">AI视觉</div>
          <div className="mt-1 font-semibold text-ink">{visualCount > 0 ? `${visualCount} 张已接入` : "未生成"}</div>
        </div>
        {quality ? (
          <div className={cn("col-span-2 rounded-2xl border p-3", qualityClass)}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold">
                {quality.status === "ready" ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
                导出前检查
              </div>
              <div className="text-sm font-bold">{quality.score} · {qualityLabel}</div>
            </div>
            <div className="mt-2 text-xs leading-5">{quality.summary}</div>
            {quality.issues.length ? (
              <div className="mt-2 line-clamp-2 text-[11px] leading-5 opacity-85">
                {quality.issues.slice(0, 2).map((issue) => issue.title).join(" / ")}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" onClick={onPreview} className="flex h-11 items-center justify-center rounded-2xl border border-line bg-white text-sm font-semibold text-ink transition hover:border-[#b7d5ff]">
          预览
        </button>
        <button type="button" onClick={onContinueEdit} className="flex h-11 items-center justify-center rounded-2xl border border-[#cfe2ff] bg-[#eef6ff] text-sm font-semibold text-[#1462ff] transition hover:border-[#82b7ff]">
          继续修改
        </button>
        <button type="button" onClick={onExport} className="flex h-11 items-center justify-center rounded-2xl bg-ink text-sm font-semibold text-white transition hover:-translate-y-0.5">
          下载
        </button>
      </div>
    </section>
  );
}

export function AgentChatPanel({
  stage,
  project,
  messages,
  searchGroups,
  assets,
  draft,
  points,
  user,
  cloudSessions,
  activeSessionId,
  isSavingSession,
  provider,
  visualCount,
  isBusy,
  canContinue,
  onDraftChange,
  onModeChange,
  uploadedFile,
  onUploaded,
  onSend,
  onContinue,
  onAutoRun,
  onNewSession,
  onPreview,
  onContinueEdit,
  onCopyLink,
  onRequirementSelect,
  onOpenAuth,
  onSaveSession,
  onLoadSession,
  onExport,
  onApplyReviewFixes,
  isApplyingReviewFixes,
  embedded = false
}: AgentChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("chat");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, stage, searchGroups.length]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  const modeContract = getWorkbenchModeContract(project.mode);
  const fileModeContract = project.mode === "reference" ? getWorkbenchModeContract("reference") : getWorkbenchModeContract("beautify");
  const needsUpload = stage !== "editor" && modeContract.requiresUpload && assets.length === 0;
  const composerPlaceholder = isBusy
    ? "AI 正在处理..."
    : stage === "editor"
      ? modeContract.editorPlaceholder
      : project.mode === "agent"
      ? modeContract.idlePlaceholder
      : needsUpload
        ? modeContract.idlePlaceholder
        : modeContract.idlePlaceholder;
  const sendLabel =
    stage === "idle"
      ? project.mode === "agent"
        ? modeContract.primaryActionLabel
        : needsUpload
          ? modeContract.waitingUploadLabel
          : modeContract.primaryActionLabel
      : "发送";
  const entryModeOptions: Array<{ key: "agent" | "file"; nextMode: WorkbenchMode; label: string; desc: string; active: boolean }> = [
    {
      key: "agent",
      nextMode: "agent",
      label: getWorkbenchModeContract("agent").label,
      desc: getWorkbenchModeContract("agent").description,
      active: project.mode === "agent"
    },
    {
      key: "file",
      nextMode: project.mode === "reference" ? "reference" : "beautify",
      label: fileModeContract.label,
      desc: fileModeContract.description,
      active: project.mode !== "agent"
    }
  ];

  return (
    <aside className={cn("flex h-full w-full flex-col bg-white", embedded ? "border-0 shadow-none" : "border-l border-line shadow-[0_0_40px_rgba(15,23,42,0.08)] lg:w-[520px]")}>
      <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-line px-5">
        <button type="button" onClick={onNewSession} className="flex size-10 items-center justify-center rounded-2xl text-[#667085] transition hover:bg-[#f2f4f7] hover:text-ink" aria-label="新建会话">
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex items-center rounded-[22px] border border-line bg-white p-1 shadow-sm">
          {[
            ["chat", MessageSquare, "对话"],
            ["structure", Layers3, "结构"],
            ["history", History, "历史"]
          ].map(([key, Icon, label]) => (
            <button
              key={String(key)}
              type="button"
              onClick={() => setPanelTab(key as PanelTab)}
              className={cn("flex size-10 items-center justify-center rounded-2xl transition", panelTab === key ? "bg-white text-ink shadow-sm" : "text-[#98a2b3] hover:bg-[#f8fafc] hover:text-ink")}
              aria-label={String(label)}
            >
              <Icon className="size-5" />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <button type="button" onClick={onOpenAuth} className="rounded-2xl bg-[#f8fafc] px-3 py-2 text-left transition hover:bg-[#eef4ff]">
            <div className="text-base font-semibold text-ink">{points}<span className="ml-1 text-xs text-muted">PTS</span></div>
            <div className="text-[10px] text-muted">{user ? user.email.split("@")[0] : "未登录"}</div>
          </button>
          <button type="button" onClick={onCopyLink} className="flex size-9 items-center justify-center rounded-2xl text-[#667085] transition hover:bg-[#f2f4f7] hover:text-ink" aria-label="复制访问链接">
            <Link2 className="size-5" />
          </button>
          <button type="button" onClick={onContinueEdit} className="flex size-9 items-center justify-center rounded-2xl text-[#667085] transition hover:bg-[#f2f4f7] hover:text-ink" aria-label="继续修改">
            <PanelRight className="size-5" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="thin-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
        {panelTab === "structure" ? (
          <>
            <ReviewCenterPanel project={project} onApplyReviewFixes={onApplyReviewFixes} isApplyingReviewFixes={isApplyingReviewFixes} />
            <OutlineSummary project={project} />
            <PlanningCard project={project} stage="planReady" />
            <section className="rounded-[22px] border border-line bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-ink">页面清单</div>
              <div className="mt-3 space-y-2">
                {project.slides.map((slide, index) => (
                  <div key={slide.id || `structure-${index}`} className="rounded-2xl bg-[#f8fafc] px-3 py-2">
                    <div className="text-sm font-semibold text-ink">{index + 1}. {slide.title}</div>
                    <div className="mt-1 text-xs text-muted">{slide.pageIntent || layoutLabel(slide.layout)} · {slide.sections?.length || 0} 个模块</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : panelTab === "history" ? (
          <section className="rounded-[22px] border border-line bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-ink">云端会话历史</div>
              <button type="button" onClick={onSaveSession} disabled={!user || isSavingSession} className="rounded-xl bg-[#eef4ff] px-3 py-1.5 text-xs font-semibold text-[#1462ff] disabled:opacity-50">
                {isSavingSession ? "保存中" : "保存当前"}
              </button>
            </div>
            {!user ? <div className="mt-3 rounded-2xl bg-[#fff7ed] p-3 text-sm text-[#c2410c]">登录后可保存和恢复本地数据库中的 PPT 会话。</div> : null}
            {user && cloudSessions.length ? (
              <div className="mt-3 space-y-2">
                {cloudSessions.map((session) => (
                  <button key={session.id} type="button" onClick={() => onLoadSession(session.id)} className={cn("block w-full rounded-2xl border px-3 py-3 text-left transition hover:border-[#b7d5ff]", activeSessionId === session.id ? "border-[#82b7ff] bg-[#eef6ff]" : "border-line bg-[#f8fafc]")}>
                    <div className="line-clamp-1 text-sm font-semibold text-ink">{session.title}</div>
                    <div className="mt-1 text-xs text-muted">{session.stage} · {new Date(session.updatedAt).toLocaleString("zh-CN")}</div>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-5 border-t border-line pt-4 text-sm font-semibold text-ink">本次操作记录</div>
            <div className="mt-3 space-y-2">
              {messages.length ? messages.slice().reverse().map((message) => (
                <div key={`history-${message.id}`} className="rounded-2xl bg-[#f8fafc] px-3 py-2">
                  <div className="text-xs font-semibold text-[#1462ff]">{message.role === "user" ? "用户" : "Agent"} · {message.time}</div>
                  <div className="mt-1 line-clamp-2 text-sm text-[#344054]">{message.content}</div>
                </div>
              )) : <div className="rounded-2xl bg-[#f8fafc] p-4 text-sm text-muted">暂无历史</div>}
            </div>
          </section>
        ) : (
          <>
        <div className="flex items-center justify-between rounded-2xl bg-[#f8fafc] px-4 py-3 text-sm">
          <span className="font-semibold text-ink">当前阶段</span>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#1462ff] shadow-sm">{stageLabels[stage]}</span>
        </div>

        {assets.length > 0 ? (
          <div className="rounded-[22px] border border-line bg-white p-3">
            <div className="mb-2 text-xs font-semibold text-muted">已归档资料</div>
            <div className="space-y-2">
              {assets.slice(0, 3).map((asset) => (
                <div key={asset.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f8fafc] px-3 py-2 text-xs">
                  <span className="min-w-0 truncate font-medium text-ink">{asset.name}</span>
                  <span className="shrink-0 text-muted">{asset.analysis ? `${asset.analysis.blockCount} 块` : formatFileSize(asset.size)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[86%] rounded-[24px] px-4 py-3 text-sm leading-6", message.role === "user" ? "bg-[#2f7cff] text-white" : "bg-white text-[#344054]")}>
              <div>{message.content}</div>
              <div className={cn("mt-2 text-right text-xs", message.role === "user" ? "text-white/70" : "text-[#98a2b3]")}>{message.time}</div>
            </div>
          </div>
        ))}

        {stage === "researching" ? <SpinnerLabel>正在进行背景调研，收集公开资料...</SpinnerLabel> : null}
        <ResearchCard stage={stage} searchGroups={searchGroups} />

        {stage === "requirements" ? (
          <>
            <div className="text-base leading-8 text-[#344054]">背景调研已完成。你可以确认内容侧重，也可以直接输入补充要求。</div>
            <BeautifyPlanPanel project={project} />
            <ReviewCenterPanel project={project} onApplyReviewFixes={onApplyReviewFixes} isApplyingReviewFixes={isApplyingReviewFixes} />
            <RequirementCard onSelect={onRequirementSelect} />
          </>
        ) : null}

        {stage === "outlining" ? (
          <>
            <SpinnerLabel>正在基于真实来源和上传资料生成 PPT 大纲...</SpinnerLabel>
            <section className="rounded-[22px] border border-line bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3 text-sm font-semibold text-ink">
                <Loader2 className="size-5 animate-spin text-[#2f7cff]" />
                大纲生成进行中...
              </div>
            </section>
          </>
        ) : null}

        {stage === "outlineReady" ? (
          <>
            <div className="text-base leading-8 text-[#344054]">大纲已生成，点击“继续”进入逐页资料检索和内容策划。</div>
            <BeautifyPlanPanel project={project} />
            <ReviewCenterPanel project={project} onApplyReviewFixes={onApplyReviewFixes} isApplyingReviewFixes={isApplyingReviewFixes} />
            <OutlineSummary project={project} />
          </>
        ) : null}

        {stage === "searching" ? <SpinnerLabel>正在为每一页生成搜索词并补充来源...</SpinnerLabel> : null}
        <PlanningCard project={project} stage={stage} />

        {stage === "designing" ? (
          <>
            <SpinnerLabel>正在根据策划稿生成可编辑版式...</SpinnerLabel>
            <section className="rounded-[22px] border border-line bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-ink">初版设计生成中</div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {project.slides.slice(0, 6).map((slide, index) => (
                  <div key={slide.id || `designing-${index}`} className="aspect-[16/10] rounded-xl bg-[#eef4ff] p-2">
                    <div className="h-full rounded-lg bg-white/80 p-2 text-[10px] font-semibold text-ink">{slide.title}</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {stage === "editor" ? (
          <>
            <ResultCard project={project} provider={provider} visualCount={visualCount} onPreview={onPreview} onContinueEdit={onContinueEdit} onExport={onExport} />
            <BeautifyPlanPanel project={project} />
            <ReviewCenterPanel project={project} onApplyReviewFixes={onApplyReviewFixes} isApplyingReviewFixes={isApplyingReviewFixes} />
          </>
        ) : null}

        {canContinue ? (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={onAutoRun} disabled={isBusy} className="h-14 rounded-[22px] border border-[#cfe2ff] bg-[#eef6ff] px-4 text-sm font-semibold text-[#1462ff] shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">
              自动跑完整流程
            </button>
            <button type="button" onClick={onContinue} disabled={isBusy} className="h-14 rounded-[22px] bg-[#2f7cff] px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">
              继续
            </button>
          </div>
        ) : null}
          </>
        )}
      </div>

      <footer className="shrink-0 border-t border-line bg-white p-5">
        <div className="rounded-[26px] border border-line bg-white p-3 shadow-sm">
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl bg-[#f8fafc] p-1">
            {entryModeOptions.map((item) => {
              const active = item.active;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onModeChange(item.nextMode)}
                  disabled={isBusy || stage !== "idle"}
                  className={cn("rounded-2xl px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60", active ? "bg-white text-ink shadow-sm" : "text-[#667085] hover:bg-white/70 hover:text-ink")}
                >
                  <div className="text-sm font-bold">{item.label}</div>
                  <div className="mt-0.5 text-[11px]">{item.desc}</div>
                </button>
              );
            })}
          </div>
          <div className="mb-3 rounded-2xl border border-line bg-[#f8fafc] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-ink">{modeContract.label}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#1462ff]">{modeContract.acceptedHint}</span>
            </div>
            <div className="mt-1 text-[11px] leading-4 text-muted">{modeContract.tagline}</div>
          </div>
          {project.mode !== "agent" && stage === "idle" ? (
            <div className="mb-3">
              <UploadPPTCard uploadedFile={uploadedFile} onUploaded={onUploaded} compact />
            </div>
          ) : null}
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isBusy}
            placeholder={composerPlaceholder}
            className="h-20 w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-6 text-ink placeholder:text-[#98a2b3] focus:ring-0"
            maxLength={2000}
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-muted">
              {needsUpload
                ? `${modeContract.helperText}；也可以切回 Agent 模式从 0 生成。`
                : "按 Enter 发送，Shift + Enter 换行"}
            </div>
            <button type="button" onClick={onSend} disabled={isBusy || !draft.trim()} className="flex h-11 items-center gap-2 rounded-2xl bg-[#eef4ff] px-4 text-sm font-semibold text-[#1462ff] transition hover:bg-[#dbeafe] disabled:cursor-not-allowed disabled:text-[#98a2b3]">
              {sendLabel}
              {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
        </div>
      </footer>
    </aside>
  );
}
