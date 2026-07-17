"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, Loader2, MessageSquareText, Radio, XCircle } from "lucide-react";
import {
  clampTeacherBetaProgress,
  type TeacherBetaOperations,
  type TeacherBetaTaskState,
} from "@/lib/teacher-beta-operations";
import { cn } from "@/lib/utils";

type TeacherBetaOperationsPanelProps = {
  operations: TeacherBetaOperations;
  onFeedback?: () => void;
};

const taskPresentation: Record<TeacherBetaTaskState, { label: string; tone: string; icon: typeof Clock3 }> = {
  idle: { label: "空闲", tone: "text-[#667085]", icon: Clock3 },
  queued: { label: "排队中", tone: "text-[#175cd3]", icon: Clock3 },
  running: { label: "处理中", tone: "text-[#175cd3]", icon: Loader2 },
  succeeded: { label: "已完成", tone: "text-[#027a48]", icon: CheckCircle2 },
  failed: { label: "需要处理", tone: "text-[#b42318]", icon: XCircle },
};

export function TeacherBetaOperationsPanel({ operations, onFeedback }: TeacherBetaOperationsPanelProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const task = taskPresentation[operations.task.state];
  const TaskIcon = task.icon;
  const progress = clampTeacherBetaProgress(operations.task.progress);
  const quotaUnit = operations.quota.unit || "次生成";

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return <div ref={rootRef} className="relative shrink-0" data-testid="teacher-beta-operations">
    <button
      type="button"
      aria-expanded={open}
      aria-controls="teacher-beta-operations-panel"
      onClick={() => setOpen((current) => !current)}
      className={cn(
        "flex h-9 max-w-28 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors sm:max-w-40 sm:px-3",
        open ? "border-[#98a2b3] bg-[#f8fafc] text-[#171719]" : "border-[#dfe5ee] bg-white text-[#344054] hover:bg-[#f8fafc]",
      )}
    >
      <Radio className={cn("size-3.5 shrink-0", operations.task.state === "running" ? "text-[#2f7cff]" : "text-[#667085]")} />
      <span className="truncate">内测</span>
      <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
    </button>

    {open ? <section
      id="teacher-beta-operations-panel"
      aria-label="内测状态与反馈"
      className="fixed inset-x-3 top-[4.5rem] z-[80] max-h-[calc(100dvh-5.5rem)] overflow-y-auto rounded-md border border-[#dfe5ee] bg-white shadow-[0_18px_48px_rgba(20,32,52,0.18)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[360px] sm:max-w-[calc(100vw-2rem)]"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[#e7ebf1] px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="break-words text-sm font-semibold text-[#171719]">{operations.cohortLabel}</h2>
          <p className="mt-1 text-[11px] leading-4 text-[#667085]">体验数据和反馈将用于修复真实课堂问题</p>
        </div>
        <span className="shrink-0 rounded border border-[#b2ddff] bg-[#eff8ff] px-2 py-1 text-[10px] font-semibold text-[#175cd3]">内测中</span>
      </div>

      <div className="grid grid-cols-2 border-b border-[#e7ebf1]">
        <div className="min-w-0 border-r border-[#e7ebf1] px-4 py-3">
          <div className="text-[10px] font-semibold text-[#667085]">可用学科</div>
          <div className="mt-1 text-lg font-bold text-[#171719]">{operations.supportedSubjects.length}<span className="ml-1 text-[11px] font-normal text-[#667085]">科</span></div>
        </div>
        <div className="min-w-0 px-4 py-3">
          <div className="text-[10px] font-semibold text-[#667085]">剩余额度</div>
          <div className="mt-1 break-words text-lg font-bold text-[#171719]">
            {operations.quota.remaining === null ? <span className="text-sm font-semibold text-[#667085]">待配置</span> : operations.quota.remaining}
            {operations.quota.remaining !== null ? <span className="ml-1 text-[11px] font-normal text-[#667085]">{quotaUnit}</span> : null}
          </div>
          {operations.quota.total ? <div className="mt-0.5 text-[10px] text-[#98a2b3]">总额度 {operations.quota.total}</div> : null}
        </div>
      </div>

      <div className="border-b border-[#e7ebf1] px-4 py-3">
        <div className="text-[10px] font-semibold text-[#667085]">当前开放学科</div>
        <p className="mt-1.5 break-words text-[11px] leading-5 text-[#344054]">{operations.supportedSubjects.join("、") || "暂未开放"}</p>
      </div>

      <div className="border-b border-[#e7ebf1] px-4 py-3.5" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] font-semibold text-[#667085]">当前任务</div>
          <span className={cn("flex shrink-0 items-center gap-1 text-[10px] font-semibold", task.tone)}>
            <TaskIcon className={cn("size-3.5", operations.task.state === "running" && "animate-spin")} />{task.label}
          </span>
        </div>
        <div className="mt-1.5 break-words text-xs font-semibold leading-5 text-[#344054]">{operations.task.label}</div>
        {operations.task.detail ? <p className="mt-0.5 break-words text-[11px] leading-4 text-[#667085]">{operations.task.detail}</p> : null}
        {progress !== null ? <div className="mt-2.5">
          <div className="h-1.5 overflow-hidden rounded bg-[#eaecf0]"><div className="h-full bg-[#2f7cff] transition-[width]" style={{ width: `${progress}%` }} /></div>
          <div className="mt-1 text-right text-[10px] text-[#667085]">{progress}%</div>
        </div> : null}
      </div>

      <div className="px-4 py-3.5">
        <div className="text-[10px] font-semibold text-[#667085]">服务公告</div>
        {operations.notices.length ? <div className="mt-2 divide-y divide-[#eef1f6]">
          {operations.notices.map((notice) => <div key={notice.id} className="flex min-w-0 gap-2 py-2 first:pt-0 last:pb-0">
            <AlertTriangle className={cn("mt-0.5 size-3.5 shrink-0", notice.tone === "critical" ? "text-[#b42318]" : notice.tone === "warning" ? "text-[#b54708]" : "text-[#667085]")} />
            <div className="min-w-0 break-words text-[11px] leading-4"><div className="font-semibold text-[#344054]">{notice.title}</div>{notice.detail ? <div className="mt-0.5 text-[#667085]">{notice.detail}</div> : null}</div>
          </div>)}
        </div> : <p className="mt-2 text-[11px] text-[#667085]">当前没有服务公告</p>}
      </div>

      <div className="border-t border-[#e7ebf1] p-3">
        <button
          type="button"
          onClick={() => { setOpen(false); onFeedback?.(); }}
          disabled={operations.feedbackEnabled === false || !onFeedback}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#171719] px-3 text-sm font-semibold text-white hover:bg-[#2c3440] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MessageSquareText className="size-4" />提交问题或建议
        </button>
      </div>
    </section> : null}
  </div>;
}
