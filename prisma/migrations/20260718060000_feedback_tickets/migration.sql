CREATE TABLE "FeedbackTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "versionId" TEXT,
    "subject" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "pageNumber" INTEGER,
    "pageId" TEXT,
    "taskId" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'P2',
    "message" TEXT NOT NULL,
    "clientMetadataJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'new',
    "assignee" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "FeedbackTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedbackTicket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CoursewareProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeedbackTicket_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CoursewareVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FeedbackTicket_userId_idempotencyKey_key"
ON "FeedbackTicket"("userId", "idempotencyKey");

CREATE INDEX "FeedbackTicket_userId_status_createdAt_idx"
ON "FeedbackTicket"("userId", "status", "createdAt");

CREATE INDEX "FeedbackTicket_projectId_createdAt_idx"
ON "FeedbackTicket"("projectId", "createdAt");

CREATE INDEX "FeedbackTicket_status_severity_createdAt_idx"
ON "FeedbackTicket"("status", "severity", "createdAt");
