import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listCoursewareVersions } from "@/lib/courseware-version";

/**
 * GET /api/courseware-versions?projectId=
 *
 * Immutable version history for a project, newest first. Each row exposes its
 * lineage (parentVersionId), the operation that produced it, and the status trio
 * — the raw material for a version timeline / re-open picker.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") || "";
  if (!projectId) {
    return NextResponse.json({ message: "projectId 为必填" }, { status: 400 });
  }

  const versions = await listCoursewareVersions(user.id, projectId);
  if (versions === null) {
    return NextResponse.json({ message: "项目不存在或无权访问" }, { status: 404 });
  }
  return NextResponse.json({ projectId, versions });
}
