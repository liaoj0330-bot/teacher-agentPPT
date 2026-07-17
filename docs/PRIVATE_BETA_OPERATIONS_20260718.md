# Teacher AgentPPT Private Beta Operations

This is the operating plan for the next-month invitation beta. It is intentionally stricter than a product feature list: a teacher who can sign in is not proof that the service can admit another teacher, and an automated score is not proof that a lesson worked in a classroom.

The machine-readable policy is [`project-state/teacher-agentppt.private-beta-operations.json`](../project-state/teacher-agentppt.private-beta-operations.json). Run `npm run teacher-private-beta:check` before inviting a new cohort.

## Current Product Position

The verified baseline on 2026-07-18 is:

| Evidence | Result | What it proves |
| --- | ---: | --- |
| Core-subject runtime paths | 8/8 | The eight initial subjects have contracts and a real no-image route. |
| New-subject route | 6/6 | Mathematics, chemistry, biology, history, geography and English completed local auth, planning, versioning, export, durable download and reopen. |
| New-subject output | 93 pages / 42 events | The route is not a fixed nine-page demo. |
| Browser/PPTX golden subjects | 2/8 | Physics and Chinese have the strongest browser evidence; the other six still need target-office and teacher evidence. |
| Image calls in six-subject acceptance | 0 | The beta can run with image generation disabled. |
| Automatic score | max 95/100 | Five points remain reserved for structured classroom-trial evidence. |

The beta is therefore **planning-ready but invitation-blocked** until the cloud deployment, backup/restore, target-office and first real teacher-trial gates are signed off. The policy must not be weakened to make a date.

The teacher workspace now includes a persisted, context-aware feedback entry. It returns a stable ticket ID and binds the report to the current project, version, subject, topic and page. API regression covers ownership validation, idempotency, user isolation and sensitive metadata redaction. This does **not** complete the operations gate: operator RBAC, SLA queue views, quota enforcement and production alerting still require cloud implementation and evidence.

## Cohort Design

Use three gates, never a single mass invite:

| Cohort | Ceiling | Minimum observation | Admission rule |
| --- | ---: | ---: | --- |
| Wave 100 | 100 invited teachers | 3 days | Daily batches of 20-30; core subjects only; no-image by default. |
| Wave 300 | 300 cumulative teachers | 5 days | Add at most 100/day after Wave 100 promotion is signed. |
| Wave 1000 | 1,000 cumulative teachers | 7 days | Add 200-250/day only after capacity exceeds the admission limit. |

The ceiling is an invitation count, not a simultaneous-generation promise. Each teacher has one running generation job, five no-image decks per day after Wave 100, 30 MB per upload, and a finite retained-project quota. Image decks remain disabled in all three waves until a separate budgeted image trial is approved.

Promotion requires the previous cohort's sample count, observation window, system metrics, product metrics, incident review and named sign-offs. Any hard stop pauses invitations immediately and rolls back to the last verified release.

## Teacher-Facing Surface

The beta needs these views. They are operational surfaces, not marketing pages:

1. **Invite and consent**: invitation code, beta notice, supported subjects, authorized-material notice, privacy notice and support channel.
2. **Onboarding**: subject, grade, textbook edition, chapter, class size, student baseline, classroom device and lesson duration.
3. **Generation status**: task stage, completed pages, failed pages, current quota, retry action and support link. Never show an unbounded spinner.
4. **Delivery result**: student deck, teacher notes, answers, board plan, differentiated homework, score provenance and version ID.
5. **Feedback entry**: a persistent `反馈问题` action on authenticated pages and a context-aware `反馈此课件` action on generation, result, export and history states.
6. **Trial evidence**: teacher-only classroom trial form with actual duration, device, editing minutes, direct-use pages, five rubric answers, issues and reuse decision.
7. **Operations view**: invitation ceiling, active jobs, queue age, generation/export failures, feedback by severity, SLA breaches, cohort metrics and rollback control.

The feedback form must collect category, description and permission to contact. It should attach project/version/task/subject/textbook/browser context automatically, and accept an optional screenshot or source reference. It must warn teachers not to upload student names, IDs, scores, faces, secrets or unauthorized materials.

