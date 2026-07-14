"use client";

import { ArrowUpRight, Loader2, SendHorizontal, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type HeroComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  maxLength?: number;
};

export function HeroComposer({
  value,
  onChange,
  onGenerate,
  isGenerating,
  maxLength = 2000
}: HeroComposerProps) {
  const reachedLimit = value.length >= maxLength;

  return (
    <section className="mx-auto w-full max-w-4xl pt-9 md:pt-16">
      <div className="text-center">
        <div className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-muted shadow-sm">
          <Sparkles className="size-3.5 text-[#5267ff]" />
          AI Presentation Agent
        </div>
        <h1 className="text-[30px] font-semibold tracking-normal text-ink sm:text-[38px]">
          下午好，有什么 PPT 需要我做？
        </h1>
        <p className="mt-3 text-base text-muted sm:text-lg">AI 生成定制级、可编辑的 PPT</p>
      </div>

      <div className="glass-panel mt-9 rounded-[24px] p-3">
        <div className="relative rounded-[20px] bg-white">
          <textarea
            value={value}
            maxLength={maxLength}
            onChange={(event) => onChange(event.target.value)}
            placeholder="描述你的 PPT 需求，例如：帮我做一份产品介绍 PPT，面向企业客户"
            className="min-h-[178px] w-full resize-none rounded-[20px] border-0 bg-transparent px-5 py-5 pb-16 text-[15px] leading-7 text-ink outline-none placeholder:text-[#a1a7b3] focus:ring-0"
          />
          <div className="absolute bottom-4 left-5 right-4 flex items-center justify-between gap-4">
            <div className={cn("text-xs", reachedLimit ? "text-[#d94646]" : "text-muted")}>
              {value.length} 字 / {maxLength} 字
            </div>
            <button
              type="button"
              disabled={isGenerating}
              onClick={onGenerate}
              className={cn(
                "flex h-11 min-w-[108px] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-white shadow-sm transition",
                "bg-[linear-gradient(135deg,#171719_0%,#3443e8_100%)] hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0",
                isGenerating && "cursor-not-allowed opacity-80 hover:translate-y-0"
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  生成中
                </>
              ) : (
                <>
                  <SendHorizontal className="size-4" />
                  生成
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-4 flex w-full max-w-3xl flex-wrap items-center justify-center gap-2 text-xs text-muted">
        {["Agent 模式", "PPT 美化", "上传已有 PPT", "根据 PDF 生成 PPT"].map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 shadow-sm"
          >
            {tag}
            <ArrowUpRight className="size-3" />
          </span>
        ))}
      </div>
    </section>
  );
}
