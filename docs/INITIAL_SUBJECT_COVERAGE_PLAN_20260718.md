# Initial Subject Coverage Plan

This document is the quantitative baseline for expanding teacher courseware beyond the two verified golden subjects. It distinguishes UI input support from a reproducible, teacher-ready subject path.

## Baseline (2026-07-18)

| Area | Measured baseline | Evidence |
| --- | ---: | --- |
| Subject choices in the teacher form | 14 | `components/TeacherPptBetaPrototype.tsx` |
| Subjects with textbook presets | 5 | same form: mathematics, Chinese, English, physics, chemistry |
| Subjects with publisher presets | 5 | same form |
| Subjects with chapter presets | 3 | mathematics, Chinese, English |
| Explicit planner branches | 4 | physics, Chinese, mathematics-topic, English; others use general planning |
| Visual profiles | 3 | `physics`, `chinese`, `general` |
| Subject-specific composition families | 6 | 3 physics + 3 Chinese |
| Verified browser/PPTX golden subjects | 2 | high-school physics and middle-school Chinese |
| Material roles | 8 | textbook, teacher guide, lesson plan, exercise, assessment, existing deck, reference image, other |
| Recognized upload types | 6 | PDF, DOCX, PPTX, TXT, MD, image |
| Scan/OCR support | 0 | scanned PDF is explicitly partial without OCR |
| Dynamic pacing regression cases | 7 | 25/45/60/90 minute cases; 45-minute general=14 pages, physics/Chinese=16 pages |
| Open release blockers | 3 | target-office font portability, broader subject/teacher matrix, cloud deployment |

The current product therefore has 14 input labels but only 2 verified delivery paths. The other 12 must not be described as stable subject support yet.

## Wave A implementation result

The first parallel implementation adds initial contracts for mathematics, chemistry, biology, history, geography, and English:

| Measure | Result |
| --- | ---: |
| Initial subject contracts | 6 |
| Distinct lesson architectures | 6 |
| 45-minute route steps | 42 (7 per subject) |
| Required textbook identity fields | 10 |
| Required material source roles | 4 |
| Teacher deliverable types | 6 |
| Subject visual forms | 24 (4 per subject) |
| Material readiness scenarios | 18 (ready, needs confirmation, blocked per subject) |
| Role-isolation materials | 30 (5 per ready subject) |
| Visual regression pages | 72 (12 per subject) |
| Subject-specific composition families | 18 (3 per subject) |
| Visual QA result | 6/6 subjects passed |

These results raise the automated initial-contract count from 2 to 8 subjects when physics and Chinese are included. The browser/PPTX golden count remains 2 until the new subjects complete full generation, export, reopen, target-office, and teacher acceptance.

## Six-subject real-path result

The no-image product workflow now passes for mathematics, chemistry, biology, history, geography, and English:

- `6/6` subjects pass authentication, parsed local acceptance source ingestion, plan confirmation, generation, workflow review, immutable versioning, PPTX export, durable artifact download/hash comparison, and version reopen.
- The result contains `93` pages and `42` lesson events.
- Each subject has `15-16` pages and `7` lesson events.
- `imageApiCalled=false`; no image quota was consumed.
- Runtime fixes removed visible planning scaffolds, repaired English lesson evidence, added history feedback, prevented false visual-form mismatch, and kept content-draft/page counts aligned.
- V3 remains `blocked` for all six subjects because real render screenshots and human subject/image-semantic reviews are intentionally absent. Internal material, lesson-event and cross-subject P0 findings are zero.

This raises real API/version/export path coverage to `8/8` core subjects when physics and Chinese are included. Browser golden evidence remains `2/8`; textbook factual truth, target-office rendering, and real teacher trials remain separate external gates.

## Definition of primary coverage

A subject is `primary_covered` only when all gates below have evidence:

