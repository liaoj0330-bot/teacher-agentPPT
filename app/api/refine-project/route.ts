import { NextResponse } from "next/server";
import { defaultProject, type CanvasProject } from "@/lib/canvas-data";
import { refineProject, type RefineMode } from "@/lib/project-refine";
import { cleanProject, cleanText } from "@/lib/text-sanitize";

function normalizeMode(value: unknown): RefineMode {
  return value === "layout" || value === "copy" || value === "evidence" || value === "auto" ? value : "auto";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const project = cleanProject(((body?.project as CanvasProject | undefined) ?? defaultProject) as CanvasProject);
  const instruction = cleanText(body?.instruction, "自动微调页面级排版、文案密度和资料映射。");
  const mode = normalizeMode(body?.mode);
  const result = refineProject(project, instruction, mode);

  return NextResponse.json({
    status: "ready",
    changes: result.changes,
    quality: result.project.quality,
    project: result.project
  });
}
