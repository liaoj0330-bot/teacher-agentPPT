import path from "path";
import { readFile } from "fs/promises";
import { Automizer } from "pptx-automizer";
import JSZip from "jszip";

export type PptxTemplateElementManifest = {
  name: string;
  type: string;
  visualType: string;
  creationId: string;
  hasTextBody: boolean;
  text: string[];
  placeholderType?: string;
};

export type PptxTemplateSlideManifest = {
  number: number;
  name: string;
  layoutName: string;
  elements: PptxTemplateElementManifest[];
};

export type PptxTemplateAutomizerManifest = {
  engine: "pptx-automizer";
  sourceFileName: string;
  slideCount: number;
  namedElementCount: number;
  textElementCount: number;
  pictureElementCount: number;
  slides: PptxTemplateSlideManifest[];
  limitations: string[];
};

function createAutomizer(sourcePath: string) {
  return new Automizer({
    templateDir: path.dirname(sourcePath),
    templateFallbackDir: path.dirname(sourcePath),
    outputDir: path.dirname(sourcePath),
    removeExistingSlides: false,
    autoImportSlideMasters: true,
    cleanupPlaceholders: false,
    cleanup: false,
    compression: 6,
    verbosity: 0,
  });
}

export async function inspectPptxWithAutomizer(sourcePath: string): Promise<PptxTemplateAutomizerManifest> {
  const sourceFileName = path.basename(sourcePath);
  const templateAlias = "source-template";
  const presentation = createAutomizer(sourcePath).loadRoot(sourceFileName).load(sourceFileName, templateAlias);
  const info = await presentation.getInfo();
  const slides = info.slidesByTemplate(templateAlias).map((slide) => ({
    number: slide.number,
    name: slide.info.name,
    layoutName: slide.info.layoutName,
    elements: slide.elements.map((element) => {
      let placeholderType: string | undefined;
      try {
        placeholderType = element.getPlaceholderInfo()?.type;
      } catch {
        placeholderType = undefined;
      }
      return {
        name: element.name,
        type: element.type,
        visualType: element.visualType,
        creationId: element.creationId,
        hasTextBody: element.hasTextBody,
        text: element.hasTextBody ? element.getText().map((value) => String(value || "").trim()).filter(Boolean) : [],
        placeholderType,
      };
    }),
  }));
  const elements = slides.flatMap((slide) => slide.elements);
  return {
    engine: "pptx-automizer",
    sourceFileName,
    slideCount: slides.length,
    namedElementCount: elements.filter((element) => element.name).length,
    textElementCount: elements.filter((element) => element.hasTextBody).length,
    pictureElementCount: elements.filter((element) => /pic|picture|image/i.test(`${element.type} ${element.visualType}`)).length,
    slides,
    limitations: [
      "动画不在自动修改范围内；增删动画关联形状可能导致动画失效。",
      "复杂图片或图表应放在母版而不是版式层，才能稳定继承。",
      "正式改写只允许命名对象或已确认占位符，未命名品牌对象默认保留。",
    ],
  };
}

/** Exact-copy baseline used by the fidelity gate before any beautification edits. */
export async function clonePptxPreservingSource(sourcePath: string): Promise<Buffer> {
  const sourceFileName = path.basename(sourcePath);
  const presentation = createAutomizer(sourcePath).loadRoot(sourceFileName);
  const zip = await presentation.getJSZip();
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function comparePptxStructure(sourcePath: string, candidate: Buffer) {
  const [sourceZip, candidateZip] = await Promise.all([
    JSZip.loadAsync(await readFile(sourcePath)),
    JSZip.loadAsync(candidate),
  ]);
  const inventory = (zip: JSZip) => ({
    slides: Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(),
    masters: Object.keys(zip.files).filter((name) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name)).sort(),
    layouts: Object.keys(zip.files).filter((name) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).sort(),
  });
  const sourceInventory = inventory(sourceZip);
  const candidateInventory = inventory(candidateZip);
  const issues: string[] = [];
  if (sourceInventory.slides.join("|") !== candidateInventory.slides.join("|")) issues.push("slide_inventory_changed");
  if (sourceInventory.masters.join("|") !== candidateInventory.masters.join("|")) issues.push("master_inventory_changed");
  if (sourceInventory.layouts.join("|") !== candidateInventory.layouts.join("|")) issues.push("layout_inventory_changed");
  for (const slideName of sourceInventory.slides) {
    const [sourceXml, candidateXml] = await Promise.all([
      sourceZip.file(slideName)?.async("string"),
      candidateZip.file(slideName)?.async("string"),
    ]);
    const texts = (xml = "") => [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => match[1].replace(/\s+/g, " ").trim()).filter(Boolean);
    if (texts(sourceXml).join("|") !== texts(candidateXml).join("|")) issues.push(`${slideName}:text_changed`);
  }
  return {
    ok: issues.length === 0,
    source: { slideCount: sourceInventory.slides.length, masterCount: sourceInventory.masters.length, layoutCount: sourceInventory.layouts.length },
    candidate: { slideCount: candidateInventory.slides.length, masterCount: candidateInventory.masters.length, layoutCount: candidateInventory.layouts.length },
    issues,
  };
}
