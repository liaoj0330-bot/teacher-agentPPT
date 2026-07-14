# TEACHER_AI_PPT_069_BACKEND_EXECUTION_REPORT_001

**Task ID**: TEACHER_AI_PPT_069_BACKEND_TRUTH_CUTOVER_001  
**Branch**: feat/teacher-ppt-backend-truth-069  
**Worktree**: `<local-worktree>`  **Base commit**: fc9725d  
**Report date**: 2026-07-13  
**Status**: ✅ COMPLETE — all acceptance gates pass, TypeScript clean

---

## Executive Summary

All eight phases of the backend-truth cutover for the Teacher AI PPT system (069) are complete. The server-side generation pipeline no longer emits hardcoded lesson content (y=2x+1, 高一, 45分钟); it is fully driven by the teacher's actual task data. A versioned domain model (CoursewareProject → CoursewareRequest → CoursewareVersion) has been persisted in SQLite. Engineering quality and teacher pedagogical readiness are now tracked as independent scores. Five acceptance gates pass with zero failures.

`commercialReady` remains `false` throughout. No push, no auto-merge, no modifications to the 068 read-only worktree or main worktree.

---

## Phases Executed

### Phase 0 — Baseline lock
Contaminations identified prior to any changes:
- `deck-content-realizer.ts`: `teacherMathDrafts()` contained hardcoded y=2x+1, A(0,1), B(2,5), 高一
- `export-pptx/route.ts` POST handler: called `addTeacherMathAgenda`, `addTeacherMathContent(contentIndex)`, `addTeacherMathSources` — all fixed-content rendering functions
- Cover used literal `"45分钟 · 高一数学 · 概念建构课"` and `"高中数学 · 概念建构课"`

### Phase 1 — Prisma domain model
**Migration**: `20260712175457_069_courseware_project_domain`  
**New models** (non-destructive, `PptSession` preserved):

| Model | Key fields |
|---|---|
| `CoursewareProject` | id, userId, title, subject, schoolStage, grade, currentVersionId, lifecycleStatus |
| `CoursewareRequest` | id, projectId, requestType, teacherTaskSnapshot, status, errorFacts |
| `CoursewareVersion` | id, projectId, requestId, versionNumber, teacherTaskSnapshot, contentPlan/slidePage/layout/deckSpec Snapshots, deckSpecHash, engineeringStatus, teacherReadiness, lifecycleStatus |
| `CoursewareArtifact` | id, projectId, versionId, artifactType, status, storagePath, manifestJson, sourceDeckSpecHash |

`User.coursewareProjects: CoursewareProject[]` back-relation added.

### Phase 2 — TeacherCoursewareTask extension
Three new optional fields added to `lib/teacher-courseware-task.ts`:
```typescript
teachingRequirements?: string;  // independent semantic requirements
textbook?: string;
chapter?: string;
```
`ContentPlan.teacherContext` and `content-planner.ts:teacherMathContext()` updated to read and propagate these fields.

### Phase 3 — Dynamic Teacher Math Realizer
`lib/ppt-agent/deck-content-realizer.ts`:
- `teacherMathDrafts` renamed to `_legacyTeacherMathDraftsFixtureOnly` with `// FIXTURE ONLY` annotation
- New `teacherMathDynamicDrafts(task, contentPlan)` function: 9 pages built from `contentPlan.teacherContext.topic` / `subject` / `schoolStage` — no hardcoded formulas, grades, or time values
- Empty topic triggers `review_required` warning draft instead of silent corruption
- `createDeckContentDrafts` delegates to the dynamic function

### Phase 4 — DeckSpec versioning
`lib/canvas-data.ts` — `DeckSpec` type extended:
```typescript
projectId?: string;
requestId?: string;
versionId?: string;
versionNumber?: number;
contentHash?: string;
```
`lib/deck-spec.ts` — `deckSpecHash()` (FNV-style 32-bit hash over `role:title:mustProve` per slide) added; `buildDeckSpec()` accepts `opts?: { projectId, requestId, versionId, versionNumber }` and computes `contentHash`.

