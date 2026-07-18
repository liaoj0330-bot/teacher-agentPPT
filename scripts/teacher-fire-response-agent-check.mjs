import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const policyPath = path.join(root, "project-state", "teacher-agentppt.fire-response-agent.json");
const instructionPath = path.join(root, "agents", "private-beta-fire-response-agent.md");
const playbookPath = path.join(root, "docs", "WAVE_100_PRIVATE_BETA_PLAYBOOK_20260718.md");
const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
const instruction = fs.readFileSync(instructionPath, "utf8");
const playbook = fs.readFileSync(playbookPath, "utf8");

assert.equal(policy.schemaVersion, "teacher-agentppt-fire-response-agent/v1");
assert.deepEqual(policy.commands, ["report", "status", "contain", "recover", "close", "drill"]);
assert.deepEqual(Object.keys(policy.severity), ["P0", "P1", "P2", "P3"]);
assert.ok(policy.hardStops.length >= 6);
assert.ok(policy.preAuthorizedActions.includes("pause_invitation_issuance"));
assert.ok(policy.prohibitedActions.includes("delete_database_or_incident_evidence"));
assert.ok(policy.recoveryChecks.includes("pptx_export_and_redownload_hash_match"));
assert.equal(policy.controlPlane.connected, false);
for (const marker of ["/fire report", "/fire contain", "/fire recover", "固定输出格式", "永远禁止"]) assert.ok(instruction.includes(marker), `missing instruction marker: ${marker}`);
for (const marker of ["10 + 20 + 30 + 40", "邀请码", "500 统一积分", "发码前必须完成", "消防队 Agent"]) assert.ok(playbook.includes(marker), `missing playbook marker: ${marker}`);
console.log(JSON.stringify({ passed: true, commands: policy.commands, severity: Object.keys(policy.severity), controlPlane: policy.controlPlane.connected }, null, 2));
