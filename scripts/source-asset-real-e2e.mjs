import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const email = process.env.TEACHER_EMAIL || "grade1-arithmetic-1784133899824-1@example.com";
const password = process.env.TEACHER_PASSWORD || "Teacher123!";
const fixture = path.join(process.cwd(), "artifacts", "template-parser-poc", "teacher-template-fixture.pptx");
const envText = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
const databaseUrl = envText.split(/\r?\n/).find((line) => line.startsWith("DATABASE_URL="))?.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
const { PrismaClient } = await import("@prisma/client");
assert.equal(fs.existsSync(fixture), true, `fixture missing: ${fixture}`);

const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
assert.equal(login.status, 200, `login failed: ${login.status}`);
const cookie = login.headers.getSetCookie?.()[0]?.split(";")[0] || login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie, "login cookie missing");
const form = new FormData();
form.set("file", new File([fs.readFileSync(fixture)], "teacher-template-fixture.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }));
const response = await fetch(`${base}/api/upload-ppt`, { method: "POST", headers: { cookie }, body: form });
const payload = await response.json();
assert.equal(response.status, 200, JSON.stringify(payload));
assert.equal(payload.storageStatus, "persisted");
assert.ok(payload.assetId);
assert.match(payload.sha256, /^[a-f0-9]{64}$/);
assert.equal(payload.analysis?.parser, "officeparser");
assert.ok(payload.analysis?.pageCount >= 2);
assert.ok(payload.analysis?.chunks?.length >= 1);
assert.equal(payload.analysis?.metadata?.templateManifest?.engine, "pptx-automizer");
assert.ok(payload.analysis?.metadata?.templateManifest?.namedElementCount > 0);

const prisma = new PrismaClient();
try {
  const asset = await prisma.sourceAsset.findUnique({ where: { id: payload.assetId } });
  assert.ok(asset, "asset record missing");
  assert.equal(asset.sha256, payload.sha256);
  assert.equal(asset.parser, "officeparser");
  assert.equal(fs.existsSync(asset.storagePath), true, "persisted original file missing");
  console.log(JSON.stringify({ ok: true, assetId: asset.id, storageStatus: payload.storageStatus, parser: asset.parser, pages: payload.analysis.pageCount, blocks: payload.analysis.blockCount, chunks: payload.analysis.chunks.length, templateSlides: payload.analysis.metadata.templateManifest.slideCount, namedElements: payload.analysis.metadata.templateManifest.namedElementCount, sha256: payload.sha256 }, null, 2));
} finally {
  await prisma.$disconnect();
}
