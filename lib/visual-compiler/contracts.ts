import type { InformationDensity } from "@/lib/ppt-agent/layout-plan";

export type VisualUnit = "in";
export type VisualRect = { x: number; y: number; width: number; height: number };
export type VisualCanvas = { width: number; height: number; unit: VisualUnit };

export type VisualDesignSpec = {
  schemaVersion: "teacher-visual-design/v1";
  designId: string;
  canvas: VisualCanvas;
  theme: { name: string; headingFont: string; bodyFont: string; colors: Record<string, string> };
  source: "teacher_builtin" | "pptx_template";
  sourceKey: string;
};

export type LayoutSlotKind = "title" | "subtitle" | "body" | "image" | "chart" | "table" | "formula" | "interaction" | "meta" | "unknown";
export type LayoutSlotContract = {
  slotId: string;
  name: string;
  kind: LayoutSlotKind;
  required: boolean;
  bounds?: VisualRect;
  maxCharacters?: number;
  maxItems?: number;
  acceptedAspectRatios?: number[];
  fontSizePt?: number;
};

export type LayoutContract = {
  schemaVersion: "teacher-layout-contract/v1";
  layoutId: string;
  name: string;
  family: string;
  source: "teacher_builtin" | "pptx_template";
  sourceKey: string;
  canvas: VisualCanvas;
  pageRoles: string[];
  densities: InformationDensity[];
  slots: LayoutSlotContract[];
  constraints: { maxCharacters: number; maxItems: number; minBodyFontPt: number; minCaptionFontPt: number; safeMarginIn: number };
  capabilities: { browser: true; pptx: true; editable: boolean };
  warnings: string[];
};

type RenderElementBase = { elementId: string; slotId?: string; bounds: VisualRect; zIndex: number; editable: boolean };
export type RenderElement =
  | (RenderElementBase & { kind: "text"; text: string; role: "title" | "subtitle" | "body" | "caption" | "meta"; fontSizePt?: number })
  | (RenderElementBase & { kind: "image"; source: string; alt: string; fit: "cover" | "contain" })
  | (RenderElementBase & { kind: "shape"; shape: "rect" | "line" | "ellipse"; fill?: string; stroke?: string })
  | (RenderElementBase & { kind: "chart"; chartType: string; data: unknown })
  | (RenderElementBase & { kind: "table"; columns: string[]; rows: string[][] });

export type RenderScene = {
  schemaVersion: "teacher-render-scene/v1";
  sceneId: string;
  projectId?: string;
  versionId?: string;
  slideId: string;
  page: number;
  layoutId: string;
  composition?: {
    recipeId: string;
    label: string;
    family: string;
    densityLevel: "sparse" | "balanced" | "dense";
    maxCharacters: number;
    maxBlocks: number;
    titlePt: number;
    bodyMinPt: number;
    visualStrategy: string;
    colors: { background: string; ink: string; muted: string; accent: string; soft: string; line: string };
  };
  canvas: VisualCanvas;
  elements: RenderElement[];
  evidenceSourceIds: string[];
};

export type VisualQAIssueCode = "OUT_OF_BOUNDS" | "OVERLAP" | "TEXT_OVERFLOW" | "FONT_TOO_SMALL" | "EMPTY_REQUIRED_SLOT" | "UNEDITABLE_CORE_CONTENT" | "UNANCHORED_VISUAL" | "DENSITY_BUDGET_EXCEEDED" | "UNDERFILLED_COMPOSITION" | "REPETITIVE_COMPOSITION" | "INSUFFICIENT_COMPOSITION_VARIETY" | "DOMINANT_COMPOSITION";
export type VisualQAIssue = { issueId: string; sceneId: string; slideId: string; severity: "error" | "warning"; code: VisualQAIssueCode; message: string; elementIds: string[] };
export type VisualQAReport = { schemaVersion: "teacher-visual-qa/v1"; status: "passed" | "review_required" | "failed"; sceneCount: number; errorCount: number; warningCount: number; issues: VisualQAIssue[] };
export type VisualCompileInput = { design: VisualDesignSpec; layouts: LayoutContract[]; scenes: RenderScene[] };
export type VisualCompileResult<TArtifact> = { artifact: TArtifact; qa: VisualQAReport };

export interface CompilerAdapter<TArtifact> {
  readonly adapterId: string;
  readonly target: "browser" | "pptx";
  compile(input: VisualCompileInput): Promise<VisualCompileResult<TArtifact>>;
}
