"use client";

import {
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  MessageSquarePlus,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

export type GenerationResult = {
  title: string;
  slides: number;
  style: string;
  status: "ready";
};

type GenerationPanelProps = {
  isVisible: boolean;
  currentStage: number;
  result: GenerationResult | null;
  error?: string;
  onPreview: () => void;
  onDownload: () => void;
  onContinueEdit: () => void;
};

const stages = ["正在理解需求", "正在生成大纲", "正在规划页面结构", "正在设计 PPT 风格", "生成完成"];

export function GenerationPanel({
  isVisible,
  currentStage,
  result,
  error,
  onPreview,
  onDownload,
  onContinueEdit
}: GenerationPanelProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <section className="rounded-[24px] border border-line bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">生成进度</h2>
          <p className="mt-1 text-xs text-muted">Agent 正在把需求转成 PPT 方案</p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4258df]">
          {result ? <CheckCircle2 className="size-5" /> : <Sparkles className="size-5 progress-pulse" />}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {stages.map((stage, index) => {
          const isDone = index < currentStage || Boolean(result);
          const isActive = index === currentStage && !result;

          return (
            <div key={stage} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs",
                  isDone && "border-[#5267ff] bg-[#5267ff] text-white",
                  isActive && "border-[#5267ff] bg-[#f4f6ff] text-[#5267ff]",
                  !isDone && !isActive && "border-line bg-[#fafbfe] text-[#a1a7b3]"
                )}
              >
                {isDone ? <Check className="size-4" /> : isActive ? <Loader2 className="size-4 animate-spin" /> : index + 1}
              </div>
              <div className={cn("text-sm", isActive || isDone ? "font-medium text-ink" : "text-muted")}>{stage}</div>
            </div>
          );
        })}
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-[#fecaca] bg-[#fff7f7] px-4 py-3 text-sm text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-5 rounded-[20px] border border-[#dfe4ee] bg-[#fbfcff] p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#4258df] shadow-sm">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">{result.title}</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-2xl bg-white px-3 py-2 shadow-sm">
                  <div className="text-muted">页数</div>
                  <div className="mt-1 font-semibold text-ink">{result.slides} 页</div>
                </div>
                <div className="rounded-2xl bg-white px-3 py-2 shadow-sm">
                  <div className="text-muted">风格</div>
                  <div className="mt-1 font-semibold text-ink">{result.style}</div>
                </div>
                <div className="rounded-2xl bg-white px-3 py-2 shadow-sm">
                  <div className="text-muted">状态</div>
                  <div className="mt-1 font-semibold text-ink">可编辑</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onPreview}
              className="flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-line bg-white text-xs font-medium transition hover:border-[#c5cffd]"
            >
              <Eye className="size-4" />
              预览
            </button>
            <button
              type="button"
              onClick={onDownload}
              className="flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-ink text-xs font-medium text-white transition hover:-translate-y-0.5"
            >
              <Download className="size-4" />
              下载 PPT
            </button>
            <button
              type="button"
              onClick={onContinueEdit}
              className="flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-line bg-white text-xs font-medium transition hover:border-[#c5cffd]"
            >
              <MessageSquarePlus className="size-4" />
              继续修改
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
