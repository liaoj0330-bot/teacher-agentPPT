import type { DeckSpec, DesignSlide, SlideSection, SlideSpec } from "@/lib/canvas-data";
import type { LayoutContract, LayoutSlotContract, RenderElement, RenderScene, VisualRect } from "@/lib/visual-compiler/contracts";
import { resolveLayoutRecipe, type LayoutRecipe } from "./layout-recipes.ts";
import { selectLayoutContract } from "./scene-builder.ts";

function sectionOf<T extends SlideSection["type"]>(slide: DesignSlide, type: T) {
  return slide.sections?.find((section) => section.type === type) as Extract<SlideSection, { type: T }> | undefined;
}

function contentBlocks(spec: SlideSpec, slide: DesignSlide) {
  const visible = (spec.visibleBlocks || []).map((block) => ({ title: block.title, body: block.body }));
  if (visible.length) return visible;
  const bullets = slide.bullets || [];
  if (bullets.length) return bullets.map((body) => ({ title: "", body }));
  return [{ title: "", body: spec.leadSentence || spec.claim || spec.mustProve || slide.subtitle || "" }].filter((item) => item.body);
}

function textFor(block: { title: string; body: string }) {
  const title = block.title.trim();
  const body = block.body.trim();
  const isPlanningLabel = /^(?:核心说明|要点\s*\d+|重点\s*\d+)\s*[：:]?$/.test(title);
  if (isPlanningLabel) return body;
  return title && body ? `${title}：${body}` : title || body;
}

function textUnits(text: string) {
  return Array.from(text).reduce((sum, character) => sum + (/[⺀-鿿豈-﫿＀-￯]/.test(character) ? 1 : 0.56), 0);
}

function estimatedTextHeight(text: string, fontSizePt: number, bounds: VisualRect) {
  const lineCapacity = Math.max(8, (bounds.width * 72) / fontSizePt);
  const lines = text.split(/\n+/).reduce((sum, paragraph) => sum + Math.max(1, Math.ceil(textUnits(paragraph.trim()) / lineCapacity)), 0);
  return lines * (fontSizePt / 72) * 1.24;
}

function bodyFontSize(text: string, bounds: VisualRect) {
  for (let size = 18; size >= 16; size -= 1) {
    if (estimatedTextHeight(text, size, bounds) <= bounds.height) return size;
  }
  return 16;
}

function textElement(slideId: string, slot: LayoutSlotContract, text: string, index: number): RenderElement {
  const role = slot.kind === "title" ? "title" : slot.kind === "subtitle" ? "subtitle" : slot.kind === "meta" ? "meta" : "body";
  const fontSizePt = slot.fontSizePt || (role === "title" ? 28 : role === "subtitle" ? 16 : role === "meta" ? 10 : bodyFontSize(text, slot.bounds!));
  return { kind: "text", elementId: `${slideId}:${slot.name}:${index}`, slotId: slot.slotId, bounds: slot.bounds!, zIndex: 2, editable: true, text, role, fontSizePt };
}

function isCoverSlide(spec: SlideSpec) {
  return spec.page === 1 || /封面|cover/.test(`${spec.role} ${spec.pagePurpose || ""}`);
}

function fallbackTitleSlot(layout: LayoutContract, recipe: LayoutRecipe): LayoutSlotContract {
  return {
    slotId: layout.slots.find((slot) => slot.kind === "title")?.slotId || `${layout.layoutId}:generatedTitle`,
    name: "generatedTitle",
    kind: "title",
    required: true,
    bounds: recipe.titleBounds || { x: 0.72, y: 0.42, width: 11.89, height: 0.78 },
    maxCharacters: 34,
    maxItems: 1,
    fontSizePt: recipe.typographyBudget.titlePt
  };
}

function fallbackVisualSlot(layout: LayoutContract, recipe: LayoutRecipe): LayoutSlotContract {
  return {
    slotId: `${layout.layoutId}:generatedVisual`,
    name: "generatedVisual",
    kind: "image",
    required: true,
    bounds: recipe.visualBounds,
    acceptedAspectRatios: [1, 4 / 3, 16 / 9]
  };
}

function fallbackBodySlots(layout: LayoutContract, recipe: LayoutRecipe): LayoutSlotContract[] {
  return recipe.textBounds.map((bounds, index) => ({
    slotId: `${layout.layoutId}:generatedBody-${index + 1}`,
    name: `generatedBody${index + 1}`,
    kind: "body",
    required: true,
    bounds,
    maxCharacters: Math.ceil(recipe.densityBudget.maxCharacters / recipe.textBounds.length),
    maxItems: Math.ceil(recipe.densityBudget.maxBlocks / recipe.textBounds.length),
    fontSizePt: recipe.typographyBudget.bodyPreferredPt
  }));
}

