import type { SlideLayout } from "@/lib/canvas-data";

export const layoutLabels: Record<string, string> = {
  cover: "封面页",
  agenda: "目录/结构页",
  section: "章节页",
  "day-route": "路线规划页",
  map: "交通动线页",
  cards: "卡片信息页",
  budget: "预算页",
  checklist: "检查清单页",
  split: "左右分栏页",
  matrix: "模块矩阵页",
  timeline: "时间轴页",
  stats: "数据看板页",
  comparison: "方案对比页",
  evidence: "证据页",
  quote: "观点页",
  gallery: "图集页",
  process: "流程页",
  closing: "行动收束页",
  source: "资料来源页"
};

export function layoutLabel(layout?: string | SlideLayout) {
  return layout ? layoutLabels[layout] || "内容页" : "内容页";
}
