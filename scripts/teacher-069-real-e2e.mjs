/**
 * TEACHER_AI_PPT_069_REAL_E2E
 *
 * Real-execution acceptance harness (companion to the static
 * scripts/teacher-069-acceptance.mjs — this one ACTUALLY RUNS the pipeline).
 *
 * It spins up a real `next dev` server against an isolated SQLite database,
 * seeds a real User + CreditAccount + AuthSession, drives /api/generate-ppt and
 * /api/export-pptx over HTTP with real cookies, and seeds controlled
 * CoursewareVersion rows over REAL captured DeckSpec+slides to exercise every
 * delivery-class branch. Ten gates:
 *
 *   1. five-task-reality            — >=5 tasks, >=3 distinct topics, real diffs
 *   2. same-topic-diff-requirements — same topic, different requirements diverge
 *   3. project-isolation            — user B cannot read/export user A's version
 *   4. version-history              — v1/v2/v3 all persist + independently export
 *   5. triple-artifact-consistency  — preview manifest / PPTX / PDF+PNG identical
 *   6. artifact-traceability        — real artifact rows, correct hash, failures logged
 *   7. server-side-truth-negative   — client-tampered slides cannot change export
 *   8. status-matrix                — dual-score matrix consistent API/storage/artifact
 *   9. powerpoint-com               — real COM: PPTX -> PDF + per-slide PNG
 *  10. (regression runs separately via npm scripts — see task runner)
 *
 * Usage: node scripts/teacher-069-real-e2e.mjs
 * commercialReady is asserted false in every branch.
 */
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import JSZip from "jszip";

const root = process.cwd();
const PORT = 3002;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SESSION_COOKIE = "ai_ppt_agent_session";
const outDir = path.join(root, "artifacts", "teacher-069-real-e2e");
const dbFile = path.join(outDir, "teacher-069-e2e.db");
const DB_URL = `file:${dbFile.replace(/\\/g, "/")}`;
for (const d of [outDir, path.join(outDir, "pptx"), path.join(outDir, "pdf"), path.join(outDir, "png")]) {
  fs.mkdirSync(d, { recursive: true });
}
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const results = [];
const record = (id, ok, detail) => { results.push({ id, status: ok ? "PASS" : "FAIL", detail }); };
const nowIso = () => new Date().toISOString();

