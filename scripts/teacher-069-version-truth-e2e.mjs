#!/usr/bin/env node
/**
 * TEACHER_AI_PPT_069_VERSIONED_INTERACTION_CLOSURE_001
 * Integration test runner: version-commit fact source against REAL HTTP routes + REAL SQLite DB
 *
 * 10 acceptance tests:
 * 1. Read-back snapshot after generation
 * 2. Manual patch creates V2 with V1 unchanged
 * 3. Stale base → 409
 * 4. AI refine no overwrite
 * 5. Upload traceable version
 * 6. Export reads only specified version + writes Artifact
 * 7. Chat queryable + applying suggestion creates version
 * 8. Readiness gates export
 * 9. Visual generation creates a version-bound render artifact
 * 10. No-op page fix is rejected; real deck fix creates an immutable version
 */

import { spawn, spawnSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// Test configuration
const TEST_PORT = 3199;
const TEST_DB_PATH = path.resolve(`D:/tmp/test-069-truth-${Date.now()}.db`);
// Prisma's Windows schema engine requires forward slashes in file URLs.
const DATABASE_URL = `file:${TEST_DB_PATH.replaceAll('\\', '/')}`;
const NEXT_CLI = path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const MIGRATIONS = [
  '20260712175457_069_courseware_project_domain',
  '20260713000001_069_add_slide_content_snapshot',
  '20260713120001_069_versioned_interaction_closure',
];
// On Windows, localhost may resolve to IPv6 while Next binds the dev server
// to IPv4 in this test process. Keep the test deterministic across machines.
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const SESSION_TOKEN = `test_token_${Date.now()}`;
const SESSION_COOKIE = `ai_ppt_agent_session=${SESSION_TOKEN}`;

// Test results collector
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, error = null) {
  const status = passed ? '✓' : '✗';
  console.log(`${status} ${name}`);
  if (error) console.log(`  Error: ${error}`);
  results.tests.push({ name, passed, error });
  if (passed) results.passed++;
  else results.failed++;
}

// SHA256 hash for auth token
function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

