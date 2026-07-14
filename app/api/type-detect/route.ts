import { NextResponse } from "next/server";
import type { UploadedAsset } from "@/lib/canvas-data";
import { detectPPTTypeContract } from "@/lib/ppt-agent/type-contracts";
import { pptTypeLabels } from "@/lib/ppt-review-rulebase";
import { getScenarioPlaybook } from "@/lib/ppt-agent/scenario-playbooks";
import { cleanText } from "@/lib/text-sanitize";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const prompt = cleanText(body?.prompt || "");
  const uploadedAssets = Array.isArray(body?.uploadedAssets) ? (body.uploadedAssets as UploadedAsset[]) : [];

  if (!prompt && uploadedAssets.length === 0) {
    return NextResponse.json({ message: "prompt or uploadedAssets is required" }, { status: 400 });
  }

  const detected = detectPPTTypeContract(prompt, uploadedAssets);
  const playbook = getScenarioPlaybook(detected.planType);

  return NextResponse.json({
    status: "ready",
    reviewType: detected.reviewType,
    reviewTypeLabel: pptTypeLabels[detected.reviewType],
    planType: detected.planType,
    confidence: detected.confidence,
    audience: detected.audience,
    goal: detected.goal,
    requiredPageRoles: playbook.requiredSlideRoles.map((role) => ({
      role: role.role,
      titleIntent: role.titleIntent,
      mustProve: role.mustProve
    })),
    scores: detected.scores,
    reasons: detected.reasons
  });
}