// ── server lifecycle ────────────────────────────────────────────────────────
async function isPortOpen(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: "127.0.0.1", port });
    s.setTimeout(800);
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("timeout", () => { s.destroy(); resolve(false); });
    s.once("error", () => resolve(false));
  });
}
async function waitForServer(timeoutMs = 120000) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE_URL}/`, { cache: "no-store" });
      if (r.status < 500) return true;
      last = `HTTP ${r.status}`;
    } catch (e) { last = e instanceof Error ? e.message : String(e); }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`server did not become ready: ${last}`);
}
function startServer() {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npm, ["run", "dev"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: process.platform === "win32",
    env: { ...process.env, DATABASE_URL: DB_URL, PORT: String(PORT), NODE_ENV: "development" },
  });
  const logs = [];
  child.stdout.on("data", (c) => logs.push(String(c)));
  child.stderr.on("data", (c) => logs.push(String(c)));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    await new Promise((res) => {
      const k = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
      k.once("exit", res); k.once("error", res);
    });
    return;
  }
  child.kill("SIGTERM");
}

// ── HTTP helpers ────────────────────────────────────────────────────────────
function cookieHeader(token) { return `${SESSION_COOKIE}=${token}`; }
async function generate(token, payload) {
  const r = await fetch(`${BASE_URL}/api/generate-ppt`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader(token) },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* non-json */ }
  return { status: r.status, json, text };
}
async function exportVersioned(token, payload) {
  const r = await fetch(`${BASE_URL}/api/export-pptx`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader(token) },
    body: JSON.stringify(payload),
  });
  const buf = Buffer.from(await r.arrayBuffer());
  const headers = Object.fromEntries(r.headers.entries());
  const isJson = (headers["content-type"] || "").includes("application/json");
  let json = null; if (isJson) { try { json = JSON.parse(buf.toString("utf8")); } catch { /* */ } }
  return { status: r.status, headers, buf, json };
}
async function inspectPptx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const texts = await Promise.all(slideNames.map(async (n) => {
    const xml = await zip.files[n].async("string");
    return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }));
  return {
    officeZip: zip.file("[Content_Types].xml") !== null && zip.file("ppt/presentation.xml") !== null,
    slideCount: slideNames.length,
    perSlideText: texts,
    joinedText: texts.join(" ␞ "),
  };
}

// ── DB setup (push the real Prisma schema to the isolated test DB) ───────────
function pushSchema() {
  const database = new DatabaseSync(dbFile);
  try {
    database.exec("PRAGMA foreign_keys = ON;");
    const migrationsRoot = path.join(root, "prisma", "migrations");
    const migrations = fs.readdirSync(migrationsRoot)
      .filter((name) => name !== "migration_lock.toml")
      .sort();
    for (const migration of migrations) {
      const migrationPath = path.join(migrationsRoot, migration, "migration.sql");
      database.exec(fs.readFileSync(migrationPath, "utf8"));
    }
  } finally {
    database.close();
  }
}

// ── DB seeding (real Prisma against the isolated test DB) ─────────────────────
let prisma = null;
async function getPrisma() {
  if (prisma) return prisma;
  process.env.DATABASE_URL = DB_URL;
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  return prisma;
}
async function seedUser(db, email) {
  const rawToken = createHash("sha1").update(`${email}-${Date.now()}-${Math.random()}`).digest("hex")
    + createHash("sha1").update(`${Math.random()}`).digest("hex");
  const user = await db.user.create({
    data: {
      email,
      name: email.split("@")[0],
      passwordHash: "x",
      inviteCode: createHash("sha1").update(`${email}-invite-${Math.random()}`).digest("hex").slice(0, 12),
      credit: { create: { balance: 100000 } },
      sessions: {
        create: {
          tokenHash: sha256(rawToken),
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      },
    },
  });
  return { userId: user.id, token: rawToken };
}
// Seed a CoursewareVersion over REAL captured deckSpec + slides with controlled
// status flags. Copies the frozen snapshots verbatim so the export route's
// recomputed contentHash still matches (no fabrication of content).
async function seedVersion(db, { userId, projectId, source, engineeringStatus, teacherReadiness }) {
  let pid = projectId;
  if (!pid) {
    const project = await db.coursewareProject.create({
      data: {
        userId, title: source.task.topic || "seed", subject: "数学",
        schoolStage: source.task.schoolStage || "高中", grade: source.task.grade || "",
        lifecycleStatus: "generating",
      },
    });
    pid = project.id;
  }
  const req = await db.coursewareRequest.create({
    data: { projectId: pid, requestType: "initial_generate", teacherTaskSnapshot: JSON.stringify(source.task), status: "completed", completedAt: new Date() },
  });
  const latest = await db.coursewareVersion.findFirst({ where: { projectId: pid }, orderBy: { versionNumber: "desc" } });
  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  const version = await db.coursewareVersion.create({
    data: {
      projectId: pid, requestId: req.id, versionNumber,
      teacherTaskSnapshot: JSON.stringify(source.task),
      contentPlanSnapshot: JSON.stringify(source.contentPlan ?? {}),
      slidePagePlanSnapshot: "[]", layoutPlanSnapshot: "[]", evidenceSnapshot: "[]",
      deckSpecSnapshot: JSON.stringify(source.deckSpec),
      deckSpecHash: source.deckSpec?.contentHash ?? "",
      slideContentSnapshot: JSON.stringify(source.slides ?? []),
      engineeringStatus, teacherReadiness, lifecycleStatus: "generated",
    },
  });
  await db.coursewareProject.update({ where: { id: pid }, data: { currentVersionId: version.id } });
  return { projectId: pid, versionId: version.id, versionNumber };
}

// ── payload builders ──────────────────────────────────────────────────────────
function teacherTask({ topic, schoolStage = "高中", grade = "高一", duration = "45分钟", requirements, materials }) {
  return {
    scenario: "teacher_courseware", planningMode: "professional",
    schoolStage, grade, subject: "数学", topic, duration,
    teachingRequirements: requirements,
    uploadedFiles: [], pastedMaterials: materials || `围绕「${topic}」的课堂材料与例题。`,
    teacherStyle: { visualMode: "teaching_grid", theme: "rational_teal" },
  };
}
function generatePayload(task, extra = {}) {
  return {
    scenario: "teacher_courseware", planningMode: "professional",
    forceLocal: true, teacherTask: task, teacherStyle: task.teacherStyle,
    ...extra,
  };
}

// Read a persisted CoursewareVersion and reconstruct a real export source from
// its frozen snapshots — used to seed sibling versions with controlled status.
async function readVersionSource(db, versionId) {
  const v = await db.coursewareVersion.findUnique({ where: { id: versionId } });
  if (!v) throw new Error(`version ${versionId} not found`);
  return {
    task: JSON.parse(v.teacherTaskSnapshot),
    contentPlan: JSON.parse(v.contentPlanSnapshot),
    deckSpec: JSON.parse(v.deckSpecSnapshot),
    slides: JSON.parse(v.slideContentSnapshot),
    engineeringStatus: v.engineeringStatus,
    teacherReadiness: v.teacherReadiness,
    deckSpecHash: v.deckSpecHash,
  };
}

// Real PowerPoint COM render: PPTX -> PDF + per-slide PNG. Returns real paths.
function renderWithPowerPoint(pptxPath, pdfPath, pngDir) {
  fs.mkdirSync(pngDir, { recursive: true });
  const ps = `param([string]$PptxPath,[string]$PdfPath,[string]$PngDir)
