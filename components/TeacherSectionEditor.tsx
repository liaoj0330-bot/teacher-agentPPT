"use client";

import { useMemo, useState } from "react";
import { Puck } from "@puckeditor/core";
import { createPortal } from "react-dom";
import "@puckeditor/core/puck.css";
import type { DesignSlide } from "@/lib/canvas-data";

type Props = {
  slide: DesignSlide;
  disabled?: boolean;
  onPersist: (sections: DesignSlide["sections"]) => void;
};

const config: any = {
  components: {
    TeachingBlock: {
      fields: {
        heading: { type: "text" },
        body: { type: "textarea" },
      },
      render: ({ heading, body }: { heading?: string; body?: string }) => (
        <section className="rounded-xl border border-[#dfe5ee] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-[#1d2939]">{heading || "课堂内容"}</h3>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-[#475467]">{body || "填写本区块内容"}</p>
        </section>
      ),
    },
  },
};

export function TeacherSectionEditor({ slide, disabled, onPersist }: Props) {
  const [open, setOpen] = useState(false);
  const [draftData, setDraftData] = useState<any>(null);
  const data = useMemo(() => ({
    root: { props: {} },
    content: (slide.sections || []).map((section: any, index) => ({
      type: "TeachingBlock",
      props: {
        id: `section-${index + 1}`,
        heading: section.title || section.heading || `课堂区块 ${index + 1}`,
        body: section.body || section.text || section.items?.join("\n") || "",
        original: section,
      },
    })),
  }), [slide.id, slide.sections]);

  const persist = () => {
    const next = draftData || data;
    const sections = (next.content || []).map((item: any, index: number) => ({ ...(item.props?.original || {}), id: item.props?.original?.id || `section-${index + 1}`, title: item.props?.heading || "Classroom block", body: item.props?.body || "" }));
    onPersist(sections);
    setOpen(false);
  };

  if (!open) return <button type="button" disabled={disabled} onClick={() => { setDraftData(null); setOpen(true); }} className="mt-3 flex h-10 w-full items-center justify-center border border-[#8bb9ff] bg-[#f3f8ff] text-sm font-semibold text-[#175cd3] disabled:opacity-50">编辑本页结构与区块</button>;

  return createPortal(<div className="fixed inset-0 z-[150] flex flex-col bg-white"><div className="flex h-12 shrink-0 items-center justify-between border-b border-[#dfe5ee] px-4 text-xs text-[#175cd3]"><span>Drag blocks to change the real slide structure.</span><div className="flex gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-[#dfe5ee] px-3 py-1.5 font-semibold text-[#344054]">Close</button><button type="button" onClick={persist} className="rounded-lg bg-[#171719] px-3 py-1.5 font-semibold text-white">Save structure and create version</button></div></div><div className="min-h-0 flex-1 overflow-hidden"><Puck config={config} data={data as any} onChange={setDraftData} onPublish={persist} /></div></div>, document.body);
}
