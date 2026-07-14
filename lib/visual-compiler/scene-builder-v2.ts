import type { DeckSpec, DesignSlide, SlideSection, SlideSpec } from "@/lib/canvas-data";
import type { LayoutContract, LayoutSlotContract, RenderElement, RenderScene } from "@/lib/visual-compiler/contracts";
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
  return block.title && block.body ? `${block.title}：${block.body}` : block.title || block.body;
}

function textElement(slideId: string, slot: LayoutSlotContract, text: string, index: number): RenderElement {
  return { kind: "text", elementId: `${slideId}:${slot.name}:${index}`, slotId: slot.slotId, bounds: slot.bounds!, zIndex: 2, editable: true, text, role: slot.kind === "title" ? "title" : slot.kind === "subtitle" ? "subtitle" : slot.kind === "meta" ? "meta" : "body", fontSizePt: slot.kind === "title" ? 28 : slot.kind === "subtitle" ? 16 : slot.kind === "meta" ? 10 : 18 };
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

function makeElements(spec: SlideSpec, slide: DesignSlide, layout: LayoutContract): RenderElement[] {
  const elements: RenderElement[] = [];
  const titleSlot = layout.slots.find((slot) => slot.kind === "title" && slot.bounds);
  if (titleSlot) elements.push(textElement(slide.id, titleSlot, spec.finalTitle || spec.title || slide.title, 0));
  const subtitleSlot = layout.slots.find((slot) => slot.kind === "subtitle" && slot.bounds);
  if (subtitleSlot && slide.subtitle) elements.push(textElement(slide.id, subtitleSlot, slide.subtitle, 0));
  elements.push(...structuredElements(slide, layout));

  const occupied = new Set(elements.map((element) => element.slotId));
  const textSlots = layout.slots.filter((slot) => slot.bounds && !occupied.has(slot.slotId) && ["body", "interaction", "formula", "meta"].includes(slot.kind));
  const blocks = contentBlocks(spec, slide);
  if (!subtitleSlot && slide.subtitle && blocks[0]?.body !== slide.subtitle) blocks.unshift({ title: "", body: slide.subtitle });
  const activeTextSlots = textSlots.slice(0, Math.min(textSlots.length, blocks.length));
  activeTextSlots.forEach((slot, index) => {
    const start = Math.floor(index * blocks.length / activeTextSlots.length);
    const end = Math.floor((index + 1) * blocks.length / activeTextSlots.length);
    const grouped = blocks.slice(start, Math.max(start + 1, end));
    if (grouped.length) elements.push(textElement(slide.id, slot, grouped.map(textFor).join("\n"), index));
  });  return elements;
}

export function buildRenderScenesV2(input: { deckSpec: DeckSpec; slides: DesignSlide[]; layouts: LayoutContract[] }): RenderScene[] {
  return input.deckSpec.slideSpecs.map((spec, index) => {
    const slide = input.slides.find((candidate) => candidate.id === spec.slideId) || input.slides[index];
    if (!slide) throw new Error(`DeckSpec 第 ${index + 1} 页找不到对应 DesignSlide`);
    const layout = selectLayoutContract(spec, input.layouts);
    if (!layout) throw new Error(`第 ${index + 1} 页没有可用版式合同`);
    return { schemaVersion: "teacher-render-scene/v1", sceneId: `${input.deckSpec.id}:${slide.id}:${index + 1}`, projectId: input.deckSpec.projectId, versionId: input.deckSpec.versionId, slideId: slide.id, page: index + 1, layoutId: layout.layoutId, canvas: layout.canvas, elements: makeElements(spec, slide, layout), evidenceSourceIds: spec.evidenceSourceIds };
  });
}