$ErrorActionPreference='Stop'; $before=@(Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object Id); $app=$null; $presentation=$null; $created=@(); $errors=@(); $pngFiles=@(); $slideCount=0; $pdfOk=$false
try { $app=New-Object -ComObject PowerPoint.Application; Start-Sleep -Milliseconds 500; $created=@((Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object Id) | Where-Object { $before -notcontains $_ }); $presentation=$app.Presentations.Open($PptxPath,-1,0,0); $slideCount=[int]$presentation.Slides.Count; 1..$slideCount | ForEach-Object { $p=Join-Path $PngDir ('slide-{0:D2}.png' -f $_); $presentation.Slides.Item($_).Export($p,'PNG',1920,1080) }; $pngFiles=@(Get-ChildItem -LiteralPath $PngDir -Filter '*.png' | Sort-Object Name | ForEach-Object FullName); $presentation.SaveAs($PdfPath,32); $pdfOk=Test-Path -LiteralPath $PdfPath }
catch { $errors += $_.Exception.Message }
finally { if($presentation){try{$presentation.Close()}catch{};try{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation)}catch{}}; if($app){if($created.Count -gt 0){try{$app.Quit()}catch{}};try{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)}catch{}}; [GC]::Collect(); [GC]::WaitForPendingFinalizers() }
[pscustomobject]@{ok=($errors.Count -eq 0 -and $pdfOk -and $pngFiles.Count -gt 0);slideCount=$slideCount;pdfPath=$(if($pdfOk){$PdfPath}else{''});pngFiles=$pngFiles;errors=$errors}|ConvertTo-Json -Depth 5 -Compress`;
  const psPath = path.join(outDir, "com-render.ps1");
  fs.writeFileSync(psPath, ps, "utf8");
  try {
    const raw = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psPath, pptxPath, pdfPath, pngDir], { encoding: "utf8", timeout: 300000 });
    return JSON.parse(raw.trim());
  } catch (e) {
    return { ok: false, slideCount: 0, pdfPath: "", pngFiles: [], errors: [e instanceof Error ? e.message : String(e)] };
  }
}
// Extract slide titles from a DesignSlide[] snapshot (preview manifest source).
function previewTitles(slides) {
  return slides.map((s) => (s.title || "").replace(/\s+/g, " ").trim()).filter(Boolean);
}
// Concatenate all visible slide body text (titles + subtitle + bullets +
// section content) so two decks can be compared for REAL content differences,
// not just title changes.
function slideBodyText(slides) {
  return slides.map((s) => JSON.stringify({
    t: s.title, sub: s.subtitle, b: s.bullets,
    sec: s.sections, blocks: s.contentBlocks,
  })).join(" ␞ ");
}

// ── main runner ───────────────────────────────────────────────────────────────
async function runGates(db) {
  const summary = { suite: "TEACHER_AI_PPT_069_REAL_E2E", startedAt: nowIso(), baseUrl: BASE_URL, dbUrl: DB_URL };

  // Seed two isolated users.
  const A = await seedUser(db, `teacher-a-${Date.now()}@example.com`);
  const B = await seedUser(db, `teacher-b-${Date.now()}@example.com`);

  // ── Gate 1: five-task reality ──────────────────────────────────────────────
  // >=5 tasks across >=3 distinct high-school math topics, real content diffs.
  const topics = [
    "一次函数的概念与图像",
    "二次函数的图像与性质",
    "古典概型与概率计算",
    "等差数列的通项与求和",
    "正弦定理与余弦定理",
  ];
  const gen = [];
  for (const topic of topics) {
    const res = await generate(A.token, generatePayload(teacherTask({ topic })));
    if (res.status !== 200 || !res.json?.versionId) {
      gen.push({ topic, ok: false, status: res.status, msg: res.json?.message || res.text.slice(0, 200) });
      continue;
    }
    const v = await db.coursewareVersion.findUnique({ where: { id: res.json.versionId } });
    const slides = JSON.parse(v.slideContentSnapshot);
    gen.push({
      topic, ok: true, versionId: res.json.versionId, projectId: res.json.projectId,
      deckSpecHash: v.deckSpecHash, slideCount: slides.length,
      titles: previewTitles(slides), body: slideBodyText(slides),
    });
  }
  const good = gen.filter((g) => g.ok);
  const distinctTopics = new Set(good.map((g) => g.topic)).size;
  const distinctHashes = new Set(good.map((g) => g.deckSpecHash)).size;
  const distinctBodies = new Set(good.map((g) => g.body)).size;
  // Real content: no two topics share identical slide body text; each has slides.
  const allHaveSlides = good.every((g) => g.slideCount >= 5);
  // No title-only diff: bodies differ, not just titles. No cross-topic formula bleed.
  const noHardcodeBleed = good.every((g) =>
    g.topic.includes("一次函数") || !/y\s*=\s*2x\s*\+\s*1/.test(g.body));
  const g1ok = good.length >= 5 && distinctTopics >= 3 && distinctHashes === good.length
    && distinctBodies === good.length && allHaveSlides && noHardcodeBleed;
  record("five-task-reality", g1ok,
    `tasks=${good.length}/5 topics=${distinctTopics} hashes=${distinctHashes} bodies=${distinctBodies} allSlides=${allHaveSlides} noBleed=${noHardcodeBleed}` +
    (good.length < 5 ? ` failures=${JSON.stringify(gen.filter((g) => !g.ok))}` : ""));

  // ── Gate 2: same topic, different requirements diverge ─────────────────────
  const sameTopic = "一次函数的概念与图像";
  const r2a = await generate(A.token, generatePayload(teacherTask({
    topic: sameTopic, requirements: "重点讲解k与b的几何意义，配套图像观察活动",
    materials: "材料A：以匀速运动情境引入，强调斜率含义。",
  })));
  const r2b = await generate(A.token, generatePayload(teacherTask({
    topic: sameTopic, requirements: "重点训练由两点求解析式的代数步骤，增加分层练习",
    materials: "材料B：以两点坐标代入求参数为主线，强化计算与检验。",
  })));
  let g2ok = false, g2detail = "";
  if (r2a.status === 200 && r2b.status === 200 && r2a.json?.versionId && r2b.json?.versionId) {
    const va = await db.coursewareVersion.findUnique({ where: { id: r2a.json.versionId } });
    const vb = await db.coursewareVersion.findUnique({ where: { id: r2b.json.versionId } });
    const bodyA = slideBodyText(JSON.parse(va.slideContentSnapshot));
    const bodyB = slideBodyText(JSON.parse(vb.slideContentSnapshot));
    g2ok = va.deckSpecHash !== vb.deckSpecHash && bodyA !== bodyB;
    g2detail = `hashA=${va.deckSpecHash.slice(0, 8)} hashB=${vb.deckSpecHash.slice(0, 8)} bodiesDiffer=${bodyA !== bodyB}`;
  } else {
    g2detail = `generate failed a=${r2a.status} b=${r2b.status}`;
  }
  record("same-topic-diff-requirements", g2ok, g2detail);

  // Capture a real source for seeding controlled-status sibling versions.
  const realSource = good[0]
    ? await readVersionSource(db, good[0].versionId)
    : null;
  const setStatus = (versionId, engineeringStatus, teacherReadiness) =>
    db.coursewareVersion.update({ where: { id: versionId }, data: { engineeringStatus, teacherReadiness } });

  // ── Gate 3: project isolation — user B cannot read/export user A's version ──
  let g3ok = false, g3detail = "no source";
  if (realSource && good[0]) {
    // Seed A a ready version so a legitimate export would otherwise succeed.
    const av = await seedVersion(db, { userId: A.userId, source: realSource, engineeringStatus: "passed", teacherReadiness: "ready_for_teacher" });
    const asExpectedOwner = await exportVersioned(A.token, { projectId: av.projectId, versionId: av.versionId, artifactType: "pptx" });
    // B tries to export A's version with the correct ids → must be denied.
    const asIntruder = await exportVersioned(B.token, { projectId: av.projectId, versionId: av.versionId, artifactType: "pptx" });
    // Owner exports successfully; intruder is denied (403 forbidden or 404 masked).
    g3ok = asExpectedOwner.status === 200 && asExpectedOwner.buf.length > 0
      && (asIntruder.status === 403 || asIntruder.status === 404) && asIntruder.buf.length < asExpectedOwner.buf.length;
    g3detail = `owner=${asExpectedOwner.status} intruder=${asIntruder.status} reason=${asIntruder.json?.reason || ""}`;
  }
  record("project-isolation", g3ok, g3detail);

  // ── Gate 4: version history — v1/v2/v3 chain onto one project, no overwrite ──
  let g4ok = false, g4detail = "";
  const vh = [];
  const t4 = [
    { topic: "反比例函数的图像与性质", requirements: "第一版：概念优先" },
    { topic: "反比例函数的图像与性质", requirements: "第二版：强化图像变换" },
    { topic: "反比例函数的图像与性质", requirements: "第三版：增加综合应用题" },
  ];
  let chainProjectId;
  for (const t of t4) {
    const res = await generate(A.token, generatePayload(teacherTask(t), chainProjectId ? { projectId: chainProjectId } : {}));
    if (res.status !== 200 || !res.json?.versionId) { vh.push({ ok: false, status: res.status }); continue; }
    chainProjectId = res.json.projectId;
    vh.push({ ok: true, versionId: res.json.versionId, versionNumber: res.json.versionNumber, projectId: res.json.projectId });
  }
  if (vh.every((v) => v.ok) && chainProjectId) {
    const rows = await db.coursewareVersion.findMany({ where: { projectId: chainProjectId }, orderBy: { versionNumber: "asc" } });
    const numbers = rows.map((r) => r.versionNumber);
    const hashes = new Set(rows.map((r) => r.deckSpecHash));
    const singleProject = new Set(vh.map((v) => v.projectId)).size === 1;
    // Make each independently exportable over its REAL frozen content, then export all three.
    const exports = [];
    for (const r of rows) {
      await setStatus(r.id, "passed", "ready_for_teacher");
      const ex = await exportVersioned(A.token, { projectId: chainProjectId, versionId: r.id, artifactType: "pptx" });
      exports.push({ vn: r.versionNumber, status: ex.status, hash: ex.headers["x-deck-spec-hash"], bytes: ex.buf.length });
    }
    const allExported = exports.every((e) => e.status === 200 && e.bytes > 0);
    const numbersOk = numbers.length === 3 && numbers[0] === 1 && numbers[1] === 2 && numbers[2] === 3;
    g4ok = singleProject && numbersOk && rows.length === 3 && allExported;
    g4detail = `project=${singleProject ? "one" : "many"} numbers=${JSON.stringify(numbers)} hashes=${hashes.size} exports=${JSON.stringify(exports.map((e) => e.status))}`;
  } else {
    g4detail = `chain generate failed ${JSON.stringify(vh)}`;
  }
  record("version-history", g4ok, g4detail);

  // ── Gate 5 + 9: triple-artifact consistency + PowerPoint COM ───────────────
  // Seed a ready version over REAL content, export PPTX, then COM-render to
  // PDF + per-slide PNG. Preview manifest (frozen slides) / PPTX / PDF+PNG must
  // agree on page count, order and titles.
  let g5ok = false, g5detail = "no source", comResult = null;
  let comPptxPath = null;
  if (realSource) {
    const sv = await seedVersion(db, { userId: A.userId, source: realSource, engineeringStatus: "passed", teacherReadiness: "ready_for_teacher" });
    const ex = await exportVersioned(A.token, { projectId: sv.projectId, versionId: sv.versionId, artifactType: "pdf" });
    if (ex.status === 200 && ex.buf.length > 0) {
      const pptxPath = path.join(outDir, "pptx", "consistency.pptx");
      fs.writeFileSync(pptxPath, ex.buf);
      comPptxPath = pptxPath;
      const inspect = await inspectPptx(ex.buf);
      // Preview manifest = frozen slideContentSnapshot (the version source of truth).
      const manifestTitles = previewTitles(realSource.slides);
      const headerCount = Number(ex.headers["x-page-count"] || 0);
      // COM render (Gate 9).
      const pdfPath = path.join(outDir, "pdf", "consistency.pdf");
      const pngDir = path.join(outDir, "png", "consistency");
      comResult = renderWithPowerPoint(pptxPath, pdfPath, pngDir);
      const pngCount = (comResult.pngFiles || []).filter((f) => fs.existsSync(f) && fs.statSync(f).size > 0).length;
      // Consistency: manifest page count == PPTX slide count == header count.
      const pageCountsAgree = manifestTitles.length === inspect.slideCount && inspect.slideCount === headerCount;
      // Title order: every manifest title appears in the matching PPTX slide text.
      const titleOrderOk = manifestTitles.every((t, i) => inspect.perSlideText[i] && inspect.perSlideText[i].includes(t.slice(0, Math.min(6, t.length))));
      const comOk = comResult.ok && comResult.slideCount === inspect.slideCount && pngCount === inspect.slideCount && fs.existsSync(pdfPath);
      g5ok = pageCountsAgree && titleOrderOk && inspect.officeZip;
      g5detail = `manifest=${manifestTitles.length} pptx=${inspect.slideCount} header=${headerCount} titleOrder=${titleOrderOk} com{ok=${comResult.ok},slides=${comResult.slideCount},png=${pngCount},pdf=${fs.existsSync(pdfPath)}}`;
      record("powerpoint-com", comOk,
        `pptx=${inspect.slideCount} comSlides=${comResult.slideCount} png=${pngCount} pdf=${fs.existsSync(pdfPath)} errors=${JSON.stringify(comResult.errors || [])}`);
    } else {
      g5detail = `export failed status=${ex.status} reason=${ex.json?.reason || ""}`;
      record("powerpoint-com", false, `export failed status=${ex.status}`);
    }
  } else {
    record("powerpoint-com", false, "no source");
  }
  record("triple-artifact-consistency", g5ok, g5detail);

  // ── Gate 8: dual-score status matrix ───────────────────────────────────────
  // Seed one version per (engineeringStatus, teacherReadiness) combo over the
  // SAME real content and assert API status + delivery class + artifact row.
  let g8ok = false, g8detail = "no source";
  const matrixRows = [];
  if (realSource) {
    const combos = [
      { eng: "passed", tr: "ready_for_teacher", wantStatus: 200, wantClass: "teacher_approved" },
      { eng: "passed", tr: "review_required", wantStatus: 200, wantClass: "teacher_review_copy" },
      { eng: "passed", tr: "pending", wantStatus: 200, wantClass: "engineering_preview" },
      { eng: "passed", tr: "failed", wantStatus: 422, wantReason: "teacher_readiness_failed" },
      { eng: "failed", tr: "ready_for_teacher", wantStatus: 422, wantReason: "engineering_not_passed" },
    ];
    for (const c of combos) {
      const sv = await seedVersion(db, { userId: A.userId, source: realSource, engineeringStatus: c.eng, teacherReadiness: c.tr });
      const ex = await exportVersioned(A.token, { projectId: sv.projectId, versionId: sv.versionId, artifactType: "pptx" });
      const artifact = await db.coursewareArtifact.findFirst({ where: { versionId: sv.versionId }, orderBy: { createdAt: "desc" } });
      const apiOk = ex.status === c.wantStatus;
      const classOk = c.wantClass ? ex.headers["x-delivery-class"] === c.wantClass : true;
      const reasonOk = c.wantReason ? ex.json?.reason === c.wantReason : true;
      // Storage/artifact consistency: success → ready pptx artifact; failure → failed artifact.
      const artifactOk = c.wantStatus === 200
        ? !!artifact && artifact.status === "ready" && artifact.sourceDeckSpecHash === realSource.deckSpecHash
        : !!artifact && artifact.status === "failed";
      // commercialReady must be false everywhere (header on success, body on failure).
      const commercialFalse = c.wantStatus === 200
        ? ex.headers["x-commercial-ready"] === "false"
        : ex.json?.commercialReady === false;
      const rowOk = apiOk && classOk && reasonOk && artifactOk && commercialFalse;
      matrixRows.push({ eng: c.eng, tr: c.tr, status: ex.status, class: ex.headers["x-delivery-class"] || null, reason: ex.json?.reason || null, artifact: artifact?.status || null, commercialFalse, rowOk });
    }
    g8ok = matrixRows.every((r) => r.rowOk);
    g8detail = JSON.stringify(matrixRows.map((r) => `${r.eng}/${r.tr}→${r.status}:${r.class || r.reason}:art=${r.artifact}:cr=${r.commercialFalse}:${r.rowOk ? "ok" : "BAD"}`));
  }
  record("status-matrix", g8ok, g8detail);

  // ── Gate 6: artifact traceability — real rows, correct hash, failures logged ─
  let g6ok = false, g6detail = "";
  const readyArtifacts = await db.coursewareArtifact.findMany({ where: { status: "ready", artifactType: "pptx" } });
  const failedArtifacts = await db.coursewareArtifact.findMany({ where: { status: "failed" } });
  const pdfArtifacts = await db.coursewareArtifact.findMany({ where: { artifactType: "pdf", status: "ready" } });
  // Every ready pptx artifact traces to a real version + non-empty deckSpec hash.
  const readyTraceable = readyArtifacts.length > 0 && (await Promise.all(readyArtifacts.map(async (a) => {
    const v = await db.coursewareVersion.findUnique({ where: { id: a.versionId } });
    return !!v && a.sourceDeckSpecHash === v.deckSpecHash && a.sourceDeckSpecHash.length > 0;
  }))).every(Boolean);
  // Failed artifacts carry an errorDetail (traceable failure).
  const failuresLogged = failedArtifacts.length > 0 && failedArtifacts.every((a) => (a.errorDetail || "").length > 0 || (a.manifestJson || "").includes("reason"));
  // PDF artifacts point at a parent pptx artifact.
  const pdfChained = pdfArtifacts.every((a) => !!a.sourceArtifactId);
  g6ok = readyTraceable && failuresLogged && pdfChained;
  g6detail = `readyPptx=${readyArtifacts.length} traceable=${readyTraceable} failed=${failedArtifacts.length} logged=${failuresLogged} pdf=${pdfArtifacts.length} chained=${pdfChained}`;
  record("artifact-traceability", g6ok, g6detail);

  // ── Gate 7: server-side truth negative test ────────────────────────────────
  // Export a seeded ready version honestly, then re-export the SAME ids while
  // submitting a tampered client project/slides/DeckSpec. The versioned export
  // must ignore client content entirely — the exported PPTX text must be
  // identical to the honest export (proving server-side DeckSpec is the truth).
  let g7ok = false, g7detail = "no source";
  if (realSource) {
    const sv = await seedVersion(db, { userId: A.userId, source: realSource, engineeringStatus: "passed", teacherReadiness: "ready_for_teacher" });
    const honest = await exportVersioned(A.token, { projectId: sv.projectId, versionId: sv.versionId, artifactType: "pptx" });
    // Fabricated client content that would drastically change output IF trusted.
    const tamperedSlides = [
      { id: "hacked-1", title: "TAMPERED_TITLE_INJECTED", subtitle: "attacker controlled body", bullets: ["evil-1", "evil-2"], layout: "cards", sections: [] },
    ];
    const tampered = await exportVersioned(A.token, {
      projectId: sv.projectId, versionId: sv.versionId, artifactType: "pptx",
      // These MUST be ignored by the versioned export path:
      project: { title: "TAMPERED", slides: tamperedSlides },
      slides: tamperedSlides,
      deckSpec: { id: "tampered", contentHash: "deadbeef", slideSpecs: [] },
    });
    if (honest.status === 200 && tampered.status === 200) {
      const hi = await inspectPptx(honest.buf);
      const ti = await inspectPptx(tampered.buf);
      const sameContent = hi.slideCount === ti.slideCount && hi.joinedText === ti.joinedText;
      const noTamperText = !ti.joinedText.includes("TAMPERED_TITLE_INJECTED") && !ti.joinedText.includes("attacker controlled");
      const sameHash = honest.headers["x-deck-spec-hash"] === tampered.headers["x-deck-spec-hash"];
      g7ok = sameContent && noTamperText && sameHash;
      g7detail = `honestSlides=${hi.slideCount} tamperedSlides=${ti.slideCount} identicalText=${hi.joinedText === ti.joinedText} noTamperText=${noTamperText} sameHash=${sameHash}`;
    } else {
      g7detail = `export failed honest=${honest.status} tampered=${tampered.status}`;
    }
  }
  record("server-side-truth-negative", g7ok, g7detail);

  summary.finishedAt = nowIso();
  summary.total = results.length;
  summary.passed = results.filter((r) => r.status === "PASS").length;
  summary.failed = summary.total - summary.passed;
  summary.results = results;
  return summary;
}

async function main() {
  // Fresh isolated DB file every run.
  for (const f of [dbFile, `${dbFile}-journal`]) {
    try { fs.rmSync(f, { force: true }); } catch { /* */ }
  }
  pushSchema();

  let server = null;
  let summary = null;
  try {
    if (await isPortOpen(PORT)) {
      throw new Error(`port ${PORT} already in use — stop the other server first`);
    }
    server = startServer();
    await waitForServer();
    const db = await getPrisma();
    summary = await runGates(db);
  } catch (e) {
    summary = summary || { suite: "TEACHER_AI_PPT_069_REAL_E2E", results };
    summary.fatal = e instanceof Error ? e.stack || e.message : String(e);
    summary.total = results.length;
    summary.passed = results.filter((r) => r.status === "PASS").length;
    summary.failed = summary.total - summary.passed || 1;
  } finally {
    if (prisma) { try { await prisma.$disconnect(); } catch { /* */ } }
    if (server?.child) {
      await stopServer(server.child);
      if (server.logs?.length) {
        fs.writeFileSync(path.join(outDir, "server-log-tail.txt"), server.logs.join("").slice(-8000), "utf8");
      }
    }
  }
  fs.writeFileSync(path.join(outDir, "real-e2e-summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
  return summary.failed === 0 && !summary.fatal ? 0 : 1;
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((e) => { console.error(e); process.exit(1); });