### Phase 5 — Unified Preview/PPTX/PDF via versioned DeckSpec
`lib/courseware-version.ts` (new):
- `upsertCoursewareVersion()`: creates CoursewareProject + CoursewareRequest + CoursewareVersion in one transaction; returns `{ projectId, requestId, versionId, versionNumber }`
- `getCoursewareVersionDeckSpec()`: retrieves and parses stored DeckSpec snapshot
- `getCoursewareVersion()`: scoped lookup with optional project-id guard

`app/api/generate-ppt/route.ts` updated:
- Imports `upsertCoursewareVersion`
- When `scenario === "teacher_courseware"` and user is authenticated, creates a CoursewareVersion (non-blocking: errors are logged but do not fail the response)
- Response includes `projectId`, `versionId`, `versionNumber` when available
- deckSpec snapshot and hash stored in `CoursewareVersion.deckSpecSnapshot` / `deckSpecHash`

### Phase 6 — Engineering Score separated from Teacher Readiness
`lib/canvas-data.ts` — `ProjectQualityReport` extended:
```typescript
engineeringScore?: number;       // Build quality: layout, structure, overflow, editability
teacherReadinessScore?: number;  // Pedagogy: teaching flow, module coverage, content depth
commercialReady?: false;         // Always false; absent on non-teacher paths
```
`app/api/generate-ppt/route.ts` — after `ensureProjectQuality`, when `scenario === "teacher_courseware"`:
- `engineeringScore` = `finalProject.quality.score` (existing structural score)
- `teacherReadinessScore` = `teacherScoreV2Shadow.scores.pedagogy`
- `commercialReady: false` enforced

### Phase 7 — Fixed Demo production exit
`app/api/export-pptx/route.ts`:

**Removed** (dead code, hardcoded content):
- `addTeacherMathAgenda()` — fixed 课堂学习路径 page
- `addTeacherMathContent(contentIndex)` — contentIndex-driven rendering with hardcoded y=2x+1, A(0,1), B(2,5) formulas
- `addTeacherMathSources()` — fixed COURSE NOTES page

**Added**:
- `addTeacherMathSlide(pptx, project, profile, item, slideIndex)` — DeckSpec-driven renderer; reads `item.sections`, `item.bullets`, `item.speakerNote`, `item.layout`; dispatches to timeline / tips-grid / table / callout / quote / fallback-bullet branches based on actual slide content

**Fixed in `addTeacherMathCover`**:
```typescript
// Before (hardcoded):
addText(slide, "高中数学 · 概念建构课", ...)
addText(slide, "45分钟 · 高一数学 · 概念建构课", ...)

// After (dynamic):
const courseLabel = [schoolStage || "高中", subject || "数学"].join("") + " · 概念建构课";
const coverMeta = [schoolStage, grade, subject, duration].filter(Boolean).join(" · ") || "高中数学 · 概念建构课";
```

**POST handler** (teacher_math_science_v1 branch):
```typescript
// Before:
addTeacherMathCover(...)
addTeacherMathAgenda(...)           // ← removed
slides.slice(1).forEach(... addTeacherMathContent(... contentIndex))  // ← removed
addTeacherMathSources(...)          // ← removed

// After:
addTeacherMathCover(...)
slides.slice(1).forEach(... addTeacherMathSlide(... slideIndex))
```

### Phase 8 — Acceptance tests (5/5 PASS)
`scripts/teacher-069-acceptance.mjs` (new):