1. Textbook identity fields (stage, grade, subject, publisher, edition/volume, chapter/lesson) and a textbook asset or explicit teacher confirmation.
2. Material role separation and blocked/needs-confirmation behavior for missing or ambiguous textbook evidence.
3. A 45-minute lesson strategy with teaching events, student actions, checks for understanding, fallback actions, and a dynamic page range.
4. At least three subject-specific visual intents and three non-repeating layout families.
5. A delivery pack containing student deck, teacher notes, board plan, activities, answer/reference material, and homework/exit ticket.
6. One deterministic regression and one browser or API path that proves the topic is present and no cross-subject content leaks into the deck.

## Parallel execution waves

### Wave A: subject contracts (parallel, 4-8 hours)

Implement the initial matrix for mathematics, chemistry, biology, history, geography, and English. Each subject gets a lesson architecture, visual intent registry, textbook metadata presets, and a focused regression. No real image generation is required.

### Wave B: material intake (parallel, 4-8 hours)

Add one representative textbook package per Wave A subject, including textbook/teacher-guide/lesson-plan role separation, edition and chapter matching, and failure cases for partial or missing parsing. Record supported file types and OCR limitations instead of hiding them.

### Wave C: render and delivery proof (parallel, 6-12 hours)

Compile one 45-minute sample per subject using native editable PPT objects, run visual QA, export/reopen the PPTX, and assert that the teacher pack and deck share one plan/version. Generate no remote visual assets unless a sample is explicitly requested.

### Wave D: external acceptance (not automatable)

Open the samples in the target WPS/PowerPoint environment, run one real teacher lesson for at least two subjects, and verify cloud persistence/backup. These gates cannot be replaced by local test results.

## Thin layers to address after Wave A

| Priority | Gap | Measurable next gate |
| --- | --- | --- |
| P0 external | WPS/PowerPoint font substitution and projection layout | Open two representative decks on target machines and record overflow, wrapping, overlap, and mojibake |
| P0 external | Real teacher usability | One 45-minute lesson trial for physics and Chinese, then one trial from Wave A |
| P0 external | Cloud delivery | HTTPS deployment, durable database/object storage, backup/restore, health checks, quotas, and logs |
| P1 | Textbook breadth | Per-subject catalog/edition matrix and at least one verified chapter per target grade band |
| P1 | PDF scans and image-heavy materials | OCR or explicit manual transcription workflow with evidence and confidence labels |
| P1 | Rendering scale | Move image data out of SQLite to object storage before high-concurrency production |
| P1 | Cross-subject leakage | Keep a multi-subject regression comparing roles, titles, content fingerprints, and forbidden vocabulary |
| P2 | Template breadth | Add more layout families only after subject intent and teaching evidence are stable |

## Scoring hardening result

The subject rollout uses `teacher-subject-scoring/v1` instead of relying on a single total score:

| Dimension | Maximum | Review-copy minimum | Classroom-ready minimum |
| --- | ---: | ---: | ---: |
| Textbook alignment | 25 | 18 | 20 |
| Pedagogy | 25 | 18 | 20 |
| Subject correctness | 20 | 15 | 16 |
| Visual expression | 15 | 9 | 10 |
| Engineering quality | 10 | 6 | 8 |
| Teacher trial evidence | 5 | 0 | 5 |
| Total | 100 | 75 | 85 |

All six initial subjects pass the deterministic positive scoring case; six negative cases are blocked for ambiguous material, missing lesson events, missing teacher deliverables, cross-subject leakage, repetitive composition, or missing render/screenshots. A P0 blocks delivery even when the numeric total is above the threshold.

Automatic evidence is capped at 95 points. The final five points require persisted `teacher-classroom-trial/v1` evidence with a server-bound reviewer, start/end and actual duration, five rubric answers, issues, and a reuse decision. Workflow submission alone does not count as a trial. `commercialReady` remains false while external gates are open.

Remaining scoring gaps: add the teacher-facing trial-evidence form and add student learning-result metrics after real classroom pilots.

## Reporting rule

Every progress report must state four numbers separately: subject choices, subjects with material contracts, subjects with automated regressions, and subjects with real teacher/target-office evidence. A larger dropdown count is not coverage.
