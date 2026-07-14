-- 069_versioned_interaction_closure
-- Version lineage + operation provenance + idempotency + source-document binding,
-- plus a persisted teacher chat log. All additive; existing rows are unaffected.

-- ── CoursewareVersion: lineage / operation / idempotency / source docs ──────────
ALTER TABLE "CoursewareVersion" ADD COLUMN "parentVersionId" TEXT;
ALTER TABLE "CoursewareVersion" ADD COLUMN "operation" TEXT NOT NULL DEFAULT 'initial_generate';
ALTER TABLE "CoursewareVersion" ADD COLUMN "summary" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CoursewareVersion" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "CoursewareVersion" ADD COLUMN "sourceDocumentsSnapshot" TEXT NOT NULL DEFAULT '[]';

-- Idempotency is scoped per project: a repeated (projectId, idempotencyKey) must
-- collapse to the same committed version instead of producing a duplicate.
CREATE UNIQUE INDEX "CoursewareVersion_projectId_idempotencyKey_key"
  ON "CoursewareVersion"("projectId", "idempotencyKey");

-- ── CoursewareChatMessage: persisted teacher conversation ───────────────────────
CREATE TABLE "CoursewareChatMessage" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "projectId"        TEXT NOT NULL,
  "versionId"        TEXT,
  "role"             TEXT NOT NULL,
  "content"          TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'complete',
  "suggestedActions" TEXT NOT NULL DEFAULT '[]',
  "suggestedPatch"   TEXT NOT NULL DEFAULT '{}',
  "appliedVersionId" TEXT,
  "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoursewareChatMessage_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "CoursewareProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CoursewareChatMessage_projectId_createdAt_idx"
  ON "CoursewareChatMessage"("projectId", "createdAt");
