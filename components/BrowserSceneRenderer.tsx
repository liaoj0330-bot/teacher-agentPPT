"use client";

import type { CSSProperties } from "react";
import type { RenderElement, RenderScene, VisualRect } from "@/lib/visual-compiler/contracts";
import { cn } from "@/lib/utils";

function rectStyle(bounds: VisualRect, scene: RenderScene): CSSProperties {
  return {
    left: `${(bounds.x / scene.canvas.width) * 100}%`,
    top: `${(bounds.y / scene.canvas.height) * 100}%`,
    width: `${(bounds.width / scene.canvas.width) * 100}%`,
    height: `${(bounds.height / scene.canvas.height) * 100}%`
  };
}

function chartRows(data: unknown) {
  if (!Array.isArray(data)) return [];
  return data.slice(0, 6).map((item, index) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const rawValue = Number(record.value ?? record.amount ?? record.count ?? 20 + index * 12);
    return {
      label: String(record.label ?? record.name ?? record.category ?? `数据 ${index + 1}`),
      value: Number.isFinite(rawValue) ? rawValue : 20 + index * 12
    };
  });
}

function SceneElement({ element, scene }: { element: RenderElement; scene: RenderScene }) {
  const common: CSSProperties = { ...rectStyle(element.bounds, scene), zIndex: element.zIndex };

  if (element.kind === "text") {
    const pt = element.fontSizePt || (element.role === "title" ? 28 : 17);
    return (
      <div
        className={cn(
          "absolute overflow-hidden whitespace-pre-line text-[#172033]",
          element.role === "title" ? "font-bold leading-tight" : "font-medium leading-[1.45]",
          element.role === "meta" && "text-[#667085]"
        )}
        style={{ ...common, fontSize: `clamp(10px, ${(pt / 72 / scene.canvas.height) * 100}cqh, ${pt * 1.35}px)` }}
      >
        {element.text}
      </div>
    );
  }

  if (element.kind === "image") {
    return <img className="absolute rounded-[1.5cqh] bg-[#e8eef8]" style={{ ...common, objectFit: element.fit }} src={element.source} alt={element.alt} />;
  }

  if (element.kind === "shape") {
    return <div className="absolute" style={{ ...common, borderRadius: element.shape === "ellipse" ? "9999px" : undefined, background: element.fill, border: element.stroke ? `1px solid ${element.stroke}` : undefined }} />;
  }

  if (element.kind === "table") {
    return (
      <div className="absolute overflow-hidden rounded-[1.2cqh] border border-[#d9e2f1] bg-white" style={common}>
        <table className="h-full w-full table-fixed border-collapse text-[clamp(9px,1.65cqh,16px)]">
          <thead className="bg-[#eaf1ff] text-[#22456f]"><tr>{element.columns.map((column) => <th className="border-b border-[#d9e2f1] px-[1cqh] text-left" key={column}>{column}</th>)}</tr></thead>
          <tbody>{element.rows.slice(0, 7).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td className="border-b border-[#edf1f7] px-[1cqh]" key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }

  const rows = chartRows(element.data);
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="absolute flex items-end gap-[1.1cqh] rounded-[1.4cqh] border border-[#d9e2f1] bg-white/90 p-[1.5cqh]" style={common}>
      {rows.length ? rows.map((row, index) => (
        <div className="flex h-full min-w-0 flex-1 flex-col justify-end gap-[0.7cqh]" key={`${row.label}-${index}`}>
          <div className="w-full rounded-t-[0.7cqh] bg-gradient-to-t from-[#2f6fec] to-[#6aa6ff]" style={{ height: `${Math.max(12, (row.value / max) * 78)}%` }} />
          <span className="truncate text-center text-[clamp(8px,1.25cqh,12px)] text-[#526174]">{row.label}</span>
        </div>
      )) : <div className="m-auto text-[clamp(10px,1.8cqh,16px)] text-[#667085]">可编辑图表区域</div>}
    </div>
  );
}

export function BrowserSceneRenderer({ scene, className }: { scene: RenderScene; className?: string }) {
  return (
    <div
      className={cn("relative h-full w-full overflow-hidden bg-[linear-gradient(135deg,#fbfdff_0%,#f2f6fd_100%)]", className)}
      style={{ containerType: "size" }}
      data-render-scene-id={scene.sceneId}
      data-render-layout-id={scene.layoutId}
    >
      <div className="absolute right-[-5%] top-[-14%] h-[55%] w-[32%] rounded-full bg-[#dce9ff]/60" />
      {scene.elements.map((element) => (
        <div className="contents" data-element-id={element.elementId} data-slot-id={element.slotId || ""} key={element.elementId}>
          <SceneElement element={element} scene={scene} />
        </div>
      ))}
    </div>
  );
}
