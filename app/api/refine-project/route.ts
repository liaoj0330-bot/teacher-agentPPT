import { NextResponse } from "next/server";
import { defaultProject, type CanvasProject } from "@/lib/canvas-data";
import { refineProject, type RefineMode } from "@/lib/project-refine";
import { cleanProject, cleanText } from "@/lib/text-sanitize";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { assertCredits, creditCosts, hasCreditOperation, spendCreditsOnce } from "@/lib/credits";

function normalizeMode(value: unknown): RefineMode {
  return value === "layout" || value === "copy" || value === "evidence" || value === "auto" ? value : "auto";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const project = cleanProject(((body?.project as CanvasProject | undefined) ?? defaultProject) as CanvasProject);
  const instruction = cleanText(body?.instruction, "自动微调页面级排版、文案密度和资料映射。");
  const mode = normalizeMode(body?.mode);
  const user = await getCurrentUser().catch(() => null);
  const creditRefId = request.headers.get("idempotency-key") || (typeof body?.idempotencyKey === "string" ? body.idempotencyKey : `refine-${randomUUID()}`);
  if (user && !(await hasCreditOperation(user.id, "refine", creditRefId))) {
    try {
      await assertCredits(user.id, creditCosts.refinePage);
    } catch (error) {
      if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") {
        return NextResponse.json({ code: "insufficient_credits", message: "credits_insufficient" }, { status: 402 });
      }
      throw error;
    }
  }
  const result = refineProject(project, instruction, mode);
  const creditSettlement = user
    ? await spendCreditsOnce(user.id, creditCosts.refinePage, "成功完成页面精修", "refine", creditRefId)
    : null;

  return NextResponse.json({
    status: "ready",
    changes: result.changes,
    quality: result.project.quality,
    project: result.project,
    ...(creditSettlement ? { credits: creditSettlement.balance, creditCharge: creditSettlement.charged ? creditCosts.refinePage : 0 } : {})
  });
}
