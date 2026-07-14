import { NextResponse } from "next/server";
import type { DeckSpec } from "@/lib/canvas-data";
import { parsePptxTemplateManifest } from "@/lib/pptx-template-poc/parser";
import { toRuntimeTemplateProfile } from "@/lib/pptx-template-poc/runtime-profile";
import { layoutContractsFromTemplate } from "@/lib/visual-compiler/layout-contracts";
import { selectTemplateLayoutsForDeck } from "@/lib/visual-compiler/template-layout-selector";

export const runtime = "nodejs";
const MAX_PPTX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "file is required" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".pptx")) return NextResponse.json({ message: "only .pptx OOXML packages are supported" }, { status: 415 });
  if (file.size > MAX_PPTX_BYTES) return NextResponse.json({ message: "pptx exceeds the 25 MB POC limit" }, { status: 413 });
  try {
    const manifest = await parsePptxTemplateManifest(Buffer.from(await file.arrayBuffer()), { fileName: file.name });
    const runtimeProfile = toRuntimeTemplateProfile(manifest);
    const layoutContracts = layoutContractsFromTemplate(runtimeProfile);
    const rawDeckSpec = form.get("deckSpec");
    let runtimeSelections = null;
    if (typeof rawDeckSpec === "string" && rawDeckSpec.trim()) {
      let deckSpec: DeckSpec;
      try {
        deckSpec = JSON.parse(rawDeckSpec) as DeckSpec;
      } catch {
        return NextResponse.json({ message: "deckSpec must be valid JSON" }, { status: 400 });
      }
      if (!Array.isArray(deckSpec.slideSpecs)) return NextResponse.json({ message: "deckSpec.slideSpecs is required" }, { status: 400 });
      runtimeSelections = selectTemplateLayoutsForDeck(runtimeProfile, deckSpec);
    }
    return NextResponse.json({
      manifest,
      runtimeProfile,
      layoutContracts,
      runtimeSelections,
      integration: { status: runtimeSelections ? "runtime_selection_ready" : "runtime_contract_ready", persisted: false, registryMutated: false, coursewareVersionCreated: false }
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : String(error) }, { status: 422 });
  }
}
