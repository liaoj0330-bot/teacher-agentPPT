import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const repoRoot = process.cwd();
const resultDir = path.join(repoRoot, "test-results", "p1-g");
const reportPath = path.join(resultDir, "smoke-3002.json");
const url = "http://127.0.0.1:3002/";

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(800);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitForHome(timeoutMs = 45000) {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      const html = await response.text();
      if (response.status === 200) return { ok: true, status: response.status, html };
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { ok: false, status: 0, html: "", error: lastError || "timeout" };
}

function startServer() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCommand, ["run", "start", "--", "-p", "3002"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env, PORT: "3002" }
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  return { child, logs };
}

async function stopServer(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
    return;
  }
  child.kill("SIGTERM");
}

const report = {
  status: "failed",
  checkedAt: new Date().toISOString(),
  url,
  port: 3002,
  portAlreadyInUse: false,
  startedByScript: false,
  httpStatus: 0,
  htmlContainsBasicContent: false,
  serverStopped: false,
  errors: []
};

let server = null;
try {
  report.portAlreadyInUse = await isPortOpen(3002);
  if (!report.portAlreadyInUse) {
    server = startServer();
    report.startedByScript = true;
  }

  const home = await waitForHome();
  report.httpStatus = home.status;
  report.htmlContainsBasicContent = /PPT|Presentation|__next|AI/i.test(home.html || "");
  if (!home.ok) report.errors.push(`Home page was not reachable: ${home.error || "unknown error"}`);
  if (home.ok && !report.htmlContainsBasicContent) report.errors.push("Home page returned 200 but did not contain basic app HTML markers.");
  report.status = report.errors.length ? "failed" : "ok";
  if (server?.logs?.length) report.serverLogTail = server.logs.join("").slice(-4000);
} catch (error) {
  report.errors.push(error instanceof Error ? error.message : String(error));
} finally {
  if (server?.child) {
    await stopServer(server.child);
    report.serverStopped = true;
  }
  writeJson(reportPath, report);
}

console.log(JSON.stringify(report, null, 2));
if (report.status !== "ok") {
  process.exitCode = 1;
}
