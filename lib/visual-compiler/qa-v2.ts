import type { LayoutContract, RenderElement, RenderScene, VisualQAIssue, VisualQAReport, VisualRect } from "@/lib/visual-compiler/contracts";

// Text measurement and overlap tolerance follow the engineering approach used
// by siril9/presentation-skill (MIT), rewritten for our RenderScene contract.
const MIN_OVERLAP_IN = 0.02;

export type SceneDensityMetric = {
  sceneId: string;
  occupiedAreaRatio: number;
  textCapacityRatio: number;
  score: number;
};

export type VisualQAReportV2 = Omit<VisualQAReport, "schemaVersion"> & {
  schemaVersion: "teacher-visual-qa/v2";
  density: SceneDensityMetric[];
};

function overlapAmount(a: VisualRect, b: VisualRect) {
  const x = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return x > MIN_OVERLAP_IN && y > MIN_OVERLAP_IN ? Math.min(x, y) : 0;
}

function estimateTextLines(text: string, fontSizePt: number, boxWidthIn: number) {
  if (!text.trim()) return 0;
  const averageCharacterWidth = Math.max(0.055, (fontSizePt / 72) * 0.56);
  const charactersPerLine = Math.max(10, Math.floor(Math.max(0.2, boxWidthIn - 0.08) / averageCharacterWidth));
  return text.split(/\n+/).reduce((sum, paragraph) => sum + Math.max(1, Math.ceil(paragraph.trim().length / charactersPerLine)), 0);
}

function estimatedTextHeight(element: Extract<RenderElement, { kind: "text" }>) {
  const fontSizePt = element.fontSizePt || (element.role === "title" ? 28 : element.role === "caption" ? 10 : 16);
  return estimateTextLines(element.text, fontSizePt, element.bounds.width) * (fontSizePt / 72) * 1.18;
}

function isOutOfBounds(element: RenderElement, scene: RenderScene) {
  const box = element.bounds;
  return box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0 || box.x + box.width > scene.canvas.width || box.y + box.height > scene.canvas.height;
}

function densityMetric(scene: RenderScene, layout: LayoutContract | undefined): SceneDensityMetric {
  const canvasArea = scene.canvas.width * scene.canvas.height;
  const occupiedArea = scene.elements.reduce((sum, element) => sum + Math.max(0, element.bounds.width * element.bounds.height), 0);
  const textLength = scene.elements.reduce((sum, element) => sum + (element.kind === "text" ? element.text.length : 0), 0);
  const capacity = Math.max(1, layout?.constraints.maxCharacters || 420);
  const occupiedAreaRatio = Math.min(1, occupiedArea / canvasArea);
  const textCapacityRatio = Math.min(1.5, textLength / capacity);
  return {
    sceneId: scene.sceneId,
    occupiedAreaRatio: Number(occupiedAreaRatio.toFixed(3)),
    textCapacityRatio: Number(textCapacityRatio.toFixed(3)),
    score: Number(Math.min(100, (occupiedAreaRatio * 0.55 + Math.min(1, textCapacityRatio) * 0.45) * 100).toFixed(1))
  };
}

export function validateRenderScenesV2(scenes: RenderScene[], layouts: LayoutContract[]): VisualQAReportV2 {
  const issues: VisualQAIssue[] = [];
  const layoutById = new Map(layouts.map((layout) => [layout.layoutId, layout]));
  const density = scenes.map((scene) => densityMetric(scene, layoutById.get(scene.layoutId)));
  for (const scene of scenes) {
    const layout = layoutById.get(scene.layoutId);
    for (const element of scene.elements) {
      if (isOutOfBounds(element, scene)) issues.push({ issueId: `${scene.sceneId}:bounds:${element.elementId}`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "error", code: "OUT_OF_BOUNDS", message: "元素超出幻灯片画布", elementIds: [element.elementId] });
      if (element.kind === "text" && element.role !== "meta" && !element.editable) issues.push({ issueId: `${scene.sceneId}:editable:${element.elementId}`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "error", code: "UNEDITABLE_CORE_CONTENT", message: "核心文本必须保持可编辑", elementIds: [element.elementId] });
      if (element.kind === "text") {
        const minimum = element.role === "caption" ? layout?.constraints.minCaptionFontPt || 10 : element.role === "body" ? layout?.constraints.minBodyFontPt || 16 : 0;
        if (minimum && (element.fontSizePt || 0) < minimum) issues.push({ issueId: `${scene.sceneId}:font:${element.elementId}`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "warning", code: "FONT_TOO_SMALL", message: `${element.role === "body" ? "正文" : "注释"}字号低于 ${minimum}pt`, elementIds: [element.elementId] });
        const estimatedHeight = estimatedTextHeight(element);
        if (estimatedHeight > element.bounds.height) issues.push({ issueId: `${scene.sceneId}:overflow:${element.elementId}`, sceneId: scene.sceneId, slideId: scene.slideId, severity: estimatedHeight > element.bounds.height * 1.25 ? "error" : "warning", code: "TEXT_OVERFLOW", message: `预计文本高度 ${estimatedHeight.toFixed(2)}in 超出文本框 ${element.bounds.height.toFixed(2)}in`, elementIds: [element.elementId] });
      }
    }
    const visible = scene.elements.filter((element) => element.kind !== "shape");
    for (let left = 0; left < visible.length; left += 1) for (let right = left + 1; right < visible.length; right += 1) {
      const amount = overlapAmount(visible[left].bounds, visible[right].bounds);
      if (amount > 0) issues.push({ issueId: `${scene.sceneId}:overlap:${visible[left].elementId}:${visible[right].elementId}`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "warning", code: "OVERLAP", message: `可见内容重叠约 ${amount.toFixed(2)}in`, elementIds: [visible[left].elementId, visible[right].elementId] });
    }
    for (const slot of layout?.slots.filter((candidate) => candidate.required) || []) {
      if (!scene.elements.some((element) => element.slotId === slot.slotId)) issues.push({ issueId: `${scene.sceneId}:slot:${slot.slotId}`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "warning", code: "EMPTY_REQUIRED_SLOT", message: `必需槽位“${slot.name}”没有绑定可见内容`, elementIds: [] });
    }
    const metric = density.find((item) => item.sceneId === scene.sceneId)!;
    if (metric.textCapacityRatio > 1.05) issues.push({ issueId: `${scene.sceneId}:density:high`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "warning", code: "TEXT_OVERFLOW", message: `页面文本容量达到版式预算的 ${Math.round(metric.textCapacityRatio * 100)}%`, elementIds: [] });
  }
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;
  return { schemaVersion: "teacher-visual-qa/v2", status: errorCount ? "failed" : warningCount ? "review_required" : "passed", sceneCount: scenes.length, errorCount, warningCount, issues, density };
}
