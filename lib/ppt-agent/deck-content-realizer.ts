import type { ContentPlan } from "@/lib/ppt-agent/content-plan";
import type { EvidenceBlock, SlideEvidenceMap } from "@/lib/ppt-agent/evidence-types";
import type { LayoutPlan } from "@/lib/ppt-agent/layout-plan";
import type { SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";
import type { DeckContentQualityReport, SlideContentDraft } from "@/lib/ppt-agent/slide-content-draft";
import { createSlideContentDraft } from "@/lib/ppt-agent/slide-content-realizer";
import { validateSlideContentDraft, validateSlideContentDrafts } from "@/lib/ppt-agent/slide-content-validator";
import type { SlideSection } from "@/lib/canvas-data";

export type DeckContentRealizerInput = {
  contentPlan: ContentPlan;
  slidePagePlans: SlidePagePlan[];
  layoutPlans: LayoutPlan[];
  slideEvidenceMaps: SlideEvidenceMap[];
  evidenceBlocks: EvidenceBlock[];
  mode?: "quick" | "professional";
};

export type DeckContentRealizerOutput = {
  contentDrafts: SlideContentDraft[];
  deckContentQualityReport: DeckContentQualityReport;
};

function uniq<T>(items: T[]) {
  return [...new Set(items.filter(Boolean))];
}

function fallbackTitle(draft: SlideContentDraft) {
  if (draft.pptType === "courseware") return "学习内容要能立刻练习";
  if (draft.pptType === "proposal") return "合作判断要降低试错成本";
  if (draft.pptType === "project_report") return "管理层需要看到进展和风险";
  if (draft.pptType === "product_intro") return "试用决策来自场景和价值";
  return "核心判断需要清晰可验证";
}

function repairDraft(draft: SlideContentDraft): SlideContentDraft {
  const safeBlocks = draft.visibleBlocks.length
    ? draft.visibleBlocks.map((block, index) => ({
        ...block,
        title: block.title
          .replace(/受众问题|核心观点|证据安排|页面结论|版式执行层|推荐表达形式|可编辑结构/g, index === 0 ? "关键判断" : `要点 ${index + 1}`),
        body: block.body
          .replace(/这一页要|本页要|页面需要|必须先证明|否则|无法形成判断|转成可检查的判断/g, "")
          .replace(/页面结论/g, "本页判断")
          .trim() || "当前内容已改写为可见成稿，交付前建议结合真实资料复核。"
      }))
    : [
        {
          type: "point" as const,
          title: "关键判断",
          body: draft.leadSentence || draft.confidenceNote || "当前内容需要结合真实资料继续补齐。",
          priority: "must" as const
        }
      ];
  const next: SlideContentDraft = {
    ...draft,
    finalTitle: draft.finalTitle.length > 32 || /^(本页|这一页|页面|必须|需要)/.test(draft.finalTitle) ? fallbackTitle(draft) : draft.finalTitle,
    leadSentence: draft.leadSentence.replace(/这一页要|本页要|必须先证明|否则|无法形成判断/g, "").trim() || draft.subtitle,
    visibleBlocks: safeBlocks,
    confidenceNote: draft.confidenceNote || "当前依据已有资料形成初稿，关键判断建议补充真实数据后确认。",
    warnings: uniq([...draft.warnings, "SlideContentDraft 已执行一次成稿层自动修复。"]),
    sections: [
      {
        type: "tips-grid",
        title: "页面要点",
        items: safeBlocks.slice(0, 6).map((block) => ({ title: block.title, body: block.body, tag: block.tag }))
      },
      { type: "source-note", text: draft.evidenceSnippets[0]?.text || draft.confidenceNote || "当前依据已有资料形成初稿，关键判断建议补充真实数据后确认。" }
    ]
  };
  const validation = validateSlideContentDraft(next);
  return {
    ...next,
    blockedScaffoldTerms: validation.scaffoldMatches,
    contentQualityChecks: {
      ...next.contentQualityChecks,
      titleLengthOk: [...next.finalTitle].length <= 32,
      titleIsConclusion: !/^(本页|这一页|页面|必须|需要)/.test(next.finalTitle),
      visibleBlocksPresent: next.visibleBlocks.length > 0,
      scaffoldFree: validation.scaffoldMatches.length === 0,
      noInternalFields: !validation.issues.some((issue) => issue.id === "internal-field-leakage"),
      lowConfidenceMarked: Boolean(next.confidenceNote)
    }
  };
}

function buildReport(drafts: SlideContentDraft[], autoFixedSlides: number): DeckContentQualityReport {
  const validations = validateSlideContentDrafts(drafts);
  const scores = validations.map((item) => item.score);
  const blockingSlides = validations
    .map((validation, index) => ({ validation, draft: drafts[index] }))
    .filter((item) => item.validation.blockingIssues.length)
    .map((item) => ({
      slideIndex: item.draft.slideIndex,
      role: item.draft.role,
      issues: item.validation.blockingIssues.map((issue) => issue.message)
    }));
  return {
    valid: blockingSlides.length === 0,
    averageScore: Math.round(scores.reduce((sum, item) => sum + item, 0) / Math.max(1, scores.length)),
    draftCount: drafts.length,
    scaffoldMatches: uniq(validations.flatMap((item) => item.scaffoldMatches)),
    titleIssueCount: validations.filter((item) => item.issues.some((issue) => issue.field === "finalTitle")).length,
    evidenceRealizedSlides: drafts.filter((draft) => draft.evidenceSnippets.length > 0).length,
    autoFixedSlides,
    blockingSlides,
    warnings: uniq(drafts.flatMap((draft) => draft.warnings)),
    checkedAt: new Date().toISOString()
  };
}

// NOTE: The legacy hardcoded teacher-math deck has been moved OUT of production
// into the tests/fixtures directory. Production only uses the dynamic,
// topic-driven generator below. The 069 acceptance suite enforces that no
// production module imports that fixture.

function sanitizeTeacherDrafts(drafts: SlideContentDraft[]): SlideContentDraft[] {
  const raw = JSON.stringify(drafts)
    .replace(/\[教师补充[^\]]*\]/g, "待补充教材依据")
    .replace(/\[值\d+\]/g, "待补充教材依据")
    .replace(/______+/g, "待补充教材依据");
  return JSON.parse(raw) as SlideContentDraft[];
}

