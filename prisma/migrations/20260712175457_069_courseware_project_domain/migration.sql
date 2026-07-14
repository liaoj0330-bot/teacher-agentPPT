-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "invitedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 500,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreditAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PptSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'idle',
    "provider" TEXT,
    "projectJson" TEXT NOT NULL,
    "assetsJson" TEXT NOT NULL DEFAULT '[]',
    "searchJson" TEXT NOT NULL DEFAULT '[]',
    "visualsJson" TEXT NOT NULL DEFAULT '{}',
    "messagesJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PptSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoursewareProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "schoolStage" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CoursewareProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoursewareRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "teacherTaskSnapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorFacts" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "CoursewareRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CoursewareProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoursewareVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "teacherTaskSnapshot" TEXT NOT NULL,
    "contentPlanSnapshot" TEXT NOT NULL DEFAULT '{}',
    "slidePagePlanSnapshot" TEXT NOT NULL DEFAULT '[]',
    "layoutPlanSnapshot" TEXT NOT NULL DEFAULT '[]',
    "evidenceSnapshot" TEXT NOT NULL DEFAULT '[]',
    "deckSpecSnapshot" TEXT NOT NULL DEFAULT '{}',
    "deckSpecHash" TEXT NOT NULL DEFAULT '',
    "engineeringStatus" TEXT NOT NULL DEFAULT 'pending',
    "teacherReadiness" TEXT NOT NULL DEFAULT 'pending',
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoursewareVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CoursewareProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoursewareVersion_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CoursewareRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoursewareArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "storagePath" TEXT NOT NULL DEFAULT '',
    "manifestJson" TEXT NOT NULL DEFAULT '{}',
    "sourceDeckSpecHash" TEXT NOT NULL DEFAULT '',
    "sourceArtifactId" TEXT,
    "errorDetail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoursewareArtifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CoursewareProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoursewareArtifact_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CoursewareVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteCode_key" ON "User"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CreditAccount_userId_key" ON "CreditAccount"("userId");

-- CreateIndex
CREATE INDEX "PptSession_userId_updatedAt_idx" ON "PptSession"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "CoursewareProject_userId_updatedAt_idx" ON "CoursewareProject"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "CoursewareRequest_projectId_createdAt_idx" ON "CoursewareRequest"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "CoursewareVersion_projectId_createdAt_idx" ON "CoursewareVersion"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoursewareVersion_projectId_versionNumber_key" ON "CoursewareVersion"("projectId", "versionNumber");

-- CreateIndex
CREATE INDEX "CoursewareArtifact_projectId_versionId_artifactType_idx" ON "CoursewareArtifact"("projectId", "versionId", "artifactType");
