import { NextResponse } from "next/server";
import { DEFAULT_BRAIN_PPT_ROOT, runBrainPptConnector, runBrainPptExecutorPackage } from "@/lib/brain-ppt/brain-connector";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const briefPath = typeof body?.briefPath === "string" ? body.briefPath : "";
  const executorPackagePath = typeof body?.executorPackagePath === "string" ? body.executorPackagePath : "";
  const rootPath = typeof body?.rootPath === "string" ? body.rootPath : DEFAULT_BRAIN_PPT_ROOT;
  const writebackId = typeof body?.writebackId === "string" ? body.writebackId : undefined;

  if (!briefPath && !executorPackagePath) {
    return NextResponse.json({ message: "briefPath or executorPackagePath is required" }, { status: 400 });
  }

  try {
    if (executorPackagePath) {
      const result = await runBrainPptExecutorPackage({ executorPackagePath, rootPath, writebackId });
      return NextResponse.json(result);
    }
    const result = await runBrainPptConnector({ briefPath, rootPath, writebackId });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 400 }
    );
  }
}