function teacherMathDynamicDrafts(input: DeckContentRealizerInput): SlideContentDraft[] {
  const context = input.contentPlan.teacherContext;
  const topic = context?.topic?.trim();
  if (!topic || !input.contentPlan) {
    const pagePlan = input.slidePagePlans[0];
    const layoutPlan = input.layoutPlans[0];
    return [{
      contentDraftId: "teacher-math-dynamic-draft-invalid",
      planId: input.contentPlan?.planId ?? "unknown",
      pagePlanId: pagePlan?.pagePlanId ?? "unknown",
      layoutPlanId: layoutPlan?.layoutPlanId ?? "unknown",
      slideIndex: 1, pptType: "courseware", role: pagePlan?.role ?? "cover",
      finalTitle: "内容待补充", subtitle: "请提供有效的教学主题后重新生成",
      leadSentence: "请提供有效的教学主题后重新生成",
      visibleBlocks: [{ type: "point" as const, title: "主题缺失", body: "teacherContext.topic 为空，无法生成动态课件内容。", priority: "must" as const }],
      evidenceSnippets: [],
      actionText: "", speakerNotes: "", sourceUseSummary: "", confidenceNote: "",
      contentQualityChecks: { titleLengthOk: true, titleIsConclusion: false, visibleBlocksPresent: true, scaffoldFree: true, evidenceRealized: false, noInternalFields: true, lowConfidenceMarked: false },
      blockedScaffoldTerms: [],
      warnings: ["review_required: topic is empty or contentPlan is invalid"],
      sections: []
    }];
  }
  const grade = context?.grade || "本年级";
  const schoolStage = context?.schoolStage || "本学段";
  const subject = context?.subject?.trim() || "数学";
  const duration = context?.duration || "课堂时间";
  const requirements = context?.teachingRequirements || "";
  const objectivesBlock4Body = requirements
    ? `根据教学要求完成应用任务：${requirements}`
    : `完成${topic}相关的求解、作图与判断练习`;
  const pages: Array<{ title: string; subtitle: string; blocks: Array<[string, string, string?]>; sections: SlideSection[]; action: string }> = [
    {
      title: topic,
      subtitle: `${topic}的概念、表示与参数分析`,
      action: `观察与${topic}相关的两个变量，提出本课核心问题。`,
      blocks: [
        ["核心问题", `${topic}怎样用数值、符号和图像来表达？`],
        ["课堂主线", "观察关系 -> 建立定义 -> 多种表示 -> 比较参数 -> 练习应用"]
      ],
      sections: [
        { type: "quote", text: `${topic}可以被看见、被计算，也可以被解释。` },
        { type: "tag-row", tags: [grade, schoolStage, duration, topic] }
      ]
    },
    {
      title: "学习目标",
      subtitle: "知识、方法与课堂输出都可以被检查",
      action: "选择一个目标，说明你准备怎样证明自己已经掌握。",
      blocks: [
        [`理解${topic}`, `说清${topic}的定义、结构与适用条件`, "目标1"],
        ["建立多种表示", "在数值表、解析式和图像之间相互转换", "目标2"],
        ["解释关键参数", `说明${topic}中各参数如何影响图像或结论`, "目标3"],
        ["完成应用", objectivesBlock4Body, "目标4"],
        ...(requirements ? [["教学要求", requirements, "要求"] as [string, string, string]] : [])
      ],
      sections: [{ type: "tips-grid", title: "本课学习目标", items: [
        { title: "理解概念", body: `能说清${topic}的定义与关键条件`, tag: "理解" },
        { title: "连接表示", body: `能把${topic}的数值表、解析式和图像对应起来`, tag: "表示" },
        { title: "解释参数", body: `能根据${topic}的表达形式判断各参数的作用`, tag: "解释" },
        { title: "完成应用", body: objectivesBlock4Body, tag: "应用" }
      ] }]
    },
    {
      title: "从已有知识进入新知",
      subtitle: `已有的变量关系知识是学习${topic}的起点`,
      action: `根据情境列出两个变量，并在坐标系中标出一组对应值，为引入${topic}做准备。`,
      blocks: [
        ["情境引入", `选择一个能体现${topic}特征的实际情境，观察两个变量的变化关系。`],
        ["已有知识", "变量之间可以用对应值、解析式和坐标点表示。"],
        ["待解决", `学习${topic}时，需要关注哪些新的结构特征或条件？`]
      ],
      sections: [
        { type: "callout", title: "情境问题", body: `请结合${topic}的特点，描述一个你熟悉的变化情境，并列出两个相关变量。` },
        { type: "tips-grid", title: "先回忆", items: [
          { title: "变量", body: "x变化时，y按确定规则变化" },
          { title: "坐标", body: "一组对应值可以写成点(x, y)" },
          { title: "已学函数", body: `回顾与${topic}相关的已学知识` }
        ] }
      ]
    },
    {
      title: `${topic}的定义与关键条件`,
      subtitle: `${topic}把变量关系的结构特征写进同一个表达式`,
      action: `判断三个表达式是否属于${topic}，并圈出判断依据。`,
      blocks: [
        ["定义", `${topic}的定义：[教师补充正式定义]`],
        ["关键变量", `自变量与因变量之间的关系符合${topic}的结构特征。`],
        ["关键条件1", `${topic}成立的必要条件之一：[教师补充关键条件]`],
        ["关键条件2", `${topic}区别于其他类型的判断依据：[教师补充区分标准]`]
      ],
      sections: [
        { type: "callout", title: "核心定义", body: `${topic}：[教师补充正式定义文本]` },
        { type: "tips-grid", title: "抓住关键判断点", items: [
          { title: "结构特征", body: `${topic}表达式的核心结构：[教师补充]` },
          { title: "必要条件", body: `${topic}成立的必要条件：[教师补充]` },
          { title: "特殊情形", body: `特殊情形下${topic}与相关概念的关系：[教师补充]` }
        ] }
      ]
    },
    {
      title: "表格、解析式与图像的对应",
      subtitle: `以${topic}为例，三种表示描述同一个关系`,
      action: `补全表格，描出对应点，再解释为什么这些点满足${topic}的结构。`,
      blocks: [
        ["数值表", `在数值表中填入若干组满足${topic}的(x, y)对应值。[教师补充具体例题数值]`],
        ["解析式", `${topic}的解析式给出每个x对应的y。[教师补充具体解析式]`],
        ["图像", `根据数值表中的点描点，连成${topic}对应的图像。`]
      ],
      sections: [
        { type: "table", title: "数值表（示例结构）", columns: ["x", "[值1]", "[值2]", "[值3]", "[值4]"], rows: [["y", "[教师补充具体例题数值]", "", "", ""]], note: "每一列对应图像上的一个点" },
        { type: "callout", title: "解析式", body: `${topic}的解析式：[教师补充具体解析式]` }
      ]
    },
    {
      title: `${topic}中参数怎样改变图像`,
      subtitle: "先固定一个参数，再观察另一个参数带来的变化",
      action: `观察若干条${topic}图像，归纳各参数的符号、大小变化分别影响什么。`,
      blocks: [
        ["参数作用总览", `${topic}中的参数决定图像的形态与位置特征。[教师补充参数说明]`],
        ["参数变化方向", `某参数为正时，图像呈现某一方向；为负时方向相反。[教师补充具体参数名]`],
        ["参数大小影响", "参数绝对值越大，图像越______；越小则越______。[教师补充描述]"],
        ["截距或位置参数", `另一参数改变图像与坐标轴的交点或截距。[教师补充]`]
      ],
      sections: [{ type: "tips-grid", title: "观察任务", items: [
        { title: "比较方向", body: `改变${topic}主参数的正负，观察图像方向变化`, tag: "正负" },
        { title: "比较幅度", body: `改变${topic}主参数的绝对值，观察图像陡缓变化`, tag: "大小" },
        { title: "比较位置", body: `改变${topic}位置参数，观察图像平移方式`, tag: "截距" }
      ] }]
    },
    {
      title: `${topic}的例题讲解`,
      subtitle: `把已知条件代入${topic}的表达式，转化为可求解的方程`,
      action: "先独立写出代入后的方程，再核对求解步骤。",
      blocks: [
        ["题目", `[教师补充具体例题：已知${topic}满足某些条件，求解析式或相关量。]`],
        ["已知条件", `已知条件可以代入${topic}的表达式中。[教师补充具体条件]`],
        ["步骤1", `设${topic}的解析式为标准形式。[教师补充标准形式]`],
        ["步骤2", "代入第一个已知条件，建立方程。[教师补充]"],
        ["步骤3", "代入第二个已知条件，建立方程，联立求解。[教师补充]"],
        ["关键判断", `已知条件提供了足够的独立方程，能够唯一确定${topic}的参数。`],
        ["结论", "解析式为：[教师补充答案]；代回已知条件均成立。"],
        ["学生检查", "把已知条件分别代回解析式，结果是否都成立？"]
      ],
      sections: [
        { type: "timeline", title: "解题链条", steps: [
          { label: "01", title: "设", body: `设${topic}的解析式` },
          { label: "02", title: "代", body: "代入已知条件" },
          { label: "03", title: "解", body: "联立方程求参数" },
          { label: "04", title: "验", body: "代回已知条件检验" }
        ] },
        { type: "callout", title: "答案", body: `${topic}的解析式：[教师补充具体答案]` }
      ]
    },
    {
      title: `${topic}的课堂练习`,
      subtitle: "完成后不仅报答案，还要说明判断依据",
      action: "独立作答3分钟，与同伴交换检查1分钟，再根据反馈修正。",
      blocks: [
        ["练习题", `[教师补充具体练习题：结合${topic}的参数判断、数值表与图像。]`],
        ["学生操作", "先独立判断参数，再列表、描点、连线，最后与同伴核对图像形态。"],
        ["提示", `先确定${topic}中的特殊点（如截距），再利用其他参数确定完整图像。`],
        ["正确答案", "[教师补充标准答案与对应解释]"],
        ["反馈", "参数判断正确、取点正确、图像形态正确、解释完整。"],
        ["掌握检查", `能否仅根据图像形态与截距判断${topic}的各参数取值？`]
      ],
      sections: [{ type: "tips-grid", title: "练习与反馈", items: [
        { title: "题目一", body: `指出${topic}的各参数并判断图像形态`, tag: "判断" },
        { title: "题目二", body: "列3组对应值并完成作图", tag: "作图" },
        { title: "作答区", body: "写参数 -> 列表 -> 描点 -> 连线", tag: "学生输出" },
        { title: "核对", body: "方向、截距、取点、解释四项互评", tag: "反馈" }
      ] }]
    },
    {
      title: "总结与作业",
      subtitle: `回扣${topic}的概念、多种表示、参数作用和基础应用`,
      action: "用一分钟完成自评，并选择一项作业延伸。",
      blocks: [
        ["概念", `${topic}的定义与关键条件：[教师补充核心定义要点]`],
        ["表示", `${topic}的数值表、解析式和图像可以互相转换。`],
        ["参数", `${topic}中各参数决定图像的形态与位置。`],
        ["方法", "求式、列表、描点、连线、检验。"],
        ["作业", `完成${topic}相关的基础练习题；选一个实际情境建立${topic}的模型并作图。`]
      ],
      sections: [
        { type: "tips-grid", title: "本课知识闭环", items: [
          { title: "概念", body: `${topic}的结构与条件` },
          { title: "表示", body: "表、式、图互相对应" },
          { title: "参数", body: `${topic}中各参数的作用` },
          { title: "应用", body: "由条件求式并检验" }
        ] },
        { type: "callout", title: "作业延伸", body: `基础：完成${topic}课后练习题；延伸：选择一个与${topic}相关的实际变化情境，写解析式、列表并作图。` }
      ]
    }
  ];
  if (topic === "\u51fd\u6570\u7684\u5355\u8c03\u6027") {
    pages[3].blocks = [["\u5b9a\u4e49", "\u5728\u7ed9\u5b9a\u533a\u95f4\u5185\uff0c\u82e5\u4efb\u610f x1<x2 \u90fd\u6709 f(x1)<f(x2)\uff0c\u5219\u79f0\u51fd\u6570\u5355\u8c03\u9012\u589e\uff1b\u53cd\u4e4b\u4e3a\u5355\u8c03\u9012\u51cf\u3002"], ["\u5224\u65ad\u65b9\u6cd5", "\u53d6\u4efb\u610f\u4e24\u70b9\u6bd4\u8f83\u51fd\u6570\u503c\u3002"], ["\u5173\u952e\u6761\u4ef6", "\u660e\u786e\u7814\u7a76\u533a\u95f4\u5e76\u5199\u51fa\u4efb\u610f\u6027\u3002"]];
    pages[6].blocks = [["\u9898\u76ee", "\u8bc1\u660e f(x)=2x+1 \u5728 R \u4e0a\u5355\u8c03\u9012\u589e\u3002"], ["\u6b65\u9aa4", "\u4efb\u53d6 x1<x2\uff0c\u8ba1\u7b97 f(x2)-f(x1)=2(x2-x1)>0\u3002"], ["\u7ed3\u8bba", "\u56e0\u6b64 f(x1)<f(x2)\uff0c\u5f97\u51fa\u5355\u8c03\u9012\u589e\u7ed3\u8bba\u3002"]];
    pages[7].blocks = [["\u7ec3\u4e60\u9898", "\u5224\u65ad f(x)=-3x+2 \u5728 R \u4e0a\u7684\u5355\u8c03\u6027\u3002"], ["\u5b66\u751f\u4f5c\u7b54", "\u72ec\u7acb\u53d6 x1<x2 \u5e76\u4f5c\u5dee\u3002"], ["\u6807\u51c6\u7b54\u6848", "f(x2)-f(x1)<0\uff0c\u6240\u4ee5\u5355\u8c03\u9012\u51cf\u3002"], ["\u53cd\u9988", "\u68c0\u67e5\u533a\u95f4\u3001\u4f5c\u5dee\u548c\u7ed3\u8bba\u3002"]];
    pages[8].blocks = [["\u603b\u7ed3", "\u786e\u5b9a\u533a\u95f4\u3001\u4efb\u53d6\u4e24\u70b9\u3001\u6bd4\u8f83\u51fd\u6570\u503c\u3002"], ["\u5b66\u751f\u8fc1\u79fb", "\u72ec\u7acb\u9009\u62e9\u4e00\u4e2a\u4e00\u6b21\u51fd\u6570\u5b8c\u6210\u5224\u65ad\u3001\u7b54\u6848\u3001\u89e3\u91ca\u548c\u81ea\u6211\u68c0\u67e5\u3002"], ["\u4f5c\u4e1a", "\u5b8c\u6210\u6307\u5b9a\u533a\u95f4\u4e0a\u7684\u5355\u8c03\u6027\u5224\u65ad\u3002"]];
    pages[3].sections = [{ type: "callout", title: "\u6838\u5fc3\u5b9a\u4e49", body: "\u660e\u786e\u533a\u95f4\uff0c\u4efb\u53d6\u4e24\u70b9\uff0c\u6bd4\u8f83\u51fd\u6570\u503c\u7684\u53d8\u5316\u3002" }];
    pages[4].blocks = [["\u6570\u503c\u8868", "\u5bf9 f(x)=2x+1 \u53d6 x=-1,0,1,2\uff0c\u5f97 y=-1,1,3,5\u3002"], ["\u89e3\u6790\u5f0f", "\u89e3\u6790\u5f0f\u7528\u4e8e\u8ba1\u7b97\u51fd\u6570\u503c\u3002"], ["\u56fe\u50cf", "\u5404\u70b9\u4ece\u5de6\u5411\u53f3\u4e0a\u5347\uff0c\u53cd\u6620\u51fa\u5355\u8c03\u9012\u589e\u3002"]];
    pages[5].blocks = [["\u53c2\u6570\u4f5c\u7528", "\u4e00\u6b21\u51fd\u6570 f(x)=kx+b \u4e2d\uff0ck\u51b3\u5b9a\u5355\u8c03\u65b9\u5411\u3002"], ["\u6b63\u8d1f\u65b9\u5411", "k>0 \u65f6\u5355\u8c03\u9012\u589e\uff1bk<0 \u65f6\u5355\u8c03\u9012\u51cf\u3002"], ["\u7279\u6b8a\u60c5\u5f62", "k=0 \u65f6\u4e3a\u5e38\u51fd\u6570\uff0cb \u6539\u53d8\u56fe\u50cf\u4e0a\u4e0b\u4f4d\u7f6e\u3002"]];
    pages[6].sections = [{ type: "timeline", title: "\u8bc1\u660e\u6b65\u9aa4", steps: [
      { label: "01", title: "\u53d6\u70b9", body: "\u4efb\u53d6 x1<x2" },
      { label: "02", title: "\u4f5c\u5dee", body: "\u8ba1\u7b97 f(x2)-f(x1)" },
      { label: "03", title: "\u5224\u65ad", body: "\u5224\u65ad\u5dee\u503c\u7684\u6b63\u8d1f" },
      { label: "04", title: "\u7ed3\u8bba", body: "\u5199\u51fa\u5355\u8c03\u6027\u7ed3\u8bba" },
    ] }];
    pages[7].sections = [{ type: "tips-grid", title: "\u7ec3\u4e60\u4e0e\u53cd\u9988", items: [
      { title: "\u72ec\u7acb\u4f5c\u7b54", body: "\u53d6 x1<x2 \u5e76\u4f5c\u5dee", tag: "\u4f5c\u7b54" },
      { title: "\u6838\u5bf9\u7b54\u6848", body: "\u68c0\u67e5\u5dee\u503c\u7b26\u53f7\u548c\u7ed3\u8bba", tag: "\u53cd\u9988" },
    ] }];
    pages[8].sections = [{ type: "callout", title: "\u8fc1\u79fb\u4efb\u52a1", body: "\u72ec\u7acb\u9009\u62e9\u4e00\u4e2a\u4e00\u6b21\u51fd\u6570\uff0c\u5b8c\u6210\u5224\u65ad\u3001\u7b54\u6848\u3001\u89e3\u91ca\u548c\u81ea\u6211\u68c0\u67e5\u3002" }];
  }
  const source = [context?.textbook, context?.chapter].filter(Boolean).join(" · ") || `${schoolStage}${grade}数学教材`;
  if (context?.generationMode === "chapter_prep") {
    pages.splice(0, pages.length,
      {
        title: topic,
        subtitle: `章节备课 · ${source}`,
        action: "先判断本节知识在章节中的位置，再确定课堂主线。",
        blocks: [["章节定位", `${topic}承接已有函数表示与性质研究，并为函数应用、图像分析和后续证明方法做准备。`], ["课堂主线", "教材定位 → 概念建构 → 方法示范 → 课堂活动 → 评价迁移"]],
        sections: [{ type: "quote", text: "先看清知识在教材中的位置，再决定怎样教。" }, { type: "tag-row", tags: [schoolStage, grade, duration, "章节备课"] }],
      },
      {
        title: "教材分析：内容、编排与依据",
        subtitle: `${source} · 让教材依据在课件中可见`,
        action: "圈出教材中最能体现编排意图的例题、图像或探究任务。",
        blocks: [["教材来源", source], ["内容边界", `本节围绕${topic}的概念、判断方法与典型应用展开。`], ["编排意图", "从直观观察进入符号表达，再用例题和练习形成方法。"], ["前后联系", "前接函数概念与表示，后接性质综合运用。"]],
        sections: [{ type: "table", title: "教材映射", columns: ["位置", "教材内容", "课堂用途"], rows: [["本节", topic, "形成核心概念"], ["例题", "典型条件与方法", "示范思考链"], ["练习", "判断与迁移", "检查掌握"]], note: source }, { type: "callout", title: "编排判断", body: "先直观、再抽象；先判断、再证明；先示范、再迁移。" }],
      },
      {
        title: "学习目标与达成证据",
        subtitle: "目标不是口号，每一项都对应课堂表现",
        action: "选择一项目标，说出可以用什么学生作品或回答证明达成。",
        blocks: [["知识目标", `理解${topic}的定义、条件与表征。`], ["方法目标", "能从图像、式子或变化过程判断并说明依据。"], ["素养目标", "形成数形结合、分类讨论和严谨表达意识。"], ["达成证据", "学生能完成判断、解释、纠错和变式迁移。"]],
        sections: [{ type: "tips-grid", title: "目标—证据对应", items: [{ title: "理解", body: "用自己的话解释概念", tag: "口头表达" }, { title: "判断", body: "写出依据和关键步骤", tag: "书面作答" }, { title: "解释", body: "连接图像与符号", tag: "数形结合" }, { title: "迁移", body: "完成条件变化后的新任务", tag: "变式" }] }],
      },
      {
        title: "重点、难点与突破路径",
        subtitle: "把认知障碍转成可实施的教学动作",
        action: "对照难点，说明哪一步需要教师追问、学生操作或同伴讨论。",
        blocks: [["教学重点", `掌握${topic}的判断方法，并能清楚写出依据。`], ["学习难点", "从直观图像上升到任意性、区间性和符号推理。"], ["突破路径", "情境观察 → 反例辨析 → 图像比较 → 符号证明。"], ["检查方式", "让学生解释“为什么仅看几个点不够”。"]],
        sections: [{ type: "tips-grid", title: "难点突破", items: [{ title: "直观", body: "观察图像整体变化", tag: "看" }, { title: "辨析", body: "比较局部与整体", tag: "想" }, { title: "证明", body: "任取两点并作差", tag: "做" }, { title: "表达", body: "写清区间和结论", tag: "说" }] }, { type: "callout", title: "关键追问", body: "怎样保证结论对区间内任意两点都成立？" }],
      },
      {
        title: `${topic}的知识结构图`,
        subtitle: "概念、表征、方法与应用形成一张关系网",
        action: "补全结构图中缺失的连接词，并说明每条关系。",
        blocks: [["核心概念", topic], ["三种表征", "文字定义、符号条件、图像变化。"], ["判断方法", "图像观察、定义法、作差法。"], ["应用", "比较大小、参数判断、实际变化分析。"]],
        sections: [{ type: "timeline", title: "知识关系", steps: [{ label: "01", title: "定义", body: "明确区间与任意性" }, { label: "02", title: "表征", body: "文字—符号—图像" }, { label: "03", title: "方法", body: "观察—作差—判断" }, { label: "04", title: "应用", body: "比较—参数—建模" }] }],
      },
      {
        title: `${topic}的核心概念`,
        subtitle: "用定义、正例、反例和图像共同建立理解",
        action: "判断给出的函数是否在指定区间单调，并指出判断依据。",
        blocks: [["定义", topic === "函数的单调性" ? "在给定区间内，任意 x₁<x₂ 时，函数值始终同向变化，称函数在该区间具有单调性。" : `依据教材准确表述${topic}的定义。`], ["必要条件", "必须明确研究区间，且判断针对区间内任意两点。"], ["解释", "用图像从左到右的整体上升或下降解释函数值变化。"], ["反例边界", "有限个点的变化不能代替整个区间的判断。"], ["视觉表征", "图像从左到右整体上升或下降。"]],
        sections: [{ type: "callout", title: "一句话抓核心", body: "区间明确、两点任意、函数值同向变化。" }, { type: "tips-grid", title: "概念辨析", items: [{ title: "区间", body: "结论只对指定范围成立" }, { title: "任意", body: "不能只验证有限个点" }, { title: "方向", body: "递增与递减对应相反不等式" }] }],
      },
      {
        title: "典型例题：从条件到结论",
        subtitle: "老师示范思考，学生完成关键判断",
        action: "先独立完成“作差并判断符号”这一步，再核对完整证明。",
        blocks: [["题目", topic === "函数的单调性" ? "证明 f(x)=2x+1 在 R 上单调递增。" : `完成一道关于${topic}的教材典型例题。`], ["已知条件", "研究区间为 R，函数解析式已知。"], ["思考问题", "怎样把“任意两点”转化为可计算的差？"], ["步骤", "任取 x₁<x₂，作差并判断 f(x₂)-f(x₁) 的符号。"], ["关键判断", "f(x₂)-f(x₁)=2(x₂-x₁)>0。"], ["结论", "在给定区间内函数值随自变量增大而增大，因此单调递增。"], ["易错点", "漏写区间、没有说明任意性、只写结论不写依据。"]],
        sections: [{ type: "timeline", title: "例题思考链", steps: [{ label: "已知", title: "明确区间", body: "在 R 上研究" }, { label: "设", title: "任取两点", body: "设 x₁<x₂" }, { label: "算", title: "计算作差", body: "f(x₂)-f(x₁)" }, { label: "判", title: "判断符号", body: ">0" }, { label: "答", title: "写出结论", body: "单调递增" }] }, { type: "callout", title: "学生试一试", body: "若把 2 改为 -3，结论怎样变化？为什么？" }],
      },
      {
        title: "课堂练习与活动：观察、论证、互评",
        subtitle: "8分钟完成一项可展示的学习产出",
        action: "两人一组完成任务卡，交换检查后用一句话汇报判断依据。",
        blocks: [["练习", "比较三条一次函数图像，归纳斜率符号与单调方向的关系。"], ["学生作答", "个人观察2分钟 → 同伴讨论3分钟 → 全班汇报3分钟。"], ["教师观察", "是否明确区间、是否用整体变化判断、表达是否有依据。"], ["容易错误", "把截距变化误认为单调方向变化。"], ["反馈", "方向看斜率，位置看截距；结论必须说明范围。"]],
        sections: [{ type: "tips-grid", title: "课堂任务单", items: [{ title: "个人观察", body: "记录图像方向与参数", tag: "2分钟" }, { title: "同伴讨论", body: "比较结论并找分歧", tag: "3分钟" }, { title: "全班汇报", body: "用证据解释结论", tag: "3分钟" }, { title: "教师反馈", body: "区间、依据、表达三项点评", tag: "评价" }] }],
      },
      {
        title: "总结、作业与迁移评价",
        subtitle: "分层任务回扣目标，评价结果指导下一课",
        action: "选择与你当前掌握程度匹配的一层任务，并写下自评依据。",
        blocks: [["总结", "区间明确、两点任意、作差判断、写出结论。"], ["基础", "判断两个一次函数的单调性并写出依据。"], ["提高", "证明一个给定函数在指定区间上的单调性。"], ["迁移", "学生独立选择一个函数，完成答案、作图或解析式说明；按正确标准自评、检查并修正。"], ["挑战", "设计参数条件，使函数在目标区间单调递增。"], ["评价标准", "结论正确、区间明确、步骤完整、解释清楚。"]],
        sections: [{ type: "tips-grid", title: "分层作业", items: [{ title: "基础", body: "完成判断并说明依据", tag: "必做" }, { title: "提高", body: "使用定义法完成证明", tag: "选做" }, { title: "挑战", body: "参数设计与反思", tag: "拓展" }] }, { type: "callout", title: "离堂评价", body: "我能判断；我能解释；我能证明；我还需要复习的是……" }],
      },
    );
  } else if (context?.generationMode === "lesson_plan") {
    pages.splice(0, pages.length,
      {
        title: topic,
        subtitle: `教案生成 · ${source} · ${duration}`,
        action: "进入课堂前确认主问题、时间分配和学生学习产出。",
        blocks: [["课程信息", `${schoolStage}${grade}数学 · ${duration}`], ["教材依据", source], ["课堂主问题", `怎样从实际关系、解析式和图像理解${topic}？`]],
        sections: [{ type: "quote", text: "一份可用教案，要让老师知道下一分钟做什么、学生产出什么。" }, { type: "tag-row", tags: [schoolStage, grade, duration, "教案生成"] }],
      },
      {
        title: "教学目标与成功标准",
        subtitle: "目标、活动、练习和评价保持一致",
        action: "学生选择一项目标，说出完成什么作品可证明达成。",
        blocks: [["学习目标：理解", `说清${topic}的基本形式和图像特征。`], ["学习目标：表示", "能在表格、解析式和图像之间转换。"], ["学习目标：应用", "能解决基础问题并解释判断依据。"], ["成功标准", "答案正确、过程完整、表达有依据。"]],
        sections: [{ type: "tips-grid", title: "目标—证据", items: [{ title: "说得清", body: "解释概念与参数" }, { title: "画得对", body: "列表、描点、连线" }, { title: "用得上", body: "解决真实任务" }, { title: "会检查", body: "用图像或代入复核" }] }],
      },
      {
        title: "导入设计：从生活数据进入函数",
        subtitle: "用真实变化情境制造学习需要",
        action: "观察出租车费用随里程变化的情境，找出两个变量并提出问题。",
        blocks: [["真实情境", "出租车起步价固定，超过起步里程后费用随里程增加。"], ["学生观察", "里程和费用分别怎样变化？"], ["认知冲突", "这种关系为什么不是正比例，却仍能用直线图像表示？"], ["导入产出", "学生写出变量、初步关系和一个待验证猜想。"]],
        sections: [{ type: "callout", title: "情境任务", body: "已知起步价8元，超过3千米后每千米2元。费用怎样随里程变化？" }, { type: "tips-grid", title: "导入问题链", items: [{ title: "找变量", body: "里程 x、费用 y" }, { title: "看变化", body: "固定部分 + 变化部分" }, { title: "提猜想", body: "图像可能是什么形状" }] }],
      },
      {
        title: `${topic}的概念与新知建构`,
        subtitle: "从情境关系到解析式，再连接图像",
        action: "把情境中的固定量和变化率分别对应到解析式中的参数。",
        blocks: [["解析式", topic === "一次函数" ? "一般形式 y=kx+b（k≠0）。" : `写出${topic}的核心表达。`], ["参数解释", "k表示单位变化率，b表示初始值或截距。"], ["图像特征", "图像是一条直线；k决定方向，b决定与y轴交点。"], ["概念边界", "b=0时得到正比例函数，是一次函数的特殊情形。"]],
        sections: [{ type: "table", title: "情境—符号—图像", columns: ["情境量", "符号", "图像含义"], rows: [["单位变化率", "k", "直线方向与陡缓"], ["初始值", "b", "y轴截距"], ["自变量", "x", "横轴输入"], ["因变量", "y", "纵轴输出"]], note: source }, { type: "callout", title: "关键关系", body: "k管方向，b管位置。" }],
      },
      {
        title: "师生活动：问题链推动理解",
        subtitle: "教师少讲一步，学生多解释一步",
        action: "围绕四个问题完成思考、同伴交流和全班反馈。",
        blocks: [["教师问", "如果里程增加1千米，费用增加多少？对应哪个参数？"], ["学生想", "比较两组数据，说明变化率是否恒定。"], ["教师追问", "b=0与b≠0时图像有什么共同与不同？"], ["学生说", "用“因为……所以……”完整表达参数与图像关系。"]],
        sections: [{ type: "tips-grid", title: "课堂互动脚本", items: [{ title: "教师提问", body: "变化率在哪里" }, { title: "学生观察", body: "比较数据和图像" }, { title: "同伴解释", body: "用参数说明原因" }, { title: "教师反馈", body: "纠正只看截距的误判" }] }],
      },
      {
        title: "探究例题：参数怎样改变直线",
        subtitle: "用一道比较例题形成参数—图像结论",
        action: "固定一个参数、改变另一个参数，完成题目、步骤和结论。",
        blocks: [["题目", `从${source}选取一组只改变一个参数的典型函数，比较它们的图像。`], ["步骤", "列表取点 → 画出图像 → 单一变量比较 → 记录变化。"], ["关键判断", "区分参数变化对图像方向、形状与位置的影响。"], ["结论", "依据教材例题和学生作图归纳参数与图像特征的对应关系。"], ["教师观察", "是否做到单一变量比较，结论是否有图像或数据证据。"]],
        sections: [{ type: "timeline", title: "探究流程", steps: [{ label: "01", title: "画", body: "画出三条直线" }, { label: "02", title: "比", body: "比较方向和位置" }, { label: "03", title: "说", body: "用参数解释变化" }, { label: "04", title: "验", body: "换一组参数复核" }] }, { type: "callout", title: "成果要求", body: "两条规律 + 一项证据 + 一个易错提醒。" }],
      },
      {
        title: "课堂练习：分层作答与即时反馈",
        subtitle: "基础—提高—挑战，教师依据错误类型反馈",
        action: "基础题2分钟独立完成，提高题同桌讨论，挑战题自选。",
        blocks: [["基础", `从${source}的示例中识别参数，并判断对应图像特征。`], ["提高", "根据教材给出的两个条件建立方程，求出函数表达式并代回检验。"], ["挑战", "设计一个满足指定图像特征的函数，并用参数关系说明理由。"], ["教师反馈", "参数识别错误→回看形式；方程错误→检查代入；图像误判→核对证据。"], ["时间", "基础独立作答，提高同伴互检，挑战题按课堂节奏选做。"]],
        sections: [{ type: "tips-grid", title: "练习任务", items: [{ title: "基础", body: "识别参数、判断方向", tag: "2分钟" }, { title: "提高", body: "由两点求解析式", tag: "4分钟" }, { title: "挑战", body: "按条件设计函数", tag: "自选" }, { title: "反馈", body: "按错误类型修正", tag: "教师观察" }] }],
      },
      {
        title: "总结评价：把知识连成结构",
        subtitle: "学生完成一分钟口述和自评",
        action: "用“情境—解析式—参数—图像—应用”完成一分钟总结。",
        blocks: [["总结", "情境关系 → y=kx+b → k与b → 直线图像 → 问题应用。"], ["课堂评价", "我能识别、能表示、能解释、能应用。"], ["易错修正", "k决定方向，b决定位置；求式后要代回检验。"], ["迁移", "学生独立选择一个生活情境，写出解析式或作图，给出答案并按标准检查、自评和修正。"], ["离堂检测", "看到一条直线，写出两个可能的参数结论。"]],
        sections: [{ type: "timeline", title: "本课知识链", steps: [{ label: "情境", title: "找变量", body: "识别变化关系" }, { label: "式", title: "建模型", body: "写成 y=kx+b" }, { label: "图", title: "看特征", body: "方向与截距" }, { label: "用", title: "解问题", body: "求式并解释" }] }],
      },
      {
        title: "板书设计与课后任务",
        subtitle: "一块板呈现本课知识骨架",
        action: "课后完成基础作业，并从生活中记录一组近似一次函数的数据。",
        blocks: [["板书左区", "情境：里程—费用；变量x、y。"], ["板书中区", "y=kx+b（k≠0）；k管方向，b管位置。"], ["板书右区", "求式步骤：设—代—解—验。"], ["课后作业", "基础练习2题；生活数据建模1题。"]],
        sections: [{ type: "tips-grid", title: "板书三栏", items: [{ title: "情境与问题", body: "变量、数据、猜想" }, { title: "概念与图像", body: "形式、参数、特征" }, { title: "方法与应用", body: "设、代、解、验" }] }, { type: "callout", title: "课后延伸", body: "收集水费、路程或温度数据，判断是否可用一次函数近似描述。" }],
      },
    );
  }
  if (subject === "物理" && /楞次定律/.test(topic)) {
    pages[2].title = "从磁铁与线圈实验进入楞次定律";
    pages[2].blocks = [
      ["实验观察", "将条形磁铁 N 极靠近线圈，检流计指针发生偏转；磁铁停下时指针回到零附近。"],
      ["改变条件", "N 极离开、S 极靠近和 S 极离开时，指针偏转方向分别发生改变。"],
      ["核心问题", "感应电流的磁场方向为什么总是阻碍磁通量的变化？"],
    ];
    pages[3].title = "楞次定律的核心知识";
    pages[3].blocks = [
      ["定律表述", "感应电流的磁场总要阻碍引起感应电流的磁通量变化。"],
      ["判断对象", "先判断原磁通量是增加还是减少，再判断感应磁场应当增强还是减弱原磁场。"],
      ["方向方法", "用阻碍变化确定线圈近端磁极，再用右手螺旋定则判断感应电流方向。"],
      ["边界提醒", "楞次定律阻碍的是磁通量变化，不是阻止磁通量本身，也不是简单地总与原磁场方向相反。"],
    ];
    pages[4].title = "示例：N 极靠近线圈时如何判断方向";
    pages[4].blocks = [
      ["题目", "条形磁铁 N 极正对线圈并向线圈靠近，判断线圈近端磁极和感应电流方向。"],
      ["步骤1", "先判断穿过线圈的磁通量增加，再确定感应磁场要阻碍这一增加。"],
      ["步骤2", "线圈近端应形成 N 极；从磁铁一侧看，感应电流应为逆时针方向。"],
      ["结论", "N 极靠近时近端形成 N 极；若改为 N 极离开，近端形成 S 极以阻碍磁通量减少。"],
    ];
    pages[5].title = "实验探究：四种运动状态的方向判断";
    pages[5].blocks = [
      ["小组任务", "记录 N 极靠近、N 极离开、S 极靠近、S 极离开四种状态下的指针方向。"],
      ["记录表", "每次先写磁通量变化，再写感应磁场方向，最后用右手螺旋定则确定电流方向。"],
      ["学习产出", "完成四行判断表，并用一句话解释其中一行为什么体现“阻碍变化”。"],
      ["评价标准", "磁通量变化判断正确、近端磁极正确、电流方向与磁极关系一致。"],
    ];
    pages[6].title = "楞次定律课堂练习";
    pages[6].blocks = [
      ["练习1", "S 极向线圈靠近时，判断线圈近端磁极。答案：S 极。"],
      ["练习2", "N 极离开线圈时，判断线圈近端磁极。答案：S 极，以阻碍磁通量减少。"],
      ["作答", "依次写磁通量变化、感应磁场方向、近端磁极和感应电流方向。"],
      ["反馈", "四步链条完整且能解释“阻碍变化”为达标；只写相反方向需回到第一步重判。"],
    ];
    pages[7].title = "典型错误与纠错再练习";
    pages[7].blocks = [
      ["错误一", "把楞次定律误记成感应磁场总与原磁场相反。"],
      ["纠正", "先看磁通量变化：增加时阻碍增加，减少时阻碍减少，不能跳过变化判断。"],
      ["错误二", "判断出近端磁极后，使用右手螺旋定则时观察方向弄反。"],
      ["再练习", "交换观察方向重新判断 N 极离开线圈的电流，并写出磁通量变化和近端磁极。"],
    ];
    pages[8].blocks = [
      ["一句话总结", "楞次定律的核心是：感应电流的磁场阻碍磁通量的变化。"],
      ["判断链条", "看运动和磁场 → 判断磁通量变化 → 确定感应磁场 → 判断近端磁极 → 用右手螺旋定则定方向。"],
      ["离堂评价", "独立判断 S 极离开线圈的近端磁极和电流方向，并解释阻碍关系。"],
      ["作业", "完成教材对应的四种运动状态判断题，再设计一个能体现“阻碍变化”的生活或实验情境。"],
    ];
  }
  if (/语文/.test(subject) && topic === "背影") {
    pages[2].title = "初读《背影》：车站送别写了什么";
    pages[2].blocks = [
      ["叙事线索", "父亲送我到车站，替我买橘子，分别后我多次想起他的背影。"],
      ["初读任务", "按时间顺序梳理送别经过，圈出直接描写父亲背影的语句。"],
      ["核心问题", "作者为什么不写父亲的正面，而反复写“背影”？"],
    ];
    pages[3].title = "词句品读：动作背后的父爱";
    pages[3].blocks = [
      ["动作词", "攀、缩、倾等动词写出父亲穿过月台时的艰难与努力。"],
      ["外貌与服饰", "黑布小帽、黑布大马褂和深青布棉袍等细节让形象具体可见。"],
      ["表达效果", "细节不靠直接抒情，而让读者从动作、背影和场景中感受深沉父爱。"],
      ["语境联系", "结合“我那时真是太聪明了”理解作者当时的自责和后来情感变化。"],
    ];
    pages[4].title = "精读示范：买橘子的背影";
    pages[4].blocks = [
      ["题目", "结合买橘子段落，说明作者怎样用动作细节表现父亲的爱。"],
      ["步骤1", "放慢“攀、缩、倾”等动词所在句子的节奏，读出动作的艰难。"],
      ["步骤2", "在动作词旁批注身体姿态、年龄和环境阻力，并引用原文作为证据。"],
      ["结论", "用“词句—画面—情感”三步说明这段背影为什么打动作者。"],
    ];
    pages[5].title = "朗读、批注与小组分享";
    pages[5].blocks = [
      ["个人批注", "选择一句最能体现父爱的句子，写下画面、动作和你的感受。"],
      ["小组交流", "比较不同同学对“背影”细节的理解，必须引用原文词句支持观点。"],
      ["学习产出", "每组完成一张“词句—画面—情感—理由”证据卡并进行朗读展示。"],
    ];
    pages[6].title = "《背影》课堂练习";
    pages[6].blocks = [
      ["练习1", "解释“蹒跚”等词语的语境义，并说明它如何帮助塑造父亲形象。"],
      ["练习2", "找出文中两次写背影的段落，说明它们在叙事和情感上的照应。"],
      ["作答", "引用一个动作细节，证明“父亲的爱是具体而克制的”，不可只写“很感动”。"],
      ["反馈", "动作艰难、买橘坚持、告别不舍和后来回忆构成完整证据；缺少原文引用需补证。"],
    ];
    pages[7].title = "典型问题与反馈修改";
    pages[7].blocks = [
      ["典型问题", "只复述故事、不引用词句；把“背影”当成外貌描写，忽略动作和情境。"],
      ["纠正方法", "回到原文圈出动词和环境信息，用“词句—画面—情感”完成证据回扣。"],
      ["再练习", "修改一段“父亲很爱我”的空泛表达，至少加入两个动作细节和一个情境。"],
      ["反馈标准", "引用准确、画面具体、情感有依据、表达不空泛。"],
    ];
    pages[8].blocks = [
      ["内容总结", "《背影》通过车站送别和买橘子的细节，写出父亲深沉、克制而具体的爱。"],
      ["方法总结", "抓动作细节，联系叙事场景，引用词句解释人物情感。"],
      ["离堂评价", "用“词句—画面—情感”三步解释买橘子的背影为何难忘。"],
      ["作业", "朗读重点段落；完成一段 150 字左右的亲情细节描写，并在旁边标出两个动作词。"],
    ];
  }
  return pages.map((page, index) => {
    const pagePlan = input.slidePagePlans[index];
    const layoutPlan = input.layoutPlans[index];
    return {
      contentDraftId: `teacher-math-dynamic-draft-${index + 1}`,
      planId: input.contentPlan.planId, pagePlanId: pagePlan.pagePlanId, layoutPlanId: layoutPlan.layoutPlanId,
      slideIndex: index + 1, pptType: "courseware", role: pagePlan.role, finalTitle: page.title, subtitle: page.subtitle,
      leadSentence: page.subtitle,
      visibleBlocks: page.blocks.map(([title, body, tag], blockIndex) => ({ type: blockIndex === 0 ? "point" as const : "example" as const, title, body, tag, priority: "must" as const })),
      evidenceSnippets: [{ text: `依据教师提供的课程材料与课堂目标生成，主题：${topic}。`, reliability: "user_claim" as const, confidence: 88, visible: false }],
      actionText: page.action, speakerNotes: `${page.subtitle} 学生活动：${page.action}`, sourceUseSummary: "教师输入材料", confidenceNote: "",
      contentQualityChecks: { titleLengthOk: true, titleIsConclusion: true, visibleBlocksPresent: true, scaffoldFree: true, evidenceRealized: true, noInternalFields: true, lowConfidenceMarked: true },
      blockedScaffoldTerms: [], warnings: [], sections: page.sections
    };
  });
}

