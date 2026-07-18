/**
 * Courseware commit service (Section 2 / 069 interaction closure)
 *
 * The single server-side entry point that turns every content-changing teacher
 * action into a new *immutable* CoursewareVersion. It never trusts a client
 * DeckSpec / slides array: it reloads the frozen snapshot of `baseVersionId`,
 * applies the requested operation server-side, re-hashes, recomputes teacher
 * readiness, then appends a fresh version that preserves parentVersionId.
 *
 * Concurrency is optimistic: a commit whose baseVersionId is no longer the
 * project's currentVersionId is rejected with 409 VERSION_CONFLICT. Retries are
 * collapsed with the per-project idempotencyKey.
 */
import { prisma as db } from "@/lib/db";
import {
  loadFullVersion,
  findVersionByIdempotencyKey,
  upsertCoursewareVersion,
  writeCoursewareArtifact,
  type CoursewareOperation,
} from "@/lib/courseware-version";
import { computeDeckSpecHash } from "@/lib/deck-spec";
import { refineProject } from "@/lib/project-refine";
import { scoreTeacherDeckV2 } from "@/lib/teacher-deck-scoring";
import type {
  CanvasProject,
  DeckSpec,
  DesignSlide,
  SlideLayout,
} from "@/lib/canvas-data";
import type { ContentPlan } from "@/lib/ppt-agent/content-plan";
import type { SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";
import type { LayoutPlan } from "@/lib/ppt-agent/layout-plan";
import type { VisibleContentBlock } from "@/lib/ppt-agent/slide-content-draft";
import type { TeacherCoursewareTask } from "@/lib/teacher-courseware-task";
import { findScaffoldMatches } from "@/lib/ppt-agent/slide-content-validator";
import { createTeacherTrialEvidence, type TeacherTrialEvidenceInput } from "@/lib/teacher-trial-evidence";

/** Whitelisted fields a manual edit may touch. Anything else is ignored. */
export type ManualEditPatch = {
  title?: string;
  subtitle?: string;
  bullets?: string[];
  speakerNote?: string;
  layout?: SlideLayout;
  sections?: DesignSlide["sections"];
};

/** The nine content-changing operations the commit endpoint accepts. */
export const COMMIT_OPERATIONS: CoursewareOperation[] = [
  "manual_edit",
  "attach_material",
  "ai_refine_page",
  "ai_refine_deck",
  "classroom_interaction",
  "generate_visuals",
  "apply_page_review_fixes",
  "apply_review_fixes",
  "restore_version",
  "teacher_submit_for_review",
];

/** Source-document / uploaded-file metadata bound into a version. */
export type SourceDocumentMeta = {
  id?: string;
  name?: string;
  kind?: string;
  bytes?: number;
  origin?: string;
  addedAt?: string;
  [key: string]: unknown;
};

export type CommitInput = {
  userId: string;
  projectId: string;
  baseVersionId: string;
  operation: CoursewareOperation;
  idempotencyKey?: string;
  /** Restricted, operation-specific payload — never a full client DeckSpec. */
  payload?: {
    /** manual_edit: which slide to patch + the whitelisted fields. */
    slideId?: string;
    patch?: ManualEditPatch;
    /** ai_refine_page / apply_page_review_fixes: which slide to target. */
    targetSlideId?: string;
    /** ai_refine_* / apply_*_fixes: natural-language steering. */
    instruction?: string;
    /** attach_material: new source documents to bind into this version. */
    sourceDocuments?: SourceDocumentMeta[];
    /** classroom_interaction: a note describing the live interaction. */
    interactionNote?: string;
    /** generate_visuals: provider-returned image URLs/data URIs keyed by slide ID. */
    renderManifest?: Record<string, string>;
    /** restore_version: historical version to copy into a new immutable version. */
    restoreVersionId?: string;
    /** the chat/request text this version was generated from (provenance). */
    basis?: string;
    /** teacher_submit_for_review: optional structured evidence from a real classroom trial. */
    trialEvidence?: TeacherTrialEvidenceInput;
  };
};

export type CommitResult =
  | {
      ok: true;
      projectId: string;
      versionId: string;
      versionNumber: number;
      parentVersionId: string | null;
      operation: CoursewareOperation;
      lifecycleStatus: string;
      engineeringStatus: string;
      teacherReadiness: string;
      deckSpec: DeckSpec | null;
      slides: DesignSlide[];
      artifactId?: string;
      deduped: boolean;
    }
  | {
      ok: false;
      status: number;
      code:
        | "not_found"
        | "forbidden"
        | "invalid_operation"
        | "version_conflict"
        | "invalid_payload"
        | "no_content_change";
      message: string;
    };

type Readiness = "pending" | "review_required" | "ready_for_teacher" | "failed";

/**
 * Recompute teacher readiness for edited slides. Engineering evidence is a
 * separate, carried-forward concern (see engineeringStatus): here we score only
 * the content the edit actually touched. Engineering findings remain unsatisfied
 * until the export artifact itself supplies real OOXML/render evidence.
 *
 * Three honest outcomes:
 *   - content P0 present            → "failed"  (export blocked)
 *   - teacher_submit_for_review + clean content → "ready_for_teacher"
 *   - otherwise                     → "review_required" (never auto-ready)
 */
function recomputeReadiness(
  task: TeacherCoursewareTask | null,
  slides: DesignSlide[],
  submitted: boolean
): Readiness {
  const visibleText = slides.flatMap((slide) => [slide.title, slide.subtitle, ...(slide.bullets || [])]).join(" ");
  if (findScaffoldMatches(visibleText).length > 0) return "failed";

  const report = scoreTeacherDeckV2({
    scene: "teacher_courseware",
    teacherStage: task?.schoolStage,
    topic: task?.topic,
    slides: slides.map((slide, index) => ({
      page: index + 1,
      id: slide.id,
      role: slide.pageIntent,
      title: slide.title,
      body: slide.subtitle,
      bullets: slide.bullets,
      layout: slide.layout,
    })),
    teacherTrial: { trialCompleted: false, reviewedByTeacher: false },
  });
  const contentP0 = report.p0.filter((item) => !/真实渲染截图|OOXML可编辑性/.test(item));
  if (contentP0.length > 0) return "failed";
  if (submitted) return "ready_for_teacher";
  return "review_required";
}

/**
 * Keep the frozen DeckSpec consistent with the edited slides so the export
 * route's content-hash guard still passes. Titles are synced back onto matching
 * specs (by slideId/id) and the contentHash is recomputed from the specs.
 */
function syncDeckSpec(
  deckSpec: DeckSpec | null,
  slides: DesignSlide[]
): DeckSpec | null {
  if (!deckSpec) return null;
  const byId = new Map(slides.map((slide) => [slide.id, slide]));
  const slideSpecs = deckSpec.slideSpecs.map((spec) => {
    const slide = byId.get(spec.slideId || "") || byId.get(spec.id);
    if (!slide) return spec;
    const layoutChanged = Boolean(slide.layout && slide.layout !== spec.layoutIntent);
    const visibleBlocks: VisibleContentBlock[] = [
      ...(slide.subtitle ? [{ type: "point" as const, title: "核心说明", body: slide.subtitle, priority: "must" as const }] : []),
      ...(slide.bullets || []).map((body, index) => ({ type: "point" as const, title: `要点 ${index + 1}`, body, priority: "must" as const })),
    ];
    return {
      ...spec,
      title: slide.title,
      finalTitle: slide.title,
      visibleBlocks,
      layoutIntent: slide.layout || spec.layoutIntent,
      selectedLayout: layoutChanged ? undefined : spec.selectedLayout,
      layoutFamily: layoutChanged ? undefined : spec.layoutFamily
    };
  });
  const contentHash = computeDeckSpecHash(slideSpecs);
  return { ...deckSpec, slideSpecs, contentHash };
}

/** Apply a whitelisted manual patch to a single slide. */
function applyManualEdit(
  slides: DesignSlide[],
  slideId: string | undefined,
  patch: ManualEditPatch | undefined
): DesignSlide[] {
  if (!slideId || !patch) return slides;
  return slides.map((slide) => {
    if (slide.id !== slideId) return slide;
    const next: DesignSlide = { ...slide };
    if (typeof patch.title === "string") next.title = patch.title;
    if (typeof patch.subtitle === "string") next.subtitle = patch.subtitle;
    if (Array.isArray(patch.bullets)) {
      next.bullets = patch.bullets.filter((b) => typeof b === "string");
    }
    if (typeof patch.speakerNote === "string") next.speakerNote = patch.speakerNote;
    if (typeof patch.layout === "string") next.layout = patch.layout;
    if (Array.isArray(patch.sections)) next.sections = patch.sections;
    return next;
  });
}

/**
 * Build a minimal, valid CanvasProject from frozen version snapshots so the
 * deterministic refineProject() can run server-side without any network.
 */
function projectFromSnapshot(
  task: TeacherCoursewareTask | null,
  contentPlan: ContentPlan | null,
  slidePagePlans: SlidePagePlan[],
  layoutPlans: LayoutPlan[],
  deckSpec: DeckSpec | null,
  slides: DesignSlide[]
): CanvasProject {
  return {
    title: task?.topic || "教师课件",
    prompt: task?.topic || "",
    mode: "agent",
    outline: [],
    research: [],
    plan: [],
    slides,
    deckSpec: deckSpec || undefined,
    contentPlan: contentPlan || undefined,
    slidePagePlans,
    layoutPlans,
  };
}

/** Refine only the targeted slide, preserving all others verbatim. */
function refinePage(
  base: CanvasProject,
  targetSlideId: string | undefined,
  instruction: string
): DesignSlide[] {
  const { project } = refineProject(base, instruction, "auto");
  if (!targetSlideId) return project.slides;
  const refinedById = new Map(project.slides.map((s) => [s.id, s]));
  return base.slides.map((slide) =>
    slide.id === targetSlideId ? refinedById.get(slide.id) || slide : slide
  );
}

function applyClassroomInteraction(
  baseSlides: DesignSlide[],
  targetSlideId: string | undefined,
  interactionNote: string,
): DesignSlide[] {
  const targetIndex = Math.max(0, baseSlides.findIndex((slide) => slide.id === targetSlideId));
  const target = baseSlides[targetIndex];
  if (!target) return baseSlides;
  const activity = /练习/.test(interactionNote)
    ? `随堂练习：请运用“${target.title}”中的方法完成一个同类问题，并写出关键步骤。`
    : /小结|总结/.test(interactionNote)
      ? `课堂小结：请用一句话概括“${target.title}”的核心结论，并提出一个仍需澄清的问题。`
      : `课堂提问：围绕“${target.title}”，你认为最关键的条件是什么？请说明判断依据。`;
  const bullets = [...(target.bullets || [])];
  if (!bullets.includes(activity)) bullets.push(activity);
  const note = `课堂互动建议：${activity}`;
  const speakerNote = target.speakerNote?.includes(note)
    ? target.speakerNote
    : [target.speakerNote, note].filter(Boolean).join("\n");
  return baseSlides.map((slide, index) => index === targetIndex ? { ...slide, bullets, speakerNote } : slide);
}
function applyDeckWidePolish(baseSlides: DesignSlide[], refinedSlides: DesignSlide[], instruction: string): DesignSlide[] {
  const refinedById = new Map(refinedSlides.map((slide) => [slide.id, slide]));
  const alternateLayout: Partial<Record<SlideLayout, SlideLayout>> = {
    cards: "matrix",
    matrix: "checklist",
    checklist: "process",
    process: "timeline",
    timeline: "comparison",
    comparison: "split",
    split: "stats",
    stats: "comparison",
    quote: "split",
    source: "cards",
    agenda: "timeline",
  };
  return baseSlides.map((baseSlide, index) => {
    const refined = refinedById.get(baseSlide.id) || baseSlide;
    const layout = index === 0
      ? "cover"
      : refined.layout === baseSlide.layout
        ? (baseSlide.layout ? alternateLayout[baseSlide.layout] : undefined) || "cards"
        : refined.layout;
    const visualPrompt = `统一教学视觉｜第 ${index + 1} 页｜${refined.title}｜清晰层级、课堂投影可读、与整套课件一致`;
    const transitionNote = `整套课件衔接：本页“${refined.title}”承接上一环节，并为下一页建立明确过渡。`;
    const speakerNote = refined.speakerNote?.includes(transitionNote)
      ? refined.speakerNote
      : [refined.speakerNote, transitionNote].filter(Boolean).join("\n");
    return { ...refined, layout, visualPrompt, speakerNote };
  });
}
const OPERATION_SUMMARY: Record<CoursewareOperation, string> = {
  initial_generate: "初始生成",
  regenerate: "重新生成",
  manual_edit: "教师手动编辑",
  attach_material: "绑定新素材",
  ai_refine_page: "AI 单页精修",
  ai_refine_deck: "AI 整份精修",
  classroom_interaction: "课堂互动记录",
  generate_visuals: "生成可视化配图",
  apply_page_review_fixes: "应用单页评审修复",
  apply_review_fixes: "应用整份评审修复",
  restore_version: "恢复历史版本",
  teacher_submit_for_review: "教师提交审核",
};

/**
 * Commit one content-changing operation as a new immutable CoursewareVersion.
 */
export async function commitCoursewareVersion(
  input: CommitInput
): Promise<CommitResult> {
  const { userId, projectId, baseVersionId, operation, idempotencyKey } = input;
  const payload = input.payload || {};

  if (!COMMIT_OPERATIONS.includes(operation)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_operation",
      message: `Unsupported operation: ${operation}`,
    };
  }

  // Collapse retries: a repeated idempotencyKey returns the version it produced.
  if (idempotencyKey) {
    const existing = await findVersionByIdempotencyKey(projectId, idempotencyKey);
    if (existing) {
      const full = await loadFullVersion(existing.id, userId, projectId);
      if (full.ok) {
        return {
          ok: true,
          projectId: full.projectId,
          versionId: full.versionId,
          versionNumber: full.versionNumber,
          parentVersionId: full.parentVersionId,
          operation,
          lifecycleStatus: full.lifecycleStatus,
          engineeringStatus: full.engineeringStatus,
          teacherReadiness: full.teacherReadiness,
          deckSpec: full.deckSpec,
          slides: full.slides,
          deduped: true,
        };
      }
    }
  }

  // Load the frozen base snapshot (ownership-checked).
  const base = await loadFullVersion(baseVersionId, userId, projectId);
  if (!base.ok) {
    return base.reason === "forbidden"
      ? { ok: false, status: 403, code: "forbidden", message: "Not your project." }
      : { ok: false, status: 404, code: "not_found", message: "Version not found." };
  }

  // Optimistic concurrency: base must still be the project's current version.
  if (!base.isCurrent) {
    return {
      ok: false,
      status: 409,
      code: "version_conflict",
      message:
        "baseVersionId is stale; reload the current version before editing.",
    };
  }

  let source = base;
  if (operation === "restore_version") {
    const restoreVersionId = payload.restoreVersionId?.trim();
    if (!restoreVersionId || restoreVersionId === baseVersionId) {
      return {
        ok: false,
        status: 400,
        code: "invalid_payload",
        message: "restore_version requires a historical restoreVersionId.",
      };
    }
    const historical = await loadFullVersion(restoreVersionId, userId, projectId);
    if (!historical.ok) {
      return historical.reason === "forbidden"
        ? { ok: false, status: 403, code: "forbidden", message: "Not your project." }
        : { ok: false, status: 404, code: "not_found", message: "Restore version not found." };
    }
    source = historical;
  }

  // loadFullVersion omits the page/layout plan snapshots — read them directly.
  const row = await db.coursewareVersion.findUnique({
    where: { id: source.versionId },
    select: { slidePagePlanSnapshot: true, layoutPlanSnapshot: true },
  });
  const slidePagePlans = safeParseArray<SlidePagePlan>(row?.slidePagePlanSnapshot);
  const layoutPlans = safeParseArray<LayoutPlan>(row?.layoutPlanSnapshot);

  // ── Apply the operation server-side on the frozen snapshot ─────────────────
  let slides = source.slides;
  let sourceDocuments = [...source.sourceDocuments];
  let renderManifest: Record<string, string> | null = null;
  const submitted = operation === "teacher_submit_for_review";

  const canvas = projectFromSnapshot(
    source.task,
    source.contentPlan,
    slidePagePlans,
    layoutPlans,
    source.deckSpec,
    source.slides
  );
  const instruction = (payload.instruction || "").trim();

  switch (operation) {
    case "manual_edit":
      if (!payload.slideId || !payload.patch) {
        return {
          ok: false,
          status: 400,
          code: "invalid_payload",
          message: "manual_edit requires { slideId, patch }.",
        };
      }
      slides = applyManualEdit(slides, payload.slideId, payload.patch);
      break;
    case "ai_refine_page":
      slides = refinePage(canvas, payload.targetSlideId, instruction || "自动微调");
      break;
    case "ai_refine_deck":
      slides = applyDeckWidePolish(slides, refineProject(canvas, instruction || "自动微调", "auto").project.slides, instruction);
      break;
    case "apply_page_review_fixes":
      slides = refinePage(canvas, payload.targetSlideId, instruction || "按评审意见修复本页");
      break;
    case "apply_review_fixes":
      slides = refineProject(canvas, instruction || "按评审意见整体修复", "auto").project.slides;
      break;
    case "attach_material": {
      const docs = Array.isArray(payload.sourceDocuments) ? payload.sourceDocuments : [];
      if (!docs.length) {
        return {
          ok: false,
          status: 400,
          code: "invalid_payload",
          message: "attach_material requires at least one source document.",
        };
      }
      const stamped = docs.map((doc) => ({
        ...doc,
        origin: doc.origin || "teacher_upload",
        addedAt: doc.addedAt || new Date().toISOString(),
      }));
      sourceDocuments = [...sourceDocuments, ...stamped];
      break;
    }
    case "classroom_interaction": {
      if (!payload.interactionNote) {
        return {
          ok: false,
          status: 400,
          code: "invalid_payload",
          message: "classroom_interaction requires an interactionNote.",
        };
      }
      // Classroom actions must change the visible target page, not only append provenance.
      slides = applyClassroomInteraction(slides, payload.targetSlideId, payload.interactionNote);
      sourceDocuments = [
        ...sourceDocuments,
        {
          kind: "classroom_interaction",
          origin: "classroom",
          note: payload.interactionNote,
          addedAt: new Date().toISOString(),
        },
      ];
      break;
    }
    case "generate_visuals": {
      const supplied = payload.renderManifest && typeof payload.renderManifest === "object"
        ? payload.renderManifest
        : {};
      renderManifest = {};
      for (let i = 0; i < slides.length; i += 1) {
        const slide = slides[i];
        const image = typeof supplied[slide.id] === "string" ? supplied[slide.id].trim() : "";
        if (image) renderManifest[slide.id] = image;
      }
      break;
    }
    case "restore_version":
      sourceDocuments.push({
        kind: "version_restore",
        origin: "version_history",
        restoredFromVersionId: source.versionId,
        addedAt: new Date().toISOString(),
      });
      break;
    case "teacher_submit_for_review":
      // Workflow approval and classroom-trial proof are separate facts. Existing
      // callers may submit without trialEvidence; that never earns trial points.
      if (payload.trialEvidence) {
        try {
          sourceDocuments.push(createTeacherTrialEvidence(payload.trialEvidence, userId));
        } catch (error) {
          return {
            ok: false,
            status: 400,
            code: "invalid_payload",
            message: `真实试讲证据无效：${error instanceof Error ? error.message : "未知错误"}`,
          };
        }
      }
      break;
  }

  const slidesChanged = JSON.stringify(slides) !== JSON.stringify(base.slides);
  const operationsThatRequireVisibleChange: CoursewareOperation[] = [
    "manual_edit",
    "ai_refine_page",
    "ai_refine_deck",
    "classroom_interaction",
    "apply_page_review_fixes",
    "apply_review_fixes",
  ];
  if (operationsThatRequireVisibleChange.includes(operation) && !slidesChanged) {
    return {
      ok: false,
      status: 422,
      code: "no_content_change",
      message: "本次操作没有产生可见课件变化，未创建空版本。",
    };
  }
  // Keep the DeckSpec content-hash consistent with the (possibly) edited slides.
  const deckSpec = syncDeckSpec(source.deckSpec, slides);

  // Engineering evidence is inherited verbatim; teacher readiness is recomputed
  // on the resulting content (submit is the only path to ready_for_teacher).
  const engineeringStatus = (source.engineeringStatus === "passed"
    ? "passed"
    : source.engineeringStatus === "failed"
      ? "failed"
      : "pending") as "pending" | "passed" | "failed";
  const teacherReadiness = recomputeReadiness(source.task, slides, submitted);

  // Provenance: fold the generation basis into the version's source record.
  if (payload.basis) {
    sourceDocuments = [
      ...sourceDocuments,
      {
        kind: "generation_basis",
        origin: "chat",
        text: payload.basis,
        addedAt: new Date().toISOString(),
      },
    ];
  }

  const inserted = await upsertCoursewareVersion({
    userId,
    task: source.task as TeacherCoursewareTask,
    contentPlan: (source.contentPlan || {}) as ContentPlan,
    slidePagePlans,
    layoutPlans,
    deckSpec,
    slides,
    evidence: source.evidence,
    engineeringStatus,
    teacherReadiness,
    requestedProjectId: projectId,
    requestType: "edit_commit",
    parentVersionId: baseVersionId,
    operation,
    summary: OPERATION_SUMMARY[operation],
    idempotencyKey,
    sourceDocuments,
  });

  // Versioned visuals: persist a render_manifest artifact keyed to the new
  // version so generated imagery is traceable without bloating the DeckSpec.
  let artifactId: string | undefined;
  if (renderManifest) {
    const written = await writeCoursewareArtifact({
      projectId: inserted.projectId,
      versionId: inserted.versionId,
      artifactType: "render_manifest",
      status: "ready",
      sourceDeckSpecHash: deckSpec?.contentHash || "",
      manifestJson: { visuals: renderManifest },
    });
    artifactId = written.artifactId;
  }

  return {
    ok: true,
    projectId: inserted.projectId,
    versionId: inserted.versionId,
    versionNumber: inserted.versionNumber,
    parentVersionId: baseVersionId,
    operation,
    lifecycleStatus: inserted.lifecycleStatus,
    engineeringStatus,
    teacherReadiness,
    deckSpec,
    slides,
    artifactId,
    deduped: false,
  };
}

function safeParseArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
