-- AddColumn: slideContentSnapshot to CoursewareVersion
-- Phase 5b / 069 – server-side render source
ALTER TABLE "CoursewareVersion" ADD COLUMN "slideContentSnapshot" TEXT NOT NULL DEFAULT '[]';