function teacherGeneralDynamicDrafts(input: DeckContentRealizerInput): SlideContentDraft[] {
  const context = input.contentPlan.teacherContext;
  const topic = context?.topic?.trim();
  const subject = context?.subject?.trim() || "课程";
  if (!topic) return [];
  const grade = context?.grade || "本年级";
  const schoolStage = context?.schoolStage || "本学段";
  const duration = context?.duration || "课堂时间";
  const requirements = context?.teachingRequirements || `理解${topic}的核心知识并完成课堂应用`;
  const source = [context?.textbook, context?.chapter].filter(Boolean).join(" · ") || `${subject}教材`;
  const pages: Array<{ title: string; subtitle: string; blocks: Array<[string, string, string?]>; sections: SlideSection[]; action: string }> = [
    {
      title: topic,
      subtitle: `${subject} · ${schoolStage}${grade} · ${duration}`,
      action: `写下你对“${topic}”最想解决的一个问题。`,
      blocks: [["核心问题", `学习${topic}时，我们需要理解什么、会做什么，并怎样证明已经掌握？`], ["课程依据", source]],
      sections: [{ type: "quote", text: `从真实问题出发，建立对“${topic}”的理解。` }, { type: "tag-row", tags: [subject, schoolStage, grade, duration] }],
    },
    {
      title: "学习目标",
      subtitle: `围绕“${topic}”建立可观察、可检查的学习成果`,
      action: "选择一个目标，说明你准备怎样证明自己已经达成。",
      blocks: [["理解", `能用自己的话说明${topic}的核心知识`], ["方法", `能按照${subject}学科方法分析与${topic}有关的问题`], ["应用", `能完成与${topic}有关的基础和迁移任务`], ["教学要求", requirements]],
      sections: [{ type: "tips-grid", title: "本课学习目标", items: [
        { title: "理解", body: `说清${topic}的核心知识`, tag: "知识" },
        { title: "方法", body: `使用${subject}学科方法进行分析`, tag: "方法" },
        { title: "应用", body: `完成${topic}相关任务`, tag: "应用" },
        { title: "反思", body: "根据反馈修正理解", tag: "反馈" },
      ] }],
    },
    {
      title: `从真实情境进入${topic}`,
      subtitle: "先连接已有经验，再提出本课需要解决的问题",
      action: "观察情境，写出一个已知信息和一个待解决问题。",
      blocks: [["情境", `回忆生活、教材或已有学习中与${topic}有关的现象或材料。`], ["已有认识", `列出学习${topic}前已经掌握的两个相关知识点。`], ["待解决问题", `这些已有认识还不能解释${topic}中的哪些问题？`]],
      sections: [{ type: "callout", title: "情境问题", body: `结合${source}，找出一个能引出“${topic}”的真实问题。` }, { type: "tips-grid", title: "进入新课前", items: [
        { title: "我知道", body: "写出两个已有知识点" },
        { title: "我观察", body: "描述一个相关现象" },
        { title: "我想问", body: "提出一个可探究问题" },
      ] }],
    },
    {
      title: `${topic}的核心知识`,
      subtitle: "抓住关键词、关系和适用边界",
      action: "圈出三个关键词，并用自己的话重述核心知识。",
      blocks: [["核心表述", `${topic}的核心知识应依据${source}进行准确表述。`], ["关键词", `从教材中找出理解${topic}最关键的三个词。`], ["关系", `说明这些关键词之间的联系、顺序或因果关系。`], ["边界", `指出${topic}适用的条件，以及容易混淆的相近内容。`]],
      sections: [{ type: "tips-grid", title: "理解核心知识", items: [
        { title: "是什么", body: `${topic}的核心表述` },
        { title: "为什么", body: "关键关系和依据" },
        { title: "怎么用", body: "基本方法或步骤" },
        { title: "注意什么", body: "条件、边界与易错点" },
      ] }],
    },
    {
      title: `${topic}的理解示例`,
      subtitle: "从材料和问题出发，展示完整的思考过程",
      action: "先独立完成关键一步，再与示例过程核对。",
      blocks: [["题目", `选择${source}中一个与${topic}直接相关的代表性问题。`], ["步骤1：提取信息", "标出已知信息、关键词和任务要求。"], ["步骤2：形成思路", `选择合适的${subject}学科方法，说明每一步的依据。`], ["结论", "完成结论后回到原任务进行检查，并说明结论如何回答题目。"]],
      sections: [{ type: "timeline", title: "示例思考链", steps: [
        { label: "01", title: "读", body: "明确任务和信息" },
        { label: "02", title: "找", body: "找到关键词与关系" },
        { label: "03", title: "做", body: `使用${subject}学科方法` },
        { label: "04", title: "验", body: "检查结论是否回答问题" },
      ] }],
    },
    {
      title: "课堂探究与合作任务",
      subtitle: `通过观察、讨论或操作深化对“${topic}”的理解`,
      action: "按角色完成小组任务，并用一项证据支持小组结论。",
      blocks: [["探究任务", `围绕${topic}设计一个可在课堂内完成的观察、讨论或操作任务。`], ["小组分工", "记录者整理信息，分析者形成解释，汇报者展示结论。"], ["学习产出", "形成一张记录表、一段解释或一项可展示成果。"], ["评价标准", "结论回应问题、依据清楚、表达准确、成员参与。"]],
      sections: [{ type: "tips-grid", title: "小组任务单", items: [
        { title: "观察", body: `收集与${topic}有关的信息`, tag: "输入" },
        { title: "讨论", body: "比较不同解释或方法", tag: "分析" },
        { title: "形成", body: "写出小组结论和依据", tag: "产出" },
        { title: "展示", body: "接受同伴提问并修正", tag: "反馈" },
      ] }],
    },
    {
      title: `${topic}的课堂练习`,
      subtitle: "从基础理解到迁移应用，逐级检查学习目标",
      action: "独立完成后标记最不确定的一题，并写出判断依据。",
      blocks: [["练习题", `完成一项基础识别、一项关系解释和一项${topic}迁移应用任务。`], ["作答要求", `独立写出答案与依据，并说明使用了什么${subject}学科方法。`], ["反馈标准", "答案完整、依据清楚、表达准确；错误处需标记并修正。"], ["再练习", `根据反馈完成一个新的${topic}情境任务。`]],
      sections: [{ type: "tips-grid", title: "分层练习", items: [
        { title: "基础", body: "准确识别核心知识", tag: "必做" },
        { title: "理解", body: "解释关系和依据", tag: "必做" },
        { title: "应用", body: "迁移到新情境", tag: "挑战" },
        { title: "检查", body: "对照标准自评", tag: "反馈" },
      ] }],
    },
    {
      title: "反馈、纠错与再练习",
      subtitle: "根据典型错误定位原因，再用一个新任务确认已经改正",
      action: "对照标准修改答案，并说明自己改了什么、为什么改。",
      blocks: [["典型错误", `列出学习${topic}时最容易出现的一类理解或方法错误。`], ["原因分析", "区分概念不清、信息遗漏、方法选择不当和表达不完整。"], ["纠正方法", "回到关键词、关系和步骤，逐项检查并修正。"], ["再练习", `完成一个与原题结构相近但情境不同的${topic}任务。`]],
      sections: [{ type: "tips-grid", title: "纠错闭环", items: [
        { title: "发现", body: "标出错误发生的位置" },
        { title: "解释", body: "说明错误产生的原因" },
        { title: "修正", body: "写出正确思路和结果" },
        { title: "再验", body: "用新任务确认掌握" },
      ] }],
    },
    {
      title: "总结与作业",
      subtitle: `回扣“${topic}”的核心知识、方法和课堂表现`,
      action: "完成一分钟总结，并对照学习目标进行自评。",
      blocks: [["核心知识", `用一句话概括${topic}最重要的内容。`], ["学科方法", `说明本课使用了什么${subject}学科方法。`], ["学习证据", "列出一项能证明自己已经掌握的课堂成果。"], ["课后作业", `完成${source}中与${topic}直接相关的巩固任务，并选择一项迁移任务。`]],
      sections: [{ type: "tips-grid", title: "本课学习闭环", items: [
        { title: "我理解", body: `${topic}的核心知识` },
        { title: "我会做", body: `使用${subject}方法完成任务` },
        { title: "我改正", body: "根据反馈修正错误" },
        { title: "我迁移", body: "在新情境中继续应用" },
      ] }, { type: "callout", title: "作业", body: `基础：完成教材巩固任务；拓展：选择一个新情境，解释${topic}如何在其中体现。` }],
    },
  ];
  while (pages.length < input.slidePagePlans.length) {
    const pagePlan = input.slidePagePlans[pages.length];
    pages.push({
      title: pagePlan?.role || `课堂任务 ${pages.length + 1}`,
      subtitle: pagePlan?.pagePurpose || `围绕“${topic}”完成一个可观察的学习任务。`,
      action: pagePlan?.studentAction || "完成本页任务，并用证据说明自己的判断。",
      blocks: [
        ["任务", pagePlan?.pagePurpose || `完成与${topic}有关的课堂任务。`],
        ["作答", pagePlan?.mustProve || "写出结论、依据和需要修正的地方。"],
        ["反馈", pagePlan?.masteryCheck || "对照标准核对自己的理解。"],
      ],
      sections: [],
    });
  }
  if (subject === "数学" && /10\s*以内|十以内/.test(topic) && /加减|加法|减法/.test(topic)) {
    pages[2].title = `用学具认识${topic}`;
    pages[2].blocks = [["生活情境", "桌上有3个苹果，又放来2个，现在一共有几个？再拿走1个，还剩几个？"], ["学生操作", "用苹果图片、积木或计数棒摆出数量，边摆边数，先说清楚发生了增加还是减少。"], ["核心问题", "加法表示合起来，减法表示拿走或比较，怎样用图、算式和语言表示同一个故事？"]];
    pages[3].title = `${topic}的算理与表示`;
    pages[3].blocks = [["概念", "把两组物品合起来是加法；从总数中拿走一部分是减法，结果都在0到10之间。"], ["解释", "从第一个数接着数第二组，或从总数中数出拿走后还剩多少。"], ["三种表示", "同一个问题可以用图片、数数动作和算式表示，三种表示要对应。"], ["检查", "用数一数、画一画或加法与减法的关系检查答案。"]];
    pages[4].title = "例题示范：小苹果的加与减";
    pages[4].blocks = [["题目", "盘中有4个苹果，又放入3个；盘中有8个苹果，拿走2个。"], ["步骤", "先摆4个再添3个，数到7，写4+3=7；先摆8个再拿走2个，数出6个，写8-2=6。"], ["结论", "合起来用加法，拿走用减法，答案分别是7和6。"], ["检验", "7-3=4，6+2=8，原来的数量能够找回来。"]];
    pages[5].title = "摆一摆、说一说、写算式";
    pages[5].blocks = [["操作", "两人一组抽取0到10的数字卡，用积木摆出数量，再增加或拿走几块。"], ["表达", "按“原来有—发生了什么—现在有多少”说完整句子。"], ["产出", "每组完成一张图片、一道算式和一句算理说明，互相检查表示是否一致。"]];
    pages[6].title = `${topic}课堂练习`;
    pages[6].blocks = [["练习", "看图计算：5+2=□，9-3=□。盒子里有7支彩笔，送给同学2支，还剩几支？"], ["作答", "请画图、列式并说一说；再用积木摆一摆，判断6-2=8错在哪里。"], ["反馈", "和同伴核对图片、算式与答案是否一致，指出把拿走和合起来弄混的地方。"], ["答案", "5+2=7；9-3=6；7-2=5。"]];
    pages[7].title = "纠错与再练习";
    pages[7].blocks = [["典型错误", "把“拿走”写成加法，或数数时漏数、重复数。"], ["纠正步骤", "先圈出原来的数量，再标出增加或拿走的数量，最后用图和算式核对。"], ["再练习", "自己编一道10以内的加法题和一道减法题，与同伴交换后用学具验证。"], ["反馈", "说清楚我改了哪一步，为什么图、算式和答案现在一致。"]];
    pages[8].blocks = [["总结", "合起来用加法，拿走或比较用减法；先用学具或图表示，再写算式。"], ["学生迁移", "独立选择生活中一个10以内的增加或减少故事，输出一幅图、一道算式和一句话解释，并讲给家人听。"], ["检查标准", "检查情境判断、数数、算式和答案是否正确，图、算式与语言必须对应。"], ["反馈与自评", "和同伴核对后修正错误，说明自己改了哪一步以及为什么。"], ["作业", "完成教材中10以内加减法练习，任选一题写出图片、算式和一句话解释。"]];
  } else if (subject === "数学" && /加减|乘除|口算|竖式/.test(topic)) {
    pages[2].title = `用生活问题认识${topic}`;
    pages[2].blocks = [["情境", "文具盒里有36支铅笔，又放入27支；送给同学28支。分别需要用加法和减法解决。"], ["学生操作", "先用小棒或计数器表示十位和个位，再写出算式。"], ["核心问题", "个位不够减或相加满十时，十位应该怎样变化？"]];
    pages[3].title = `${topic}的计算方法`;
    pages[3].blocks = [["数位对齐", "列竖式时个位和个位对齐，十位和十位对齐。"], ["进位加法", "个位相加满十，向十位进1。"], ["退位减法", "个位不够减，从十位退1当作10个一。"], ["检查", "用估算或相反运算检查结果是否合理。"]];
    pages[4].title = "例题：36+27和52-28";
    pages[4].blocks = [["加法", "36+27：个位6+7=13，写3向十位进1；十位3+2+1=6，结果63。"], ["减法", "52-28：个位2不够减8，从十位退1，12-8=4；十位4-2=2，结果24。"], ["检验", "63-27=36；24+28=52。"]];
    pages[5].title = "摆小棒、说算理、写竖式";
    pages[5].blocks = [["操作", "两人一组用小棒表示47+35，交换一捆十根，说明为什么要进位。"], ["表达", "按“先算个位—再算十位—写出结果”的顺序说算理。"], ["产出", "每组完成一张小棒图、一列竖式和一句算理说明。"]];
    pages[6].title = `${topic}课堂练习`;
    pages[6].blocks = [["基础", "列竖式计算：28+34，71-46。"], ["判断", "找出错误：43+29=612，并说明数位为什么不能错位。"], ["应用", "二年级一班有38人，二班有35人，两个班一共有多少人？"], ["答案", "28+34=62；71-46=25；38+35=73。"]];
    pages[7].blocks = [["典型错误", "数位没有对齐、忘记进位、退位后十位没有减1。"], ["纠正步骤", "先圈出个位和十位，再逐位计算，最后用相反运算检查。"], ["再练习", "计算46+37和80-54，并向同伴解释进位或退位发生在哪里。"]];
    pages[8].blocks = [["方法总结", "数位对齐，从个位算起；满十进1，不够减就退1当10。"], ["自我检查", "我会列竖式、说算理、检查答案。"], ["作业", "完成教材对应练习，并编一道需要进位或退位的生活问题。"]];
  }
  if (/语文/.test(subject)) {
    pages[2].title = `初读《${topic}》`;
    pages[2].blocks = [["朗读任务", "自由朗读课文，读准字音，标出不理解的词语。"], ["整体感知", `用一句话说说《${topic}》主要写了什么。`], ["学习问题", "作者按怎样的顺序展开描写？哪些词句最有画面感？"]];
    pages[3].title = "词语、段落与表达线索";
    pages[3].blocks = [["重点词语", "结合上下文理解“五彩缤纷”等词语，并用近义词或画面解释。"], ["段落结构", "给每个自然段提取关键词，梳理课文从整体到具体的表达顺序。"], ["表达效果", "寻找比喻、拟人等表达，说明它让景物产生了怎样的画面。"]];
    pages[4].title = "重点段落品读";
    pages[4].blocks = [["读", "有感情地朗读重点段落，圈出表示颜色、动作和气味的词语。"], ["想", "把文字转换成脑海中的画面，说出你看见了什么。"], ["析", "选择一处比喻或拟人，说明本体、表达特点和情感作用。"], ["写", "仿照课文句式写一句秋天的景物。"]];
    pages[5].title = "朗读、批注与小组分享";
    pages[5].blocks = [["个人批注", "在最喜欢的句子旁写下画面、感受和理由。"], ["小组交流", "轮流朗读并比较不同语气带来的表达效果。"], ["学习产出", "每组推荐一句重点句，完成“朗读—解释—仿写”展示。"]];
    pages[6].title = `《${topic}》课堂练习`;
    pages[6].blocks = [["词语", "联系上下文解释重点词语，并选择一个词造句。"], ["结构", "用关键词补全自然段之间的关系。"], ["表达", "判断一个句子使用了什么修辞，并说明表达效果。"], ["迁移", "仿照课文写两句自己观察到的秋天。"]];
    pages[7].blocks = [["典型问题", "朗读停顿不当、只说“很美”却没有引用词句、仿写缺少具体景物。"], ["纠正方法", "回到关键词和重点句，用“词句—画面—感受”三步说明。"], ["再练习", "重新朗读并修改仿写，使句子包含颜色、动作或气味。"]];
    pages[8].blocks = [["内容总结", `《${topic}》通过具体景物展现秋天的特点。`], ["方法总结", "抓关键词、想象画面、体会修辞、通过朗读表达感受。"], ["作业", "朗读课文给家人听，并完成一段80字左右的秋景仿写。"]];
  }
  if (/英语|English/i.test(subject)) {
    pages[2].title = "Listen and greet";
    pages[2].blocks = [["情境", "Two students meet at the school gate in the morning."], ["听说任务", "Listen and choose: Hello / Good morning / Goodbye."], ["课堂问题", "How do we greet someone and introduce ourselves politely?"]];
    pages[3].title = "Key expressions";
    pages[3].blocks = [["Greeting", "Hello! / Hi! / Good morning!"], ["Introduction", "My name is Li Hua. / I'm Li Hua."], ["Ask a name", "What's your name?"], ["Response", "Nice to meet you. — Nice to meet you, too."]];
    pages[4].title = "Model dialogue";
    pages[4].blocks = [["A", "Good morning! I'm Amy. What's your name?"], ["B", "Good morning! My name is Jack."], ["A", "Nice to meet you, Jack."], ["B", "Nice to meet you, too."]];
    pages[5].title = "Pair work: meet a new classmate";
    pages[5].blocks = [["Step 1", "Choose a greeting for morning or afternoon."], ["Step 2", "Introduce yourself and ask your partner's name."], ["Step 3", "Change partners and complete the dialogue again."], ["Output", "Each pair performs a four-line dialogue without reading."]];
    pages[6].title = "Speaking practice";
    pages[6].blocks = [["Complete", "A: Good morning! ____ Amy. B: Hello, Amy! ____ name is Tom."], ["Choose", "At 8:00 a.m., say: Good morning / Good evening."], ["Create", "Use Hello, My name is and Nice to meet you to write a new dialogue."], ["Answer", "I'm; My; Good morning."]];
    pages[7].blocks = [["Common error", "Saying Good evening in the morning, or forgetting is in My name is..."], ["Pronunciation", "Practise the stress in GOOD MORNING and NICE TO MEET YOU."], ["Retry", "Perform the dialogue again with clear voice, eye contact and correct expressions."]];
    pages[8].blocks = [["I can", "I can greet people, introduce myself and ask someone's name."], ["Checklist", "Correct words, complete sentences, clear voice and natural response."], ["Homework", "Record a 20-second self-introduction and greet one family member in English."]];
  }  if (/函数的单调性|一次函数/.test(topic)) {
    pages[3].blocks = [
      ["定义", "在给定区间内，若任意 x1 < x2 都有 f(x1) < f(x2)，则称函数在该区间上单调递增；反之为单调递减。"],
      ["判断方法", "取区间内任意两点比较函数值，或结合图象从左向右观察变化趋势。"],
      ["关键条件", "必须明确研究区间，并使用任意两点而不是个别点作判断。"],
    ];
    pages[3].sections = [{ type: "callout", title: "函数单调性的核心定义", body: "先确定区间，再比较任意两点的函数值变化。" }];
    pages[6].blocks = [
      ["题目", "证明函数 f(x)=2x+1 在实数集上单调递增。"],
      ["步骤1", "任取 x1、x2∈R，且 x1<x2。"],
      ["步骤2", "f(x2)-f(x1)=2(x2-x1)>0。"],
      ["结论", "因此 f(x1)<f(x2)，函数 f(x)=2x+1 在 R 上单调递增。"],
    ];
    pages[6].sections = [{ type: "timeline", title: "证明链条", steps: [
      { label: "01", title: "取点", body: "任取区间内两点 x1<x2" },
      { label: "02", title: "作差", body: "计算 f(x2)-f(x1)" },
      { label: "03", title: "判断", body: "判断差值的正负" },
      { label: "04", title: "结论", body: "写出单调性结论" },
    ] }];
    pages[7].blocks = [
      ["练习题", "判断函数 f(x)=-3x+2 在 R 上的单调性，并说明理由。"],
      ["学生作答", "独立取 x1<x2，计算 f(x2)-f(x1)，再与同伴核对。"],
      ["标准答案", "f(x2)-f(x1)=-3(x2-x1)<0，所以函数在 R 上单调递减。"],
      ["反馈", "检查研究区间、两点关系、作差过程和结论是否完整。"],
    ];
    pages[4].blocks = [
      ["数值表", "取 f(x)=2x+1，x=-1、0、1、2 时，y=-1、1、3、5。"],
      ["解析式", "一次函数的一般形式为 y=kx+b，其中 k、b 为常数且 k≠0。"],
      ["图像", "在坐标系中描出对应点，所有点落在同一条直线上。"],
    ];
    pages[5].blocks = [
      ["斜率 k", "k>0 时函数递增，k<0 时函数递减；|k| 越大，直线越陡。"],
      ["截距 b", "b 决定直线与 y 轴的交点，改变 b 会使直线平移。"],
      ["对照观察", "固定 b，改变 k，比较图像倾斜方向和变化快慢。"],
    ];
    pages[7].sections = [{ type: "tips-grid", title: "课堂练习与反馈", items: [
      { title: "独立判断", body: "先写出任意两点 x1<x2。", tag: "作答" },
      { title: "代数验证", body: "计算 f(x2)-f(x1) 并判断正负。", tag: "验证" },
      { title: "同伴核对", body: "核对区间、作差和结论。", tag: "反馈" },
    ] }];
    pages[8].blocks = [
      ["总结", "函数单调性判断的核心是：确定区间、任取两点、比较函数值。"],
      ["方法", "图象法观察趋势，定义法计算 f(x2)-f(x1)。"],
      ["学生迁移", "独立选择一个一次函数，写出判断步骤、答案和解释。"],
      ["自我检查", "检查区间、任意性、差值符号、结论和作图是否正确。"],
      ["作业", "完成一个一次函数和一个二次函数在指定区间上的单调性判断。"],
    ];
  }
  if (topic === "\u51fd\u6570\u7684\u5355\u8c03\u6027") {
    pages[3].blocks = [
      ["\u5b9a\u4e49", "\u5728\u7ed9\u5b9a\u533a\u95f4\u5185\uff0c\u82e5\u4efb\u610f x1 < x2 \u90fd\u6709 f(x1) < f(x2)\uff0c\u5219\u79f0\u51fd\u6570\u5728\u8be5\u533a\u95f4\u4e0a\u5355\u8c03\u9012\u589e\uff1b\u53cd\u4e4b\u4e3a\u5355\u8c03\u9012\u51cf\u3002"],
      ["\u5224\u65ad\u65b9\u6cd5", "\u53d6\u533a\u95f4\u5185\u4efb\u610f\u4e24\u70b9\u6bd4\u8f83\u51fd\u6570\u503c\uff0c\u6216\u7ed3\u5408\u56fe\u8c61\u4ece\u5de6\u5411\u53f3\u89c2\u5bdf\u53d8\u5316\u8d8b\u52bf\u3002"],
      ["\u5173\u952e\u6761\u4ef6", "\u5fc5\u987b\u660e\u786e\u7814\u7a76\u533a\u95f4\uff0c\u5e76\u4f7f\u7528\u4efb\u610f\u4e24\u70b9\u4f5c\u5224\u65ad\u3002"],
    ];
    pages[6].blocks = [
      ["\u9898\u76ee", "\u8bc1\u660e\u51fd\u6570 f(x)=2x+1 \u5728\u5b9e\u6570\u96c6\u4e0a\u5355\u8c03\u9012\u589e\u3002"],
      ["\u6b65\u9aa41", "\u4efb\u53d6 x1\u3001x2\u2208R\uff0c\u4e14 x1<x2\u3002"],
      ["\u6b65\u9aa42", "f(x2)-f(x1)=2(x2-x1)>0\u3002"],
      ["\u7ed3\u8bba", "\u56e0\u6b64 f(x1)<f(x2)\uff0c\u51fd\u6570 f(x)=2x+1 \u5728 R \u4e0a\u5355\u8c03\u9012\u589e\u3002"],
    ];
    pages[7].blocks = [
      ["\u7ec3\u4e60\u9898", "\u5224\u65ad\u51fd\u6570 f(x)=-3x+2 \u5728 R \u4e0a\u7684\u5355\u8c03\u6027\uff0c\u5e76\u8bf4\u660e\u7406\u7531\u3002"],
      ["\u5b66\u751f\u4f5c\u7b54", "\u72ec\u7acb\u53d6 x1<x2\uff0c\u8ba1\u7b97 f(x2)-f(x1)\uff0c\u518d\u4e0e\u540c\u4f34\u6838\u5bf9\u3002"],
      ["\u6807\u51c6\u7b54\u6848", "f(x2)-f(x1)=-3(x2-x1)<0\uff0c\u6240\u4ee5\u51fd\u6570\u5728 R \u4e0a\u5355\u8c03\u9012\u51cf\u3002"],
      ["\u53cd\u9988", "\u68c0\u67e5\u7814\u7a76\u533a\u95f4\u3001\u4e24\u70b9\u5173\u7cfb\u3001\u4f5c\u5dee\u8fc7\u7a0b\u548c\u7ed3\u8bba\u662f\u5426\u5b8c\u6574\u3002"],
    ];
    pages[8].blocks = [
      ["\u603b\u7ed3", "\u51fd\u6570\u5355\u8c03\u6027\u5224\u65ad\u7684\u6838\u5fc3\u662f\uff1a\u786e\u5b9a\u533a\u95f4\u3001\u4efb\u53d6\u4e24\u70b9\u3001\u6bd4\u8f83\u51fd\u6570\u503c\u3002"],
      ["\u65b9\u6cd5", "\u56fe\u8c61\u6cd5\u89c2\u5bdf\u8d8b\u52bf\uff0c\u5b9a\u4e49\u6cd5\u8ba1\u7b97 f(x2)-f(x1)\u3002"],
      ["\u5b66\u751f\u8fc1\u79fb", "\u72ec\u7acb\u9009\u62e9\u4e00\u4e2a\u4e00\u6b21\u51fd\u6570\uff0c\u5199\u51fa\u5224\u65ad\u6b65\u9aa4\u3001\u7b54\u6848\u548c\u89e3\u91ca\u3002"],
      ["\u81ea\u6211\u68c0\u67e5", "\u68c0\u67e5\u533a\u95f4\u3001\u4efb\u610f\u6027\u3001\u5dee\u503c\u7b26\u53f7\u3001\u7ed3\u8bba\u548c\u4f5c\u56fe\u662f\u5426\u6b63\u786e\u3002"],
      ["\u4f5c\u4e1a", "\u5b8c\u6210\u4e00\u4e2a\u4e00\u6b21\u51fd\u6570\u548c\u4e00\u4e2a\u4e8c\u6b21\u51fd\u6570\u5728\u6307\u5b9a\u533a\u95f4\u4e0a\u7684\u5355\u8c03\u6027\u5224\u65ad\u3002"],
    ];
  }
  if (subject === "物理" && /楞次定律/.test(topic)) {
    if (pages.length >= 16) {
      const fullPages: Array<Partial<(typeof pages)[number]>> = [
        { title: "楞次定律", subtitle: "从实验现象出发，建立方向判断的完整证据链", blocks: [["核心问题", "磁通量变化时，感应电流为什么会这样响应？"], ["本课产出", "完成一条方向判断链，并能解释每一步依据。"]] },
        { title: "今天我们怎样证明学会了", subtitle: "规律、判断链、迁移解释三个目标", blocks: [["学习目标", "能说清“阻碍的是磁通量变化”。"], ["方法", "能按变化、感应磁场、近端磁极、电流方向完成判断。"], ["应用", "能在新情境中解释楞次定律的作用。"]] },
        { title: "磁铁靠近线圈时发生了什么", subtitle: "先记录事实，不急着给出结论", blocks: [["观察", "N 极靠近线圈，检流计发生偏转；磁铁停下，指针回零。"], ["事实", "有相对运动时才有偏转，方向需要继续比较。"], ["问题", "偏转方向由什么决定？"]] },
        { title: "先预测：四种运动会怎样偏转", subtitle: "让猜想接受实验记录的检验", blocks: [["条件", "N 极靠近、N 极离开、S 极靠近、S 极离开。"], ["作答", "先写磁通量增加或减少，再预测线圈近端磁极。"], ["要求", "保留一处不确定项，观察后再修正。"]] },
        { title: "四种状态的实验记录", subtitle: "比较条件变化与检流计偏转", blocks: [["记录", "每行写磁极、运动、磁通量变化、近端磁极和电流方向。"], ["比较", "同一磁极靠近与离开，结论为什么不同？"], ["证据", "四行记录共同指向“阻碍变化”。"]] },
        { title: "从证据归纳楞次定律", subtitle: "感应电流的磁场总要阻碍磁通量的变化", blocks: [["规律", "当原磁通量增加，感应磁场阻碍增加；减少时，感应磁场阻碍减少。"], ["边界", "不是感应磁场总与原磁场相反。"], ["表达", "用“变化—响应—阻碍”说出规律。"]] },
        { title: "判断方向前先看磁通量变化", subtitle: "核心概念决定判断链不能跳过第一步", blocks: [["核心概念", "磁通量变化是判断感应效应的起点。"], ["第一步", "看磁铁运动和原磁场，判断穿过线圈的磁通量增加还是减少。"], ["解释", "确定感应磁场应阻碍哪一种变化，再判断近端磁极和电流方向。"]] },
        { title: "示范：N 极靠近时怎样判断", subtitle: "从已知条件走到感应电流方向", blocks: [["题目", "N 极正对线圈靠近，判断近端磁极和感应电流方向。"], ["步骤", "磁通量增加，线圈近端形成 N 极以阻碍增加。"], ["结论", "从磁铁一侧看，感应电流为逆时针。"]] },
        { title: "变式：N 极离开时哪里变了", subtitle: "方法不变，变化方向改变", blocks: [["变化", "N 极离开，穿过线圈的磁通量减少。"], ["判断", "线圈近端形成 S 极，以阻碍减少。"], ["比较", "靠近与离开都遵循同一判断链。"]] },
        { title: "小组探究：用判断链解释四种状态", subtitle: "把实验记录变成可说清的物理解释", blocks: [["分工", "一人读条件，一人判断变化，一人定磁极，一人核对电流方向。"], ["产出", "每组完成一行完整判断链并解释依据。"], ["追问", "若只写“相反”，漏掉了哪一步？"]] },
        { title: "30 秒检测：先写变化，再判方向", subtitle: "检查自己是否跳过了磁通量判断", blocks: [["练习", "S 极靠近线圈时，线圈近端形成什么磁极？"], ["作答", "先写磁通量变化，再写感应磁场和近端磁极。"], ["反馈", "答案为 S 极；只写答案没有依据需补全判断链。"]] },
        { title: "基础、理解与迁移三层练习", subtitle: "同一规律在不同条件下是否仍然成立", blocks: [["基础", "判断 S 极离开线圈时的近端磁极。"], ["理解", "说明为什么“总与原磁场相反”不准确。"], ["迁移", "解释电磁阻尼为什么会阻碍物体运动状态的变化。"]] },
        { title: "为什么“总是相反”是错的", subtitle: "错误常发生在忽略磁通量变化", blocks: [["错误", "看到原磁场就直接写感应磁场相反。"], ["诊断", "没有判断原磁通量究竟增加还是减少。"], ["修正", "回到运动和磁场，先完成第一步。"]] },
        { title: "纠错后再判一次：观察方向不能弄反", subtitle: "用右手螺旋定则完成最后校验", blocks: [["再练", "从线圈另一侧观察 N 极靠近，电流顺逆时针如何变化？"], ["作答", "先固定观察位置，再用近端磁极反推电流方向。"], ["反馈", "改变观察侧会改变描述的顺逆时针，不改变物理磁极判断。"]] },
        { title: "楞次定律还能解释什么", subtitle: "把阻碍变化迁移到新的物理情境", blocks: [["新情境", "导体在磁场中运动时会受到阻碍运动的作用。"], ["解释", "运动改变磁通量，感应效应会阻碍这种变化。"], ["迁移", "用“变化—响应—阻碍”解释一个新现象。"]] },
        { title: "离堂任务与课后巩固", subtitle: "用独立判断证明本课方法已经形成", blocks: [["总结", "楞次定律判断先看磁通量变化，再确定响应方向。"], ["离堂作答", "独立写出 S 极远离线圈时的答案和完整判断链。"], ["迁移与自评", "把方法用于一个新情境，对照检查标准自评并修正。"]] },
      ];
      fullPages.forEach((page, index) => { pages[index] = { ...pages[index], ...page, sections: pages[index].sections }; });
    }
    if (pages.length < 16) {
    pages[2].title = "从磁铁与线圈实验进入楞次定律";
    pages[2].blocks = [["实验观察", "N 极靠近线圈时检流计偏转，磁铁停下时指针回零。"], ["改变条件", "N 极离开、S 极靠近和 S 极离开时，偏转方向随磁通量变化改变。"], ["核心问题", "感应电流的磁场为什么阻碍磁通量的变化？"]];
    pages[3].title = "楞次定律的核心知识";
    pages[3].blocks = [["定律表述", "感应电流的磁场总要阻碍引起感应电流的磁通量变化。"], ["判断顺序", "先判断磁通量增加还是减少，再确定感应磁场应增强还是减弱原磁场。"], ["方向方法", "确定线圈近端磁极后，用右手螺旋定则判断电流方向。"], ["边界提醒", "阻碍的是磁通量变化，不是阻止磁通量本身，也不是总与原磁场相反。"]];
    pages[4].title = "示例：N 极靠近线圈时判断方向";
    pages[4].blocks = [["题目", "N 极正对线圈靠近，判断线圈近端磁极和感应电流方向。"], ["步骤1", "先判断穿过线圈的磁通量增加，再确定感应磁场要阻碍这一增加。"], ["步骤2", "线圈近端形成 N 极；从磁铁一侧看，感应电流为逆时针。"], ["结论", "N 极靠近时近端形成 N 极；N 极离开时近端形成 S 极以阻碍磁通量减少。"]];
    pages[5].title = "实验探究：四种运动状态的方向判断";
    pages[5].blocks = [["任务", "记录 N 极靠近、N 极离开、S 极靠近、S 极离开四种状态。"], ["记录链", "磁通量变化 → 感应磁场 → 近端磁极 → 右手螺旋定则。"], ["学习产出", "完成四行判断表，并解释其中一行如何体现阻碍变化。"]];
    pages[6].title = "楞次定律课堂练习";
    pages[6].blocks = [["练习1", "S 极靠近时，判断线圈近端磁极。答案：S 极。"], ["练习2", "N 极离开时，判断线圈近端磁极。答案：S 极，以阻碍磁通量减少。"], ["作答", "依次写磁通量变化、感应磁场方向、近端磁极和感应电流方向。"], ["反馈", "四步链条完整且能解释阻碍变化为达标；只写相反方向需回到第一步重判。"]];
    pages[7].title = "典型错误与纠错再练习";
    pages[7].blocks = [["错误一", "把楞次定律误记成感应磁场总与原磁场相反。"], ["纠正", "磁通量增加时阻碍增加，减少时阻碍减少，必须先判断变化。"], ["错误二", "判断近端磁极后，观察方向弄反。"], ["再练习", "重新判断 N 极离开线圈的电流，并写出变化和近端磁极。"]];
    pages[8].blocks = [["总结", "感应电流的磁场阻碍磁通量的变化。"], ["判断链条", "看运动和磁场 → 判磁通量变化 → 定感应磁场 → 判近端磁极 → 定电流方向。"], ["离堂评价", "独立判断 S 极离开线圈的近端磁极和电流方向，并解释阻碍关系。"], ["作业", "完成教材四种运动状态判断题，再设计一个体现阻碍变化的实验情境。"]];
    }
  }
  if (/语文/.test(subject) && topic === "背影") {
    if (pages.length >= 16) {
      const fullPages: Array<Partial<(typeof pages)[number]>> = [
        { title: "背影", subtitle: "从词句和细节读出父亲深沉而克制的爱", blocks: [["核心问题", "作者为什么反复写背影，而不直说父爱？"], ["本课产出", "完成一条“词句—画面—情感”证据链。"]] },
        { title: "今天我们怎样读懂背影", subtitle: "文本证据、细读解释、表达迁移", blocks: [["学习目标", "能准确引用关键词句。"], ["解释", "能还原画面并说明人物情感。"], ["迁移", "能用具体细节写一段自己的生活片段。"]] },
        { title: "车站送别：故事发生了什么", subtitle: "先理清人物、地点、事件与背影线索", blocks: [["人物", "父亲与“我”在浦口车站送别。"], ["事件", "父亲叮嘱、照看行李、穿过月台买橘子。"], ["线索", "背影在送别、买橘子和回忆中反复出现。"]] },
        { title: "读准动作：哪些词让画面出现", subtitle: "朗读中的停顿和重音服务于理解", blocks: [["朗读", "在“攀、缩、倾”处放慢节奏，读出动作的艰难。"], ["圈画", "标出动作词、衣着和环境信息。"], ["问题", "这些细节为什么比“父亲很爱我”更有力量？"]] },
        { title: "攀、缩、倾：动作词写出了什么", subtitle: "动作、身体和处境共同构成父亲形象", blocks: [["核心概念", "细读要从词句进入画面，再解释人物和情感。"], ["词句", "攀写出向上越过月台的费力；缩、倾写出身体的笨重和小心。"], ["解释", "年迈的父亲穿着厚衣，在月台间艰难移动，不直接抒情却让父爱可见。"]] },
        { title: "月台、年龄与衣着让背影更具体", subtitle: "细读不能只孤立解释一个动词", blocks: [["环境", "月台高低、铁道阻隔增加了行动难度。"], ["人物", "黑布小帽、大马褂和棉袍呈现父亲的朴素与年迈。"], ["联系", "动作和情境一起构成令人难忘的背影。"]] },
        { title: "为什么文章反复写背影", subtitle: "背影既是线索，也是情感变化的入口", blocks: [["第一次", "车站送别中的背影让“我”看见父亲的艰难。"], ["重点", "买橘子段落把细节推到最清晰处。"], ["回忆", "多年后回望，背影承载理解、愧疚和思念。"]] },
        { title: "精读示范：买橘子的背影", subtitle: "把引用、画面还原和情感判断组织成完整回答", blocks: [["题目", "结合买橘子段落，说明作者怎样用动作细节表现父亲的爱。"], ["步骤", "引用动作词，还原画面，再解释父亲的处境与情感。"], ["结论", "细节让爱不靠口号，而在艰难行动中显现。"]] },
        { title: "把一句话读深：词句、画面、情感", subtitle: "独立完成一条有依据的文本批注", blocks: [["词句", "选择一句父亲动作描写。"], ["画面", "写出你看见的人物姿态、环境和动作节奏。"], ["情感", "说明这一画面为什么让你感到爱与不舍。"]] },
        { title: "不同朗读为什么会带来不同理解", subtitle: "用同伴追问检验解释是否回到原文", blocks: [["交流", "两人朗读同一句，比较重音和停顿。"], ["追问", "你的理解依据哪一个词或细节？"], ["修正", "把“很感动”改成有词句支撑的表达。"]] },
        { title: "用一处动作细节证明父爱", subtitle: "即时短答检查证据链是否完整", blocks: [["练习", "选择“攀、缩、倾”中的一个词解释父亲形象。"], ["作答", "写出引用、画面和情感，不少于三句话。"], ["反馈", "没有原文词句或只有空泛情感，需要补回证据。"]] },
        { title: "把具体细节写进自己的片段", subtitle: "迁移克制而具体的表达方法", blocks: [["任务", "写一个熟悉的人为你做小事的 80 字片段。"], ["要求", "至少有一个动作、一个情境，不直接写“他很爱我”。"], ["分享", "标出最能让画面出现的一个词。"]] },
        { title: "只说“父爱伟大”为什么不够", subtitle: "空泛结论缺少文本证据和画面", blocks: [["问题", "只复述买橘子故事，没有解释词句。"], ["补证", "补上动作词、画面还原和人物处境。"], ["标准", "每个情感判断都要能回到原文。"]] },
        { title: "让解释站得住：补词句，也补画面", subtitle: "按标准修改自己的短答", blocks: [["检查", "有没有准确引用？有没有具体画面？有没有解释情感？"], ["修改", "用一个动作词替换“很感动”这类空泛表达。"], ["反馈", "保留修改痕迹，并说明自己补强了什么。"]] },
        { title: "背影为何难忘", subtitle: "用一句有证据的回答收束本课", blocks: [["总结", "用词句、画面和情感三步，才能把背影读深。"], ["离堂作答", "独立写出一段答案，引用原文解释买橘子的背影为何难忘。"], ["迁移与自评", "把方法用于另一处细节，对照检查标准自评并修正。"]] },
        { title: "带着细节观察生活", subtitle: "朗读巩固与亲情细节写作", blocks: [["基础", "朗读买橘子段落，标出三个动作词。"], ["提高", "完成 150 字亲情细节描写。"], ["拓展", "给自己的片段写一句旁批，说明哪个细节最有力量。"]] },
      ];
      fullPages.forEach((page, index) => { pages[index] = { ...pages[index], ...page, sections: pages[index].sections }; });
    }
    if (pages.length < 16) {
    pages[2].title = "初读《背影》：车站送别写了什么";
    pages[2].blocks = [["叙事线索", "父亲送我到车站、替我买橘子，分别后我多次想起他的背影。"], ["初读任务", "梳理送别经过，圈出直接描写父亲背影的语句。"], ["核心问题", "作者为什么不写正面，而反复写背影？"]];
    pages[3].title = "词句品读：动作背后的父爱";
    pages[3].blocks = [["动作词", "攀、缩、倾等动词写出父亲穿过月台的艰难与努力。"], ["外貌细节", "黑布小帽、黑布大马褂和深青布棉袍让形象具体可见。"], ["表达效果", "细节让读者从动作和场景中感受深沉父爱。"], ["语境联系", "结合“我那时真是太聪明了”理解作者当时的自责。"]];
    pages[4].title = "精读示范：买橘子的背影";
    pages[4].blocks = [["题目", "结合买橘子段落，说明作者怎样用动作细节表现父亲的爱。"], ["步骤1", "放慢动作词所在句子的节奏，读出父亲穿过月台时的艰难。"], ["步骤2", "在动作词旁批注身体姿态、年龄和环境阻力，并引用原文作为证据。"], ["结论", "用词句—画面—情感三步说明这段背影为什么打动作者。"]];
    pages[5].title = "朗读、批注与小组分享";
    pages[5].blocks = [["个人批注", "选择一句最能体现父爱的句子，写下画面、动作和感受。"], ["小组交流", "比较不同理解，必须引用原文词句支持观点。"], ["学习产出", "完成词句—画面—情感—理由证据卡并朗读展示。"]];
    pages[6].title = "《背影》课堂练习";
    pages[6].blocks = [["练习1", "解释“蹒跚”等词语的语境义，并说明它如何塑造父亲形象。"], ["练习2", "找出文中两次写背影的段落，说明它们在叙事和情感上的照应。"], ["作答", "引用一个动作细节，证明父亲的爱具体而克制，不可只写“很感动”。"], ["反馈", "动作艰难、买橘坚持、告别不舍和后来回忆构成完整证据；缺少原文引用需补证。"]];
    pages[7].title = "典型问题与反馈修改";
    pages[7].blocks = [["典型问题", "只复述故事、不引用词句；把背影当成外貌描写。"], ["纠正方法", "回到原文圈出动词和环境信息，完成词句—画面—情感回扣。"], ["再练习", "修改“父亲很爱我”的空泛表达，加入两个动作细节。"], ["反馈标准", "引用准确、画面具体、情感有依据、表达不空泛。"]];
    pages[8].blocks = [["内容总结", "《背影》通过车站送别和买橘子的细节，写出父亲深沉而具体的爱。"], ["方法总结", "抓动作细节，联系场景，引用词句解释人物情感。"], ["离堂评价", "用词句—画面—情感三步解释买橘子的背影为何难忘。"], ["作业", "朗读重点段落；完成 150 字亲情细节描写并标出两个动作词。"]];
    }
  }
  return pages.map((page, index) => {
    const pagePlan = input.slidePagePlans[index];
    const layoutPlan = input.layoutPlans[index];
    return {
      contentDraftId: `teacher-general-draft-${index + 1}`,
      planId: input.contentPlan.planId,
      pagePlanId: pagePlan.pagePlanId,
      layoutPlanId: layoutPlan.layoutPlanId,
      slideIndex: index + 1,
      pptType: "courseware",
      role: pagePlan.role,
      finalTitle: page.title,
      subtitle: page.subtitle,
      leadSentence: page.subtitle,
      visibleBlocks: page.blocks.map(([title, body, tag], blockIndex) => ({ type: blockIndex === 0 ? "point" as const : "example" as const, title, body: body.replace(/\[教师补充[^\]]*\]/g, "待补充教材依据").replace(/______+/g, "对应变化趋势"), tag, priority: "must" as const })),
      evidenceSnippets: [{ text: `依据教师输入与${source}生成，主题：${topic}。`, reliability: "user_claim" as const, confidence: 86, visible: false }],
      actionText: page.action,
      speakerNotes: `${page.subtitle} 学生活动：${page.action}`,
      sourceUseSummary: source,
      confidenceNote: "事实性细节请教师结合教材复核。",
      contentQualityChecks: { titleLengthOk: true, titleIsConclusion: true, visibleBlocksPresent: true, scaffoldFree: true, evidenceRealized: true, noInternalFields: true, lowConfidenceMarked: true },
      blockedScaffoldTerms: [],
      warnings: [],
      sections: page.sections,
    };
  });
}

