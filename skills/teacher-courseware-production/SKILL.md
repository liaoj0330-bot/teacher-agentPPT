---
name: teacher-courseware-production
description: Build and ship teacher-ready lesson courseware from textbook, teacher-guide, lesson-plan, exercise, assessment, and existing-deck materials. Use when planning, generating, editing, validating, or packaging a real classroom PPT for a specified grade, subject, chapter, and lesson duration, especially when delivery quality, source traceability, visual variety, or teacher usability matters.
---

# Teacher Courseware Production

Use this skill to take a teacher request from source intake to a deliverable lesson package. Treat the PPT as one part of a 45-minute teaching artifact: the deck, pacing, teacher script, board plan, activities, checks for understanding, answers, and source evidence must agree.

## Workflow

1. **Read project state first.** Inspect `project-state/teacher-agentppt.current.json` and `project-state/teacher-agentppt.issue-board.json`. Do not declare production-ready while a P0/P1 issue or an external gate is open.

2. **Normalize the request.** Capture school stage, grade, subject, textbook/publisher/edition, unit/chapter/lesson, duration, teaching objective, classroom constraints, generation mode, and expected delivery files. Ask for missing identifiers when they change content correctness.

3. **Build the material package.** Pass uploaded files and task metadata through `buildTeacherMaterialPackage` in `lib/ppt-agent/teacher-material-package.ts`. Keep roles distinct: a lesson plan or teacher guide is not a textbook. Require a textbook asset, trusted catalog match, or explicit teacher confirmation before making textbook-specific claims. Respect `readiness.status`; stop on `blocked`, surface `needs_confirmation`, and retain parse/citation warnings.

4. **Plan pacing dynamically.** Use `deriveLessonPresentationStrategy` from `lib/ppt-agent/lesson-presentation-strategy.ts` through the existing content planner. Never force a fixed nine-page deck. Validate the resulting plan with `validateContentPlan` in `lib/ppt-agent/content-plan-validator.ts`; every teaching segment needs a distinct intent, student action, and mastery check. Keep slides within the strategy's minimum/maximum range.

5. **Compile subject-appropriate visuals.** Use the visual compiler (`lib/visual-compiler/layout-recipes.ts`, `scene-builder-v2.ts`, and `qa-v2.ts`). Select composition by subject and teaching intent: experiments/evidence/reasoning for physics and sciences; close reading/evidence paths/expression work for language subjects. Reject long runs of the same composition and decks with too few layout families. A visual is optional only when it would reduce clarity; never add decorative imagery to fill a page.

6. **Generate the delivery pack.** Produce the PPTX plus lesson plan, teacher speaking notes, board plan, activities, answer/reference material, homework or exit ticket, and source/evidence manifest. Keep all artifacts tied to the same plan/version and retain the material package in provenance.

7. **Edit immutably.** Use courseware commit APIs for manual edits. Every edit must carry an idempotency key and current version. Treat `version_conflict` as a refresh-and-rebase event. Restore history with `restore_version`; restoration creates a new version and never overwrites an old version. Keep historical versions read-only.

8. **Run gates before handoff.** At minimum run the focused regressions in `scripts/` and `scripts/teacher-courseware-preflight.ps1`. For a release candidate also run the browser golden flow and render/open the final PPTX in the target office environment. Report exact commands, artifact paths, and any skipped external gate.

## Non-negotiable gates

- **Source gate:** no textbook-specific generation when the material package is `blocked`; no silent fallback from textbook to lesson plan.
- **Pacing gate:** page count follows duration and complexity; a 45-minute lesson normally lands around 14 pages and may expand for complex subject requirements.
- **Teaching gate:** the plan includes objectives, teacher moves, student actions, checks for understanding, mastery evidence, practice, closure, and a usable 45-minute flow.
- **Visual gate:** subject-specific layout families are used; repetitive composition is a hard failure, not a cosmetic warning.
- **Artifact gate:** PPTX, notes, board plan, activities, answers, and source evidence are internally consistent and reopenable.
- **Version gate:** edits are immutable, retries are idempotent, stale writes are rejected, and restores produce a new authoritative version.
- **Honesty gate:** distinguish local automated evidence from WPS/PowerPoint target-machine validation, real teacher trial, image-provider availability, and cloud deployment. Do not call the result commercially ready until required external gates pass.

## Repository map

- Source intake: `lib/ppt-agent/teacher-material-package.ts`, `app/api/teacher-courseware-plan/route.ts`, `app/api/generate-ppt/route.ts`
- Pacing and lesson plan: `lib/ppt-agent/lesson-presentation-strategy.ts`, `content-planner.ts`, `content-plan-validator.ts`
- Visual compilation and QA: `lib/visual-compiler/layout-recipes.ts`, `scene-builder-v2.ts`, `qa-v2.ts`
- Versioned editing: `lib/courseware-commit.ts`, `lib/courseware-version.ts`, `components/CanvasWorkbench.tsx`
- State and issue tracking: `project-state/teacher-agentppt.current.json`, `project-state/teacher-agentppt.issue-board.json`
- Regression entry points: `scripts/teacher-material-package-regression.ts`, `teacher-dynamic-page-strategy-regression.mjs`, `teacher-subject-visual-policy-regression.ts`, `teacher-edit-stress-e2e.mjs`, `teacher-two-subject-delivery-e2e.mjs`, `teacher-two-subject-browser-golden-e2e.mjs`

## Handoff format

Return a concise production report containing: request identity, source-package readiness, strategy/page range, generated artifact paths, tests run and results, unresolved warnings, and the three separate statuses `local RC`, `target-office verified`, and `commercially ready`. Include the next blocking action instead of hiding it behind a quality score.
