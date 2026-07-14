import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const root = process.cwd();
const port = 3201;
const base = `http://127.0.0.1:${port}`;
const fixture = path.join(root, "artifacts", "template-parser-poc", "teacher-template-fixture.pptx");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");

async function portOpen() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

async function waitForServer() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (await portOpen()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("template API test server did not start");
}

if (!fs.existsSync(fixture)) throw new Error(`fixture missing: ${fixture}; run npm run teacher-template-poc:test first`);
const server = spawn(process.execPath, [nextCli, "dev", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env, NEXT_DIST_DIR: ".next-template-api-e2e" }
});
let stderr = "";
server.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await waitForServer();
  const deckSpec = {
    id: "template-api-deck", version: "1", pptType: "courseware", pptTypeLabel: "教师课件", audience: "学生", goal: "教学", coreMessage: "函数", expectedDecision: "掌握", recommendedSlideCount: 1,
    requiredPages: [], forbiddenContent: [], evidenceNeeds: [], styleProfile: "grid", qualityBar: 82, createdAt: new Date(0).toISOString(),
    slideSpecs: [{ id: "cover", page: 1, title: "函数", role: "课程封面", claim: "", mustProve: "", evidenceNeeds: [], evidenceSourceIds: [], layoutIntent: "cover", layoutReason: "", visualIntent: "", density: "airy", mustHave: [], avoid: [], scoreRules: [] }]
  };
  const form = new FormData();
  form.set("file", new File([fs.readFileSync(fixture)], "teacher-template-fixture.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }));
  form.set("deckSpec", JSON.stringify(deckSpec));
  const response = await fetch(`${base}/api/teacher-template-manifest`, { method: "POST", body: form });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.integration.status, "runtime_selection_ready");
  assert.equal(payload.integration.persisted, false);
  assert.ok(payload.layoutContracts.length >= 2);
  assert.equal(payload.runtimeSelections.length, 1);
  assert.ok(payload.runtimeSelections[0].candidates.length >= 1);
  console.log(JSON.stringify({ pass: true, status: response.status, integration: payload.integration, templateKey: payload.runtimeProfile.templateKey, layoutContracts: payload.layoutContracts.length, selection: payload.runtimeSelections[0] }, null, 2));
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (!server.killed) server.kill("SIGKILL");
  if (stderr && process.env.DEBUG_TEMPLATE_API_E2E) process.stderr.write(stderr);
}
