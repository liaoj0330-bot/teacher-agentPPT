"use client";

import { CanvasWorkbench } from "@/components/CanvasWorkbench";

/** Canonical runtime boundary for /teacher-ai-ppt. */
export function TeacherWorkspace() {
  return <CanvasWorkbench entryMode="teacher" />;
}