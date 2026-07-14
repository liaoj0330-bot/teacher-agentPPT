"use client";

import { ArrowUpRight, BarChart3, Building2, MapPinned, Shapes } from "lucide-react";
import { cn } from "@/lib/utils";

type CaseGalleryProps = {
  onSelectCase: (prompt: string) => void;
};

const cases = [
  {
    title: "北京 5 日游攻略",
    category: "生活常用",
    prompt: "帮我做一份北京 5 日游攻略 PPT，包含每日路线、景点亮点、交通建议、美食推荐和预算安排。",
    theme: "travel",
    icon: MapPinned
  },
  {
    title: "正泰电器企业介绍 PPT",
    category: "企业介绍",
    prompt: "帮我做一份正泰电器企业介绍 PPT，突出企业发展历程、核心业务、技术实力、市场布局和未来战略。",
    theme: "business",
    icon: Building2
  },
  {
    title: "Dify 产品介绍 PPT",
    category: "产品介绍",
    prompt: "帮我做一份 Dify 产品介绍 PPT，面向企业客户，包含产品定位、核心功能、应用场景、架构优势和案例。",
    theme: "product",
    icon: Shapes
  },
  {
    title: "小米 2025 Q3 季度财报分析",
    category: "根据 PDF 生成 PPT",
    prompt: "帮我做一份小米 2025 Q3 季度财报分析 PPT，包含收入结构、利润表现、业务亮点、风险与展望。",
    theme: "finance",
    icon: BarChart3
  }
];

function CoverPreview({ theme, title, category }: { theme: string; title: string; category: string }) {
  return (
    <div
      className={cn(
        "ppt-cover-grid relative aspect-[16/10] overflow-hidden rounded-[18px] border border-white/70 p-4",
        theme === "travel" && "bg-[linear-gradient(135deg,#eff6ff_0%,#dff7ee_52%,#ffffff_100%)]",
        theme === "business" && "bg-[linear-gradient(135deg,#f7f8fb_0%,#e8ecf5_52%,#ffffff_100%)]",
        theme === "product" && "bg-[linear-gradient(135deg,#f4f6ff_0%,#eef7ff_52%,#ffffff_100%)]",
        theme === "finance" && "bg-[linear-gradient(135deg,#fff7ed_0%,#f1f5ff_56%,#ffffff_100%)]"
      )}
    >
      <div className="absolute right-[-36px] top-[-42px] size-32 rounded-full border border-white/80 bg-white/40" />
      <div className="absolute bottom-[-46px] left-[-28px] h-28 w-44 rounded-full border border-white/80 bg-white/50" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-white/75 px-2.5 py-1 text-[10px] font-medium text-muted shadow-sm">
            {category}
          </span>
          <span className="h-2 w-14 rounded-full bg-ink/18" />
        </div>
        <div>
          <div className="mb-3 grid grid-cols-5 gap-1.5">
            {[52, 72, 38, 86, 64].map((height, index) => (
              <span
                key={index}
                className="block rounded-full bg-white/80 shadow-sm"
                style={{ height: `${height}px` }}
              />
            ))}
          </div>
          <div className="max-w-[78%] text-[17px] font-semibold leading-6 text-ink">{title}</div>
          <div className="mt-2 h-1.5 w-20 rounded-full bg-[#5267ff]/70" />
        </div>
      </div>
    </div>
  );
}

export function CaseGallery({ onSelectCase }: CaseGalleryProps) {
  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-normal text-ink">生成案例</h2>
        <span className="text-xs text-muted">点击案例自动填充需求</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cases.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.title}
              type="button"
              onClick={() => onSelectCase(item.prompt)}
              className="group rounded-[24px] border border-line bg-white p-2.5 text-left shadow-sm transition hover:-translate-y-1 hover:border-[#b9c7ff] hover:shadow-lift"
            >
              <CoverPreview theme={item.theme} title={item.title} category={item.category} />
              <div className="flex items-start gap-3 px-2 py-3">
                <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-[#f2f5ff] text-[#4258df]">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{item.title}</div>
                  <div className="mt-1 text-xs text-muted">{item.category}</div>
                </div>
                <ArrowUpRight className="mt-1 size-4 text-[#a1a7b3] transition group-hover:text-[#5267ff]" />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
