import { NextResponse } from "next/server";
import { getWorkbenchModeContract, modeForUploadedFile, type WorkbenchMode } from "@/lib/workbench-mode";

function normalizeMode(value: unknown): WorkbenchMode {
  return value === "agent" || value === "reference" || value === "beautify" ? value : "agent";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const mode = body?.fileName || body?.mimeType
    ? modeForUploadedFile({
        name: typeof body.fileName === "string" ? body.fileName : "",
        mimeType: typeof body.mimeType === "string" ? body.mimeType : "",
        type: typeof body.type === "string" ? body.type : ""
      })
    : normalizeMode(body?.mode);
  return NextResponse.json({
    mode,
    contract: getWorkbenchModeContract(mode)
  });
}
