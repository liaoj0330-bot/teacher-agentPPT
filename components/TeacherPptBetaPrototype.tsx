"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  GraduationCap,
  LayoutTemplate,
  Loader2,
  Paperclip,
  Palette,
  Send,
  Sparkles,
  Wand2,
  WandSparkles,
} from "lucide-react";
import { AuthModal, type AuthUser } from "@/components/AuthModal";
import { TeacherOutlinePlanner } from "@/components/TeacherOutlinePlanner";
import { TeacherWorkspace } from "@/components/TeacherWorkspace";
import { UploadPPTCard, type UploadedFile } from "@/components/UploadPPTCard";
import type { TeacherTheme, TeacherVisualMode } from "@/lib/canvas-data";
import {
  teacherWorkspaceBootstrapKey,
  teacherWorkspaceIdentityKey,
  type TeacherCoursewareTask,
  type TeacherDeckPlan,
  type WorkspaceBootstrapPayload,
} from "@/lib/teacher-courseware-task";
import {
  beginTeacherPlanCompilation,
  completeTeacherPlanCompilation,
  failTeacherPlanCompilation,
} from "@/lib/teacher-plan-client";
import {
  A1_TEMPLATE_ID,
  type TeacherLessonType,
} from "@/lib/teacher-template-registry";
import { cn } from "@/lib/utils";

const DRAFT_KEY = "sandun.teacher-courseware.draft.v3";
type TaskKind = "chapter" | "materials" | "polish";
type GuideStep = "choose" | "basics" | "curriculum" | "style" | "plan";
type TeacherMessage = {
  id: string;
  role: "teacher" | "assistant";
  content: string;
  provider?: "model" | "local";
};
type TeacherForm = {
  schoolStage: string;
  grade: string;
  subject: string;
  topic: string;
  duration: string;
  textbook: string;
  chapter: string;
  teachingRequirements: string;
};

const initialForm: TeacherForm = {
  schoolStage: "初中",
  grade: "八年级",
  subject: "数学",
  topic: "",
  duration: "45分钟",
  textbook: "",
  chapter: "",
  teachingRequirements: "",
};

const schoolStages = ["幼儿园", "小学", "初中", "高中", "中职", "大学"];
const subjects = [
  "语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理",
  "道德与法治", "科学", "信息科技", "音乐", "美术", "体育",
];
const gradesByStage: Record<string, string[]> = {
  幼儿园: ["小班", "中班", "大班"],
  小学: ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"],
  初中: ["七年级", "八年级", "九年级"],
  高中: ["高一", "高二", "高三"],
  中职: ["一年级", "二年级", "三年级"],
  大学: ["大一", "大二", "大三", "大四"],
};

const textbookPresets: Record<string, string[]> = {
  数学: ["人教版数学", "北师大版数学", "苏教版数学"],
  语文: ["人教版语文", "部编版语文", "统编版语文"],
  英语: ["人教版英语", "外研版英语", "北师大版英语"],
  物理: ["人教版物理", "北师大版物理"],
  化学: ["人教版化学", "鲁教版化学"],
};

const chapterPresets: Record<string, string[]> = {
  数学: ["第十四章 函数", "一次函数", "二次函数", "几何与图形"],
  语文: ["第一单元", "第二单元", "古诗文阅读", "现代文阅读"],
  英语: ["Unit 1", "Unit 2", "Unit 3", "Revision"],
};

const taskCards: Array<{
  id: TaskKind;
  title: string;
  description: string;
  icon: typeof BookOpen;
}> = [
  {
    id: "chapter",
    title: "从教材章节备课",
    description: "从课题、教材和教学要求开始。",
    icon: BookOpen,
  },
  {
    id: "materials",
    title: "从教案生成",
    description: "上传教案、教材节选或练习资料。",
    icon: FileText,
  },
  {
    id: "polish",
    title: "优化已有课件",
    description: "保留内容，重排版式和课堂节奏。",
    icon: LayoutTemplate,
  },
];