function decorationElements(slideId: string, recipe: LayoutRecipe, textBounds: VisualRect[], visualBounds?: VisualRect): RenderElement[] {
  const elements: RenderElement[] = [
    { kind: "shape", elementId: `${slideId}:accent-rule`, bounds: { x: 0.78, y: 1.31, width: 0.86, height: 0.05 }, zIndex: 0, editable: true, shape: "rect", fill: recipe.colors.accent }
  ];
  textBounds.forEach((bounds, index) => {
    elements.push({ kind: "shape", elementId: `${slideId}:content-band-${index + 1}`, bounds: { x: Math.max(0, bounds.x - 0.08), y: Math.max(0, bounds.y - 0.06), width: bounds.width + 0.16, height: bounds.height + 0.12 }, zIndex: 0, editable: true, shape: "rect", fill: index % 2 ? "FFFFFF" : recipe.colors.soft, stroke: recipe.colors.line });
    elements.push({ kind: "shape", elementId: `${slideId}:content-marker-${index + 1}`, bounds: { x: Math.max(0, bounds.x - 0.08), y: bounds.y + 0.14, width: 0.05, height: Math.min(0.42, Math.max(0.22, bounds.height * 0.18)) }, zIndex: 1, editable: true, shape: "rect", fill: recipe.colors.accent });
  });
  if (visualBounds) elements.push({ kind: "shape", elementId: `${slideId}:visual-frame`, bounds: { x: Math.max(0, visualBounds.x - 0.06), y: Math.max(0, visualBounds.y - 0.06), width: visualBounds.width + 0.12, height: visualBounds.height + 0.12 }, zIndex: 0, editable: true, shape: "rect", fill: "FFFFFF", stroke: recipe.colors.line });
  return elements;
}

function nativeVisualElements(slideId: string, recipe: LayoutRecipe, bounds: VisualRect): RenderElement[] {
  const { x, y, width: w, height: h } = bounds;
  const shape = (suffix: string, rect: VisualRect, fill: string, kind: "rect" | "ellipse" = "rect"): RenderElement => ({
    kind: "shape", elementId: `${slideId}:native-visual-${suffix}`, bounds: rect, zIndex: 1, editable: true, shape: kind, fill, stroke: recipe.colors.line
  });
  const elements: RenderElement[] = [shape("surface", { x: x + 0.12, y: y + 0.12, width: w - 0.24, height: h - 0.24 }, recipe.colors.soft)];

  if (recipe.family === "cover-hero") {
    elements.push(
      shape("panel-a", { x: x + w * 0.12, y: y + h * 0.16, width: w * 0.47, height: h * 0.58 }, "FFFFFF"),
      shape("panel-b", { x: x + w * 0.52, y: y + h * 0.31, width: w * 0.32, height: h * 0.48 }, recipe.colors.accent),
      shape("focus", { x: x + w * 0.22, y: y + h * 0.27, width: w * 0.22, height: w * 0.22 }, recipe.colors.accent, "ellipse"),
      shape("desk", { x: x + w * 0.12, y: y + h * 0.77, width: w * 0.72, height: h * 0.06 }, recipe.colors.line)
    );
    return elements;
  }

  if (["context-visual-left", "worked-example", "practice-workspace"].includes(recipe.family)) {
    const diameter = Math.min(w, h) * 0.1;
    for (let index = 0; index < 6; index += 1) {
      const column = index % 3;
      const row = Math.floor(index / 3);
      elements.push(shape(`counter-${index + 1}`, { x: x + w * (0.2 + column * 0.22), y: y + h * (0.25 + row * 0.3), width: diameter, height: diameter }, index < 3 ? recipe.colors.accent : "FFFFFF", "ellipse"));
    }
    return elements;
  }

  elements.push(
    shape("node-a", { x: x + w * 0.12, y: y + h * 0.2, width: w * 0.3, height: h * 0.24 }, "FFFFFF"),
    shape("node-b", { x: x + w * 0.58, y: y + h * 0.56, width: w * 0.3, height: h * 0.24 }, "FFFFFF"),
    shape("bridge", { x: x + w * 0.37, y: y + h * 0.46, width: w * 0.28, height: h * 0.08 }, recipe.colors.accent)
  );
  return elements;
}

