import type { DeckSpec, DesignSlide, SlideSpec } from "@/lib/canvas-data";
import type { LayoutContract, RenderElement, RenderScene, VisualRect } from "@/lib/visual-compiler/contracts";

const DEFAULT_CANVAS = { width: 13.3333, height: 7.5, unit: "in" as const };

function normalize(value: string | undefined) {
  return String(value || "").trim().toLowerCase();
}

function intersectsRole(contract: LayoutContract, spec: SlideSpec) {
  const role = normalize(`${spec.role} ${spec.pagePurpose || ""} ${spec.layoutIntent}`);
  return contract.pageRoles.some((candidate) => role.includes(normalize(candidate)) || normalize(candidate).includes(normalize(spec.role)));
}

export function selectLayoutContract(spec: SlideSpec, contracts: LayoutContract[]) {
  const exact = contracts.find((contract) => contract.layoutId === spec.selectedLayout || contract.layoutId === spec.layoutIntent);
  if (exact) return exact;
  const density = spec.informationDensity || (spec.density === "dense" ? "high" : spec.density === "airy" ? "low" : "medium");
  return contracts
    .map((contract) => ({ contract, score: (intersectsRole(contract, spec) ? 30 : 0) + (contract.densities.includes(density) ? 12 : 0) + (contract.capabilities.editable ? 8 : 0) }))
    .sort((left, right) => right.score - left.score)[0]?.contract;
}

function slotBounds(contract: LayoutContract | undefined, kinds: string[], fallback: VisualRect) {
  return contract?.slots.find((slot) => kinds.includes(slot.kind) && slot.bounds)?.bounds || fallback;
}

function visibleBody(spec: SlideSpec, slide: DesignSlide) {
  const blocks = (spec.visibleBlocks || []).map((block) => `${block.title}${block.body ? `：${block.body}` : ""}`);
  if (blocks.length) return blocks.join("\n");
  if (slide.bullets?.length) return slide.bullets.join("\n");
  return spec.leadSentence || spec.claim || spec.mustProve || slide.subtitle || "";
}

function makeElements(spec: SlideSpec, slide: DesignSlide, contract: LayoutContract | undefined): RenderElement[] {
  const canvas = contract?.canvas || DEFAULT_CANVAS;
  const titleBounds = slotBounds(contract, ["title"], { x: 0.72, y: 0.48, width: canvas.width - 1.44, height: 0.78 });
  const subtitleBounds = slotBounds(contract, ["subtitle"], { x: 0.78, y: 1.3, width: canvas.width - 1.56, height: 0.48 });
  const bodyBounds = slotBounds(contract, ["body", "interaction", "table", "chart"], { x: 0.78, y: 1.92, width: canvas.width - 1.56, height: canvas.height - 2.54 });
  const title = spec.finalTitle || spec.title || slide.title;
  const subtitle = slide.subtitle || spec.leadSentence || "";
  const body = visibleBody(spec, slide);
  const elements: RenderElement[] = [
    { kind: "text", elementId: `${slide.id}:title`, slotId: contract?.slots.find((slot) => slot.kind === "title")?.slotId, bounds: titleBounds, zIndex: 2, editable: true, text: title, role: "title", fontSizePt: 28 }
  ];
  if (subtitle && subtitle !== body) {
    elements.push({ kind: "text", elementId: `${slide.id}:subtitle`, slotId: contract?.slots.find((slot) => slot.kind === "subtitle")?.slotId, bounds: subtitleBounds, zIndex: 2, editable: true, text: subtitle, role: "subtitle", fontSizePt: 16 });
  }
  if (body) {
    elements.push({ kind: "text", elementId: `${slide.id}:body`, slotId: contract?.slots.find((slot) => ["body", "interaction"].includes(slot.kind))?.slotId, bounds: bodyBounds, zIndex: 2, editable: true, text: body, role: "body", fontSizePt: 18 });
  }
  return elements;
}

export function buildRenderScenes(input: { deckSpec: DeckSpec; slides: DesignSlide[]; layouts: LayoutContract[] }): RenderScene[] {
  return input.deckSpec.slideSpecs.map((spec, index) => {
    const slide = input.slides.find((candidate) => candidate.id === spec.slideId) || input.slides[index];
    if (!slide) throw new Error(`DeckSpec 第 ${index + 1} 页找不到对应 DesignSlide`);
    const contract = selectLayoutContract(spec, input.layouts);
    return {
      schemaVersion: "teacher-render-scene/v1",
      sceneId: `${input.deckSpec.id}:${slide.id}:${index + 1}`,
      projectId: input.deckSpec.projectId,
      versionId: input.deckSpec.versionId,
      slideId: slide.id,
      page: index + 1,
      layoutId: contract?.layoutId || spec.selectedLayout || String(spec.layoutIntent),
      canvas: contract?.canvas || DEFAULT_CANVAS,
      elements: makeElements(spec, slide, contract),
      evidenceSourceIds: spec.evidenceSourceIds
    } satisfies RenderScene;
  });
}
