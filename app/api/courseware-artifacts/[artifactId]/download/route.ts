import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCoursewareArtifactForDownload } from "@/lib/courseware-version";
import { readCoursewareArtifactBuffer } from "@/lib/courseware-artifact-storage";

export async function GET(_: Request, context: { params: Promise<{ artifactId: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const { artifactId } = await context.params;
  if (!artifactId) {
    return NextResponse.json({ message: "artifactId 为必填" }, { status: 400 });
  }
  const artifact = await getCoursewareArtifactForDownload(user.id, artifactId);
  if (!artifact) {
    return NextResponse.json({ message: "产物不存在或无权访问" }, { status: 404 });
  }
  const buffer = await readCoursewareArtifactBuffer(artifact.storagePath).catch(() => null);
  if (!buffer?.length) {
    return NextResponse.json({ message: "产物字节不存在，当前记录不可下载" }, { status: 410 });
  }
  const fileName = path.basename(artifact.storagePath) || `${artifact.artifactId}.${artifact.artifactType}`;
  return new NextResponse(buffer as BodyInit, {
    headers: {
      "Content-Type": artifact.mimeType,
      "Content-Disposition": `attachment; filename="${artifact.artifactId}.${artifact.artifactType}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Length": String(buffer.length),
      "X-Artifact-Id": artifact.artifactId,
      "X-Artifact-Sha256": artifact.sha256,
    },
  });
}
