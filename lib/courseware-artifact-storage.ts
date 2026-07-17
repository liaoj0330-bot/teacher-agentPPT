import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function cleanSegment(value: string) {
  const cleaned = String(value || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "artifact";
}

export function sha256Buffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function persistCoursewareArtifactBuffer(input: {
  userId: string;
  projectId: string;
  versionId: string;
  artifactType: "pptx" | "pdf";
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const sha256 = sha256Buffer(input.buffer);
  const byteSize = input.buffer.length;
  const dir = path.join(
    process.cwd(),
    "artifacts",
    "courseware-exports",
    cleanSegment(input.userId),
    cleanSegment(input.projectId),
    cleanSegment(input.versionId),
    input.artifactType,
  );
  await mkdir(dir, { recursive: true });
  const storagePath = path.join(dir, `${sha256.slice(0, 16)}-${cleanSegment(input.fileName)}`);
  await writeFile(storagePath, input.buffer);
  return {
    storagePath,
    sha256,
    byteSize,
    mimeType: input.mimeType,
  };
}

export async function readCoursewareArtifactBuffer(storagePath: string) {
  return readFile(storagePath);
}
