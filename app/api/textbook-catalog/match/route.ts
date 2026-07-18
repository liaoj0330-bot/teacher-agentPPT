import { NextResponse } from "next/server.js";
import {
  getTextbookCatalogEntry,
  resolveTextbookCatalog,
  TEXTBOOK_CATALOG_COVERAGE,
  type TextbookCatalogInput,
} from "../../../../lib/ppt-agent/textbook-catalog.ts";

export const runtime = "nodejs";

function responseFor(input: TextbookCatalogInput) {
  const match = resolveTextbookCatalog(input);
  return {
    ok: true,
    match,
    verificationStatus: match.status === "exact" ? "catalog_verified" : "unverified",
    candidates: match.candidateIds
      .map(getTextbookCatalogEntry)
      .filter((candidate) => Boolean(candidate)),
    coverage: TEXTBOOK_CATALOG_COVERAGE,
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return NextResponse.json(responseFor({
    displayName: params.get("displayName"),
    schoolStage: params.get("schoolStage"),
    grade: params.get("grade"),
    subject: params.get("subject"),
    publisher: params.get("publisher"),
    editionYear: params.get("editionYear"),
    volume: params.get("volume"),
  }));
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as TextbookCatalogInput;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ ok: false, error: "invalid_textbook_match_payload" }, { status: 400 });
    }
    return NextResponse.json(responseFor(payload));
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
}