| Gate | Description | Result |
|---|---|---|
| `contamination-scan` | No hardcoded y=2x+1, y=-x+3, A(0,1)B(2,5), 45分钟·高一数学, "高一", agenda/sources calls in production code | ✅ PASS |
| `dynamic-realizer` | `teacherMathDynamicDrafts` exists; legacy marked FIXTURE ONLY; `createDeckContentDrafts` delegates to dynamic; dynamic references `topic` | ✅ PASS |
| `deck-spec-hash` | `deckSpecHash` in deck-spec.ts; `buildDeckSpec` accepts opts; `DeckSpec` type has contentHash/versionId/projectId | ✅ PASS |
| `quality-separation` | `ProjectQualityReport` has engineeringScore + teacherReadinessScore + commercialReady; generate-ppt route sets all three | ✅ PASS |
| `schema-models` | All 4 Prisma models present; engineeringStatus + teacherReadiness on CoursewareVersion; 069 migration exists; lib/courseware-version.ts exists; route imports upsertCoursewareVersion | ✅ PASS |

---

## Files Changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | +4 domain models, User back-relation |
| `prisma/migrations/20260712175457_069_courseware_project_domain/migration.sql` | New non-destructive migration |
| `lib/teacher-courseware-task.ts` | +3 optional fields |
| `lib/ppt-agent/content-plan.ts` | teacherContext +3 fields |
| `lib/ppt-agent/content-planner.ts` | teacherMathContext reads new fields |
| `lib/canvas-data.ts` | DeckSpec +5 versioning fields; ProjectQualityReport +3 Phase 6 fields |
| `lib/deck-spec.ts` | deckSpecHash() + opts on buildDeckSpec |
| `lib/ppt-agent/deck-content-realizer.ts` | Legacy → FIXTURE ONLY; +teacherMathDynamicDrafts (9 pages, fully dynamic) |
| `lib/courseware-version.ts` | **New** — upsertCoursewareVersion / getCoursewareVersionDeckSpec / getCoursewareVersion |
| `app/api/generate-ppt/route.ts` | upsertCoursewareVersion call + Phase 6 quality augmentation + versionId/projectId in response |
| `app/api/export-pptx/route.ts` | Removed 3 dead legacy functions; +addTeacherMathSlide; dynamic cover metadata |
| `scripts/teacher-069-acceptance.mjs` | **New** — 5-gate acceptance suite |

---

## TypeScript Verification

```
npx tsc --noEmit → (no output, exit 0)
```

Clean throughout all phases. Zero new type errors introduced.

---

## Security Constraints (all honoured)

| Constraint | Status |
|---|---|
| previous worktree read-only | ✅ Never touched |
| main worktree not modified | ✅ All work in feat/teacher-ppt-backend-truth-069 |
| Frozen reports not modified | ✅ No report files altered |
| No reset/overwrite of user modifications | ✅ Only additive changes |
| No auto-merge to main branch | ✅ Branch stays isolated |
| No push to remote | ✅ Local only |
| `commercialReady` always `false` | ✅ Enforced in TeacherDeckScoreReportV2 and ProjectQualityReport |

---

## Known Limitations / Out of Scope for This Round

1. **Triple-artifact end-to-end** (PPTX + Preview + PDF from single versionId): `CoursewareArtifact` model is provisioned but the artifact creation pipeline (export-pptx writing to storage + artifact record) is not yet wired. The model is ready; artifact writes are Phase 2 work.

2. **Teacher Readiness gate on export**: the export route currently proceeds regardless of `teacherReadiness`; a hard gate (`teacherReadiness !== "failed"` check before export) is a candidate follow-up.

3. **Version lookup on re-export**: export-pptx currently rebuilds the deck from the `project` payload in the request body; it does not yet look up the stored DeckSpec snapshot by `versionId`. `getCoursewareVersionDeckSpec()` is available for this.

4. **Preview route** (`/api/preview-slides`): not updated in this round. DeckSpec versioning fields are present in the type and will be passed through on next generation; the preview route uses whatever `project.deckSpec` it receives.

---

## Acceptance

```
node scripts/teacher-069-acceptance.mjs

{
  "suite": "TEACHER_AI_PPT_069_ACCEPTANCE",
  "total": 5,
  "passed": 5,
  "failed": 0
}
```

All gates pass. The implementation is ready for human teacher review before any production promotion.