const themes: Array<{ id: TeacherTheme; name: string; color: string }> = [
  { id: "book_blue", name: "书卷蓝", color: "bg-[#2f7cff]" },
  { id: "rational_teal", name: "理性青绿", color: "bg-[#12806a]" },
  { id: "warm_orange", name: "暖橙米白", color: "bg-[#d7683c]" },
  { id: "high_contrast", name: "黑白高对比", color: "bg-[#171719]" },
];

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs font-semibold text-[#475467]">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-[#2f7cff] focus:ring-[#2f7cff]/10"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-[#475467]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-[#2f7cff] focus:ring-[#2f7cff]/10"
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export function TeacherPptBetaPrototype() {
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [taskKind, setTaskKind] = useState<TaskKind | null>(null);
  const [step, setStep] = useState<GuideStep>("choose");
  const [form, setForm] = useState<TeacherForm>(initialForm);
  const [lessonType, setLessonType] =
    useState<TeacherLessonType>("concept_building");
  const [visualMode, setVisualMode] =
    useState<TeacherVisualMode>("teaching_grid");
  const [theme, setTheme] = useState<TeacherTheme>("book_blue");
  const [pastedMaterials, setPastedMaterials] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<TeacherMessage[]>([]);
  const [isChatSending, setIsChatSending] = useState(false);
  const [isUploaderOpen, setIsUploaderOpen] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [state, setState] = useState<"idle" | "calling" | "error">("idle");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [deckPlan, setDeckPlan] = useState<TeacherDeckPlan | null>(null);

  useEffect(() => {
    if (
      window.sessionStorage.getItem(teacherWorkspaceBootstrapKey) ||
      window.sessionStorage.getItem(teacherWorkspaceIdentityKey)
    ) {
      setShowWorkspace(true);
      return;
    }
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as {
        taskKind?: TaskKind;
        form?: TeacherForm;
        lessonType?: TeacherLessonType;
        visualMode?: TeacherVisualMode;
        theme?: TeacherTheme;
        pastedMaterials?: string;
        step?: GuideStep;
        chatMessages?: TeacherMessage[];
        uploadedFile?: UploadedFile | null;
        deckPlan?: TeacherDeckPlan | null;
      };
      if (saved.taskKind) {
        setTaskKind(saved.taskKind);
        setStep(saved.step && saved.step !== "choose" ? saved.step : "basics");
      }
      if (saved.form) setForm(saved.form);
      if (saved.lessonType) setLessonType(saved.lessonType);
      if (saved.visualMode) setVisualMode(saved.visualMode);
      if (saved.theme) setTheme(saved.theme);
      if (typeof saved.pastedMaterials === "string")
        setPastedMaterials(saved.pastedMaterials);
      if (Array.isArray(saved.chatMessages)) setChatMessages(saved.chatMessages);
      if (saved.uploadedFile) setUploadedFile(saved.uploadedFile);
      if (saved.deckPlan?.pages?.length) setDeckPlan(saved.deckPlan);
    } catch {
      window.sessionStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { user: AuthUser | null })
          : null,
      )
      .then((data) => setUser(data?.user ?? null))
      .catch(() => setUser(null));
  }, []);

  const update = (key: keyof TeacherForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const requiredReady = Boolean(
    form.schoolStage.trim() &&
    form.grade.trim() &&
    form.subject.trim() &&
    form.topic.trim(),
  );
  const needsFile = taskKind === "materials" || taskKind === "polish";
  const currentTask = taskCards.find((item) => item.id === taskKind);
  const gradeOptions = gradesByStage[form.schoolStage] || [form.grade].filter(Boolean);
  const summary = useMemo(
    () =>
      [form.schoolStage, form.grade, form.subject, form.duration]
        .filter(Boolean)
        .join(" · "),
    [form],
  );

  const chooseTask = (kind: TaskKind) => {
    // Each card represents a different teacher workflow. Switching cards must
    // never carry a previous lesson's topic, textbook, upload or chat into the
    // next generation request. Re-selecting the same card keeps its draft.
    if (taskKind && taskKind !== kind) {
      setForm(initialForm);
      setLessonType("concept_building");
      setVisualMode("teaching_grid");
      setTheme("book_blue");
      setPastedMaterials("");
      setChatMessages([]);
      setChatInput("");
      setUploadedFile(null);
      setDeckPlan(null);
      setIsUploaderOpen(false);
      window.sessionStorage.removeItem(DRAFT_KEY);
      window.sessionStorage.removeItem(teacherWorkspaceBootstrapKey);
      window.sessionStorage.removeItem(teacherWorkspaceIdentityKey);
    }
    setTaskKind(kind);
    setStep("basics");
    setState("idle");
    setMessage("");
  };
  const goBack = () => {
    if (step === "basics") {
      // Keep the selected card identity while the chooser is visible so a
      // different card can be detected as a real workflow switch above.
      setStep("choose");
    } else if (step === "curriculum") setStep("basics");
    else if (step === "plan") setStep("style");
    else setStep("curriculum");
  };
  const saveDraft = () => {
    window.sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        taskKind,
        form,
        lessonType,
        visualMode,
        theme,
        pastedMaterials,
        step,
        chatMessages,
        uploadedFile,
        deckPlan,
      }),
    );
    setState("idle");
    setMessage("备课草稿已保存在当前浏览器会话中。");
  };

  const startNewTask = () => {
    window.sessionStorage.removeItem(DRAFT_KEY);
    window.sessionStorage.removeItem(teacherWorkspaceBootstrapKey);
    window.sessionStorage.removeItem(teacherWorkspaceIdentityKey);
    setTaskKind(null);
    setStep("choose");
    setForm(initialForm);
    setLessonType("concept_building");
    setVisualMode("teaching_grid");
    setTheme("book_blue");
    setPastedMaterials("");
    setChatMessages([]);
    setChatInput("");
    setUploadedFile(null);
    setDeckPlan(null);
    setIsUploaderOpen(false);
    setState("idle");
    setMessage("");
  };

  const sendTeacherMessage = async () => {
    const content = chatInput.trim();
    if (!content || isChatSending) return;
    const teacherMessage: TeacherMessage = {
      id: `teacher-${Date.now()}`,
      role: "teacher",
      content,
    };
    setChatMessages((current) => [...current, teacherMessage]);
    setChatInput("");
    setIsChatSending(true);
    try {
      const response = await fetch("/api/teacher-prep-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, message: content, step, taskKind, form }),
      });
      const data = await response.json().catch(() => null) as {
        reply?: string;
        patch?: Partial<TeacherForm>;
        taskKind?: TaskKind;
        provider?: "model" | "local";
        message?: string;
      } | null;
      if (!response.ok || !data?.reply) {
        throw new Error(data?.message || "备课助理暂时无法响应");
      }
      if (data.patch) setForm((current) => ({ ...current, ...data.patch }));
      if (data.taskKind) {
        setTaskKind(data.taskKind);
        if (step === "choose") setStep("basics");
      }
      setChatMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.reply || "",
        provider: data.provider,
      }]);
    } catch (error) {
      setChatMessages((current) => [...current, {
        id: `assistant-error-${Date.now()}`,
        role: "assistant",
        content: `备课助理响应失败：${error instanceof Error ? error.message : "请稍后重试"}`,
      }]);
    } finally {
      setIsChatSending(false);
    }
  };

  const buildTeacherTask = (): TeacherCoursewareTask => ({
    scenario: "teacher_courseware", planningMode: "professional",
    generationMode: taskKind === "chapter" ? "chapter_prep" : taskKind === "materials" ? "lesson_plan" : "optimize_existing",
    ...form, lessonType, templateId: lessonType === "concept_building" ? A1_TEMPLATE_ID : undefined,
    uploadedFiles: uploadedFile ? [uploadedFile] : [], pastedMaterials, teacherStyle: { visualMode, theme },
  });

  async function preparePlan() {
    if (!taskKind || !requiredReady || state === "calling") return;
    if (needsFile && uploadedFile?.status !== "uploaded") { setState("error"); setMessage("Please upload the required file first."); return; }
    setState("calling"); setMessage("Building the teaching plan from your curriculum inputs?");
    try {
      const response = await fetch("/api/teacher-courseware-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teacherTask: buildTeacherTask() }) });
      const data = await response.json();
      if (!response.ok || !data?.deckPlan) throw new Error(data?.message || "The planning service did not return a plan.");
      setDeckPlan(data.deckPlan as TeacherDeckPlan); setStep("plan"); setState("idle");
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Planning failed."); }
  }

  async function generate() {
    if (!taskKind || !requiredReady || state === "calling") return;
    if (needsFile && uploadedFile?.status !== "uploaded") {
      setState("error");
      setMessage(
        taskKind === "polish"
          ? "请先上传需要优化的 PPT 文件。"
          : "请先上传教案、教材或补充资料。",
      );
      return;
    }
    if (!user) {
      setMessage("登录后才能创建可保存、可导出的教师课件版本。");
      setIsAuthOpen(true);
      return;
    }
    if (!deckPlan?.pages.length) {
      setState("error");
      setMessage("请先生成并确认教学大纲。");
      return;
    }
    setState("calling");
    setMessage("正在保存大纲并逐页生成课件…");
    const baseTeacherTask = buildTeacherTask();
    let compilingPlan: TeacherDeckPlan | null = null;
    const mode =
      taskKind === "chapter"
        ? "agent"
        : taskKind === "materials"
          ? "reference"
          : "beautify";
    const prompt = `请为${form.schoolStage}${form.grade}${form.subject}课题“${form.topic}”生成一份${form.duration}的课堂课件。教材：${form.textbook}；章节：${form.chapter}；教学要求：${form.teachingRequirements}。${pastedMaterials}`;
    try {
      compilingPlan = await beginTeacherPlanCompilation(baseTeacherTask, deckPlan);
      setDeckPlan(compilingPlan);
      const teacherTask: TeacherCoursewareTask = {
        ...baseTeacherTask,
        deckPlan: {
          ...compilingPlan,
          status: "confirmed",
          confirmedAt: compilingPlan.confirmedAt || new Date().toISOString(),
          pageCount: compilingPlan.pages.length,
        },
      };
      const response = await fetch("/api/generate-ppt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: "teacher_courseware",
          teacherTask,
          prompt,
          mode,
          planningMode: "professional",
          uploadedFile,
          teacherStyle: teacherTask.teacherStyle,
          projectId: compilingPlan.projectId,
        }),
      });
      const data =
        (await response.json()) as Partial<WorkspaceBootstrapPayload> & {
          message?: string;
        };
      if (!response.ok || !data.project)
        throw new Error(data.message || `服务返回 HTTP ${response.status}`);
      if (
        !data.projectId ||
        !data.requestId ||
        !data.versionId ||
        !data.versionNumber ||
        !data.lifecycleStatus
      )
        throw new Error("课件已生成，但服务器没有返回完整版本身份，请重试");
      const readyPlan = await completeTeacherPlanCompilation(compilingPlan);
      setDeckPlan(readyPlan);
      const payload: WorkspaceBootstrapPayload = {
        scenario: "teacher_courseware",
        workspaceMode: "teacher_courseware",
        task: teacherTask,
        contentPlan: data.contentPlan ?? data.project.contentPlan!,
        slidePagePlan: data.slidePagePlan ?? data.project.slidePagePlans ?? [],
        layoutPlan: data.layoutPlan ?? data.project.layoutPlans ?? [],
        slides: data.project.slides,
        sourceDocuments:
          data.sourceDocuments ?? data.project.sourceDocuments ?? [],
        generationWarnings: data.generationWarnings ?? [],
        project: data.project,
        templateId: data.project.templateId,
        projectId: data.projectId,
        requestId: data.requestId,
        versionId: data.versionId,
        versionNumber: data.versionNumber,
        lifecycleStatus: data.lifecycleStatus,
        deckPlan: readyPlan,
      };
      window.sessionStorage.setItem(
        teacherWorkspaceBootstrapKey,
        JSON.stringify(payload),
      );
      window.sessionStorage.removeItem(DRAFT_KEY);
      setShowWorkspace(true);
    } catch (error) {
      if (compilingPlan) {
        const failedPlan = await failTeacherPlanCompilation(compilingPlan, error).catch(() => null);
        if (failedPlan) setDeckPlan(failedPlan);
      }
      setState("error");
      setMessage(
        `生成未完成：${error instanceof Error ? error.message : "请稍后重试"}`,
      );
    }
  }

  const canvasTitle =
    step === "choose" ? "今天准备哪一节课？" : form.topic || "正在整理备课任务";
  const canvasCopy =
    step === "choose"
      ? "BNSR 会先了解你的教学任务，再制作可编辑的课堂课件。"
      : step === "basics"
        ? "先确定授课对象与课题，右侧继续回答即可。"
        : step === "curriculum"
          ? "教材、章节和教学要求会直接进入课件内容规划。"
          : "最后选择课堂表达和视觉风格。";

  if (showWorkspace) return <TeacherWorkspace />;

  return (
    <main className="flex min-h-dvh overflow-hidden bg-[#f4f6fa] text-ink lg:h-dvh">
      <section className="relative min-h-[52dvh] flex-1 overflow-hidden bg-[radial-gradient(#d7ddea_1.15px,transparent_1.15px)] bg-[size:26px_26px] lg:min-h-0">
        <div className="absolute left-4 top-4 z-10 flex items-center gap-3 rounded-[24px] border border-line bg-white/95 px-3 py-3 shadow-sm backdrop-blur">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-ink text-white">
            <Wand2 className="size-5" />
          </span>
          <div>
            <div className="text-sm font-semibold">BNSR</div>
            <div className="text-xs text-muted">教师课件制作台</div>
          </div>
          <button
            type="button"
            onClick={() => {
              startNewTask();
            }}
            className="ml-2 flex h-9 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-xs font-semibold text-ink hover:border-[#b7d5ff]"
          >
            <Sparkles className="size-4" />
            新建
          </button>
        </div>
        <div className="relative z-[1] flex min-h-[52dvh] items-center justify-center px-5 py-28 lg:min-h-full">
          <div className="w-full max-w-[790px] text-center">
            <div className="mx-auto flex size-20 items-center justify-center rounded-[26px] border border-line bg-white text-ink shadow-[0_20px_60px_rgba(47,124,255,0.14)]">
              <GraduationCap className="size-10" />
            </div>
            <h1 className="mt-6 text-4xl font-bold leading-tight md:text-5xl">
              {canvasTitle}
            </h1>
            <p className="mx-auto mt-4 max-w-[560px] text-sm leading-6 text-muted md:text-base">
              {canvasCopy}
            </p>
            {step !== "choose" ? (
              <div className="mx-auto mt-8 max-w-[540px] border border-line bg-white p-5 text-left shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">备课任务</div>
                  <span className="rounded-full bg-[#eef6ff] px-2.5 py-1 text-xs font-semibold text-[#175cd3]">
                    {currentTask?.title}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted">授课对象</div>
                    <div className="mt-1 text-sm font-semibold">{summary}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">教材章节</div>
                    <div className="mt-1 text-sm font-semibold">
                      {form.textbook} · {form.chapter}
                    </div>
                  </div>
                </div>
                <div className="mt-4 border-t border-line pt-3 text-xs leading-5 text-muted">
                  {form.teachingRequirements}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="absolute bottom-4 left-4 hidden rounded-[20px] border border-line bg-white/90 px-4 py-3 text-xs text-muted shadow-sm backdrop-blur md:block">
          教学任务会保留在当前课件版本中
        </div>
      </section>
      <aside className="flex h-[48dvh] w-full shrink-0 flex-col border-t border-line bg-white lg:h-full lg:w-[500px] lg:border-l lg:border-t-0">
        <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-line px-5">
          <button
            type="button"
            onClick={goBack}
            disabled={step === "choose"}
            className="flex size-10 items-center justify-center rounded-2xl text-[#667085] hover:bg-[#f2f4f7] disabled:opacity-30"
            aria-label="返回上一步"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="text-center">
            <div className="text-sm font-semibold">课件助理</div>
            <div className="mt-1 text-xs text-muted">
              {step === "choose"
                ? "开始备课"
                : step === "basics"
                  ? "第 1 步 · 课堂信息"
                  : step === "curriculum"
                    ? "第 2 步 · 教材依据"
                    : "第 3 步 · 生成偏好"}
            </div>
          </div>
          <button
            type="button"
            onClick={saveDraft}
            className="rounded-xl bg-[#f8fafc] px-3 py-2 text-xs font-semibold text-[#475467] hover:bg-[#eef4ff]"
          >
            保存
          </button>
        </header>
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-6">
          {step === "choose" ? (
            <div className="space-y-5">
              <div className="rounded-[22px] bg-[#f8fafc] p-4 text-sm leading-7 text-[#344054]">
                你好，我会把你的备课任务整理成可编辑课件。你想从哪里开始？
              </div>
              <div className="space-y-2">
                {taskCards.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => chooseTask(item.id)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-4 text-left hover:border-[#a8c9ff]"
                    >
                      <span className="flex size-10 items-center justify-center rounded-xl bg-[#eef6ff] text-[#2f7cff]">
                        <Icon className="size-5" />
                      </span>
                      <span>
                        <b className="block text-sm">{item.title}</b>
                        <span className="mt-1 block text-xs text-muted">
                          {item.description}
                        </span>
                      </span>
                      <ChevronRight className="ml-auto size-4 text-[#98a2b3]" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {step === "basics" ? (
            <div>
              <div className="rounded-[22px] bg-[#f8fafc] p-4 text-sm leading-7 text-[#344054]">
                先确认这节课的基本信息。我会据此安排页面节奏和课堂表达。
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <SelectField
                  label="学段"
                  value={form.schoolStage}
                  options={schoolStages}
                  onChange={(value) => setForm((current) => ({
                    ...current,
                    schoolStage: value,
                    grade: gradesByStage[value]?.[0] || "",
                  }))}
                />
                <SelectField
                  label="年级"
                  value={form.grade}
                  options={gradeOptions}
                  onChange={(value) => update("grade", value)}
                />
                <SelectField
                  label="学科"
                  value={form.subject}
                  options={subjects}
                  onChange={(value) => update("subject", value)}
                />
                <Field
                  label="授课时长"
                  value={form.duration}
                  onChange={(value) => update("duration", value)}
                />
              </div>
              <div className="mt-3">
                <Field
                  label="课题"
                  value={form.topic}
                  onChange={(value) => update("topic", value)}
                  placeholder="例如：函数的单调性"
                />
              </div>
              <label className="mt-3 block text-xs font-semibold text-[#475467]">
                课型
                <select
                  value={lessonType}
                  onChange={(event) =>
                    setLessonType(event.target.value as TeacherLessonType)
                  }
                  className="mt-2 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm focus:border-[#2f7cff] focus:ring-[#2f7cff]/10"
                >
                  <option value="concept_building">概念建构课</option>
                  <option value="general">通用课型</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  if (requiredReady) setStep("curriculum");
                  else {
                    setState("error");
                    setMessage("请先填写学段、年级、学科和课题。");
                  }
                }}
                className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#2f7cff] text-sm font-semibold text-white"
              >
                继续
                <ChevronRight className="size-4" />
              </button>
            </div>
          ) : null}
          {step === "curriculum" ? (
            <div>
              <div className="rounded-[22px] bg-[#f8fafc] p-4 text-sm leading-7 text-[#344054]">
                这节课依据什么教材和章节？再告诉我希望学生学会什么。
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-[#475467]">
                  教材版本
                  <input list="teacher-textbook-presets" value={form.textbook} onChange={(event) => update("textbook", event.target.value)} placeholder="可选择或输入教材版本" className="mt-2 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-[#2f7cff]" />
                  <datalist id="teacher-textbook-presets">{(textbookPresets[form.subject] || ["人教版", "北师大版", "苏教版"]).map((item) => <option key={item} value={item} />)}</datalist>
                </label>
                <label className="block text-xs font-semibold text-[#475467]">
                  章节/单元
                  <input list="teacher-chapter-presets" value={form.chapter} onChange={(event) => update("chapter", event.target.value)} placeholder="可选择或输入章节" className="mt-2 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-[#2f7cff]" />
                  <datalist id="teacher-chapter-presets">{(chapterPresets[form.subject] || ["第一单元", "第二单元", "专题复习"]).map((item) => <option key={item} value={item} />)}</datalist>
                </label>
              </div>
              <label className="mt-3 block text-xs font-semibold text-[#475467]">
                教学要求
                <textarea
                  value={form.teachingRequirements}
                  onChange={(event) =>
                    update("teachingRequirements", event.target.value)
                  }
                  className="mt-2 min-h-24 w-full rounded-xl border border-line p-3 text-sm leading-6 focus:border-[#2f7cff] focus:ring-[#2f7cff]/10"
                />
              </label>
              <label className="mt-3 block text-xs font-semibold text-[#475467]">
                补充说明{" "}
                <span className="font-normal text-[#98a2b3]">选填</span>
                <textarea
                  value={pastedMaterials}
                  onChange={(event) => setPastedMaterials(event.target.value)}
                  placeholder="可补充课堂活动、例题、练习或教学风格"
                  className="mt-2 min-h-20 w-full rounded-xl border border-line p-3 text-sm leading-6 focus:border-[#2f7cff] focus:ring-[#2f7cff]/10"
                />
              </label>
              {needsFile ? (
                <div className="mt-4">
                  <UploadPPTCard
                    uploadedFile={uploadedFile}
                    onUploaded={setUploadedFile}
                    compact
                    fileKind={taskKind === "polish" ? "ppt" : "any"}
                  />
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setStep("style")}
                className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#2f7cff] text-sm font-semibold text-white"
              >
                继续
                <ChevronRight className="size-4" />
              </button>
            </div>
          ) : null}
          {step === "plan" && deckPlan ? (
            <TeacherOutlinePlanner
              plan={deckPlan}
              busy={state === "calling"}
              onChange={setDeckPlan}
              onRegenerate={() => void preparePlan()}
              onConfirm={() => void generate()}
            />
          ) : null}
          {step === "style" ? (
            <div>
              <div className="rounded-[22px] bg-[#f8fafc] p-4 text-sm leading-7 text-[#344054]">
                最后确认课堂表达。生成后你仍可以在 BNSR
                画布中继续改内容、版式和互动。
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setVisualMode("teaching_grid")}
                  className={cn(
                    "border p-4 text-left",
                    visualMode === "teaching_grid"
                      ? "border-[#2f7cff] bg-[#f5f9ff]"
                      : "border-line",
                  )}
                >
                  <b className="text-sm">结构清晰</b>
                  <span className="mt-1 block text-xs leading-5 text-muted">
                    适合概念、例题与练习
                  </span>
                  {visualMode === "teaching_grid" ? (
                    <Check className="mt-3 size-4 text-[#2f7cff]" />
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => setVisualMode("teaching_editorial")}
                  className={cn(
                    "border p-4 text-left",
                    visualMode === "teaching_editorial"
                      ? "border-[#2f7cff] bg-[#f5f9ff]"
                      : "border-line",
                  )}
                >
                  <b className="text-sm">叙事讲解</b>
                  <span className="mt-1 block text-xs leading-5 text-muted">
                    适合情境和主题探究
                  </span>
                  {visualMode === "teaching_editorial" ? (
                    <Check className="mt-3 size-4 text-[#2f7cff]" />
                  ) : null}
                </button>
              </div>
              <div className="mt-5 text-xs font-semibold text-[#475467]">
                主题
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {themes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTheme(item.id)}
                    className={cn(
                      "flex h-9 items-center gap-2 rounded-xl border px-3 text-xs",
                      theme === item.id
                        ? "border-[#2f7cff] bg-[#f5f9ff]"
                        : "border-line",
                    )}
                  >
                    <span className={cn("size-3 rounded-sm", item.color)} />
                    {item.name}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void preparePlan()}
                disabled={state === "calling"}
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-semibold text-white disabled:opacity-50"
              >
                {state === "calling" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <WandSparkles className="size-4" />
                )}
                {user ? "开始生成课件" : "登录后生成课件"}
              </button>
            </div>
          ) : null}
          {message ? (
            <div
              className={cn(
                "mt-4 rounded-xl px-3 py-2 text-xs leading-5",
                state === "error"
                  ? "bg-[#fff1f3] text-[#b42318]"
                  : "bg-[#eef6ff] text-[#175cd3]",
              )}
            >
              {message}
            </div>
          ) : null}
        </div>
        <footer className="shrink-0 border-t border-line bg-white px-5 py-3">
          {isUploaderOpen ? (
            <div className="mb-3">
              <UploadPPTCard
                uploadedFile={uploadedFile}
                onUploaded={setUploadedFile}
                compact
                fileKind={taskKind === "polish" ? "ppt" : "any"}
              />
            </div>
          ) : null}
          {chatMessages.length > 0 ? (
            <div className="thin-scrollbar mb-3 max-h-52 space-y-2 overflow-y-auto text-xs leading-5">
              {chatMessages.slice(-6).map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "max-w-[92%] rounded-xl px-3 py-2",
                    item.role === "teacher"
                      ? "ml-auto bg-[#2f7cff] text-white"
                      : "bg-[#f2f4f7] text-[#475467]",
                  )}
                >
                  <div>{item.content}</div>
                  {item.role === "assistant" && item.provider ? (
                    <div className="mt-1 text-[10px] opacity-60">
                      {item.provider === "model" ? "AI 助理" : "本地备课规则"}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-[#fafbfe] p-2 focus-within:border-[#8dbbff] focus-within:bg-white">
            <button
              type="button"
              onClick={() => setIsUploaderOpen((current) => !current)}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl text-[#667085] transition hover:bg-[#eef4ff] hover:text-[#175cd3]",
                isUploaderOpen && "bg-[#eef4ff] text-[#175cd3]",
              )}
              aria-label="上传资料"
              title="上传教材、教案、PPT 或图片"
            >
              <Paperclip className="size-4" />
            </button>
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendTeacherMessage();
                }
              }}
              placeholder="补充你的教学要求，或询问课件怎么做"
              rows={1}
              className="max-h-20 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm leading-5 text-ink outline-none placeholder:text-[#98a2b3]"
            />
            <button
              type="button"
              onClick={() => void sendTeacherMessage()}
              disabled={!chatInput.trim() || isChatSending}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#2f7cff] text-white transition hover:bg-[#1f6de3] disabled:bg-[#d0d5dd]"
              aria-label="发送补充要求"
              title="发送"
            >
              {isChatSending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
          <div className="mt-2 text-[11px] text-[#98a2b3]">
            附件和补充要求会一并用于本次课件生成
          </div>
        </footer>
      </aside>
      <AuthModal
        open={isAuthOpen}
        user={user}
        onClose={() => setIsAuthOpen(false)}
        onAuthed={(nextUser) => {
          setUser(nextUser);
          setMessage(
            nextUser
              ? "已登录，可以开始生成课件。"
              : "教师课件需要登录后生成。",
          );
        }}
      />
    </main>
  );
}