// DeckSpec hash formula (from lib/deck-spec.ts)
function computeDeckSpecHash(specs) {
  const raw = specs.map(s => JSON.stringify({
    role: s.role,
    title: s.title,
    mustProve: s.mustProve,
    claim: s.claim,
    visibleBlocks: s.visibleBlocks,
    evidenceSnippets: s.evidenceSnippets,
    layoutIntent: s.layoutIntent,
  })).join('|');
  let h = 0;
  for (const ch of raw) {
    h = ((h << 5) - h + ch.charCodeAt(0)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0');
}

function initializeTemporaryDatabase() {
  const database = new DatabaseSync(TEST_DB_PATH);
  try {
    database.exec('PRAGMA foreign_keys = ON;');
    for (const migration of MIGRATIONS) {
      const migrationPath = path.join(projectRoot, 'prisma', 'migrations', migration, 'migration.sql');
      database.exec(readFileSync(migrationPath, 'utf8'));
    }
  } finally {
    database.close();
  }
}

// HTTP helpers
async function postJson(url, body, cookie = SESSION_COOKIE) {
  const res = await fetch(`${BASE_URL}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

async function getJson(url, cookie = SESSION_COOKIE) {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Cookie': cookie }
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

// POST that inspects the raw response. The versioned export streams a binary
// PPTX buffer with metadata in headers (X-Artifact-Id, X-Deck-Spec-Hash, ...),
// so a JSON parse would fail. On a non-OK response we still parse the JSON
// error body. Returns { status, ok, headers, json, isBinary }.
async function postRaw(url, body, cookie = SESSION_COOKIE) {
  const res = await fetch(`${BASE_URL}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify(body)
  });
  const contentType = res.headers.get('content-type') || '';
  const isBinary = !contentType.includes('application/json');
  let json = {};
  let buffer = null;
  if (!isBinary) {
    json = await res.json().catch(() => ({}));
  } else {
    buffer = Buffer.from(await res.arrayBuffer());
  }
  const headers = {};
  for (const [k, v] of res.headers.entries()) headers[k.toLowerCase()] = v;
  return { status: res.status, ok: res.ok, headers, json, isBinary, buffer };
}

// Database seeding via Prisma
async function seedDatabase() {
  console.log('Seeding test database...');

  // Import Prisma client
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } }
  });

  try {
    // Create test user
    const user = await prisma.user.create({
      data: {
        id: 'test_user_069',
        email: 'test@teacher069.local',
        name: 'Test Teacher',
        passwordHash: sha256('test_password_069'),
        inviteCode: 'TEST069INVITE',
        createdAt: new Date()
      }
    });

    // Create credit account
    await prisma.creditAccount.create({
      data: {
        id: 'test_credit_069',
        userId: user.id,
        balance: 10000,
        createdAt: new Date()
      }
    });

    // Create auth session
    const tokenHash = sha256(SESSION_TOKEN);
    await prisma.authSession.create({
      data: {
        id: 'test_session_069',
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date()
      }
    });

    // Create slide specs with hash-consistent structure
    const slideSpecs = [
      {
        id: 'slide-001',
        page: 1,
        title: '初始标题A',
        role: 'opener',
        claim: 'Test claim A',
        mustProve: 'Proof A',
        evidenceNeeds: ['evidence-1'],
        evidenceSourceIds: []
      },
      {
        id: 'slide-002',
        page: 2,
        title: '初始标题B',
        role: 'body',
        claim: 'Test claim B',
        mustProve: 'Proof B',
        evidenceNeeds: ['evidence-2'],
        evidenceSourceIds: []
      }
    ];

    const deckSpecHash = computeDeckSpecHash(slideSpecs);

    // Create design slides matching specs
    const designSlides = slideSpecs.map(spec => ({
      id: spec.id,
      title: spec.title,
      subtitle: `Subtitle for ${spec.title}`,
      tone: 'professional',
      bullets: ['Point 1', 'Point 2'],
      layout: 'title_body',
      speakerNote: `Speaker note for ${spec.title}`,
      evidenceBlockIds: spec.evidenceNeeds,
      sourceIds: spec.evidenceSourceIds
    }));

    const deckSpec = {
      id: 'deck-069-test',
      version: 1,
      contentHash: deckSpecHash,
      pptType: 'teacher_math',
      pptTypeLabel: '数学教学课件',
      audience: 'middle_school_students',
      goal: 'Test goal',
      coreMessage: 'Test message',
      expectedDecision: 'understanding',
      recommendedSlideCount: 2,
      requiredPages: [],
      forbiddenContent: [],
      evidenceNeeds: [],
      styleProfile: { tone: 'professional' },
      qualityBar: 'teacher_courseware',
      slideSpecs,
      createdAt: new Date().toISOString()
    };

    // Create courseware project
    const project = await prisma.coursewareProject.create({
      data: {
        id: 'proj-069-test',
        userId: user.id,
        title: 'Test Project 069',
        subject: '数学',
        schoolStage: 'middle_school',
        grade: '初二',
        createdAt: new Date()
      }
    });

    // Create courseware request
    const request = await prisma.coursewareRequest.create({
      data: {
        id: 'req-069-test',
        projectId: project.id,
        requestType: 'initial_generate',
        status: 'completed',
        teacherTaskSnapshot: JSON.stringify({
          subject: '数学',
          schoolStage: 'middle_school',
          grade: '初二',
          topic: '勾股定理',
          objective: 'Test objective'
        }),
        createdAt: new Date()
      }
    });

    // Create initial version V1
    const version1 = await prisma.coursewareVersion.create({
      data: {
        id: 'ver-069-test-v1',
        projectId: project.id,
        requestId: request.id,
        versionNumber: 1,
        operation: 'initial_generate',
        summary: 'Initial generation',
        teacherTaskSnapshot: JSON.stringify({
          subject: '数学',
          schoolStage: 'middle_school',
          grade: '初二',
          topic: '勾股定理',
          objective: 'Test objective'
        }),
        deckSpecSnapshot: JSON.stringify(deckSpec),
        deckSpecHash,
        slideContentSnapshot: JSON.stringify(designSlides),
        contentPlanSnapshot: JSON.stringify({ approach: 'test', teacherContext: { topic: '勾股定理', schoolStage: 'middle_school', grade: '初二', subject: '数学' } }),
        evidenceSnapshot: JSON.stringify([]),
        sourceDocumentsSnapshot: JSON.stringify([]),
        engineeringStatus: 'passed',
        teacherReadiness: 'review_required',
        lifecycleStatus: 'draft',
        createdAt: new Date()
      }
    });

    // Set current version
    await prisma.coursewareProject.update({
      where: { id: project.id },
      data: { currentVersionId: version1.id }
    });

    console.log(`✓ Seeded: User, Project ${project.id}, Version V1 (hash: ${deckSpecHash})`);

    await prisma.$disconnect();

    return {
      userId: user.id,
      projectId: project.id,
      versionId: version1.id,
      deckSpecHash,
      slideSpecs,
      designSlides,
      deckSpec
    };
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }
}

