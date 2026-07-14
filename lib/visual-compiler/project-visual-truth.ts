import type { DeckSpec, DesignSlide } from "@/lib/canvas-data";
import { layoutLibrary } from "@/lib/ppt-agent/layout-library";
import { layoutContractFromDefinition } from "@/lib/visual-compiler/layout-contracts";
import { evaluatePageGates } from "@/lib/visual-compiler/page-gate";
import { validateRenderScenesV2 } from "@/lib/visual-compiler/qa-v2";
import { buildRenderScenesV2 } from "@/lib/visual-compiler/scene-builder-v2";
import { mergeTeacherLayoutProtocol } from "@/lib/visual-compiler/teacher-layout-protocol";

/**
 * The one pure, client-safe compiler entry used by preview, QA and export.
 * It deliberately has no database, filesystem or PowerPoint dependency.
 */
export function buildProjectVisualTruth(deckSpec: DeckSpec, slides: DesignSlide[]) {
  const legacyLayouts = layoutLibrary.map((definition) => layoutContractFromDefinition(definition));
  const layouts = mergeTeacherLayoutProtocol(legacyLayouts);
  const scenes = buildRenderScenesV2({ deckSpec, slides, layouts });
  const qa = validateRenderScenesV2(scenes, layouts);
  const pageGates = evaluatePageGates(scenes, qa);

  return {
    schemaVersion: "teacher-project-visual-truth/v1" as const,
    layouts,
    scenes,
    qa,
    pageGates
  };
}
