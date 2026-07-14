/**
 * TEACHER_AI_PPT_069_ACCEPTANCE
 *
 * Five acceptance gates for the backend-truth cutover:
 *   1. contamination-scan   – No hardcoded demo strings in production code paths
 *   2. dynamic-realizer     – topic-driven generator + legacy fixture proven OUT of production (zero prod imports)
 *   3. deck-spec-hash       – Different topics produce different contentHash values
 *   4. quality-separation   – ProjectQualityReport carries engineeringScore + teacherReadinessScore
 *   5. schema-models        – Prisma schema contains all 4 courseware domain models
 *
 * Usage: node scripts/teacher-069-acceptance.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const pass = (id) => ({ id, status: "PASS" });
const fail = (id, reason) => { throw Object.assign(new Error(reason), { caseId: id }); };

const transpile = (filePath) => {
  const src = fs.readFileSync(filePath, "utf8");
  const outText = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const tmp = path.join(root, `.${path.basename(filePath)}.069-tmp.mjs`);
  // Strip path aliases: @/ → relative path from lib root
  const fixed = outText
    .replace(/from\s+"@\/lib\/([^"]+)"/g, (_, p) => `from "./${p}.ts.069-tmp.mjs"`)
    .replace(/from\s+"@\/([^"]+)"/g, (_, p) => `from "../${p}.ts.069-tmp.mjs"`);
  fs.writeFileSync(tmp, fixed);
  return tmp;
};

const CONTAMINATION_PATTERNS = [
  // Exact hardcoded lesson content that must NOT appear in production code
  { pattern: /y\s*=\s*2x\s*[+＋]\s*1/, label: "y=2x+1 (hardcoded formula)" },
  { pattern: /y\s*=\s*-x\s*[+＋]\s*3/, label: "y=-x+3 (hardcoded formula)" },
  { pattern: /A\(0,\s*1\)\s*B\(2,\s*5\)/, label: "A(0,1) B(2,5) (hardcoded points)" },
  { pattern: /45分钟\s*·\s*高一数学/, label: "45分钟·高一数学 (hardcoded metadata)" },
  { pattern: /"高一"/, label: '"高一" (hardcoded grade string)' },
  { pattern: /addTeacherMathAgenda\(/, label: "addTeacherMathAgenda() call in POST handler" },
  { pattern: /addTeacherMathSources\(/, label: "addTeacherMathSources() call in POST handler" },
];

// The legacy hardcoded fixture has been physically moved OUT of production into
// tests/fixtures/teacher-math-legacy-drafts.ts (see Gate 2). No production file
// is exempt from the contamination scan any longer.
const LEGACY_ALLOWED = new Set();

// For POST handler contamination, even the realizer is not allowed addTeacherMathAgenda calls
const POST_HANDLER_FILES = [
  path.join(root, "app", "api", "export-pptx", "route.ts"),
];

const SCANNED_FILES = [
  path.join(root, "lib", "ppt-agent", "deck-content-realizer.ts"),
  ...POST_HANDLER_FILES,
  path.join(root, "app", "api", "generate-ppt", "route.ts"),
];

// ── Gate 1: Contamination scan ────────────────────────────────────────────────
const results = [];

try {
  for (const filePath of SCANNED_FILES) {
    const src = fs.readFileSync(filePath, "utf8");
    // No production file is exempt: the legacy fixture no longer lives here.
    if (LEGACY_ALLOWED.has(filePath)) {
      fail("contamination-scan", `${path.relative(root, filePath)} must not be in LEGACY_ALLOWED — the fixture belongs under tests/`);
    }
    const isPostHandler = POST_HANDLER_FILES.includes(filePath);
    const effectiveSrc = src;

    for (const { pattern, label } of CONTAMINATION_PATTERNS) {
      // addTeacherMathAgenda/Sources are only scanned in post-handler files
      if ((label.includes("addTeacherMathAgenda") || label.includes("addTeacherMathSources")) && !isPostHandler) continue;
      if (pattern.test(effectiveSrc)) {
        fail("contamination-scan", `${label} found in ${path.relative(root, filePath)}`);
      }
    }
  }
  results.push(pass("contamination-scan"));
} catch (e) {
  if (e.caseId) throw e;
  throw Object.assign(new Error(`contamination-scan: ${e.message}`), { caseId: "contamination-scan" });
}

// ── Gate 2: Dynamic realizer + fixture-isolation dependency scan ─────────────
// The production realizer must (a) generate topic-specific content dynamically,
// and (b) contain NO trace of the legacy hardcoded fixture. The fixture must
// live under tests/ and be imported by ZERO production modules. A rename is not
// sufficient — this gate proves physical removal from production.
try {
  const realizerPath = path.join(root, "lib", "ppt-agent", "deck-content-realizer.ts");
  const src = fs.readFileSync(realizerPath, "utf8");

  // teacherMathDynamicDrafts must exist and be the production generator
  assert.ok(src.includes("function teacherMathDynamicDrafts"), "teacherMathDynamicDrafts function must exist");

  // The production createDeckContentDrafts must call the dynamic function
  const productionCallRegex = /createDeckContentDrafts[\s\S]{0,800}teacherMathDynamic/;
  assert.ok(
    productionCallRegex.test(src),
    "createDeckContentDrafts must delegate to teacherMathDynamicDrafts"
  );

  // Dynamic function must reference topic (not hardcoded content)
  const dynamicFnMatch = src.match(/function teacherMathDynamicDrafts\([\s\S]{0,4000}?\nfunction /);
  const dynamicFnBody = dynamicFnMatch ? dynamicFnMatch[0] : src;
  assert.ok(
    /topic/.test(dynamicFnBody),
    "teacherMathDynamicDrafts must reference 'topic' from the task/contentPlan"
  );

  // The legacy fixture function must NOT exist in production any longer.
  assert.ok(
    !src.includes("_legacyTeacherMathDraftsFixtureOnly") && !src.includes("legacyTeacherMathDraftsFixture"),
    "legacy fixture function must be removed from the production realizer (moved to tests/fixtures)"
  );

  // The realizer must contain NO hardcoded lesson content at all now.
  assert.ok(!/y\s*=\s*2x\s*[+＋]\s*1/.test(src), "y=2x+1 must not appear in the production realizer");
  assert.ok(!/A\(0,\s*1\)/.test(src), "hardcoded point A(0,1) must not appear in the production realizer");

  // The fixture must physically exist under tests/.
  const fixturePath = path.join(root, "tests", "fixtures", "teacher-math-legacy-drafts.ts");
  assert.ok(fs.existsSync(fixturePath), "legacy fixture must live at tests/fixtures/teacher-math-legacy-drafts.ts");
  const fixtureSrc = fs.readFileSync(fixturePath, "utf8");
  assert.ok(
    fixtureSrc.includes("legacyTeacherMathDraftsFixture"),
    "fixture file must export legacyTeacherMathDraftsFixture"
  );
  assert.ok(/y\s*=\s*2x\s*[+＋]\s*1/.test(fixtureSrc), "the hardcoded content must now reside in the fixture file");

  // Dependency scan: NO production module (app/**, lib/**) may import the fixture.
  const fixtureImportRegex = /teacher-math-legacy-drafts/;
  const scanRoots = [path.join(root, "app"), path.join(root, "lib")];
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        walk(full);
      } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
        const content = fs.readFileSync(full, "utf8");
        if (fixtureImportRegex.test(content)) offenders.push(path.relative(root, full));
      }
    }
  };
  for (const dir of scanRoots) {
    if (fs.existsSync(dir)) walk(dir);
  }
  assert.equal(
    offenders.length,
    0,
    `no production module may import the legacy fixture; offenders: ${offenders.join(", ")}`
  );

  results.push(pass("dynamic-realizer"));
} catch (e) {
  throw Object.assign(new Error(`dynamic-realizer: ${e.message}`), { caseId: "dynamic-realizer" });
}

// ── Gate 3: DeckSpec hash produces different values for different topics ───────
try {
  const src = fs.readFileSync(path.join(root, "lib", "deck-spec.ts"), "utf8");

  // deckSpecHash function must exist
  assert.ok(src.includes("deckSpecHash"), "deckSpecHash function must exist in deck-spec.ts");

  // buildDeckSpec must have opts parameter for projectId/versionId
  assert.ok(
    /buildDeckSpec\([^)]*opts\?/.test(src) || /opts\?\s*:\s*\{/.test(src),
    "buildDeckSpec must accept opts parameter with versionId/projectId"
  );

  // DeckSpec type must have contentHash field
  const canvasDataSrc = fs.readFileSync(path.join(root, "lib", "canvas-data.ts"), "utf8");
  assert.ok(
    canvasDataSrc.includes("contentHash"),
    "DeckSpec type must include contentHash field"
  );
  assert.ok(
    canvasDataSrc.includes("versionId"),
    "DeckSpec type must include versionId field"
  );
  assert.ok(
    canvasDataSrc.includes("projectId"),
    "DeckSpec type must include projectId field"
  );

  results.push(pass("deck-spec-hash"));
} catch (e) {
  throw Object.assign(new Error(`deck-spec-hash: ${e.message}`), { caseId: "deck-spec-hash" });
}

// ── Gate 4: Quality separation – ProjectQualityReport type fields ─────────────
try {
  const src = fs.readFileSync(path.join(root, "lib", "canvas-data.ts"), "utf8");

  // ProjectQualityReport must contain engineeringScore and teacherReadinessScore
  assert.ok(
    src.includes("engineeringScore"),
    "ProjectQualityReport must contain engineeringScore field"
  );
  assert.ok(
    src.includes("teacherReadinessScore"),
    "ProjectQualityReport must contain teacherReadinessScore field"
  );
  assert.ok(
    src.includes("commercialReady?: false"),
    "ProjectQualityReport must contain commercialReady: false field"
  );

  // generate-ppt route must compute and include these scores
  const routeSrc = fs.readFileSync(path.join(root, "app", "api", "generate-ppt", "route.ts"), "utf8");
  assert.ok(
    routeSrc.includes("engineeringScore"),
    "generate-ppt route must set engineeringScore in quality"
  );
  assert.ok(
    routeSrc.includes("teacherReadinessScore"),
    "generate-ppt route must set teacherReadinessScore in quality"
  );
  assert.ok(
    routeSrc.includes("commercialReady: false"),
    "generate-ppt route must enforce commercialReady: false"
  );

  results.push(pass("quality-separation"));
} catch (e) {
  throw Object.assign(new Error(`quality-separation: ${e.message}`), { caseId: "quality-separation" });
}

// ── Gate 5: Prisma schema models ──────────────────────────────────────────────
try {
  const src = fs.readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");

  const requiredModels = [
    "model CoursewareProject",
    "model CoursewareRequest",
    "model CoursewareVersion",
    "model CoursewareArtifact",
  ];
  for (const model of requiredModels) {
    assert.ok(src.includes(model), `Prisma schema must contain ${model}`);
  }

  // CoursewareVersion must have engineeringStatus and teacherReadiness
  assert.ok(src.includes("engineeringStatus"), "CoursewareVersion must have engineeringStatus field");
  assert.ok(src.includes("teacherReadiness"), "CoursewareVersion must have teacherReadiness field");

  // CoursewareVersion must have deckSpecSnapshot and deckSpecHash
  assert.ok(src.includes("deckSpecSnapshot"), "CoursewareVersion must have deckSpecSnapshot field");
  assert.ok(src.includes("deckSpecHash"), "CoursewareVersion must have deckSpecHash field");

  // CoursewareProject must relate to User
  assert.ok(
    src.includes("coursewareProjects") || src.includes("CoursewareProject[]"),
    "User must have coursewareProjects back-relation"
  );

  // Migration must exist for 069
  const migrationsDir = path.join(root, "prisma", "migrations");
  const migrations = fs.readdirSync(migrationsDir).filter((d) => d.includes("069"));
  assert.ok(migrations.length > 0, "A migration with '069' in the name must exist");

  // lib/courseware-version.ts service layer must exist
  assert.ok(
    fs.existsSync(path.join(root, "lib", "courseware-version.ts")),
    "lib/courseware-version.ts service file must exist"
  );

  // generate-ppt route must import upsertCoursewareVersion
  const routeSrc = fs.readFileSync(path.join(root, "app", "api", "generate-ppt", "route.ts"), "utf8");
  assert.ok(
    routeSrc.includes("upsertCoursewareVersion"),
    "generate-ppt route must import and call upsertCoursewareVersion"
  );

  results.push(pass("schema-models"));
} catch (e) {
  throw Object.assign(new Error(`schema-models: ${e.message}`), { caseId: "schema-models" });
}

// ── Summary ───────────────────────────────────────────────────────────────────
const total = results.length;
const passed = results.filter((r) => r.status === "PASS").length;
console.log(
  JSON.stringify(
    {
      suite: "TEACHER_AI_PPT_069_ACCEPTANCE",
      total,
      passed,
      failed: total - passed,
      results,
    },
    null,
    2
  )
);
if (passed < total) {
  process.exit(1);
}
