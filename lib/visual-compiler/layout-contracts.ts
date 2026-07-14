import type { LayoutDefinition } from "@/lib/ppt-agent/layout-library";
import type { RuntimeTemplateProfile } from "@/lib/pptx-template-poc/runtime-profile";
import type { LayoutContract, LayoutSlotContract, LayoutSlotKind, VisualCanvas, VisualDesignSpec } from "@/lib/visual-compiler/contracts";

const DEFAULT_CANVAS: VisualCanvas = { width: 13.3333, height: 7.5, unit: "in" };
const EMU_PER_INCH = 914400;

function clean(value: string | undefined) {
  return String(value || "").trim().toLowerCase();
}

function slotKind(value: string): LayoutSlotKind {
  const normalized = clean(value);
  if (/title|ctrtitle/.test(normalized)) return "title";
  if (/subtitle/.test(normalized)) return "subtitle";
  if (/pic|image|photo/.test(normalized)) return "image";
  if (/chart|graph/.test(normalized)) return "chart";
  if (/table/.test(normalized)) return "table";
  if (/formula|equation/.test(normalized)) return "formula";
  if (/student|practice|answer|feedback|interaction/.test(normalized)) return "interaction";
  if (/body|content|text|obj/.test(normalized)) return "body";
  if (/date|footer|sldnum|slide number|meta/.test(normalized)) return "meta";
  return "unknown";
}

function templateRoles(type: string, name: string) {
  const value = `${clean(type)} ${clean(name)}`;
  if (/title|cover/.test(value)) return ["课程封面", "课题定调"];
  if (/section|divider/.test(value)) return ["章节过渡"];
  if (/comparison|compare/.test(value)) return ["方法对比", "参数比较"];
  if (/picture|image/.test(value)) return ["图文解释", "情境导入"];
  return ["概念讲解", "例题讲解", "课堂练习", "课堂总结"];
}

function defaultSlotBounds(index: number, count: number, canvas = DEFAULT_CANVAS) {
  if (index === 0) return { x: 0.72, y: 0.48, width: canvas.width - 1.44, height: 0.78 };
  const bodyCount = Math.max(1, count - 1);
  const gap = 0.22;
  const available = canvas.width - 1.44 - gap * (bodyCount - 1);
  const width = available / bodyCount;
  return { x: 0.72 + (index - 1) * (width + gap), y: 1.55, width, height: canvas.height - 2.05 };
}

export function visualDesignFromTemplate(profile: RuntimeTemplateProfile): VisualDesignSpec {
  return {
    schemaVersion: "teacher-visual-design/v1",
    designId: `design-${profile.templateKey}`,
    canvas: { width: profile.slideSize.widthInches, height: profile.slideSize.heightInches, unit: "in" },
    theme: profile.theme,
    source: "pptx_template",
    sourceKey: profile.templateKey
  };
}

export function layoutContractsFromTemplate(profile: RuntimeTemplateProfile): LayoutContract[] {
  const canvas = visualDesignFromTemplate(profile).canvas;
  return profile.layoutCandidates.map((layout) => {
    const slots: LayoutSlotContract[] = layout.slots.map((slot, index) => {
      const kind = slotKind(`${slot.type} ${slot.name}`);
      return {
        slotId: slot.slotId,
        name: slot.name || slot.type || `slot-${index + 1}`,
        kind,
        required: ["title", "body", "image"].includes(kind),
        bounds: slot.geometry
          ? { x: slot.geometry.xEmu / EMU_PER_INCH, y: slot.geometry.yEmu / EMU_PER_INCH, width: slot.geometry.widthEmu / EMU_PER_INCH, height: slot.geometry.heightEmu / EMU_PER_INCH }
          : undefined,
        maxCharacters: kind === "title" ? 36 : 360,
        maxItems: kind === "body" ? 7 : undefined
      };
    });
    return {
      schemaVersion: "teacher-layout-contract/v1",
      layoutId: layout.layoutId,
      name: layout.name || layout.type || layout.layoutId,
      family: layout.type || "template",
      source: "pptx_template",
      sourceKey: profile.templateKey,
      canvas,
      pageRoles: templateRoles(layout.type, layout.name),
      densities: slots.length >= 5 ? ["high"] : slots.length >= 3 ? ["medium"] : ["low"],
      slots,
      constraints: { maxCharacters: Math.max(180, slots.length * 160), maxItems: Math.max(3, slots.length + 2), minBodyFontPt: 16, minCaptionFontPt: 10, safeMarginIn: 0.24 },
      capabilities: { browser: true, pptx: true, editable: true },
      warnings: [
        ...(profile.status === "partial" ? ["模板解析结果不完整，必须经过人工复核"] : []),
        ...(slots.some((slot) => !slot.bounds) ? ["部分占位符没有独立几何信息，需要从母版继承或使用安全回退"] : [])
      ]
    } satisfies LayoutContract;
  });
}

export function layoutContractFromDefinition(definition: LayoutDefinition, canvas = DEFAULT_CANVAS): LayoutContract {
  const slotNames = [...definition.requiredSlots, ...definition.optionalSlots];
  const slots = slotNames.map((name, index) => ({
    slotId: `${definition.layoutId}:${name}`,
    name,
    kind: slotKind(name),
    required: index < definition.requiredSlots.length,
    bounds: defaultSlotBounds(index, slotNames.length, canvas),
    maxCharacters: index === 0 ? definition.maxTitleLength || 36 : definition.maxItemLength || Math.ceil(definition.maxTextLength / Math.max(1, definition.maxItems)),
    maxItems: index === 0 ? 1 : definition.maxItems
  } satisfies LayoutSlotContract));
  return {
    schemaVersion: "teacher-layout-contract/v1",
    layoutId: definition.layoutId,
    name: definition.layoutName,
    family: definition.layoutFamily,
    source: "teacher_builtin",
    sourceKey: "teacher-layout-library/v1",
    canvas,
    pageRoles: definition.supportedRoles,
    densities: definition.informationDensity,
    slots,
    constraints: {
      maxCharacters: definition.maxTextLength,
      maxItems: definition.maxItems,
      minBodyFontPt: definition.typographyScale?.body || 16,
      minCaptionFontPt: definition.typographyScale?.caption || 10,
      safeMarginIn: 0.24
    },
    capabilities: { browser: true, pptx: true, editable: definition.exportCompatibility === "editable-shapes" },
    warnings: []
  };
}