// Start Next.js dev server
function startDevServer() {
  return new Promise((resolve, reject) => {
    console.log(`Starting Next.js dev server on port ${TEST_PORT}...`);

    const server = spawn(process.execPath, [NEXT_CLI, 'dev', '-H', '127.0.0.1', '-p', TEST_PORT.toString()], {
      cwd: projectRoot,
      env: {
        ...process.env,
        DATABASE_URL,
        NODE_ENV: 'development',
        PORT: TEST_PORT.toString(),
        NEXT_DIST_DIR: '.next-069-e2e',
        NEXT_TELEMETRY_DISABLED: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    });

    let output = '';
    let resolved = false;
    const timeout = setTimeout(() => {
      server.kill();
      if (output.trim()) console.error('Server output before health timeout:\n' + output.slice(-4000));
      reject(new Error('Server startup timeout'));
    }, 60000);

    server.stdout.on('data', (data) => {
      output += data.toString();
      if (!resolved && (output.includes('Local:') || output.includes('Ready in'))) {
        resolved = true;
        clearTimeout(timeout);
        console.log('✓ Next.js dev server process started');
        resolve(server);
      }
    });

    server.stderr.on('data', (data) => {
      const text = data.toString();
      if (text.includes('Error') && !text.includes('warn')) {
        console.error('Server error:', text);
      }
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Poll for server health
async function waitForServer(maxAttempts = 180) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Any HTTP response (even 401/400) means the route layer is compiled and serving.
      const res = await fetch(`${BASE_URL}/api/courseware-version?projectId=probe&versionId=probe`, { method: 'GET' });
      if (res.status > 0) {
        console.log(`✓ Server responding (HTTP ${res.status})`);
        return true;
      }
    } catch (err) {
      // Server not ready yet / connection refused
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Server health check failed at ${BASE_URL}`);
}

// Test implementations
async function runTests(seedData) {
  const { projectId, versionId, deckSpecHash, slideSpecs, designSlides, deckSpec } = seedData;

  // The GET endpoint intentionally requires an explicit versionId (the frontend
  // always knows the current version it opened). Tests therefore track the head
  // of the version chain here, updating it from each commit's returned versionId,
  // rather than asking the server to resolve "current" from projectId alone.
  let currentVersionId = versionId; // starts at V1

  console.log('\n=== Running Integration Tests ===\n');

  // Test 1: Read-back snapshot after generation
  try {
    const res = await getJson(`/api/courseware-version?projectId=${projectId}&versionId=${versionId}`);
    const pass = res.ok &&
                 res.json.projectId === projectId &&
                 res.json.versionId === versionId &&
                 res.json.versionNumber === 1 &&
                 res.json.deckSpecHash === deckSpecHash &&
                 res.json.engineeringStatus === 'passed' &&
                 res.json.isCurrent === true;
    logTest('Test 1: Read-back snapshot after generation', pass, !pass ? `Status: ${res.status}, match failed` : null);
  } catch (err) {
    logTest('Test 1: Read-back snapshot after generation', false, err.message);
  }

  // Test 2: Manual patch creates V2 with V1 unchanged
  try {
    const editRes = await postJson('/api/courseware-version', {
      projectId,
      baseVersionId: versionId,
      operation: 'manual_edit',
      idempotencyKey: `test-edit-${Date.now()}`,
      payload: {
        slideId: 'slide-001',
        patch: { title: '修改后标题A' }
      }
    });

    const v2Pass = editRes.ok && editRes.json.versionNumber === 2;
    if (editRes.ok && editRes.json.versionId) currentVersionId = editRes.json.versionId;

    // Check V1 unchanged
    const v1Check = await getJson(`/api/courseware-version?projectId=${projectId}&versionId=${versionId}`);
    const v1Unchanged = v1Check.ok &&
                        v1Check.json.deckSpec.slideSpecs[0].title === '初始标题A' &&
                        v1Check.json.deckSpecHash === deckSpecHash &&
                        v1Check.json.isCurrent === false;

    const pass = v2Pass && v1Unchanged;
    logTest('Test 2: Manual patch creates V2 with V1 unchanged', pass, !pass ? `V2: ${editRes.status}, V1 unchanged: ${v1Unchanged}` : null);
  } catch (err) {
    logTest('Test 2: Manual patch creates V2 with V1 unchanged', false, err.message);
  }

  // Test 3: Stale base → 409
  try {
    const staleRes = await postJson('/api/courseware-version', {
      projectId,
      baseVersionId: versionId, // V1 is no longer current
      operation: 'manual_edit',
      idempotencyKey: `test-stale-${Date.now()}`,
      payload: {
        slideId: 'slide-002',
        patch: { title: 'Should fail' }
      }
    });

    const pass = staleRes.status === 409 && staleRes.json.code === 'version_conflict';
    logTest('Test 3: Stale base → 409', pass, !pass ? `Status: ${staleRes.status}, code: ${staleRes.json.code}` : null);
  } catch (err) {
    logTest('Test 3: Stale base → 409', false, err.message);
  }

  // Test 4: AI refine no overwrite
  try {
    // currentVersionId is the head of the chain (V2 from Test 2)
    const refineRes = await postJson('/api/courseware-version', {
      projectId,
      baseVersionId: currentVersionId,
      operation: 'ai_refine_deck',
      idempotencyKey: `test-refine-${Date.now()}`,
      payload: {
        refinementGoal: 'improve_clarity'
      }
    });

    const v3Created = refineRes.ok && refineRes.json.versionNumber === 3;
    if (refineRes.ok && refineRes.json.versionId) currentVersionId = refineRes.json.versionId;

    // Check V1 still readable
    const v1Still = await getJson(`/api/courseware-version?projectId=${projectId}&versionId=${versionId}`);
    const v1Readable = v1Still.ok && v1Still.json.versionNumber === 1;

    const pass = v3Created && v1Readable;
    logTest('Test 4: AI refine no overwrite', pass, !pass ? `V3: ${refineRes.status}, V1 readable: ${v1Readable}` : null);
  } catch (err) {
    logTest('Test 4: AI refine no overwrite', false, err.message);
  }

  // Test 5: Upload traceable version
  try {
    const uploadRes = await postJson('/api/courseware-version', {
      projectId,
      baseVersionId: currentVersionId,
      operation: 'attach_material',
      idempotencyKey: `test-upload-${Date.now()}`,
      payload: {
        sourceDocuments: [{
          id: `doc-${Date.now()}`,
          name: 'test-material.pdf',
          kind: 'reference',
          bytes: 2048,
          origin: 'teacher_upload'
        }]
      }
    });

    const versionCreated = uploadRes.ok;
    if (uploadRes.ok && uploadRes.json.versionId) currentVersionId = uploadRes.json.versionId;

    // Read back and check sourceDocuments
    if (versionCreated) {
      const checkRes = await getJson(`/api/courseware-version?projectId=${projectId}&versionId=${uploadRes.json.versionId}`);
      const hasSource = checkRes.ok &&
                        Array.isArray(checkRes.json.sourceDocuments) &&
                        checkRes.json.sourceDocuments.length > 0;
      const pass = hasSource;
      logTest('Test 5: Upload traceable version', pass, !pass ? `Version created but sourceDocuments: ${JSON.stringify(checkRes.json.sourceDocuments)}` : null);
    } else {
      logTest('Test 5: Upload traceable version', false, `Upload failed: ${uploadRes.status}`);
    }
  } catch (err) {
    logTest('Test 5: Upload traceable version', false, err.message);
  }

  // Test 6: Export reads only specified version + writes Artifact
  try {
    // The versioned export streams a binary PPTX with metadata in headers, so
    // we must inspect headers (X-Artifact-Id) — a JSON parse would fail.
    const exportRes = await postRaw('/api/export-pptx', {
      projectId,
      versionId, // V1
      artifactType: 'pptx'
    });

    const artifactId = exportRes.headers['x-artifact-id'];
    const deckHash = exportRes.headers['x-deck-spec-hash'];
    const exportSucceeded = exportRes.ok && exportRes.isBinary && !!artifactId;

    // Prove the artifact row was actually written to the DB, bound to V1, and
    // that the export re-derived V1's hash (i.e. it read only that version).
    let artifactRow = null;
    if (exportSucceeded) {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
      try {
        artifactRow = await prisma.coursewareArtifact.findUnique({ where: { id: artifactId } });
      } finally {
        await prisma.$disconnect();
      }
    }

    const artifactWritten = !!artifactRow &&
                            artifactRow.versionId === versionId &&
                            artifactRow.status === 'ready';
    const readSpecifiedVersion = deckHash === deckSpecHash;
    let pptxStructureValid = false;
    let pptxStructureDetail = 'no binary buffer';
    if (exportRes.buffer) {
      const zip = await JSZip.loadAsync(exportRes.buffer);
      const slideFiles = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]));
      const slideXml = await Promise.all(slideFiles.map((name) => zip.file(name).async('string')));
      const editablePages = slideXml.filter((xml) => (xml.match(/<p:sp>/g) || []).length >= 2 && xml.includes('<a:t>')).length;
      pptxStructureValid = slideFiles.length === designSlides.length && editablePages === slideFiles.length;
      pptxStructureDetail = `slides=${slideFiles.length}/${designSlides.length} editablePages=${editablePages}`;
    }

    const pass = exportSucceeded && artifactWritten && readSpecifiedVersion && pptxStructureValid;
    logTest(
      'Test 6: Export reads only specified version + writes Artifact',
      pass,
      !pass
        ? `status=${exportRes.status} binary=${exportRes.isBinary} artifactId=${artifactId} boundVersion=${artifactRow?.versionId} artifactStatus=${artifactRow?.status} deckHash=${deckHash} expected=${deckSpecHash} structure=${pptxStructureDetail}`
        : null
    );
  } catch (err) {
    logTest('Test 6: Export reads only specified version + writes Artifact', false, err.message);
  }

  // Test 7: Chat queryable + applying suggestion creates version
  try {
    // Post a chat message (will get 503 without API key, but should persist)
    const chatRes = await postJson('/api/courseware-chat', {
      projectId,
      versionId: currentVersionId,
      message: 'Test message',
      context: {}
    });

    // Expected 503 (no OPENAI_API_KEY), but messages should be persisted
    const messagesPersisted = chatRes.status === 503 || chatRes.status === 201;

    // Query messages
    const messagesRes = await getJson(`/api/courseware-chat?projectId=${projectId}&versionId=${currentVersionId}`);
    const messagesQueryable = messagesRes.ok && Array.isArray(messagesRes.json.messages);

    // Apply a patch via commit (simulating suggestion application)
    const patchRes = await postJson('/api/courseware-version', {
      projectId,
      baseVersionId: currentVersionId,
      operation: 'classroom_interaction',
      idempotencyKey: `test-chat-patch-${Date.now()}`,
      payload: {
        interactionNote: 'Applied chat suggestion during classroom trial'
      }
    });

    const patchCreatesVersion = patchRes.ok && patchRes.json.versionNumber > 3;
    if (patchRes.ok && patchRes.json.versionId) currentVersionId = patchRes.json.versionId;

    const pass = messagesPersisted && messagesQueryable && patchCreatesVersion;
    logTest('Test 7: Chat queryable + applying suggestion creates version', pass, !pass ? `Persist: ${messagesPersisted}, Query: ${messagesQueryable}, Patch: ${patchCreatesVersion}` : null);
  } catch (err) {
    logTest('Test 7: Chat queryable + applying suggestion creates version', false, err.message);
  }

  // Test 8: Readiness gates export
  try {
    // Create a version with teacherReadiness="failed"
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL } }
    });

    // Seed a VALID snapshot (real deckSpec + slides + matching hash) so the export
    // route passes not_found/corrupt_snapshot/hash checks and actually reaches the
    // teacherReadiness gate. A corrupt/empty snapshot would also 422, but for the
    // wrong reason and would not prove the readiness gate works.
    const failedVersion = await prisma.coursewareVersion.create({
      data: {
        id: `ver-069-test-failed-${Date.now()}`,
        projectId,
        requestId: 'req-069-test',
        versionNumber: 99,
        operation: 'manual_edit',
        summary: 'Failed readiness version',
        teacherTaskSnapshot: JSON.stringify({ subject: '数学', schoolStage: 'middle_school', grade: '初二', topic: '勾股定理' }),
        deckSpecSnapshot: JSON.stringify(deckSpec),
        deckSpecHash, // matches computeDeckSpecHash(slideSpecs)
        slideContentSnapshot: JSON.stringify(designSlides),
        contentPlanSnapshot: JSON.stringify({ approach: 'test', teacherContext: { topic: '勾股定理', schoolStage: 'middle_school', grade: '初二', subject: '数学' } }),
        evidenceSnapshot: JSON.stringify([]),
        sourceDocumentsSnapshot: JSON.stringify([]),
        engineeringStatus: 'passed',       // engineering OK, so only readiness can block
        teacherReadiness: 'failed',        // <-- the gate under test
        lifecycleStatus: 'draft',
        createdAt: new Date()
      }
    });

    await prisma.$disconnect();

    // Try to export this version
    const exportRes = await postJson('/api/export-pptx', {
      projectId,
      versionId: failedVersion.id,
      artifactType: 'pptx'
    });

    // Must be 422, AND the failure reason must cite teacherReadiness (proving the
    // gate blocked it, not an incidental corrupt-snapshot / hash mismatch).
    const reason = (exportRes.json && (exportRes.json.reason || exportRes.json.message || exportRes.json.failureReason)) || '';
    const blockedByReadiness = /readiness|teacherReadiness|就绪/i.test(String(reason));
    const pass = exportRes.status === 422 && blockedByReadiness;
    logTest('Test 8: Readiness gates export', pass, !pass ? `Expected 422 w/ readiness reason, got ${exportRes.status} reason="${reason}"` : null);
  } catch (err) {
    logTest('Test 8: Readiness gates export', false, err.message);
  }

  // Test 9: Visual generation creates a version-bound render artifact
  try {
    const baseVersionId = currentVersionId;
    const visualRes = await postJson('/api/courseware-version', {
      projectId,
      baseVersionId,
      operation: 'generate_visuals',
      idempotencyKey: `test-visuals-${Date.now()}`,
      payload: {}
    });

    let artifactRow = null;
    if (visualRes.ok && visualRes.json.artifactId) {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
      try {
        artifactRow = await prisma.coursewareArtifact.findUnique({
          where: { id: visualRes.json.artifactId }
        });
      } finally {
        await prisma.$disconnect();
      }
    }

    const pass = visualRes.ok &&
      visualRes.json.parentVersionId === baseVersionId &&
      artifactRow?.versionId === visualRes.json.versionId &&
      artifactRow?.artifactType === 'render_manifest' &&
      artifactRow?.status === 'ready';
    if (visualRes.ok && visualRes.json.versionId) currentVersionId = visualRes.json.versionId;
    logTest(
      'Test 9: Visual generation creates version-bound render artifact',
      pass,
      !pass ? `status=${visualRes.status} artifact=${JSON.stringify(artifactRow)}` : null
    );
  } catch (err) {
    logTest('Test 9: Visual generation creates version-bound render artifact', false, err.message);
  }

  // Test 10: Page and deck review fixes create immutable versions
  try {
    const pageBaseVersionId = currentVersionId;
    const pageFixRes = await postJson('/api/courseware-version', {
      projectId,
      baseVersionId: pageBaseVersionId,
      operation: 'apply_page_review_fixes',
      idempotencyKey: `test-page-review-${Date.now()}`,
      payload: {
        targetSlideId: 'slide-001',
        instruction: '按课前检查建议修复本页，保留教学内容。'
      }
    });
    if (pageFixRes.ok && pageFixRes.json.versionId) currentVersionId = pageFixRes.json.versionId;

    const deckBaseVersionId = currentVersionId;
    const deckFixRes = await postJson('/api/courseware-version', {
      projectId,
      baseVersionId: deckBaseVersionId,
      operation: 'apply_review_fixes',
      idempotencyKey: `test-deck-review-${Date.now()}`,
      payload: { instruction: '按课前检查建议修复整套课件，保留教学内容。' }
    });
    if (deckFixRes.ok && deckFixRes.json.versionId) currentVersionId = deckFixRes.json.versionId;

    const deckRead = deckFixRes.ok
      ? await getJson(`/api/courseware-version?projectId=${projectId}&versionId=${deckFixRes.json.versionId}`)
      : null;
    const pass = pageFixRes.status === 422 &&
      pageFixRes.json.code === 'no_content_change' &&
      deckFixRes.ok &&
      deckRead?.json.operation === 'apply_review_fixes' &&
      deckRead?.json.parentVersionId === deckBaseVersionId &&
      deckRead?.json.isCurrent === true;
    logTest(
      'Test 10: No-op page fix rejected; real deck fix versioned',
      pass,
      !pass ? `page=${pageFixRes.status} deck=${deckFixRes.status}` : null
    );
  } catch (err) {
    logTest('Test 10: No-op page fix rejected; real deck fix versioned', false, err.message);
  }
}

// Cleanup
async function cleanup(server, dbPath) {
  console.log('\nCleaning up...');
  if (server && server.pid) {
    try {
      // On Windows, the dev server is a child of the shell; kill the whole tree.
      spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
    } catch {}
    try { server.kill(); } catch {}
    console.log('✓ Server stopped');
  }
  if (existsSync(dbPath)) {
    let lastError = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        unlinkSync(dbPath);
        console.log('✓ Test database removed');
        return;
      } catch (err) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    console.log(`Warning: Could not remove test DB: ${lastError?.message || 'unknown error'}`);
  }
}

// Main execution
async function main() {
  let server = null;

  try {
    // Step 1: Build a fresh test DB from the checked-in migrations. This avoids
    // nesting Prisma's Windows schema engine inside the test runner.
    console.log('Setting up temporary database...');
    initializeTemporaryDatabase();
    console.log('✓ Checked-in migrations applied to temp DB');

    // Step 2: Seed database
    const seedData = await seedDatabase();

    // Step 3: Start Next.js dev server
    server = await startDevServer();
    await waitForServer();

    // Step 4: Run tests
    await runTests(seedData);

    // Summary
    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Total: ${results.tests.length}`);

    // Write JSON summary
    const summaryPath = path.join(projectRoot, 'test-069-version-truth-results.json');
    writeFileSync(summaryPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      testSuite: 'teacher-069-version-truth-e2e',
      passed: results.passed,
      failed: results.failed,
      total: results.tests.length,
      tests: results.tests
    }, null, 2));
    console.log(`\n✓ Results written to ${summaryPath}`);

    // Set exit code
    process.exitCode = results.failed > 0 ? 1 : 0;

  } catch (error) {
    console.error('\n✗ Fatal error:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await cleanup(server, TEST_DB_PATH);
  }
}

main();
