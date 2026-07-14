export type TeacherPrepTaskKind = "chapter" | "materials" | "polish";

export type TeacherPrepForm = {
  schoolStage: string;
  grade: string;
  subject: string;
  topic: string;
  duration: string;
  textbook: string;
  chapter: string;
  teachingRequirements: string;
};

export type TeacherPrepAssistantInput = {
  message: string;
  step?: string;
  taskKind?: TeacherPrepTaskKind | null;
  form: TeacherPrepForm;
};

export type TeacherPrepAssistantResult = {
  reply: string;
  patch: Partial<TeacherPrepForm>;
  taskKind?: TeacherPrepTaskKind;
  provider: "model" | "local";
};

const SUBJECTS = [
  "语文",
  "数学",
  "英语",
  "物理",
  "化学",
  "生物",
  "历史",
  "地理",
  "道德与法治",
  "科学",
  "信息科技",
  "音乐",
  "美术",
  "体育",
];

const STAGES = ["幼儿园", "小学", "初中", "高中", "中职", "大学"];
const GRADES = [
  "一年级", "二年级", "三年级", "四年级", "五年级", "六年级",
  "七年级", "八年级", "九年级", "高一", "高二", "高三",
];

function clean(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function modelEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  return normalized.endsWith("/v1")
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

function normalizedPatch(value: unknown): Partial<TeacherPrepForm> {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const keys: Array<keyof TeacherPrepForm> = [
    "schoolStage", "grade", "subject", "topic", "duration",
    "textbook", "chapter", "teachingRequirements",
  ];
  return Object.fromEntries(
    keys.map((key) => [key, clean(source[key])]).filter(([, entry]) => Boolean(entry)),
  ) as Partial<TeacherPrepForm>;
}

function parseModelResult(text: string): Omit<TeacherPrepAssistantResult, "provider"> | null {
  const candidate = text.match(/\{[\s\S]*\}/)?.[0] || text;
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const reply = clean(parsed.reply, 600);
    if (!reply) return null;
    const taskKind = ["chapter", "materials", "polish"].includes(String(parsed.taskKind))
      ? (parsed.taskKind as TeacherPrepTaskKind)
      : undefined;
    return { reply, patch: normalizedPatch(parsed.patch), taskKind };
  } catch {
    return null;
  }
}

