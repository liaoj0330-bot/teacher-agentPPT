import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listCoursewareArtifacts } from "@/lib/courseware-version";

/**
 * GET /api/courseware-artifacts?projectId=&versionId=
 *
 * Export (artifact) history for a project, optionally filtered to one version.
 * Every artifact traces back to projectId + versionId + the DeckSpec hash it was
 * rendered from, so an export can always be tied to the exact frozen version.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") || "";
  const versionId = url.searchParams.get("versionId") || undefined;
  if (!projectId) {
    return NextResponse.json({ message: "projectId 为必填" }, { status: 400 });
  }

  const artifacts = await listCoursewareArtifacts(user.id, projectId, versionId);
  if (artifacts === null) {
    return NextResponse.json({ message: "项目不存在或无权访问" }, { status: 404 });
  }
  return NextResponse.json({ projectId, versionId: versionId ?? null, artifacts });
}
