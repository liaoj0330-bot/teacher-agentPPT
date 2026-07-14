"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Crosshair,
  FileText,
  Layers3,
  Search,
  Sparkles,
  UploadCloud,
  X
} from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CanvasProject, DesignSlide, OutlineItem, PlanItem, ResearchItem, UploadedAsset } from "@/lib/canvas-data";
import { layoutLabel } from "@/lib/ppt-labels";
import { cn, formatFileSize } from "@/lib/utils";

type NodeData = {
  project: CanvasProject;
  assets: UploadedAsset[];
  collapsedNodeIds: string[];
  focusNodeId: string | null;
  onProjectChange: (project: CanvasProject) => void;
  onSearchMore: () => void;
  onRemoveAsset: (id: string) => void;
  onToggleNodeCollapse: (id: string) => void;
  onFocusNode: (id: string | null) => void;
};

function Shell({
  nodeId,
  data,
  title,
  icon,
  children,
  className
}: {
  nodeId: string;
  data: NodeData;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const collapsed = data.collapsedNodeIds.includes(nodeId);
  const focused = data.focusNodeId === nodeId;
  return (
    <div className={cn("canvas-node w-[360px] rounded-[22px] border bg-white shadow-panel transition", focused ? "border-[#2f7cff] ring-4 ring-[#2f7cff]/10" : "border-line", className)}>
      <Handle type="target" position={Position.Left} className="!border-white !bg-[#6674ff]" />
      <Handle type="source" position={Position.Right} className="!border-white !bg-[#6674ff]" />
      <div className="flex items-center justify-between border-b border-line/80 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-[#f2f5ff] text-[#4258df]">{icon}</span>
          <div className="text-sm font-semibold text-ink">{title}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => data.onFocusNode(focused ? null : nodeId)} className="nodrag flex size-8 items-center justify-center rounded-xl text-[#667085] transition hover:bg-[#f2f4f7] hover:text-ink" aria-label={`聚焦${title}`}>
            <Crosshair className="size-4" />
          </button>
          <button type="button" onClick={() => data.onToggleNodeCollapse(nodeId)} className="nodrag flex size-8 items-center justify-center rounded-xl text-[#667085] transition hover:bg-[#f2f4f7] hover:text-ink" aria-label={collapsed ? `展开${title}` : `折叠${title}`}>
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          <span className="rounded-full bg-[#f8fafc] px-2.5 py-1 text-[11px] font-semibold text-[#667085]">可编辑</span>
        </div>
      </div>
      {collapsed ? (
        <button type="button" onClick={() => data.onToggleNodeCollapse(nodeId)} className="nodrag block w-full p-4 text-left text-xs leading-5 text-muted">
          当前节点已折叠。点击展开后继续查看和编辑本阶段内容。
        </button>
      ) : (
        <div className="p-4">{children}</div>
      )}
    </div>
  );
}

