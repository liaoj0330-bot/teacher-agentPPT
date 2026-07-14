import type pptxgen from "pptxgenjs";
import type { RenderElement, RenderScene } from "@/lib/visual-compiler/contracts";

const COLORS = {
  ink: "172033",
  muted: "667085",
  line: "D9E2F1",
  soft: "F3F7FD",
  accent: "2F6FEC",
  accent2: "6AA6FF",
  white: "FFFFFF"
} as const;

function chartRows(data: unknown) {
  if (!Array.isArray(data)) return [];
  return data.slice(0, 6).map((item, index) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const raw = Number(record.value ?? record.amount ?? record.count ?? 20 + index * 12);
    return { label: String(record.label ?? record.name ?? record.category ?? `数据 ${index + 1}`), value: Number.isFinite(raw) ? raw : 20 + index * 12 };
  });
}

function addTextElement(slide: pptxgen.Slide, element: Extract<RenderElement, { kind: "text" }>) {
  slide.addText(element.text || "", {
    x: element.bounds.x,
    y: element.bounds.y,
    w: element.bounds.width,
    h: element.bounds.height,
    fontFace: "Microsoft YaHei",
    fontSize: element.fontSizePt || (element.role === "title" ? 28 : 17),
    bold: element.role === "title",
    color: element.role === "meta" ? COLORS.muted : COLORS.ink,
    margin: 0.04,
    breakLine: true,
    valign: element.role === "title" ? "middle" : "top",
    fit: "shrink"
  });
}

function addTableElement(pptx: pptxgen, slide: pptxgen.Slide, element: Extract<RenderElement, { kind: "table" }>) {
  const rows = [element.columns, ...element.rows.slice(0, 7)];
  const columnCount = Math.max(1, element.columns.length);
  const cellWidth = element.bounds.width / columnCount;
  const cellHeight = element.bounds.height / Math.max(1, rows.length);
  rows.forEach((row, rowIndex) => row.slice(0, columnCount).forEach((cell, columnIndex) => {
    const x = element.bounds.x + columnIndex * cellWidth;
    const y = element.bounds.y + rowIndex * cellHeight;
    slide.addShape(pptx.ShapeType.rect, { x, y, w: cellWidth, h: cellHeight, fill: { color: rowIndex === 0 ? "EAF1FF" : rowIndex % 2 ? COLORS.white : COLORS.soft }, line: { color: COLORS.line, width: 0.6 } });
    slide.addText(String(cell ?? ""), { x: x + 0.06, y: y + 0.03, w: Math.max(0.1, cellWidth - 0.12), h: Math.max(0.1, cellHeight - 0.06), fontFace: "Microsoft YaHei", fontSize: rowIndex === 0 ? 10 : 9, bold: rowIndex === 0, color: rowIndex === 0 ? "22456F" : COLORS.ink, margin: 0.02, fit: "shrink", valign: "middle" });
  }));
}

function addChartElement(pptx: pptxgen, slide: pptxgen.Slide, element: Extract<RenderElement, { kind: "chart" }>) {
  slide.addShape(pptx.ShapeType.roundRect, { x: element.bounds.x, y: element.bounds.y, w: element.bounds.width, h: element.bounds.height, rectRadius: 0.05, fill: { color: COLORS.white }, line: { color: COLORS.line, width: 0.8 } });
  const rows = chartRows(element.data);
  if (!rows.length) {
    slide.addText("可编辑图表区域", { x: element.bounds.x + 0.2, y: element.bounds.y + element.bounds.height / 2 - 0.15, w: element.bounds.width - 0.4, h: 0.3, fontFace: "Microsoft YaHei", fontSize: 11, color: COLORS.muted, align: "center", margin: 0 });
    return;
  }
  const max = Math.max(1, ...rows.map((row) => row.value));
  const left = element.bounds.x + Math.min(1.1, element.bounds.width * 0.28);
  const usableWidth = Math.max(0.4, element.bounds.width - (left - element.bounds.x) - 0.3);
  const rowHeight = element.bounds.height / (rows.length + 0.6);
  rows.forEach((row, index) => {
    const y = element.bounds.y + 0.18 + index * rowHeight;
    slide.addText(row.label, { x: element.bounds.x + 0.12, y, w: Math.max(0.45, left - element.bounds.x - 0.18), h: Math.max(0.16, rowHeight * 0.55), fontFace: "Microsoft YaHei", fontSize: 8, color: COLORS.ink, margin: 0, fit: "shrink", valign: "middle" });
    slide.addShape(pptx.ShapeType.roundRect, { x: left, y: y + 0.03, w: usableWidth, h: Math.max(0.1, rowHeight * 0.34), rectRadius: 0.02, fill: { color: "E9EEF6" }, line: { color: "E9EEF6" } });
    slide.addShape(pptx.ShapeType.roundRect, { x: left, y: y + 0.03, w: Math.max(0.08, usableWidth * (row.value / max)), h: Math.max(0.1, rowHeight * 0.34), rectRadius: 0.02, fill: { color: index % 2 ? COLORS.accent2 : COLORS.accent }, line: { color: index % 2 ? COLORS.accent2 : COLORS.accent } });
  });
}

function addElement(pptx: pptxgen, slide: pptxgen.Slide, element: RenderElement) {
  if (element.kind === "text") return addTextElement(slide, element);
  if (element.kind === "table") return addTableElement(pptx, slide, element);
  if (element.kind === "chart") return addChartElement(pptx, slide, element);
  if (element.kind === "image") {
    const input = element.source.startsWith("data:") ? { data: element.source } : { path: element.source };
    slide.addImage({ ...input, x: element.bounds.x, y: element.bounds.y, w: element.bounds.width, h: element.bounds.height, sizing: { type: element.fit, x: element.bounds.x, y: element.bounds.y, w: element.bounds.width, h: element.bounds.height } });
    return;
  }
  const shape = element.shape === "ellipse" ? pptx.ShapeType.ellipse : element.shape === "line" ? pptx.ShapeType.line : pptx.ShapeType.rect;
  slide.addShape(shape, { x: element.bounds.x, y: element.bounds.y, w: element.bounds.width, h: element.bounds.height, fill: element.shape === "line" ? undefined : { color: (element.fill || COLORS.soft).replace("#", "") }, line: { color: (element.stroke || element.fill || COLORS.line).replace("#", ""), width: 0.8 } });
}

/** Render every scene as native, editable PowerPoint objects. */
export function addRenderScenesToPptx(pptx: pptxgen, scenes: RenderScene[]) {
  [...scenes].sort((left, right) => left.page - right.page).forEach((scene) => {
    const slide = pptx.addSlide();
    slide.background = { color: "F7FAFF" };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: scene.canvas.width, h: scene.canvas.height, fill: { color: "F7FAFF" }, line: { color: "F7FAFF" } });
    slide.addShape(pptx.ShapeType.ellipse, { x: scene.canvas.width - 4.3, y: -1.05, w: 4.8, h: 4.1, fill: { color: "DCE9FF", transparency: 42 }, line: { color: "DCE9FF", transparency: 100 } });
    [...scene.elements].sort((left, right) => left.zIndex - right.zIndex).forEach((element) => addElement(pptx, slide, element));
    slide.addText(String(scene.page).padStart(2, "0"), { x: scene.canvas.width - 0.9, y: scene.canvas.height - 0.42, w: 0.45, h: 0.2, fontFace: "Microsoft YaHei", fontSize: 8, bold: true, color: COLORS.muted, align: "right", margin: 0 });
  });
}
