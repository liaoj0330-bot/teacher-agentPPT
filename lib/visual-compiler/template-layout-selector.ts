import type { DeckSpec, SlideSpec } from "@/lib/canvas-data";
import type { RuntimeTemplateProfile } from "@/lib/pptx-template-poc/runtime-profile";
import type { LayoutContract, LayoutSlotKind } from "@/lib/visual-compiler/contracts";
import { layoutContractsFromTemplate } from "./layout-contracts.ts";

export type TemplateLayoutScore = {
  layoutId: string;
  score: number;
  reasons: string[];
  missingKinds: LayoutSlotKind[];
};

export type TemplatePageSelection = {
  page: number;
  slideSpecId: string;
  selectedLayoutId: string | null;
  accepted: boolean;
  fallbackReason?: string;
  candidates: TemplateLayoutScore[];
};

function normalize(value: string | undefined) {
  return String(value || "").trim().toLowerCase();
}

function expectedKinds(spec: SlideSpec): LayoutSlotKind[] {
  const text = normalize(`${spec.role} ${spec.pagePurpose || ""} ${spec.recommendedVisualForm || ""} ${spec.layoutIntent}`);
  const kinds: LayoutSlotKind[] = ["title", "body"];
  if (/图|image|gallery|photo/.test(text)) kinds.push("image");
  if (/图表|chart|dashboard|graph|参数/.test(text)) kinds.push("chart");
  if (/表格|table|对比/.test(text)) kinds.push("table");
  if (/公式|解析式|formula|equation/.test(text)) kinds.push("formula");
  if (/练习|互动|反馈|practice|action/.test(text)) kinds.push("interaction");
  return [...new Set(kinds)];
}

function densityOf(spec: SlideSpec) {
  return spec.informationDensity || (spec.density === "dense" ? "high" : spec.density === "airy" ? "low" : "medium");
}

export function scoreTemplateLayout(spec: SlideSpec, layout: LayoutContract, previousUseCount = 0): TemplateLayoutScore {
  let score = 0;
  const reasons: string[] = [];
  const role = normalize(`${spec.role} ${spec.pagePurpose || ""}`);
  if (layout.pageRoles.some((candidate) => role.includes(normalize(candidate)) || normalize(candidate).includes(normalize(spec.role)))) {
    score += 32; reasons.push("页面角色匹配");
  }
  if (layout.densities.includes(densityOf(spec))) { score += 18; reasons.push("信息密度匹配"); }
  const availableKinds = new Set(layout.slots.map((slot) => slot.kind));
  const expected = expectedKinds(spec);
  const missingKinds = expected.filter((kind) => !availableKinds.has(kind));
  const matchedKinds = expected.length - missingKinds.length;
  score += Math.round((matchedKinds / expected.length) * 24);
  if (!missingKinds.length) reasons.push("内容槽位完整");
  const geometryRatio = layout.slots.length ? layout.slots.filter((slot) => slot.bounds).length / layout.slots.length : 0;
  score += Math.round(geometryRatio * 14);
  if (geometryRatio === 1) reasons.push("占位符几何完整");
  if (layout.capabilities.editable) { score += 8; reasons.push("支持可编辑导出"); }
  if (layout.warnings.length) score -= Math.min(18, layout.warnings.length * 6);
  if (previousUseCount) score -= Math.min(15, previousUseCount * 5);
  if (missingKinds.includes("title") || missingKinds.includes("body")) score -= 30;
  return { layoutId: layout.layoutId, score: Math.max(0, Math.min(100, score)), reasons, missingKinds };
}

export function selectTemplateLayoutsForDeck(profile: RuntimeTemplateProfile, deckSpec: DeckSpec): TemplatePageSelection[] {
  const layouts = layoutContractsFromTemplate(profile);
  const useCount = new Map<string, number>();
  return deckSpec.slideSpecs.map((spec) => {
    const candidates = layouts
      .map((layout) => scoreTemplateLayout(spec, layout, useCount.get(layout.layoutId) || 0))
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);
    const selected = candidates[0];
    const accepted = Boolean(selected && selected.score >= 50 && !selected.missingKinds.includes("title") && !selected.missingKinds.includes("body"));
    if (accepted) useCount.set(selected.layoutId, (useCount.get(selected.layoutId) || 0) + 1);
    return {
      page: spec.page,
      slideSpecId: spec.id,
      selectedLayoutId: accepted ? selected.layoutId : null,
      accepted,
      fallbackReason: accepted ? undefined : selected ? `最高候选仅 ${selected.score} 分或缺少核心槽位，回退教师内置版式` : "模板没有可用版式",
      candidates
    };
  });
}