export function BriefNode({ data, id }: NodeProps) {
  const nodeData = data as NodeData;
  const { project, assets } = nodeData;

  return (
    <Shell nodeId={id} data={nodeData} title="任务简报" icon={<Sparkles className="size-4" />}>
      <textarea
        value={project.prompt}
        onChange={(event) => nodeData.onProjectChange({ ...project, prompt: event.target.value })}
        className="nodrag min-h-[128px] w-full resize-none rounded-2xl border border-line bg-[#fafbfe] px-3 py-3 text-sm leading-6 text-ink focus:border-[#8090ff] focus:ring-[#8090ff]"
      />
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-2xl bg-[#f7f8fb] px-3 py-2">
          <div className="text-muted">模式</div>
          <div className="mt-1 font-semibold text-ink">{project.mode === "agent" ? "Agent" : project.mode === "reference" ? "参考资料" : "PPT 美化"}</div>
        </div>
        <div className="rounded-2xl bg-[#f7f8fb] px-3 py-2">
          <div className="text-muted">资料</div>
          <div className="mt-1 font-semibold text-ink">{assets.length} 个</div>
        </div>
        <div className="rounded-2xl bg-[#f7f8fb] px-3 py-2">
          <div className="text-muted">页数</div>
          <div className="mt-1 font-semibold text-ink">{project.slides.length} 页</div>
        </div>
      </div>
    </Shell>
  );
}

export function OutlineNode({ data, id }: NodeProps) {
  const nodeData = data as NodeData;
  const { project } = nodeData;

  const updateItem = (id: string, patch: Partial<OutlineItem>) => {
    nodeData.onProjectChange({
      ...project,
      outline: project.outline.map((item) => (item.id === id ? { ...item, ...patch } : item))
    });
  };

  return (
    <Shell nodeId={id} data={nodeData} title="便签式大纲" icon={<Layers3 className="size-4" />}>
      <div className="space-y-2">
        {project.outline.map((item, index) => (
          <div key={item.id || `outline-${index}`} className="rounded-2xl border border-line bg-[#fbfcff] p-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted">
              <span className="flex size-6 items-center justify-center rounded-full bg-white font-semibold text-[#4258df]">{item.page}</span>
              第 {item.page} 页
            </div>
            <input
              value={item.title}
              onChange={(event) => updateItem(item.id, { title: event.target.value })}
              className="nodrag h-9 w-full rounded-xl border-line bg-white px-3 text-sm font-medium focus:border-[#8090ff] focus:ring-[#8090ff]"
            />
            <textarea
              value={item.note}
              onChange={(event) => updateItem(item.id, { note: event.target.value })}
              className="nodrag mt-2 min-h-[52px] w-full resize-none rounded-xl border-line bg-white px-3 py-2 text-xs leading-5 text-muted focus:border-[#8090ff] focus:ring-[#8090ff]"
            />
            {item.evidenceBlockIds?.length ? <div className="mt-2 text-[11px] text-[#4258df]">证据块：{item.evidenceBlockIds.slice(0, 3).join(" / ")}</div> : null}
          </div>
        ))}
      </div>
    </Shell>
  );
}

function ConfidenceBlocks({ items }: { items: ResearchItem[] }) {
  return (
    <div className="grid grid-cols-8 gap-1.5">
      {items.flatMap((item) =>
        Array.from({ length: 5 }, (_, index) => {
          const score = Math.max(18, Math.min(96, item.confidence - index * 7));
          return (
            <span
              key={`${item.id}-${index}`}
              title={`${item.title} ${score}%`}
              className="h-5 rounded-md"
              style={{ backgroundColor: `rgba(82, 103, 255, ${score / 120})` }}
            />
          );
        })
      )}
    </div>
  );
}

export function ResearchNode({ data, id }: NodeProps) {
  const nodeData = data as NodeData;
  const { project } = nodeData;
  const weakCount = project.research.filter((item) => item.confidence < 60).length;

  return (
    <Shell nodeId={id} data={nodeData} title="资料模块" icon={<Search className="size-4" />} className="w-[410px]">
      <div className="rounded-2xl bg-[#f7f8fb] p-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-ink">检索结果置信度</span>
          <span className="text-muted">颜色越深越可靠</span>
        </div>
        <ConfidenceBlocks items={project.research} />
      </div>

      {weakCount > 0 ? (
        <div className="mt-3 flex gap-2 rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-3 text-xs leading-5 text-[#92400e]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>有 {weakCount} 组资料置信度偏低，建议补充关键词或上传参考文件。</span>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {project.research.map((item, index) => (
          <article key={item.id || `research-${index}`} className="rounded-2xl border border-line bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-ink">{item.title}</div>
                <div className="mt-1 text-xs text-muted">{item.sourceName || item.source}</div>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-1 text-[11px] font-semibold",
                  item.confidence >= 80 && "bg-[#ecfdf3] text-[#027a48]",
                  item.confidence >= 60 && item.confidence < 80 && "bg-[#eff6ff] text-[#175cd3]",
                  item.confidence < 60 && "bg-[#fff7ed] text-[#c2410c]"
                )}
              >
                {item.confidence}%
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">{item.summary}</p>
            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer" className="nodrag mt-2 block truncate rounded-xl bg-[#f8fafc] px-2.5 py-1.5 text-[11px] font-medium text-[#4258df] transition hover:bg-[#eef2ff]">
                {item.status === "verified" ? "已验证来源" : "公开来源"} · {item.url}
              </a>
            ) : null}
          </article>
        ))}
      </div>

      <button type="button" onClick={nodeData.onSearchMore} className="nodrag mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-xs font-semibold text-white transition hover:-translate-y-0.5">
        <Search className="size-4" />
        补充检索
      </button>
    </Shell>
  );
}

