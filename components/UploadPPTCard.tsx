"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2, Paperclip, UploadCloud, X } from "lucide-react";
import type { DocumentAnalysis } from "@/lib/document-analysis";
import { cn, formatFileSize } from "@/lib/utils";

export type UploadedFile = {
  name: string;
  size: number;
  status: "uploading" | "uploaded" | "error";
  mimeType?: string;
  analysis?: DocumentAnalysis;
};

type UploadPPTCardProps = {
  uploadedFile: UploadedFile | null;
  onUploaded: (file: UploadedFile | null) => void;
  compact?: boolean;
  fileKind?: "any" | "ppt";
};

const allowedExtensions = [".ppt", ".pptx", ".pdf", ".doc", ".docx", ".txt", ".md", ".png", ".jpg", ".jpeg", ".webp"];

export function UploadPPTCard({ uploadedFile, onUploaded, compact = false, fileKind = "any" }: UploadPPTCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file?: File) => {
    if (!file) {
      return;
    }

    const lowerName = file.name.toLowerCase();
    const extensions = fileKind === "ppt" ? [".ppt", ".pptx"] : allowedExtensions;
    const isAllowed = extensions.some((extension) => lowerName.endsWith(extension));

    if (!isAllowed) {
      setError(fileKind === "ppt" ? "优化已有课件仅支持 PPT 或 PPTX 文件" : "支持 PPT、PDF、Word、文本和常见图片格式");
      return;
    }

    setError("");
    onUploaded({ name: file.name, size: file.size, status: "uploading", mimeType: file.type });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload-ppt", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        throw new Error("upload failed");
      }

      const data = (await response.json()) as {
        fileName?: string;
        size?: number;
        type?: string;
        analysis?: DocumentAnalysis;
      };
      onUploaded({
        name: data.fileName || file.name,
        size: data.size || file.size,
        status: "uploaded",
        mimeType: data.type || file.type,
        analysis: data.analysis
      });
    } catch {
      onUploaded({ name: file.name, size: file.size, status: "error", mimeType: file.type });
      setError("上传或解析失败，请稍后重试");
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  };

  return (
    <section className={cn("rounded-[24px] border border-line bg-white shadow-sm", compact ? "p-2" : "p-4")}>
      <div className={cn("flex items-center justify-between gap-3", compact ? "mb-2 px-1" : "mb-3")}>
        <div>
          <h2 className="text-sm font-semibold text-ink">{fileKind === "ppt" ? "上传需要优化的 PPT" : compact ? "上传 PPT / PDF / 文档" : "上传资料到画布"}</h2>
          <p className="mt-1 text-xs text-muted">{fileKind === "ppt" ? "支持 PPT、PPTX" : "支持 PPT、PDF、Word、文本、图片"}</p>
        </div>
        <div className={cn("flex items-center justify-center rounded-2xl bg-[#eef6ff] text-[#2563eb]", compact ? "size-9" : "size-10")}>
          <FileUp className="size-5" />
        </div>
      </div>

      <div
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center rounded-[20px] border border-dashed px-5 text-center transition",
          compact ? "min-h-[92px]" : "min-h-[146px]",
          isDragging ? "border-[#6172ff] bg-[#f5f7ff]" : "border-[#d9deea] bg-[#fafbfe]"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={fileKind === "ppt" ? ".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" : ".ppt,.pptx,.pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*,text/plain,text/markdown"}
          className="hidden"
          onChange={handleInputChange}
        />

        {!uploadedFile ? (
          <>
            <div className={cn("flex items-center justify-center rounded-2xl bg-white text-[#4f63ff] shadow-sm", compact ? "size-9" : "size-12")}>
              <UploadCloud className={compact ? "size-5" : "size-6"} />
            </div>
            <div className={cn("font-medium text-ink", compact ? "mt-2 text-xs" : "mt-3 text-sm")}>拖拽文件到这里</div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn("rounded-2xl bg-ink px-4 py-2 text-xs font-medium text-white transition hover:-translate-y-0.5", compact ? "mt-2" : "mt-3")}
            >
              选择资料文件
            </button>
          </>
        ) : (
          <div className="w-full rounded-2xl border border-line bg-white p-3 text-left shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f1f4fb] text-[#5267ff]">
                {uploadedFile.status === "uploading" ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : uploadedFile.status === "uploaded" ? (
                  <CheckCircle2 className="size-5" />
                ) : (
                  <Paperclip className="size-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{uploadedFile.name}</div>
                <div className="mt-1 text-xs text-muted">
                  {formatFileSize(uploadedFile.size)} ·{" "}
                  {uploadedFile.status === "uploading" ? "上传并解析中" : uploadedFile.status === "uploaded" ? "已解析" : "上传失败"}
                </div>
              </div>
              <button
                type="button"
                aria-label="移除文件"
                onClick={() => {
                  setError("");
                  onUploaded(null);
                }}
                className="flex size-8 items-center justify-center rounded-xl text-muted transition hover:bg-[#f2f4f8] hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            {uploadedFile.analysis ? (
              <div className="mt-3 rounded-2xl bg-[#f8fafc] px-3 py-2 text-xs leading-5 text-muted">
                已解析 {uploadedFile.analysis.pageCount} 页 / {uploadedFile.analysis.blockCount} 个内容块
                <div className="mt-1 line-clamp-2">{uploadedFile.analysis.summary}</div>
              </div>
            ) : null}

            {uploadedFile.status === "uploaded" ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-[#fafbfe] text-xs font-medium text-ink transition hover:border-[#b9c7ff] hover:bg-white"
              >
                <UploadCloud className="size-4" />
                更换资料文件
              </button>
            ) : null}
          </div>
        )}
      </div>

      {error ? <div className="mt-2 text-xs text-[#d94646]">{error}</div> : null}
    </section>
  );
}
