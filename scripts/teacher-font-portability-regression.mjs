import assert from "node:assert/strict";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { addRenderScenesToPptx } from "../lib/visual-compiler/pptx-scene-renderer.ts";

const scene = {
  slideId: "font-scene-1",
  page: 1,
  layoutId: "font-test",
  canvas: { width: 13.333, height: 7.5 },
  composition: { family: "teacher", colors: { background: "F7FAFF", ink: "172033", muted: "667085", accent: "2F6FEC", accent2: "6AA6FF", line: "D9E2F1", soft: "F3F7FD" } },
  elements: [
    { id: "t1", kind: "text", role: "title", text: "字体兼容性检查", editable: true, zIndex: 1, bounds: { x: 0.8, y: 0.9, width: 5.8, height: 0.7 }, fontSizePt: 24 },
    { id: "b1", kind: "text", role: "body", text: "正文应使用宋体，标题应使用黑体，避免依赖微软雅黑。", editable: true, zIndex: 2, bounds: { x: 0.8, y: 1.9, width: 6.8, height: 1.0 }, fontSizePt: 14 },
  ],
};

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.theme = { headFontFace: "SimHei", bodyFontFace: "SimSun" };
addRenderScenesToPptx(pptx, [scene]);
const buffer = await pptx.write({ outputType: "nodebuffer" });
const zip = await JSZip.loadAsync(buffer);
const themeXml = await zip.file("ppt/theme/theme1.xml")?.async("string");
const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string");
assert.ok(themeXml?.includes("SimHei"), "theme must declare SimHei");
assert.ok(themeXml?.includes("SimSun"), "theme must declare SimSun");
assert.ok(!themeXml?.includes("Microsoft YaHei"), "theme must not declare Microsoft YaHei");
assert.ok(slideXml?.includes("字体兼容性检查"), "slide must contain title text");
assert.ok(slideXml?.includes("正文应使用宋体"), "slide must contain body text");
assert.ok(!slideXml?.includes("Microsoft YaHei"), "slide xml must not hardcode Microsoft YaHei");
console.log(JSON.stringify({ pass: true, themeFonts: ["SimHei", "SimSun"], slideTextChecks: true }, null, 2));
