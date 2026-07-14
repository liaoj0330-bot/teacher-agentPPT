import type { RenderElement, RenderScene, VisualQAIssue, VisualQAReport, VisualRect } from "@/lib/visual-compiler/contracts";

function overlaps(a: VisualRect, b: VisualRect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function outOfBounds(element: RenderElement, scene: RenderScene) {
  const { bounds } = element;
  return bounds.x < 0 || bounds.y < 0 || bounds.width <= 0 || bounds.height <= 0 || bounds.x + bounds.width > scene.canvas.width || bounds.y + bounds.height > scene.canvas.height;
}

export function validateRenderScenes(scenes: RenderScene[]): VisualQAReport {
  const issues: VisualQAIssue[] = [];
  for (const scene of scenes) {
    for (const element of scene.elements) {
      if (outOfBounds(element, scene)) {
        issues.push({ issueId: `${scene.sceneId}:bounds:${element.elementId}`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "error", code: "OUT_OF_BOUNDS", message: "元素超出幻灯片画布", elementIds: [element.elementId] });
      }
      if (element.kind === "text" && element.role !== "meta" && !element.editable) {
        issues.push({ issueId: `${scene.sceneId}:editable:${element.elementId}`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "error", code: "UNEDITABLE_CORE_CONTENT", message: "核心文本必须保持可编辑", elementIds: [element.elementId] });
      }
      if (element.kind === "text" && element.fontSizePt && element.role === "body" && element.fontSizePt < 16) {
        issues.push({ issueId: `${scene.sceneId}:font:${element.elementId}`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "warning", code: "FONT_TOO_SMALL", message: "正文小于教师课件建议的 16pt", elementIds: [element.elementId] });
      }
    }
    const visible = scene.elements.filter((item) => item.kind !== "shape");
    for (let left = 0; left < visible.length; left += 1) {
      for (let right = left + 1; right < visible.length; right += 1) {
        if (overlaps(visible[left].bounds, visible[right].bounds)) {
          issues.push({ issueId: `${scene.sceneId}:overlap:${visible[left].elementId}:${visible[right].elementId}`, sceneId: scene.sceneId, slideId: scene.slideId, severity: "warning", code: "OVERLAP", message: "可见内容区域发生重叠，需要渲染器确认层级或重新排版", elementIds: [visible[left].elementId, visible[right].elementId] });
        }
      }
    }
  }
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;
  return { schemaVersion: "teacher-visual-qa/v1", status: errorCount ? "failed" : warningCount ? "review_required" : "passed", sceneCount: scenes.length, errorCount, warningCount, issues };
}