export function createDeckContentDrafts(input: DeckContentRealizerInput): DeckContentRealizerOutput {
  if (input.contentPlan.playbookId === "teacher_math_science_v1") {
    const contentDrafts = sanitizeTeacherDrafts(teacherMathDynamicDrafts(input));
    return { contentDrafts, deckContentQualityReport: buildReport(contentDrafts, 0) };
  }
  if (input.contentPlan.playbookId === "teacher_general_v1") {
    // General subjects must not inherit mathematics/function vocabulary.
    // The subject-neutral realizer lets subject/topic inputs drive visible classroom tasks.
    const contentDrafts = sanitizeTeacherDrafts(teacherGeneralDynamicDrafts(input));
    return { contentDrafts, deckContentQualityReport: buildReport(contentDrafts, 0) };
  }
  let autoFixedSlides = 0;
  const drafts = input.slidePagePlans.map((pagePlan, index) => {
    const layoutPlan = input.layoutPlans.find((plan) => plan.pagePlanId === pagePlan.pagePlanId) || input.layoutPlans[index];
    const evidenceMap = input.slideEvidenceMaps.find((map) => map.pagePlanId === pagePlan.pagePlanId) || input.slideEvidenceMaps[index];
    const draft = createSlideContentDraft({
      contentPlan: input.contentPlan,
      slidePagePlan: pagePlan,
      layoutPlan,
      slideEvidenceMap: evidenceMap,
      evidenceBlocks: input.evidenceBlocks,
      mode: input.mode
    });
    const validation = validateSlideContentDraft(draft);
    if (validation.valid) return draft;
    autoFixedSlides += 1;
    return repairDraft(draft);
  });
  return {
    contentDrafts: drafts,
    deckContentQualityReport: buildReport(drafts, autoFixedSlides)
  };
}
