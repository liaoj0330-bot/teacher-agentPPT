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
  const occupiedArea = scene.elements.reduce((sum, element) => {
    const area = Math.max(0, element.bounds.width * element.bounds.height);
    if (element.kind !== "shape") return sum + area;
    return area < canvasArea * 0.7 ? sum + area * 0.32 : sum;
  }, 0);
  const textLength = scene.elements.reduce((sum, element) => sum + (element.kind === "text" ? element.text.length : 0), 0);
  const capacity = Math.max(1, scene.composition?.maxCharacters || layout?.constraints.maxCharacters || 420);
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
      if (element.kind === "image" && !element.slotId) issues.push({ issueId: `${scene.sceneId}:anchor:${element.elementId}`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "error", code: "UNANCHORED_VISUAL", message: "图片没有绑定版式锚点", elementIds: [element.elementId] });
      if (element.kind === "text" && element.role !== "meta" && !element.editable) issues.push({ issueId: `${scene.sceneId}:editable:${element.elementId}`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "error", code: "UNEDITABLE_CORE_CONTENT", message: "核心文本必须保持可编辑", elementIds: [element.elementId] });
      if (element.kind === "text") {
        const minimum = element.role === "caption" ? layout?.constraints.minCaptionFontPt || 10 : element.role === "body" ? Math.max(layout?.constraints.minBodyFontPt || 16, scene.composition?.bodyMinPt || 16) : 0;
        if (minimum && (element.fontSizePt || 0) < minimum) issues.push({ issueId: `${scene.sceneId}:font:${element.elementId}`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "warning", code: "FONT_TOO_SMALL", message: `${element.role === "body" ? "正文" : "注释"}字号低于 ${minimum}pt`, elementIds: [element.elementId] });
        const estimatedHeight = estimatedTextHeight(element);
        if (estimatedHeight > element.bounds.height) issues.push({ issueId: `${scene.sceneId}:overflow:${element.elementId}`, sceneId: scene.sceneId, slideId: scene.slideId, severity: estimatedHeight > element.bounds.height * 1.25 ? "error" : "warning", code: "TEXT_OVERFLOW", message: `预计文本高度 ${estimatedHeight.toFixed(2)}in 超出文本框 ${element.bounds.height.toFixed(2)}in`, elementIds: [element.elementId] });
      }
    }
    const visible = scene.elements.filter((element) => element.kind !== "shape");
    for (let left = 0; left < visible.length; left += 1) for (let right = left + 1; right < visible.length; right += 1) {
      const amount = overlapAmount(visible[left].bounds, visible[right].bounds);
      if (amount > 0) {
        const imageCollision = visible[left].kind === "image" || visible[right].kind === "image";
        issues.push({ issueId: `${scene.sceneId}:overlap:${visible[left].elementId}:${visible[right].elementId}`, sceneId: scene.sceneId, slideId: scene.slideId, severity: imageCollision ? "error" : "warning", code: "OVERLAP", message: `${imageCollision ? "图片与页面内容" : "可见内容"}重叠约 ${amount.toFixed(2)}in`, elementIds: [visible[left].elementId, visible[right].elementId] });
      }
    }
    const hasSafeBodyReflow = scene.elements.some((element) => element.slotId?.startsWith(`${scene.layoutId}:generatedBody`));
    for (const slot of layout?.slots.filter((candidate) => candidate.required) || []) {
      const satisfiedByReflow = hasSafeBodyReflow && ["body", "interaction", "formula"].includes(slot.kind);
      if (!satisfiedByReflow && !scene.elements.some((element) => element.slotId === slot.slotId)) issues.push({ issueId: `${scene.sceneId}:slot:${slot.slotId}`, sceneId: scene.sceneId, slideId: scene.slideId, severity: slot.kind === "image" ? "error" : "warning", code: "EMPTY_REQUIRED_SLOT", message: `必需槽位“${slot.name}”没有绑定可见内容`, elementIds: [] });
    }
    const metric = density.find((item) => item.sceneId === scene.sceneId)!;
    const bodyBlocks = scene.elements.filter((element) => element.kind === "text" && element.role === "body").length;
    if (metric.textCapacityRatio > 1.05 || (scene.composition && bodyBlocks > scene.composition.maxBlocks)) issues.push({ issueId: `${scene.sceneId}:density:high`, sceneId: scene.sceneId, slideId: scene.slideId, severity: metric.textCapacityRatio > 1.25 ? "error" : "warning", code: "DENSITY_BUDGET_EXCEEDED", message: `页面超过构图预算：文字 ${Math.round(metric.textCapacityRatio * 100)}%，内容块 ${bodyBlocks}/${scene.composition?.maxBlocks || layout?.constraints.maxItems || 0}`, elementIds: [] });
    const minimumOccupiedRatio = scene.composition?.densityLevel === "dense" ? 0.3 : scene.composition?.densityLevel === "balanced" ? 0.22 : 0.14;
    if (scene.page > 1 && metric.occupiedAreaRatio < minimumOccupiedRatio) issues.push({ issueId: `${scene.sceneId}:density:low`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "warning", code: "UNDERFILLED_COMPOSITION", message: `页面有效占用仅 ${Math.round(metric.occupiedAreaRatio * 100)}%，低于当前构图建议的 ${Math.round(minimumOccupiedRatio * 100)}%`, elementIds: [] });
  }
  for (let start = 0; start <= scenes.length - 3; start += 1) {
    const window = scenes.slice(start, start + 3);
    const families = window.map((scene) => scene.composition?.family || scene.layoutId);
    if (new Set(families).size === 1) {
      const nextFamily = scenes[start + 3]?.composition?.family || scenes[start + 3]?.layoutId;
      const previousFamily = scenes[start - 1]?.composition?.family || scenes[start - 1]?.layoutId;
      if (nextFamily === families[0] || previousFamily === families[0]) continue;
      const scene = window.at(-1)!;
      issues.push({ issueId: `${scene.sceneId}:composition:repeat`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "warning", code: "REPETITIVE_COMPOSITION", message: `连续 3 页重复使用构图“${families[0]}”`, elementIds: [] });
      break;
    }
  }
  // A deliverable teaching deck needs more than one visual rhythm. Three
  // consecutive repeats are review-worthy; four are a hard export failure.
  for (let start = 0; start <= scenes.length - 4; start += 1) {
    const window = scenes.slice(start, start + 4);
    const families = window.map((scene) => scene.composition?.family || scene.layoutId);
    if (new Set(families).size === 1) {
      const scene = window.at(-1)!;
      issues.push({ issueId: `${scene.sceneId}:composition:repeat-hard`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "error", code: "REPETITIVE_COMPOSITION", message: `连续 4 页重复使用构图“${families[0]}”，不满足课堂课件的视觉节奏要求`, elementIds: [] });
      break;
    }
  }
  if (scenes.length >= 8) {
    const familyCounts = new Map<string, number>();
    scenes.forEach((scene) => {
      const family = scene.composition?.family || scene.layoutId;
      familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
    });
    const uniqueFamilies = familyCounts.size;
    if (uniqueFamilies < 4) {
      const scene = scenes.at(-1)!;
      issues.push({ issueId: `${scene.sceneId}:composition:variety`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "error", code: "INSUFFICIENT_COMPOSITION_VARIETY", message: `整套 ${scenes.length} 页仅使用 ${uniqueFamilies} 种构图，至少需要 4 种课堂场景构图`, elementIds: [] });
    }
    const dominant = [...familyCounts.entries()].sort((left, right) => right[1] - left[1])[0];
    if (dominant && dominant[1] / scenes.length >= 0.55) {
      const scene = scenes.at(-1)!;
      issues.push({ issueId: `${scene.sceneId}:composition:dominant`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "warning", code: "DOMINANT_COMPOSITION", message: `构图“${dominant[0]}”占 ${Math.round(dominant[1] / scenes.length * 100)}%，页面节奏可能过于机械`, elementIds: [] });
    }
  }
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;
  return { schemaVersion: "teacher-visual-qa/v2", status: errorCount ? "failed" : warningCount ? "review_required" : "passed", sceneCount: scenes.length, errorCount, warningCount, issues, density };
}
