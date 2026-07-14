"use client";

import { Brush, FileStack, Sparkles, Wand2 } from "lucide-react";

const features = [
  {
    icon: FileStack,
    title: "上传已有 PPT 进行美化",
    description: "保留原内容，优化版式、配色和视觉层级"
  },
  {
    icon: Sparkles,
    title: "Agent 模式",
    description: "理解目标、拆解大纲、规划页面结构"
  },
  {
    icon: Brush,
    title: "PPT 美化",
    description: "商务简约、汇报、产品介绍等风格快速适配"
  },
  {
    icon: Wand2,
    title: "描述需求，AI 为你生成 PPT",
    description: "从一句话到完整可编辑演示文稿"
  }
];

export function FeatureCards() {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {features.map((feature) => {
        const Icon = feature.icon;

        return (
          <article
            key={feature.title}
            className="rounded-[22px] border border-line bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#c5cffd] hover:shadow-lift"
          >
            <div className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-[#f2f5ff] text-[#4258df]">
              <Icon className="size-5" />
            </div>
            <h3 className="text-sm font-semibold text-ink">{feature.title}</h3>
            <p className="mt-2 min-h-10 text-xs leading-5 text-muted">{feature.description}</p>
          </article>
        );
      })}
    </section>
  );
}
