import type { CanvasProject } from "@/lib/canvas-data";

export type WorkbenchMode = CanvasProject["mode"];

export type WorkbenchModeContract = {
  mode: WorkbenchMode;
  label: string;
  shortLabel: string;
  description: string;
  tagline: string;
  requiresUpload: boolean;
  acceptedHint: string;
  idlePlaceholder: string;
  editorPlaceholder: string;
  waitingUploadLabel: string;
  primaryActionLabel: string;
  helperText: string;
  uploadMissingMessage: string;
};

export const workbenchModeContracts: Record<WorkbenchMode, WorkbenchModeContract> = {
  agent: {
    mode: "agent",
    label: "Agent 模式",
    shortLabel: "Agent",
    description: "从 0 生成",
    tagline: "先调研，再策划，再出稿",
    requiresUpload: false,
    acceptedHint: "输入真实需求即可开始",
    idlePlaceholder: "描述你的 PPT 需求，例如：帮我做一份项目汇报 PPT，面向管理层",
    editorPlaceholder: "输入修改指令，例如：把这一页改得更简洁一些",
    waitingUploadLabel: "启动 Agent / 生成 PPT",
    primaryActionLabel: "启动 Agent / 生成 PPT",
    helperText: "按 Enter 发送，Shift + Enter 换行",
    uploadMissingMessage: ""
  },
  beautify: {
    mode: "beautify",
    label: "PPT 美化",
    shortLabel: "美化",
    description: "上传 PPT 改稿",
    tagline: "先诊断原稿，再重排提分，再导出 PPTX",
    requiresUpload: true,
    acceptedHint: "支持 .ppt / .pptx",
    idlePlaceholder: "先上传 PPT/PPTX，再描述你希望保留什么、优化什么",
    editorPlaceholder: "输入修改指令，例如：统一标题层级、压缩文案、强化商务风",
    waitingUploadLabel: "等待上传 PPT",
    primaryActionLabel: "解析原稿 / 美化 PPT",
    helperText: "PPT 美化需要先上传 .ppt 或 .pptx；进入编辑器后可直接输入修改指令",
    uploadMissingMessage: "PPT 美化需要先上传 .ppt 或 .pptx 原稿"
  },
  reference: {
    mode: "reference",
    label: "资料生成",
    shortLabel: "资料",
    description: "按资料生成 PPT",
    tagline: "先解析资料，再映射证据，再生成页面",
    requiresUpload: true,
    acceptedHint: "支持 PDF / Word / TXT / MD / 图片",
    idlePlaceholder: "先上传 PDF、Word、TXT 或需求文档，再描述生成目标和受众",
    editorPlaceholder: "输入修改指令，例如：补证据来源、重写第 3 页、增强结论",
    waitingUploadLabel: "等待上传资料",
    primaryActionLabel: "解析资料 / 生成 PPT",
    helperText: "资料生成需要先上传可解析文件；系统会把资料块映射到页面证据",
    uploadMissingMessage: "资料生成需要先上传 PDF、Word、TXT、图片或需求文档"
  }
};

export function getWorkbenchModeContract(mode: WorkbenchMode | undefined): WorkbenchModeContract {
  return workbenchModeContracts[mode || "agent"] || workbenchModeContracts.agent;
}

export function isPptLikeFile(fileName = "", mimeType = "") {
  const value = `${fileName} ${mimeType}`.toLowerCase();
  return /\.(ppt|pptx)\b/.test(value) || value.includes("powerpoint") || value.includes("presentationml");
}

export function isReferenceLikeFile(fileName = "", mimeType = "") {
  const value = `${fileName} ${mimeType}`.toLowerCase();
  return (
    /\.(pdf|doc|docx|txt|md|png|jpe?g|webp)\b/.test(value) ||
    value.includes("pdf") ||
    value.includes("word") ||
    value.includes("text/") ||
    value.includes("image/")
  );
}

export function modeForUploadedFile(file: { name?: string; mimeType?: string; type?: string } | null | undefined): WorkbenchMode {
  const name = file?.name || "";
  const mimeType = file?.mimeType || file?.type || "";
  if (isPptLikeFile(name, mimeType)) return "beautify";
  if (isReferenceLikeFile(name, mimeType)) return "reference";
  return "reference";
}
