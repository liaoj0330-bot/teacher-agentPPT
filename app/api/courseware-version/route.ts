import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { loadFullVersion } from "@/lib/courseware-version";
import type { CommitInput } from "@/lib/courseware-commit";
import { commitCoursewareVersion, COMMIT_OPERATIONS } from "@/lib/courseware-commit";
import { scoreTeacherDeckV3 } from "@/lib/teacher-deck-scoring-v3";
import type { SourceDocument, SlideEvidenceMap } from "@/lib/ppt-agent/evidence-types";
import { findTeacherTrialEvidence, validateTeacherTrialEvidence } from "@/lib/teacher-trial-evidence";

/**
 * GET /api/courseware-version?projectId=&versionId=
 *
 * Server-side source of truth for re-open / preview. Returns the frozen DeckSpec,
 * slide content snapshot, source documents, teacher task, and the engineering /
 * readiness / lifecycle status trio for one immutable version. The workbench
 * rehydrates from this — never from client memory.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") || "";
  const versionId = url.searchParams.get("versionId") || "";
  if (!projectId || !versionId) {
    return NextResponse.json({ message: "projectId 与 versionId 均为必填" }, { status: 400 });
  }

  const source = await loadFullVersion(versionId, user.id, projectId);
  if (!source.ok) {
    const status = source.reason === "forbidden" ? 403 : 404;
    return NextResponse.json({ message: `无法读取版本：${source.reason}` }, { status });
  }
  const teacherTrialValidation = validateTeacherTrialEvidence(findTeacherTrialEvidence(source.sourceDocuments));
  const teacherScoreV3 = scoreTeacherDeckV3({
    scene: "teacher_courseware",
    task: source.task,
    sources: source.sourceDocuments as SourceDocument[],
    evidenceMaps: source.evidence as SlideEvidenceMap[],
    slides: source.slides.map((slide, index) => ({ page: index + 1, id: slide.id, role: slide.pageIntent, title: slide.title, body: slide.subtitle, bullets: slide.bullets, layout: slide.layout })),
    lessonPlan: source.contentPlan?.lessonPlan || source.contentPlan?.lessonBlueprint?.lessonPlan,
    deliveryPack: source.contentPlan?.deliveryPack,
    engineering: { geometryPassed: source.engineeringStatus === "passed" },
    subjectReview: { completed: false },
    imageSemanticReview: { completed: false },
    teacherTrial: { trialCompleted: teacherTrialValidation.status === "complete", reviewedByTeacher: teacherTrialValidation.status === "complete" },
  });

  return NextResponse.json({
    projectId: source.projectId,
    versionId: source.versionId,
    versionNumber: source.versionNumber,
    parentVersionId: source.parentVersionId,
    operation: source.operation,
    summary: source.summary,
    lifecycleStatus: source.lifecycleStatus,
    engineeringStatus: source.engineeringStatus,
    teacherReadiness: source.teacherReadiness,
    deckSpec: source.deckSpec,
    slides: source.slides,
    contentPlan: source.contentPlan,
    task: source.task,
    sourceDocuments: source.sourceDocuments,
    evidence: source.evidence,
    deckSpecHash: source.deckSpecHash,
    isCurrent: source.isCurrent,
    createdAt: source.createdAt,
    renderManifest: source.renderManifest,
    renderManifestArtifactId: source.renderManifestArtifactId,
    teacherScoreV3,
    teacherTrialValidation,
  });
}

/**
 * POST /api/courseware-version
 *
 * The unified "commit version" endpoint. Every content-changing teacher action
 * routes here. The server reads the baseVersionId snapshot as its source of
 * truth, applies the (restricted) payload server-side, and writes a NEW immutable
 * version. It never trusts a client-submitted full DeckSpec, and never overwrites
 * an existing version. A stale baseVersionId yields 409 VERSION_CONFLICT.
 *
 * Body: { projectId, baseVersionId, operation, idempotencyKey?, payload? }
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "请求体必须是 JSON" }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const baseVersionId = typeof body.baseVersionId === "string" ? body.baseVersionId : "";
  const operation = typeof body.operation === "string" ? body.operation : "";
  const idempotencyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined;
  const payload =
    body.payload && typeof body.payload === "object"
      ? (body.payload as Record<string, unknown>)
      : {};

  if (!projectId || !baseVersionId || !operation) {
    return NextResponse.json(
      { message: "projectId、baseVersionId、operation 均为必填" },
      { status: 400 }
    );
  }
  if (!COMMIT_OPERATIONS.includes(operation as (typeof COMMIT_OPERATIONS)[number])) {
    return NextResponse.json(
      { code: "invalid_operation", message: `未知操作：${operation}` },
      { status: 400 }
    );
  }

  const result = await commitCoursewareVersion({
    userId: user.id,
    projectId,
    baseVersionId,
    operation: operation as (typeof COMMIT_OPERATIONS)[number],
    idempotencyKey,
    payload: payload as CommitInput["payload"],
  });

  if (!result.ok) {
    return NextResponse.json(
      { code: result.code, message: result.message },
      { status: result.status }
    );
  }

  return NextResponse.json(
    {
      projectId: result.projectId,
      versionId: result.versionId,
      versionNumber: result.versionNumber,
      parentVersionId: result.parentVersionId,
      operation: result.operation,
      lifecycleStatus: result.lifecycleStatus,
      engineeringStatus: result.engineeringStatus,
      teacherReadiness: result.teacherReadiness,
      deckSpec: result.deckSpec,
      slides: result.slides,
      artifactId: result.artifactId ?? null,
      deduped: result.deduped,
    },
    { status: result.deduped ? 200 : 201 }
  );
}