export function PlanNode({ data, id }: NodeProps) {
  const nodeData = data as NodeData;
  const { project } = nodeData;

  const updateItem = (id: string, patch: Partial<PlanItem>) => {
    nodeData.onProjectChange({
      ...project,
      plan: project.plan.map((item) => (item.id === id ? { ...item, ...patch } : item))
    });
  };

  return (
    <Shell nodeId={id} data={nodeData} title="内容策划稿" icon={<FileText className="size-4" />} className="w-[410px]">
      <div className="space-y-3">
        {project.plan.map((item, index) => (
          <article key={item.id || `plan-${index}`} className="rounded-2xl border border-line bg-[#fbfcff] p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#4258df]">Page {item.page}</span>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] text-muted shadow-sm">可编辑</span>
            </div>
            <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} className="nodrag mt-2 h-9 w-full rounded-xl border-line bg-white px-3 text-sm font-semibold focus:border-[#8090ff] focus:ring-[#8090ff]" />
            <div className="mt-2 rounded-xl border border-line bg-white px-3 py-2 text-xs font-semibold text-muted">{layoutLabel(item.layout)}</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.elements.map((element, elementIndex) => (
                <span key={`${element}-${elementIndex}`} className="rounded-full bg-white px-2.5 py-1 text-[11px] text-muted shadow-sm">
                  {element}
                </span>
              ))}
            </div>
            {item.evidenceBlockIds?.length ? <div className="mt-2 text-[11px] text-[#4258df]">映射：{item.evidenceBlockIds.slice(0, 4).join(" / ")}</div> : null}
          </article>
        ))}
      </div>
    </Shell>
  );
}

function SlidePreview({ slide, index }: { slide: DesignSlide; index: number }) {
  return (
    <div className="aspect-[16/10] rounded-2xl border border-line bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_52%,#ffffff_100%)] p-3 shadow-sm">
      <div className="flex h-full flex-col justify-between rounded-xl bg-white/70 p-3">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-ink px-2 py-1 text-[10px] font-semibold text-white">{String(index + 1).padStart(2, "0")}</span>
          <span className="h-1.5 w-14 rounded-full bg-[#5267ff]/40" />
        </div>
        <div>
          <div className="line-clamp-2 text-sm font-semibold leading-5 text-ink">{slide.title}</div>
          <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted">{slide.pageIntent || layoutLabel(slide.layout)}</div>
        </div>
      </div>
    </div>
  );
}

export function DesignNode({ data, id }: NodeProps) {
  const nodeData = data as NodeData;

  return (
    <Shell nodeId={id} data={nodeData} title="设计预览" icon={<BarChart3 className="size-4" />} className="w-[430px]">
      <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-2xl bg-[#f7f8fb] p-3">
          <div className="text-muted">初稿</div>
          <div className="mt-1 font-semibold text-ink">已生成</div>
        </div>
        <div className="rounded-2xl bg-[#f7f8fb] p-3">
          <div className="text-muted">版式</div>
          <div className="mt-1 font-semibold text-ink">多样化</div>
        </div>
        <div className="rounded-2xl bg-[#f7f8fb] p-3">
          <div className="text-muted">导出</div>
          <div className="mt-1 font-semibold text-ink">PPTX</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {nodeData.project.slides.slice(0, 6).map((slide, index) => (
          <SlidePreview key={slide.id || `slide-${index}`} slide={slide} index={index} />
        ))}
      </div>
    </Shell>
  );
}

export function AssetsNode({ data, id }: NodeProps) {
  const nodeData = data as NodeData;

  return (
    <Shell nodeId={id} data={nodeData} title="文件资料" icon={<UploadCloud className="size-4" />}>
      {nodeData.assets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-[#fafbfe] px-4 py-8 text-center text-sm text-muted">
          上传 PPT、PDF、Word 或图片后，会自动解析为内容块并归拢到画布
        </div>
      ) : (
        <div className="space-y-2">
          {nodeData.assets.map((asset) => (
            <div key={asset.id} className="flex items-center gap-3 rounded-2xl border border-line bg-[#fbfcff] p-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-white text-[#4258df] shadow-sm">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{asset.name}</div>
                <div className="mt-1 text-xs text-muted">
                  {asset.type} · {formatFileSize(asset.size)}
                  {asset.analysis ? ` · ${asset.analysis.blockCount} 个内容块` : ""}
                </div>
              </div>
              <CheckCircle2 className="size-4 text-[#12b76a]" />
              <button type="button" onClick={() => nodeData.onRemoveAsset(asset.id)} className="nodrag flex size-7 items-center justify-center rounded-xl text-muted transition hover:bg-white hover:text-ink" aria-label="移除资料">
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
