import type { DeckSpec, DesignSlide } from "@/lib/canvas-data";
import { buildProjectVisualTruth } from "@/lib/visual-compiler/project-visual-truth";

export function buildExportVisualTruth(deckSpec: DeckSpec, slides: DesignSlide[]) {
  const { scenes, qa, pageGates } = buildProjectVisualTruth(deckSpec, slides);
  return {
    schemaVersion: "teacher-export-visual-truth/v1" as const,
    sceneCount: scenes.length,
    sceneIds: scenes.map((scene) => scene.sceneId),
    layoutIds: scenes.map((scene) => scene.layoutId),
    scenes,
    qa,
    pageGates
  };
}