## Feedback and Support Loop

Feedback categories are教材或章节不一致、知识或答案错误、课堂节奏不合理、排版或乱码、生成或导出失败、操作体验、隐私或安全 and other. Every report receives a stable `feedbackId`, status and owner. The triage states are `new`, `triaged`, `in_progress`, `waiting_teacher`, `resolved`, `closed` and `duplicate`.

Severity is assigned by impact, not by how loudly a report is written:

| Severity | Example | Acknowledge | Update | Mitigation target |
| --- | --- | ---: | ---: | ---: |
| P0 | Privacy exposure, data loss, corrupt artifact, or primary path unavailable to 30%+ active users | 15 min | 30 min | 2 h |
| P1 | 10-30% generation/export failure, severe textbook mismatch or no workaround | 1 h | 2 h | 8 h |
| P2 | Limited recoverable failure, layout defect or workaround exists | 8 h | 24 h | 72 h |
| P3 | Cosmetic defect, wording issue or feature request | 24 h | 72 h | 7 days |

The daily operations digest should include new feedback, P0/P1 incidents, SLA breaches, top repeated categories, teachers blocked at each funnel stage, and the next action owner. P0/P1 reports are triaged continuously during 08:00-22:00 Asia/Shanghai; P2/P3 twice daily.

## Go / No-Go Rules

No cohort promotion is allowed with an open P0, a known credential/privacy leak, an untested restore, a failed target-office check, generation completion below 95%, export success below 98%, artifact redownload hash mismatch, or severe textbook mismatch above 1%.

Track these metrics separately:

- **System**: no-image completion rate, P50/P90 generation latency, export success, artifact hash integrity and crash-free sessions.
- **Product**: invitation activation, first durable deck, willing-to-reuse rate, usable-within-15-minutes editing rate and severe textbook mismatch.
- **Operations**: feedback SLA compliance, open P0/P1 age, queue age, rollback count and deletion-request completion.

The machine policy contains definitions and targets. A promotion record must capture the metric snapshot, incident list, unresolved feedback, release commit and signatures from beta owner, operations, engineering, content QA and privacy owner.

## Rollback and Recovery

When a hard stop fires: pause invitations and generation admission; preserve job, database and artifact evidence; disable the affected feature or return to the last verified release; publish an in-product and support-group notice; verify login, upload, no-image generation, export, redownload and reopen; then resume only at the previous cohort ceiling. Never silently delete failed jobs or rerun a full image batch to hide a failure.

## Trial and Scoring

Automated evidence is capped at 95. The final five points require persisted `teacher-classroom-trial/v1` evidence from a named reviewer, including actual start/end time, class size, device, editing minutes, direct-use page count, five rubric answers, issues and reuse decision. A workflow submission, generated PPTX or product-owner opinion cannot earn those points. Student outcome metrics are collected after the first real classroom pilots and remain separate from pre-class checks.

## Data and Privacy

The beta does not use uploaded materials, generated decks or feedback for model training without explicit opt-in. Prohibit student identity documents, phone numbers, faces without consent, student-level score sheets, API keys, passwords and unauthorized materials. Use least-privilege production access with audit logs. The default retention is 30 days for source materials, generated artifacts and application logs; 180 days for feedback and security audit records; seven days to complete deletion requests. Run an encrypted daily backup and a restore drill before Wave 100 and every major release.

## Roles

The beta owner signs cohort decisions. Operations owns the queue, feedback and incident record. Engineering owns restoration and rollback. Content QA owns textbook identity and subject correctness. Teacher success owns onboarding and trial scheduling. Privacy owns access and deletion requests. Data analysis owns metric definitions and daily snapshots. A role may be combined for a small pilot, but the accountable name must still be recorded.

## First Release Checklist

Before the first invite, confirm: HTTPS cloud endpoint; persistent database and artifact storage; backup and restore report; health check and logs; quota enforcement; feedback entry and operations queue; no-image default; one running job per teacher; target-office sample opened; at least one real teacher trial scheduled; and a signed Wave 100 go/no-go record. Until then, the correct product status is **local RC verified, private beta invitation blocked**.