async function askModel(input: TeacherPrepAssistantInput) {
  const useOpenAICompatible = Boolean(process.env.OPENAI_API_KEY);
  const useArk = !useOpenAICompatible && Boolean(process.env.ARK_API_KEY || process.env.VOLCENGINE_API_KEY);
  const usePinchuan = !useOpenAICompatible && !useArk && Boolean(process.env.PINCHUAN_API_KEY);
  const apiKey = useOpenAICompatible
    ? process.env.OPENAI_API_KEY
    : useArk
      ? process.env.ARK_API_KEY || process.env.VOLCENGINE_API_KEY
      : process.env.PINCHUAN_API_KEY;
  if (!apiKey) return null;
  const baseUrl = useArk
    ? process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3"
    : usePinchuan
    ? process.env.PINCHUAN_API_BASE_URL || "https://pinchuanapi.tech"
    : process.env.OPENAI_BASE_URL || "https://api.openai.com";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const requestBody = JSON.stringify({
      model: useArk ? process.env.ARK_TEXT_MODEL || "doubao-1.5-vision-pro-250328" : usePinchuan ? process.env.SANDUN_TEXT_MODEL || process.env.OPENAI_MODEL || "gpt-5.5" : process.env.OPENAI_MODEL || "gpt-5.5",
      messages: [
        {
          role: "system",
          content: [
            "你是教师备课助理。根据教师消息回答问题，并提取可确认的备课字段。",
            "只返回 JSON：{reply,patch,taskKind}。",
            "patch 只能包含 schoolStage、grade、subject、topic、duration、textbook、chapter、teachingRequirements。",
            "taskKind 只能是 chapter、materials、polish；不确定时省略。",
            "不要虚构教师没有提供的信息。回复必须说明识别或建议的具体内容。",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify(input) },
      ],
      max_tokens: 900,
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(modelEndpoint(baseUrl), {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: requestBody,
      });
      if (response.ok) {
        const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        return parseModelResult(payload.choices?.[0]?.message?.content || "");
      }
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        continue;
      }
      return null;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function firstMatch(message: string, values: string[]) {
  return values.find((value) => message.includes(value));
}

function capture(message: string, pattern: RegExp) {
  return clean(message.match(pattern)?.[1], 80).replace(/[”"」]$/, "");
}

function localAssistant(input: TeacherPrepAssistantInput): Omit<TeacherPrepAssistantResult, "provider"> {
  const message = clean(input.message, 500);
  const patch: Partial<TeacherPrepForm> = {};

  if (/能.{0,4}(对话|聊天)|可以.{0,4}(对话|聊天)|会.{0,4}(对话|聊天)/.test(message)) {
    const context = [input.form.grade, input.form.subject, input.form.topic].filter(Boolean).join(" ");
    return {
      reply: `可以。${context ? `我已经知道你正在准备“${context}”的课件。` : "你可以直接告诉我学段、年级、学科和课题。"}你可以继续补充教材、教学目标，也可以直接问我这节课应该怎么组织。`,
      patch,
      taskKind: input.taskKind || undefined,
    };
  }
  const subject = firstMatch(message, SUBJECTS);
  const schoolStage = firstMatch(message, STAGES);
  const grade = firstMatch(message, GRADES);
  const durationMatch = message.match(/(\d{1,3})\s*(分钟|分|课时)/);
  const topic =
    capture(message, /(?:课题|主题)\s*(?:(?:是|为|改为|改成)|：|:)??\s*[“"「]?([^，”"」；;\n]{2,40})/) ||
    capture(message, /(?:把|将)\s*(?:课题|主题)\s*(?:改为|改成)\s*[“"「]?([^，”"」；;\n]{2,40})/) ||
    capture(message, /(?:我要|准备|想要)?\s*(?:讲|教)\s*(?:一节|一课|一下)?\s*([^，。；;\n]{2,32})/);
  const textbook = capture(message, /((?:人教版|苏教版|北师大版|沪教版|鲁教版|部编版|统编版)[^，。；;\n]{0,24})/);
  const chapter = capture(message, /((?:第[一二三四五六七八九十百\d]+)(?:章|节|单元)[^，。；;\n]{0,24})/);
  const requirement = capture(message, /(?:教学要求|要求|目标)\s*(?:是|为|：|:)?\s*([^\n]{3,120})/);

  if (subject) patch.subject = subject;
  if (schoolStage) patch.schoolStage = schoolStage;
  if (grade) patch.grade = grade;
  if (durationMatch) patch.duration = `${durationMatch[1]}${durationMatch[2] === "课时" ? "课时" : "分钟"}`;
  if (topic) patch.topic = topic;
  if (textbook) patch.textbook = textbook;
  if (chapter) patch.chapter = chapter;
  if (requirement) patch.teachingRequirements = requirement;

  let taskKind: TeacherPrepTaskKind | undefined;
  if (/已有.*(?:PPT|课件)|美化|重新排版|优化课件/i.test(message)) taskKind = "polish";
  else if (/教案|上传.*(?:资料|文件)|教材节选|练习资料/.test(message)) taskKind = "materials";
  else if (/教材|章节|课题|备课/.test(message)) taskKind = "chapter";

  const changed = Object.entries(patch).map(([key, value]) => {
    const labels: Record<string, string> = {
      schoolStage: "学段", grade: "年级", subject: "学科", topic: "课题",
      duration: "时长", textbook: "教材", chapter: "章节", teachingRequirements: "教学要求",
    };
    return `${labels[key]}：${value}`;
  });

  if (changed.length) {
    const merged = { ...input.form, ...patch };
    const missing = [
      !merged.schoolStage && "学段",
      !merged.grade && "年级",
      !merged.subject && "学科",
      !merged.topic && "课题",
    ].filter(Boolean);
    return {
      reply: `已更新${changed.join("，")}。${missing.length ? `还需要确认：${missing.join("、")}。` : "基础信息已齐，可以继续补充教材和教学要求。"}`,
      patch,
      taskKind,
    };
  }

  if (/[？?]|怎么|如何|建议|怎样/.test(message)) {
    const subjectName = input.form.subject || "这门课";
    const topicName = input.form.topic ? `“${input.form.topic}”` : "当前课题";
    return {
      reply: `针对${subjectName}${topicName}，建议按“情境导入—明确目标—核心讲解—课堂练习—总结反馈”组织。你也可以直接告诉我学段、年级、课题和课时，我会同步更新右侧备课表单。`,
      patch,
      taskKind,
    };
  }

  const appended = [input.form.teachingRequirements, message].filter(Boolean).join("；");
  return {
    reply: `这条内容已作为教学要求记录：${message}`,
    patch: { teachingRequirements: appended },
    taskKind,
  };
}

export async function runTeacherPrepAssistant(
  input: TeacherPrepAssistantInput,
): Promise<TeacherPrepAssistantResult> {
  const model = await askModel(input);
  if (model) return { ...model, provider: "model" };
  return { ...localAssistant(input), provider: "local" };
}
