-- Durable asynchronous image generation jobs.
CREATE TABLE "ImageGenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerKey" TEXT NOT NULL,
    "userId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestJson" TEXT NOT NULL DEFAULT '{}',
    "pagesJson" TEXT NOT NULL DEFAULT '[]',
    "resultJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

CREATE UNIQUE INDEX "ImageGenerationJob_ownerKey_idempotencyKey_key"
ON "ImageGenerationJob"("ownerKey", "idempotencyKey");

CREATE INDEX "ImageGenerationJob_ownerKey_updatedAt_idx"
ON "ImageGenerationJob"("ownerKey", "updatedAt");
