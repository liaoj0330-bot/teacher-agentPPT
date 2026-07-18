import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "app", "api", "admin", "beta-monitor", "route.ts"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "components", "BetaMonitoringDashboard.tsx"), "utf8");
const operations = JSON.parse(fs.readFileSync(path.join(root, "project-state", "teacher-agentppt.private-beta-operations.json"), "utf8"));
const fire = JSON.parse(fs.readFileSync(path.join(root, "project-state", "teacher-agentppt.fire-response-agent.json"), "utf8"));

for (const marker of ["registeredUsers", "activeUsers", "generationCompletionRate", "generationLatencyP90Seconds", "exportSuccessRate", "oldestQueueMinutes", "openP0", "creditsSpent", "unmeasuredUntilCloudTelemetry"]) {
  assert.ok(route.includes(marker), `missing monitoring API signal: ${marker}`);
}
for (const marker of ["60_000", "使用率", "稳定性", "告警与消防队"]) {
  assert.ok(dashboard.includes(marker), `missing dashboard contract: ${marker}`);
}
assert.equal(operations.monitoring.dashboardPath, "/teacher-ai-ppt/admin");
assert.equal(operations.monitoring.refreshSeconds, 60);
assert.ok(operations.monitoring.usageSignals.includes("credits_spent"));
assert.ok(operations.monitoring.stabilitySignals.includes("generation_latency_p90"));
assert.equal(fire.monitoring.automaticFireMapping, true);
console.log(JSON.stringify({ passed: true, usageSignals: operations.monitoring.usageSignals.length, stabilitySignals: operations.monitoring.stabilitySignals.length, refreshSeconds: operations.monitoring.refreshSeconds }, null, 2));
