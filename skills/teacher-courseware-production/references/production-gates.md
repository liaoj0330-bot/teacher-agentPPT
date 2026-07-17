# Production Gates

Use this file when deciding whether a generated lesson can be handed to a teacher.

## Evidence levels

| Level | Meaning | Required evidence |
| --- | --- | --- |
| Local RC | Automated repo path is coherent | lint, focused regressions, build, artifact reopen/render |
| Target-office verified | File behaves in the customer's office environment | open/edit/export check in the target WPS/PowerPoint version and fonts |
| Commercially ready | A teacher can deliver the lesson without repair | target-office check, real 45-minute teacher trial, deployment/observability, no open P0/P1 |

## Failure handling

- Source ambiguity: pause generation and request textbook/chapter confirmation.
- Parse or citation failure: keep the warning in the evidence manifest; do not invent page references.
- Pacing or teaching gap: revise the plan, not just the slide count.
- Visual repetition: change composition families or teaching intent; do not merely recolor slides.
- Stale edit: refresh the current version, rebase the user's change, and retry with a new idempotency key only when the user action is still valid.
- Office-only issue: record it as an external blocker and do not mark local tests as a substitute.
