import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();
const root = path.join(repoRoot, "test-results", "p1-i");
const pptxDir = path.join(root, "exported-pptx");
const metadataDir = path.join(root, "deck-metadata");
const reportPath = path.join(root, "content-quality-regression.json");
const sampleIds = ["product_intro", "project_report", "sales_proposal", "courseware"];

const bannedPatterns = [
  { id: "audience-question", pattern: /受众问题/ },
  { id: "core-claim-label", pattern: /核心观点/ },
  { id: "evidence-arrangement", pattern: /证据安排/ },
  { id: "page-conclusion", pattern: /页面结论/ },
  { id: "layout-execution", pattern: /版式执行层/ },
  { id: "recommended-expression", pattern: /推荐表达形式/ },
  { id: "this-page-needs", pattern: /这一页要|本页要|页面需要/ },
  { id: "must-prove-first", pattern: /必须先证明/ },
  { id: "internal-page-plan-id", pattern: /\bpagePlanId\b/i },
  { id: "internal-layout-plan-id", pattern: /\blayoutPlanId\b/i },
  { id: "internal-content-draft-id", pattern: /\bcontentDraftId\b/i },
  { id: "internal-evidence-block-id", pattern: /\bevidenceBlockId\b/i },
  { id: "internal-source-id", pattern: /\bsourceId\b/i },
  { id: "debug-mock-auto", pattern: /\b(debug|mock|generated visual)\b/i },
  { id: "test-case-aigc", pattern: /高校\s*AIGC|产教融合|北京五日游|Dify/i },
  { id: "mojibake-replacement", pattern: /\uFFFD/ }
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function pathToFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, "/")}`;
}

function decodeXmlText(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function textFromSlideXml(xml) {
  const runs = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXmlText(match[1] || ""));
  return runs.join(" ").replace(/\s+/g, " ").trim();
}

async function inspectPptx(filePath) {
  const pptxgenPath = require.resolve("pptxgenjs");
  const nodeModulesDir = pptxgenPath.slice(0, pptxgenPath.lastIndexOf(`${path.sep}pptxgenjs${path.sep}`));
  const jszip = await import(pathToFileUrl(path.join(nodeModulesDir, "jszip", "lib", "index.js")));
  const zip = await jszip.default.loadAsync(fs.readFileSync(filePath));
  const slideXmlFiles = Object.keys(zip.files)
    .filter((name) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const slides = [];
  for (const xmlFile of slideXmlFiles) {
    const xml = await zip.files[xmlFile].async("string");
    slides.push({ xmlFile, text: textFromSlideXml(xml) });
  }
  return slides;
}

function titleIssues(slides) {
  return slides.flatMap((slide, index) => {
    const title = slide.title || "";
    if (!title) return [];
    const length = [...title].length;
    const issues = [];
    if (length > 34) issues.push({ slide: index + 1, id: "title-too-long", title, length });
    if (/^(本页|这一页|页面|此页|必须|需要|要把|用于|用来|证明|讲清|说明)/.test(title)) {
      issues.push({ slide: index + 1, id: "title-is-meta-sentence", title, length });
    }
    return issues;
  });
}

function inspectMetadata(deckId) {
  const filePath = path.join(metadataDir, `${deckId}.json`);
  if (!fs.existsSync(filePath)) {
    return { present: false, issues: [{ id: "metadata-missing", message: `${deckId} metadata missing` }] };
  }
  const metadata = readJson(filePath);
  const issues = [];
  if (!metadata.contentPlan?.present) issues.push({ id: "content-plan-missing", message: "ContentPlan summary missing" });
  if (!metadata.slidePagePlans?.present) issues.push({ id: "slide-page-plans-missing", message: "SlidePagePlan summary missing" });
  if (!metadata.layoutPlans?.present) issues.push({ id: "layout-plans-missing", message: "LayoutPlan summary missing" });
  if (!metadata.evidenceReport?.present) issues.push({ id: "evidence-report-missing", message: "EvidenceReport summary missing" });
  if (!metadata.contentDrafts?.present) issues.push({ id: "content-drafts-missing", message: "SlideContentDraft summary missing" });
  if (!metadata.deckContentQualityReport?.present) issues.push({ id: "deck-content-quality-report-missing", message: "DeckContentQualityReport missing" });
  if (metadata.deckContentQualityReport?.valid === false) issues.push({ id: "deck-content-quality-invalid", message: "DeckContentQualityReport invalid" });
  if ((metadata.contentDrafts?.count || 0) !== (metadata.slideCount || 0)) {
    const expectedCoreSlides = metadata.slideCount - 2;
    if ((metadata.contentDrafts?.count || 0) < expectedCoreSlides) {
      issues.push({ id: "content-draft-count-mismatch", message: `draftCount ${metadata.contentDrafts?.count || 0} is too low for slideCount ${metadata.slideCount || 0}` });
    }
  }
  for (const title of metadata.contentDrafts?.finalTitles || []) {
    const length = [...title].length;
    if (length > 32) issues.push({ id: "draft-title-too-long", title, length });
    if (/^(本页|这一页|页面|此页|必须|需要|要把|用于|用来|证明|讲清|说明)/.test(title)) {
      issues.push({ id: "draft-title-is-meta-sentence", title, length });
    }
  }
  if (deckId === "sales_proposal" && /政务蓝|评审汇报/i.test(JSON.stringify(metadata))) {
    issues.push({ id: "proposal-theme-leakage", message: "sales_proposal metadata contains government review theme leakage" });
  }
  if (deckId === "courseware" && /event_plan|活动亮白|执行策划/i.test(JSON.stringify(metadata))) {
    issues.push({ id: "courseware-type-leakage", message: "courseware metadata contains event_plan leakage" });
  }
  return { present: true, metadata, issues };
}

async function inspectDeck(deckId) {
  const pptxPath = path.join(pptxDir, `${deckId}.pptx`);
  const deckIssues = [];
  if (!fs.existsSync(pptxPath)) {
    return {
      deckId,
      pptxPath,
      slideCount: 0,
      valid: false,
      issues: [{ id: "pptx-missing", message: `Missing ${pptxPath}` }]
    };
  }
  const slides = await inspectPptx(pptxPath);
  const visibleText = slides.map((slide) => slide.text).join("\n");
  for (const banned of bannedPatterns) {
    const match = banned.pattern.exec(visibleText);
    if (match) deckIssues.push({ id: banned.id, match: match[0] });
  }
  if (deckId === "sales_proposal" && /政务蓝|评审汇报/i.test(visibleText)) {
    deckIssues.push({ id: "sales-proposal-government-theme-visible", match: "政务/评审主题" });
  }
  if (deckId === "courseware" && /event_plan|活动亮白|执行策划|EVENT PLAN/i.test(visibleText)) {
    deckIssues.push({ id: "courseware-event-plan-visible", match: "event_plan/activity theme" });
  }
  if (slides.length < 8 || slides.length > 12) {
    deckIssues.push({ id: "slide-count-out-of-range", message: `Expected 8-12 slides, got ${slides.length}` });
  }
  const thinSlides = slides
    .map((slide, index) => ({ slide: index + 1, length: [...slide.text.replace(/\s+/g, "")].length }))
    .filter((item) => item.slide > 1 && item.length < 45);
  if (thinSlides.length) {
    deckIssues.push({ id: "thin-visible-content", slides: thinSlides.slice(0, 4) });
  }
  const metadata = inspectMetadata(deckId);
  deckIssues.push(...metadata.issues);
  return {
    deckId,
    pptxPath,
    slideCount: slides.length,
    visibleTextLength: visibleText.length,
    metadata: metadata.present
      ? {
          pptType: metadata.metadata.pptType,
          reviewType: metadata.metadata.reviewType,
          contentDraftCount: metadata.metadata.contentDrafts?.count || 0,
          deckContentQualityValid: metadata.metadata.deckContentQualityReport?.valid ?? null,
          reviewScore: metadata.metadata.reviewScore,
          exportGate: metadata.metadata.exportGate?.status
        }
      : null,
    issues: deckIssues,
    valid: deckIssues.length === 0
  };
}

async function main() {
  ensureDir(root);
  const decks = [];
  for (const id of sampleIds) {
    decks.push(await inspectDeck(id));
  }
  const report = {
    status: decks.every((deck) => deck.valid) ? "passed" : "failed",
    checkedAt: new Date().toISOString(),
    root,
    decks,
    summary: {
      deckCount: decks.length,
      validDecks: decks.filter((deck) => deck.valid).length,
      issueCount: decks.reduce((sum, deck) => sum + deck.issues.length, 0)
    }
  };
  writeJson(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "passed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const report = {
    status: "failed",
    checkedAt: new Date().toISOString(),
    root,
    error: error instanceof Error ? error.message : String(error)
  };
  writeJson(reportPath, report);
  console.error(error);
  process.exit(1);
});
