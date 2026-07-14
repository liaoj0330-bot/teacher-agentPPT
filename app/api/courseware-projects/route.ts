import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listCoursewareProjects } from "@/lib/courseware-version";

/**
 * GET /api/courseware-projects
 *
 * The projects this teacher can re-open, newest first. Each carries its
 * currentVersionId so the client can immediately fetch the authoritative
 * server-stored version instead of relying on local memory.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const projects = await listCoursewareProjects(user.id);
  return NextResponse.json({ projects });
}
