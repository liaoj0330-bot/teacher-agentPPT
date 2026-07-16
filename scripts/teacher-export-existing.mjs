import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.BASE_URL || 'http://127.0.0.1:3002';
const outputDir = path.resolve(process.env.OUTPUT_DIR || 'D:/tmp/sandun-replica/teacher-export-existing');
const email = 'grade1-arithmetic-1784133899824-1@example.com';
const password = 'Teacher123!';
const identity = {
  projectType: 'teacher_courseware',
  projectId: 'cmrmb9bxp00550wqwndl4ayh2',
  requestId: 'cmrmbkvv3005h0wqwvgu6vklu',
  versionId: 'cmrmbkvw3005j0wqw704ovksa',
  versionNumber: 2,
  lifecycleStatus: 'review_required',
  engineeringStatus: 'passed',
  teacherReadiness: 'review_required'
};

fs.mkdirSync(outputDir, { recursive: true });
const edge = [
  `${process.env.ProgramFiles}/Microsoft/Edge/Application/msedge.exe`,
  `${process.env['ProgramFiles(x86)']}/Microsoft/Edge/Application/msedge.exe`
].find(candidate => candidate && fs.existsSync(candidate));
if (!edge) throw new Error('Microsoft Edge not found');
const browser = await chromium.launch({ headless: true, executablePath: edge });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const events = [];
page.on('console', msg => events.push({ type: 'console', text: msg.text() }));
page.on('pageerror', error => events.push({ type: 'pageerror', text: error.message }));

await page.goto(`${base}/teacher-ai-ppt`, { waitUntil: 'domcontentloaded' });
const login = await page.evaluate(async ({ email, password }) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}, { email, password });
if (login.status !== 200) throw new Error(`login failed ${login.status}: ${JSON.stringify(login.body)}`);

await page.evaluate(identity => {
  sessionStorage.setItem('sandun.teacher-courseware.identity.v1', JSON.stringify(identity));
  sessionStorage.removeItem('sandun.teacher-courseware.bootstrap.v1');
}, identity);
await page.reload({ waitUntil: 'networkidle' });

await page.getByRole('button', { name: /导出课件/ }).waitFor({ state: 'visible', timeout: 30000 });
const state = await page.evaluate(() => ({ url: location.href, body: document.body.innerText.slice(0, 4000) }));
const downloadPromise = page.waitForEvent('download', { timeout: 180000 });
await page.getByRole('button', { name: /导出课件/ }).click();
const download = await downloadPromise;
const filePath = path.join(outputDir, await download.suggestedFilename());
await download.saveAs(filePath);
const stat = fs.statSync(filePath);
const header = fs.readFileSync(filePath).subarray(0, 4).toString('hex');
const bodyText = await page.locator('body').innerText();
fs.writeFileSync(path.join(outputDir, 'result.json'), JSON.stringify({
  base, loginStatus: login.status, state, downloadPath: filePath,
  suggestedFilename: download.suggestedFilename(), size: stat.size, header,
  failure: await download.failure(), bodyTail: bodyText.slice(-1800), events
}, null, 2));
console.log(JSON.stringify({ filePath, size: stat.size, header, suggestedFilename: download.suggestedFilename(), bodyTail: bodyText.slice(-500) }, null, 2));
await browser.close();