function structuredElements(slide: DesignSlide, layout: LayoutContract): RenderElement[] {
  const elements: RenderElement[] = [];
  const table = sectionOf(slide, "table");
  const bar = sectionOf(slide, "bar-chart");
  const donut = sectionOf(slide, "donut-chart");
  const tableSlot = layout.slots.find((slot) => slot.kind === "table" && slot.bounds);
  if (table && tableSlot) elements.push({ kind: "table", elementId: `${slide.id}:table`, slotId: tableSlot.slotId, bounds: tableSlot.bounds!, zIndex: 2, editable: true, columns: table.columns, rows: table.rows });
  const chartSlots = layout.slots.filter((slot) => slot.kind === "chart" && slot.bounds);
  if (bar && chartSlots[0]) elements.push({ kind: "chart", elementId: `${slide.id}:bar-chart`, slotId: chartSlots[0].slotId, bounds: chartSlots[0].bounds!, zIndex: 2, editable: true, chartType: "bar", data: bar.bars });
  if (donut && chartSlots[bar ? 1 : 0]) elements.push({ kind: "chart", elementId: `${slide.id}:donut-chart`, slotId: chartSlots[bar ? 1 : 0].slotId, bounds: chartSlots[bar ? 1 : 0].bounds!, zIndex: 2, editable: true, chartType: "donut", data: donut.segments });
  return elements;
}

function makeElements(spec: SlideSpec, slide: DesignSlide, layout: LayoutContract, recipe: LayoutRecipe, visualSource?: string): RenderElement[] {
  const visualBounds = recipe.visualBounds;
  const elements: RenderElement[] = [];
  // Layout recipes are the final geometry authority. Template slot semantics are
  // still used for selection and traceability, but must not collapse a teaching
  // composition back into narrow legacy text columns.
  const titleSlot = fallbackTitleSlot(layout, recipe);
  if (titleSlot) elements.push(textElement(slide.id, titleSlot, spec.finalTitle || spec.title || slide.title, 0));
  if (visualSource) {
    const imageSlot = fallbackVisualSlot(layout, recipe);
    elements.push({ kind: "image", elementId: `${slide.id}:generated-visual`, slotId: imageSlot.slotId, bounds: imageSlot.bounds!, zIndex: 1, editable: true, source: visualSource, alt: slide.title, fit: "cover" });
  }
  elements.push(...structuredElements(slide, layout));

  const textSlots = fallbackBodySlots(layout, recipe);
  const blocks = contentBlocks(spec, slide);
  if (slide.subtitle && blocks[0]?.body !== slide.subtitle) blocks.unshift({ title: "", body: slide.subtitle });
  const activeTextSlots = textSlots.slice(0, Math.min(textSlots.length, blocks.length));
  activeTextSlots.forEach((slot, index) => {
    const start = Math.floor(index * blocks.length / activeTextSlots.length);
    const end = Math.floor((index + 1) * blocks.length / activeTextSlots.length);
    const grouped = blocks.slice(start, Math.max(start + 1, end));
    if (grouped.length) elements.push(textElement(slide.id, slot, grouped.map(textFor).join("\n"), index));
  });
  const activeTextBounds = activeTextSlots.map((slot) => slot.bounds!).filter(Boolean);
  const decorations = decorationElements(slide.id, recipe, activeTextBounds, visualBounds);
  const nativeVisuals = !visualSource ? nativeVisualElements(slide.id, recipe, visualBounds) : [];
  return [...decorations, ...nativeVisuals, ...elements];
}

export function buildRenderScenesV2(input: { deckSpec: DeckSpec; slides: DesignSlide[]; layouts: LayoutContract[]; visuals?: Record<string, string> }): RenderScene[] {
  return input.deckSpec.slideSpecs.map((spec, index) => {
    const slide = input.slides.find((candidate) => candidate.id === spec.slideId) || input.slides[index];
    if (!slide) throw new Error(`DeckSpec 第 ${index + 1} 页找不到对应 DesignSlide`);
    const effectiveSpec = slide.layout && slide.layout !== spec.layoutIntent
      ? { ...spec, layoutIntent: slide.layout, selectedLayout: undefined, layoutFamily: undefined }
      : spec;
    const layout = selectLayoutContract(effectiveSpec, input.layouts);
    if (!layout) throw new Error(`第 ${index + 1} 页没有可用版式合同`);
    const recipe = resolveLayoutRecipe(effectiveSpec, layout.layoutId);
    const visualSource = input.visuals?.[slide.id] || input.visuals?.[String(index + 1)];
    return {
      schemaVersion: "teacher-render-scene/v1", sceneId: `${input.deckSpec.id}:${slide.id}:${index + 1}`, projectId: input.deckSpec.projectId, versionId: input.deckSpec.versionId,
      slideId: slide.id, page: index + 1, layoutId: layout.layoutId, canvas: layout.canvas,
      composition: { recipeId: recipe.recipeId, label: recipe.label, family: recipe.family, densityLevel: recipe.densityBudget.level, maxCharacters: recipe.densityBudget.maxCharacters, maxBlocks: recipe.densityBudget.maxBlocks, titlePt: recipe.typographyBudget.titlePt, bodyMinPt: recipe.typographyBudget.bodyMinPt, visualStrategy: recipe.visualStrategy, colors: recipe.colors },
      elements: makeElements(effectiveSpec, slide, layout, recipe, visualSource), evidenceSourceIds: spec.evidenceSourceIds
    };
  });
}
