import JSZip from "jszip";
import type { RenderScene } from "@/lib/visual-compiler/contracts";

export type PptxArtifactQAPage = {
  page: number;
  slideId: string;
  nativeTextObjects: number;
  nativePictureObjects: number;
  expectedTextObjects: number;
  expectedPictureObjects: number;
  imageCoverage: number;
};

export type PptxArtifactQAReport = {
  ok: boolean;
  slideCount: number;
  nativeTextObjects: number;
  nativePictureObjects: number;
  editableObjectCoverage: number;
  imageCoverageMax: number;
  ooxmlEditable: boolean;
  pages: PptxArtifactQAPage[];
  issues: string[];
};

function slideNumber(name: string) {
  return Number(name.match(/slide(\d+)\.xml$/)?.[1] || 0);
}

export async function inspectPptxArtifact(buffer: Buffer, scenes: RenderScene[]): Promise<PptxArtifactQAReport> {
  const archive = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(archive.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => slideNumber(left) - slideNumber(right));
  const sortedScenes = [...scenes].sort((left, right) => left.page - right.page);
  const issues: string[] = [];
  const pages: PptxArtifactQAPage[] = [];

  if (slideNames.length !== sortedScenes.length) {
    issues.push(`PPTX 页数 ${slideNames.length} 与渲染场景 ${sortedScenes.length} 不一致`);
  }

  for (let index = 0; index < slideNames.length; index += 1) {
    const scene = sortedScenes[index];
    const xml = await archive.file(slideNames[index])!.async("string");
    const nativeTextObjects = (xml.match(/<p:txBody>/g) || []).length;
    const nativePictureObjects = (xml.match(/<p:pic>/g) || []).length;
    const expectedTextObjects = scene?.elements.filter((element) => element.kind === "text").length || 0;
    const expectedPictureObjects = scene?.elements.filter((element) => element.kind === "image").length || 0;
    const canvasArea = scene ? scene.canvas.width * scene.canvas.height : 1;
    const imageArea = scene?.elements.filter((element) => element.kind === "image").reduce((sum, element) => sum + element.bounds.width * element.bounds.height, 0) || 0;
    const imageCoverage = Number((imageArea / canvasArea).toFixed(3));
    pages.push({ page: index + 1, slideId: scene?.slideId || `slide-${index + 1}`, nativeTextObjects, nativePictureObjects, expectedTextObjects, expectedPictureObjects, imageCoverage });
    if (nativeTextObjects < expectedTextObjects) issues.push(`第 ${index + 1} 页原生文本对象缺失：${nativeTextObjects}/${expectedTextObjects}`);
    if (nativePictureObjects < expectedPictureObjects) issues.push(`第 ${index + 1} 页图片对象缺失：${nativePictureObjects}/${expectedPictureObjects}`);
  }

  const nativeTextObjects = pages.reduce((sum, page) => sum + page.nativeTextObjects, 0);
  const nativePictureObjects = pages.reduce((sum, page) => sum + page.nativePictureObjects, 0);
  const expectedTextObjects = pages.reduce((sum, page) => sum + page.expectedTextObjects, 0);
  const editableObjectCoverage = Number(Math.min(1, nativeTextObjects / Math.max(1, expectedTextObjects)).toFixed(3));
  const imageCoverageMax = Math.max(0, ...pages.map((page) => page.imageCoverage));
  const ooxmlEditable = issues.length === 0 && editableObjectCoverage >= 1;
  return { ok: issues.length === 0, slideCount: slideNames.length, nativeTextObjects, nativePictureObjects, editableObjectCoverage, imageCoverageMax, ooxmlEditable, pages, issues };
}
