/**
 * CoursewareVersion service (Phase 1 / 069)
 *
 * Server-side fact store for teacher courseware generation.
 * Each teacher_courseware generation creates:
 *   CoursewareProject → CoursewareRequest → CoursewareVersion → (later) CoursewareArtifact
 *
 * PptSession is kept for backward compatibility with the general path.
 */
import { prisma as db } from "@/lib/db";
import type { TeacherCoursewareTask } from "@/lib/teacher-courseware-task";
import type { ContentPlan } from "@/lib/ppt-agent/content-plan";
import type { SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";
import type { LayoutPlan } from "@/lib/ppt-agent/layout-plan";
import type { DeckSpec, DesignSlide } from "@/lib/canvas-data";
import type { SourceDocument } from "@/lib/ppt-agent/evidence-types";

export type CoursewareVersionInsertResult = {
  projectId: string;
  requestId: string;
  versionId: string;
  versionNumber: number;
  lifecycleStatus: string;
};

export type CoursewareVersionInput = {
  userId: string;
  task: TeacherCoursewareTask;
  contentPlan: ContentPlan;
  slidePagePlans: SlidePagePlan[];
  layoutPlans: LayoutPlan[];
  deckSpec: DeckSpec | null;
  /**
   * Rendered DesignSlide[] frozen at generation time. This is the server-side
   * render source of truth for export — the export route reads this back from
   * the DB instead of trusting client-submitted slides.
   */
  slides?: DesignSlide[];
  /** Evidence blocks frozen at generation time (JSON serialisable). */
  evidence?: unknown[];
  engineeringStatus: "pending" | "passed" | "failed";
  teacherReadiness:
    | "pending"
    | "review_required"
    | "ready_for_teacher"
    | "failed";
  /**
   * Re-use an existing project instead of creating a new one. Ownership is
   * validated here: if the id is unknown or belongs to another user, a fresh
   * project is created instead (never attaches to someone else's project).
   */
  requestedProjectId?: string;
  requestType?: "initial_generate" | "regenerate" | "edit_commit";
  // ── Version lineage / provenance (069 interaction closure) ─────────────────
  /** The baseVersionId this version was committed from. */
  parentVersionId?: string;
  /** The operation that produced this version (see CoursewareOperation). */
  operation?: CoursewareOperation;
  /** Short human-readable description of what changed. */
  summary?: string;
  /** Client dedupe key; a repeat collapses to the same committed version. */
  idempotencyKey?: string;
  /** Bound source-document / uploaded-file metadata frozen into the version. */
  sourceDocuments?: unknown[];
};

/**
 * Every operation that produces a new immutable CoursewareVersion. The teacher
 * workbench must map each content-changing button to exactly one of these.
 */
export type CoursewareOperation =
  | "initial_generate"
  | "regenerate"
  | "manual_edit"
  | "attach_material"
  | "ai_refine_page"
  | "ai_refine_deck"
  | "classroom_interaction"
  | "generate_visuals"
  | "apply_page_review_fixes"
  | "apply_review_fixes"
  | "teacher_submit_for_review";

/**
 * Create (or extend) a CoursewareProject + CoursewareVersion for a teacher
 * courseware generation run. Returns the IDs to embed in the API response.
 */
export async function upsertCoursewareVersion(
  input: CoursewareVersionInput
): Promise<CoursewareVersionInsertResult> {
  const {
    userId,
    task,
    contentPlan,
    slidePagePlans,
    layoutPlans,
    deckSpec,
    slides,
    evidence,
    engineeringStatus,
    teacherReadiness,
    requestedProjectId,
    requestType = "initial_generate",
    parentVersionId,
    operation = requestType === "initial_generate" ? "initial_generate" : "regenerate",
    summary = "",
    idempotencyKey,
    sourceDocuments,
  } = input;

  const taskJson = JSON.stringify(task);
  const now = new Date();

  // ── Find or create project ───────────────────────────────────────────────
  // Validate ownership of a requested existing project server-side. An unknown
  // id or one owned by a different user is ignored (fresh project created).
  let existingProjectId: string | undefined;
  if (requestedProjectId) {
    const owned = await db.coursewareProject.findFirst({
      where: { id: requestedProjectId, userId },
      select: { id: true },
    });
    existingProjectId = owned?.id;
  }

  let projectId: string;
  if (existingProjectId) {
    projectId = existingProjectId;
  } else {
    const project = await db.coursewareProject.create({
      data: {
        userId,
        title: task.topic || "新课件",
        subject: task.subject || "数学",
        schoolStage: task.schoolStage || "高中",
        grade: task.grade || "",
        lifecycleStatus: "generating",
      },
    });
    projectId = project.id;
  }

  // ── Create request ───────────────────────────────────────────────────────
  const request = await db.coursewareRequest.create({
    data: {
      projectId,
      requestType,
      teacherTaskSnapshot: taskJson,
      status: "running",
    },
  });

  // ── Determine next version number ────────────────────────────────────────
  const latestVersion = await db.coursewareVersion.findFirst({
    where: { projectId },
    orderBy: { versionNumber: "desc" },
  });
  const versionNumber = (latestVersion?.versionNumber ?? 0) + 1;

  // ── Derive lifecycle status ──────────────────────────────────────────────
  const lifecycleStatus: string =
    engineeringStatus === "failed"
      ? "failed"
      : teacherReadiness === "failed"
      ? "failed"
      : teacherReadiness === "review_required"
      ? "review_required"
      : teacherReadiness === "ready_for_teacher"
      ? "ready_for_teacher"
      : "generated";

  // ── Create version ───────────────────────────────────────────────────────
  const deckSpecJson = deckSpec ? JSON.stringify(deckSpec) : "{}";
  const deckSpecHash = deckSpec?.contentHash ?? "";

  const version = await db.coursewareVersion.create({
    data: {
      projectId,
      requestId: request.id,
      versionNumber,
      parentVersionId: parentVersionId ?? null,
      operation,
      summary,
      idempotencyKey: idempotencyKey ?? null,
      teacherTaskSnapshot: taskJson,
      contentPlanSnapshot: JSON.stringify(contentPlan),
      slidePagePlanSnapshot: JSON.stringify(slidePagePlans),
      layoutPlanSnapshot: JSON.stringify(layoutPlans),
      deckSpecSnapshot: deckSpecJson,
      deckSpecHash,
      slideContentSnapshot: JSON.stringify(slides ?? []),
      evidenceSnapshot: JSON.stringify(evidence ?? []),
      sourceDocumentsSnapshot: JSON.stringify(sourceDocuments ?? []),
      engineeringStatus,
      teacherReadiness,
      lifecycleStatus,
    },
  });

  // ── Mark request completed ───────────────────────────────────────────────
  await db.coursewareRequest.update({
    where: { id: request.id },
    data: { status: "completed", completedAt: now },
  });

  // ── Update project's currentVersionId ───────────────────────────────────
  await db.coursewareProject.update({
    where: { id: projectId },
    data: {
      currentVersionId: version.id,
      lifecycleStatus,
      updatedAt: now,
    },
  });

  return {
    projectId,
    requestId: request.id,
    versionId: version.id,
    versionNumber,
    lifecycleStatus,
  };
}

/**
 * Read a CoursewareVersion by ID and return its DeckSpec snapshot.
 * Returns null if not found or deckSpecSnapshot is empty / invalid.
 */
export async function getCoursewareVersionDeckSpec(
  versionId: string
): Promise<DeckSpec | null> {
  const version = await db.coursewareVersion.findUnique({
    where: { id: versionId },
  });
  if (!version) return null;
  try {
    const spec = JSON.parse(version.deckSpecSnapshot) as DeckSpec;
    return spec?.id ? spec : null;
  } catch {
    return null;
  }
}

/**
 * Get a CoursewareVersion record with optional project-scope check.
 * Returns null if versionId not found or belongs to a different project.
 */
export async function getCoursewareVersion(
  versionId: string,
  projectId?: string
) {
  const version = await db.coursewareVersion.findUnique({
    where: { id: versionId },
  });
  if (!version) return null;
  if (projectId && version.projectId !== projectId) return null;
  return version;
}

/**
 * Load everything the export route needs to render a frozen version as the
 * server-side source of truth. Performs ownership + project-scope checks and
 * returns the frozen DeckSpec, the frozen DesignSlide[] render source, the
 * DeckSpec content hash and the two status fields.
 *
 * The `reason` field explains why `ok` is false so the caller can produce an
 * explicit failure (missing version / permission error / etc.).
 */
export type ExportSourceResult =
  | {
      ok: true;
      projectId: string;
      versionId: string;
      versionNumber: number;
      deckSpec: DeckSpec;
      slides: DesignSlide[];
      evidence: unknown[];
      sourceDocuments: SourceDocument[];
      teacherTask: TeacherCoursewareTask;
      /**
       * Frozen ContentPlan snapshot. Needed by the export renderer to route to
       * the teacher-math playbook and populate teacherContext labels. This is a
       * render hint only — the authoritative content is deckSpec + slides.
       */
      contentPlan: ContentPlan | null;
      deckSpecHash: string;
      engineeringStatus: string;
      teacherReadiness: string;
      lifecycleStatus: string;
      /** Latest committed provider-backed visuals, keyed by frozen slide id. */
      renderManifest: Record<string, string>;
    }
  | { ok: false; reason: "not_found" | "forbidden" | "corrupt_snapshot" };

export async function loadExportSource(
  versionId: string,
  userId: string,
  projectId?: string
): Promise<ExportSourceResult> {
  const version = await db.coursewareVersion.findUnique({
    where: { id: versionId },
    include: { project: true },
  });
  if (!version) return { ok: false, reason: "not_found" };
  if (projectId && version.projectId !== projectId) {
    return { ok: false, reason: "not_found" };
  }
  // Ownership: the version's project must belong to this user.
  if (!version.project || version.project.userId !== userId) {
    return { ok: false, reason: "forbidden" };
  }

  let deckSpec: DeckSpec | null = null;
  let slides: DesignSlide[] = [];
  let evidence: unknown[] = [];
  let sourceDocuments: SourceDocument[] = [];
  let contentPlan: ContentPlan | null = null;
  let teacherTask: TeacherCoursewareTask | null = null;
  let renderManifest: Record<string, string> = {};
  try {
    deckSpec = JSON.parse(version.deckSpecSnapshot) as DeckSpec;
    slides = JSON.parse(version.slideContentSnapshot) as DesignSlide[];
    evidence = JSON.parse(version.evidenceSnapshot) as unknown[];
    sourceDocuments = JSON.parse(version.sourceDocumentsSnapshot) as SourceDocument[];
    teacherTask = JSON.parse(version.teacherTaskSnapshot) as TeacherCoursewareTask;
    // contentPlan is a render hint only; a corrupt one degrades to null rather
    // than failing the whole export (deckSpec + slides remain authoritative).
    try {
      contentPlan = JSON.parse(version.contentPlanSnapshot) as ContentPlan;
    } catch {
      contentPlan = null;
    }
  } catch {
    return { ok: false, reason: "corrupt_snapshot" };
  }
  if (!deckSpec?.id || !Array.isArray(slides) || !teacherTask || typeof teacherTask !== "object") {
    return { ok: false, reason: "corrupt_snapshot" };
  }

  const visualArtifact = await db.coursewareArtifact.findFirst({
    where: { versionId: version.id, artifactType: "render_manifest", status: "ready" },
    orderBy: { createdAt: "desc" },
  });
  if (visualArtifact?.manifestJson) {
    try {
      const manifest = JSON.parse(visualArtifact.manifestJson) as { visuals?: unknown };
      if (manifest.visuals && typeof manifest.visuals === "object" && !Array.isArray(manifest.visuals)) {
        renderManifest = Object.fromEntries(Object.entries(manifest.visuals).filter(([, value]) => typeof value === "string")) as Record<string, string>;
      }
    } catch {
      renderManifest = {};
    }
  }

  return {
    ok: true,
    projectId: version.projectId,
    versionId: version.id,
    versionNumber: version.versionNumber,
    deckSpec,
    slides,
    evidence: Array.isArray(evidence) ? evidence : [],
    sourceDocuments: Array.isArray(sourceDocuments) ? sourceDocuments : [],
    teacherTask,
    contentPlan: contentPlan && typeof contentPlan === "object" ? contentPlan : null,
    deckSpecHash: version.deckSpecHash,
    engineeringStatus: version.engineeringStatus,
    teacherReadiness: version.teacherReadiness,
    lifecycleStatus: version.lifecycleStatus,
    renderManifest,
  };
}

/**
 * Write a CoursewareArtifact record. Used after PPTX / PDF / PNG generation,
 * for BOTH success and failure. The artifact always traces back to the same
 * projectId + versionId + DeckSpec hash. For derived artifacts (pdf / png) pass
 * `sourceArtifactId` pointing at the parent pptx artifact.
 */
export type WriteArtifactInput = {
  projectId: string;
  versionId: string;
  artifactType: "pptx" | "pdf" | "preview_manifest" | "render_manifest";
  status: "pending" | "generating" | "ready" | "failed";
  sourceDeckSpecHash: string;
  storagePath?: string;
  manifestJson?: unknown;
  sourceArtifactId?: string | null;
  errorDetail?: string | null;
};

export async function writeCoursewareArtifact(
  input: WriteArtifactInput
): Promise<{ artifactId: string }> {
  const artifact = await db.coursewareArtifact.create({
    data: {
      projectId: input.projectId,
      versionId: input.versionId,
      artifactType: input.artifactType,
      status: input.status,
      sourceDeckSpecHash: input.sourceDeckSpecHash,
      storagePath: input.storagePath ?? "",
      manifestJson:
        input.manifestJson === undefined
          ? "{}"
          : JSON.stringify(input.manifestJson),
      sourceArtifactId: input.sourceArtifactId ?? null,
      errorDetail: input.errorDetail ?? null,
    },
  });
  return { artifactId: artifact.id };
}

// ── Read helpers (069 interaction closure) ────────────────────────────────────
// These power project re-open, version history and artifact history. All are
// ownership-scoped: a project that does not belong to `userId` is invisible.

function safeParse<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

export type CoursewareProjectSummary = {
  projectId: string;
  title: string;
  subject: string;
  schoolStage: string;
  grade: string;
  lifecycleStatus: string;
  currentVersionId: string | null;
  updatedAt: string;
  createdAt: string;
};

/** Projects the user may re-open, newest first. */
export async function listCoursewareProjects(
  userId: string
): Promise<CoursewareProjectSummary[]> {
  const projects = await db.coursewareProject.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return projects.map((p) => ({
    projectId: p.id,
    title: p.title,
    subject: p.subject,
    schoolStage: p.schoolStage,
    grade: p.grade,
    lifecycleStatus: p.lifecycleStatus,
    currentVersionId: p.currentVersionId,
    updatedAt: p.updatedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
  }));
}

export type CoursewareVersionSummary = {
  versionId: string;
  versionNumber: number;
  parentVersionId: string | null;
  operation: string;
  summary: string;
  lifecycleStatus: string;
  engineeringStatus: string;
  teacherReadiness: string;
  isCurrent: boolean;
  createdAt: string;
};

/**
 * Version history for a project, newest first. Returns null when the project is
 * unknown or not owned by the user (so the API can answer 404 without leaking).
 */
export async function listCoursewareVersions(
  userId: string,
  projectId: string
): Promise<CoursewareVersionSummary[] | null> {
  const project = await db.coursewareProject.findFirst({
    where: { id: projectId, userId },
    select: { id: true, currentVersionId: true },
  });
  if (!project) return null;
  const versions = await db.coursewareVersion.findMany({
    where: { projectId },
    orderBy: { versionNumber: "desc" },
  });
  return versions.map((v) => ({
    versionId: v.id,
    versionNumber: v.versionNumber,
    parentVersionId: v.parentVersionId,
    operation: v.operation,
    summary: v.summary,
    lifecycleStatus: v.lifecycleStatus,
    engineeringStatus: v.engineeringStatus,
    teacherReadiness: v.teacherReadiness,
    isCurrent: v.id === project.currentVersionId,
    createdAt: v.createdAt.toISOString(),
  }));
}

export type CoursewareArtifactSummary = {
  artifactId: string;
  versionId: string;
  artifactType: string;
  status: string;
  storagePath: string;
  sourceDeckSpecHash: string;
  sourceArtifactId: string | null;
  errorDetail: string | null;
  createdAt: string;
};

/**
 * Artifact (export) history for a project, optionally filtered to one version.
 * Returns null when the project is unknown or not owned by the user.
 */
export async function listCoursewareArtifacts(
  userId: string,
  projectId: string,
  versionId?: string
): Promise<CoursewareArtifactSummary[] | null> {
  const project = await db.coursewareProject.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return null;
  const artifacts = await db.coursewareArtifact.findMany({
    where: { projectId, ...(versionId ? { versionId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return artifacts.map((a) => ({
    artifactId: a.id,
    versionId: a.versionId,
    artifactType: a.artifactType,
    status: a.status,
    storagePath: a.storagePath,
    sourceDeckSpecHash: a.sourceDeckSpecHash,
    sourceArtifactId: a.sourceArtifactId,
    errorDetail: a.errorDetail,
    createdAt: a.createdAt.toISOString(),
  }));
}

/**
 * Full version read for project re-open / preview. Ownership + project-scope
 * checked. Returns the frozen DeckSpec, slides, contentPlan, teacher task,
 * source documents and the status trio — everything the workbench needs to
 * rehydrate from the server rather than from client memory.
 */
export type FullVersionResult =
  | {
      ok: true;
      projectId: string;
      versionId: string;
      versionNumber: number;
      parentVersionId: string | null;
      operation: string;
      summary: string;
      deckSpec: DeckSpec | null;
      slides: DesignSlide[];
      contentPlan: ContentPlan | null;
      task: TeacherCoursewareTask | null;
      sourceDocuments: unknown[];
      evidence: unknown[];
      deckSpecHash: string;
      engineeringStatus: string;
      teacherReadiness: string;
      lifecycleStatus: string;
      isCurrent: boolean;
      createdAt: string;
      /** Latest provider-backed visuals attached to this immutable version. */
      renderManifest: Record<string, string>;
      renderManifestArtifactId: string | null;
    }
  | { ok: false; reason: "not_found" | "forbidden" };

export async function loadFullVersion(
  versionId: string,
  userId: string,
  projectId?: string
): Promise<FullVersionResult> {
  const version = await db.coursewareVersion.findUnique({
    where: { id: versionId },
    include: { project: true },
  });
  if (!version) return { ok: false, reason: "not_found" };
  if (projectId && version.projectId !== projectId) {
    return { ok: false, reason: "not_found" };
  }
  if (!version.project || version.project.userId !== userId) {
    return { ok: false, reason: "forbidden" };
  }

  const deckSpec = safeParse<DeckSpec | null>(version.deckSpecSnapshot, null);
  const slides = safeParse<DesignSlide[]>(version.slideContentSnapshot, []);
  const contentPlan = safeParse<ContentPlan | null>(version.contentPlanSnapshot, null);
  const task = safeParse<TeacherCoursewareTask | null>(version.teacherTaskSnapshot, null);
  const sourceDocuments = safeParse<unknown[]>(version.sourceDocumentsSnapshot, []);
  const evidence = safeParse<unknown[]>(version.evidenceSnapshot, []);
  let renderManifest: Record<string, string> = {};
  const visualArtifact = await db.coursewareArtifact.findFirst({
    where: { versionId: version.id, artifactType: "render_manifest", status: "ready" },
    orderBy: { createdAt: "desc" },
  });
  if (visualArtifact?.manifestJson) {
    const manifest = safeParse<{ visuals?: unknown }>(visualArtifact.manifestJson, {});
    if (manifest.visuals && typeof manifest.visuals === "object" && !Array.isArray(manifest.visuals)) {
      renderManifest = Object.fromEntries(
        Object.entries(manifest.visuals).filter(([, value]) => typeof value === "string")
      ) as Record<string, string>;
    }
  }

  return {
    ok: true,
    projectId: version.projectId,
    versionId: version.id,
    versionNumber: version.versionNumber,
    parentVersionId: version.parentVersionId,
    operation: version.operation,
    summary: version.summary,
    deckSpec: deckSpec?.id ? deckSpec : null,
    slides: Array.isArray(slides) ? slides : [],
    contentPlan: contentPlan && typeof contentPlan === "object" ? contentPlan : null,
    task: task && typeof task === "object" ? task : null,
    sourceDocuments: Array.isArray(sourceDocuments) ? sourceDocuments : [],
    evidence: Array.isArray(evidence) ? evidence : [],
    deckSpecHash: version.deckSpecHash,
    engineeringStatus: version.engineeringStatus,
    teacherReadiness: version.teacherReadiness,
    lifecycleStatus: version.lifecycleStatus,
    isCurrent: version.id === version.project.currentVersionId,
    createdAt: version.createdAt.toISOString(),
    renderManifest,
    renderManifestArtifactId: visualArtifact?.id ?? null,
  };
}

/**
 * Look up an already-committed version by its idempotency key (scoped to the
 * project). The commit service uses this to collapse a retried request onto the
 * version it already produced instead of creating a duplicate.
 */
export async function findVersionByIdempotencyKey(
  projectId: string,
  idempotencyKey: string
) {
  return db.coursewareVersion.findFirst({
    where: { projectId, idempotencyKey },
  });
}
