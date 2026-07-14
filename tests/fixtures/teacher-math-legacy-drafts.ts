/**
 * TEST FIXTURE ONLY — NOT PRODUCTION CODE.
 *
 * This is the legacy hardcoded teacher-math deck (the former
 * `_legacyTeacherMathDraftsFixtureOnly` that used to live inside
 * lib/ppt-agent/deck-content-realizer.ts). It contains hardcoded lesson
 * content (y=2x+1, A(0,1)/B(2,5), "高一", 45分钟) and is retained solely so
 * regression fixtures / snapshot baselines can reference the historical
 * output shape. It is deliberately located under tests/ so that NO production
 * module (app/**, lib/**) can import it. The 069 acceptance suite asserts this
 * separation via a dependency scan.
 */
import type { DeckContentRealizerInput } from "@/lib/ppt-agent/deck-content-realizer";
import type { SlideContentDraft } from "@/lib/ppt-agent/slide-content-draft";
import type { SlideSection } from "@/lib/canvas-data";

export function legacyTeacherMathDraftsFixture(
  input: DeckContentRealizerInput
): SlideContentDraft[] {
  const context = input.contentPlan.teacherContext;
  const topic = context?.topic || "数学概念与图像";
  const source = context?.sourceMaterial || "教师提供的课程材料";
  const baseEquation = source.match(/y\s*=\s*kx\s*\+\s*b/i)?.[0]?.replace(/\s+/g, "") || "y=kx+b";
  const pages: Array<{ title: string; subtitle: string; blocks: Array<[string, string, string?]>; sections: SlideSection[]; action: string }> = [
    {
      title: topic, subtitle: "从变量关系出发，用表格、解析式和图像理解函数", action: "观察生活中的两个变量，提出本课核心问题。",
      blocks: [["核心问题", "同一个变量关系，怎样用数值、符号和图像表达？"], ["课堂主线", "观察关系 -> 建立定义 -> 描点作图 -> 比较参数 -> 练习应用"]],
      sections: [{ type: "quote", text: "同一个变化关系，可以被看见、被计算，也可以被解释。" }, { type: "tag-row", tags: [context?.grade || "高一", "45分钟", "概念与图像", "可编辑数学图形"] }]
    },
    {
      title: "学习目标", subtitle: "知识、方法与课堂输出都可以被检查", action: "选择一个目标，说明你准备怎样证明自己已经掌握。",
      blocks: [["理解", `识别${baseEquation}的结构与条件`, "目标1"], ["表示", "在数值表、解析式和图像之间转换", "目标2"], ["解释", "说明k与b如何影响图像", "目标3"], ["应用", "完成求解析式、作图与判断", "目标4"]],
      sections: [{ type: "tips-grid", title: "本课学习目标", items: [
        { title: "理解概念", body: `说清${baseEquation}中变量与参数的含义`, tag: "理解" },
        { title: "连接表示", body: "能把数值表、解析式和图像对应起来", tag: "表示" },
        { title: "解释参数", body: "能根据图像判断k、b的作用", tag: "解释" },
        { title: "完成应用", body: "能求式、描点、作图并核对", tag: "应用" }
      ] }]
    },
    {
      title: "从已有知识进入新知", subtitle: "变量、坐标与正比例关系是理解图像的起点", action: "根据情境列出两个变量，并在坐标系中标出一组对应值。",
      blocks: [["情境", "一辆车匀速行驶，路程随时间稳定增加。"], ["已有知识", "变量之间可以用对应值、解析式和坐标点表示。"], ["待解决", "当关系不经过原点时，图像与解析式怎样变化？"]],
      sections: [{ type: "callout", title: "情境问题", body: "起点已有2千米，之后每小时行驶3千米。时间x与路程y有什么关系？" }, { type: "tips-grid", title: "先回忆", items: [
        { title: "变量", body: "x变化时，y按确定规则变化" }, { title: "坐标", body: "一组对应值可以写成点(x, y)" }, { title: "正比例", body: "y=kx的图像经过原点" }
      ] }]
    },
    {
      title: "定义与关键变量", subtitle: `${baseEquation}把变化速度与初始位置写进同一个关系`, action: "判断三个表达式是否属于本课概念，并圈出判断依据。",
      blocks: [["定义", `形如${baseEquation}，其中k、b为常数且k不等于0。`], ["变量", "x是自变量，y是因变量。"], ["参数k", "决定直线的变化方向与陡缓。"], ["参数b", "决定图像与y轴的交点。"]],
      sections: [{ type: "callout", title: "核心定义", body: `${baseEquation}（k、b为常数，k不等于0）` }, { type: "tips-grid", title: "抓住三个判断点", items: [
        { title: "变量次数", body: "自变量的最高次数是1" }, { title: "k不为0", body: "k=0时函数值不再随x发生一次变化" }, { title: "b可为0", body: "b=0时是正比例函数" }
      ] }]
    },
    {
      title: "表格、解析式与图像的对应", subtitle: "以y=2x+1为例，三种表示描述同一条直线", action: "补全表格，描出对应点，再解释为什么这些点在同一条直线上。",
      blocks: [["数值表", "x取-1、0、1、2时，y依次为-1、1、3、5。"], ["解析式", "y=2x+1给出每个x对应的y。"], ["图像", "描点(-1,-1)、(0,1)、(1,3)、(2,5)并连成直线。"]],
      sections: [{ type: "table", title: "数值表", columns: ["x", "-1", "0", "1", "2"], rows: [["y", "-1", "1", "3", "5"]], note: "每一列对应图像上的一个点" }, { type: "callout", title: "解析式", body: "y = 2x + 1" }]
    },
    {
      title: "k与b怎样改变图像", subtitle: "先固定一个参数，再观察另一个参数带来的变化", action: "观察四条直线，归纳k的符号、大小和b的变化分别影响什么。",
      blocks: [["k的符号", "k大于0时从左向右上升；k小于0时下降。"], ["k的大小", "绝对值越大，直线越陡。"], ["b的作用", "b改变直线与y轴的交点，平行线可由此上下移动。"]],
      sections: [{ type: "tips-grid", title: "观察任务", items: [
        { title: "比较方向", body: "y=2x+1 与 y=-2x+1", tag: "k正负" },
        { title: "比较陡缓", body: "y=x+1 与 y=2x+1", tag: "|k|" },
        { title: "比较截距", body: "y=2x+1 与 y=2x-2", tag: "b" }
      ] }]
    },
    {
      title: "例题：由两点求解析式", subtitle: "把点的坐标代入解析式，转化为关于k、b的方程", action: "先独立写出代入后的两个方程，再核对求解步骤。",
      blocks: [["题目", "已知一次函数图像经过A(0,1)、B(2,5)，求解析式。"], ["已知条件", "A、B两点都在同一条一次函数图像上，坐标可分别代入y=kx+b。"], ["步骤1", "设解析式为y=kx+b。"], ["步骤2", "代入A(0,1)，得到b=1。"], ["步骤3", "代入B(2,5)，得到2k+b=5，所以k=2。"], ["关键判断", "两个点提供两个独立条件，能够确定k与b。"], ["结论", "解析式为y=2x+1；代回两点均成立。"], ["学生检查", "把A、B坐标分别代回解析式，结果是否都成立？"]],
      sections: [{ type: "timeline", title: "解题链条", steps: [
        { label: "01", title: "设", body: "设y=kx+b" }, { label: "02", title: "代", body: "代入两个点" }, { label: "03", title: "解", body: "求k、b" }, { label: "04", title: "验", body: "代回检验" }
      ] }, { type: "callout", title: "答案", body: "y = 2x + 1" }]
    },
    {
      title: "课堂练习：表示、判断与反馈", subtitle: "完成后不仅报答案，还要说明图像依据", action: "独立作答3分钟，与同伴交换检查1分钟，再根据反馈修正。",
      blocks: [["练习题", "函数y=-x+3中，k、b分别是多少？补全x=-1、0、1时的函数值，并画出图像。"], ["学生操作", "先独立判断参数，再列表、描点、连线，最后与同伴核对图像方向。"], ["提示", "先找(0,b)，再利用k确定另一个点。"], ["正确答案", "k=-1，b=3；对应函数值为4、3、2，图像从左向右下降。"], ["反馈", "参数判断正确、取点正确、直线方向正确、解释完整。"], ["掌握检查", "能否仅根据图像方向与y轴交点判断k和b？"]],
      sections: [{ type: "tips-grid", title: "练习与反馈", items: [
        { title: "题目一", body: "指出k、b并判断图像方向", tag: "判断" },
        { title: "题目二", body: "列3组对应值并完成作图", tag: "作图" },
        { title: "作答区", body: "写参数 -> 列表 -> 描点 -> 连线", tag: "学生输出" },
        { title: "核对", body: "方向、截距、取点、解释四项互评", tag: "反馈" }
      ] }]
    },
    {
      title: "总结与作业", subtitle: "回扣概念、多种表示、参数作用和基础应用", action: "用一分钟完成自评，并选择一项作业延伸。",
      blocks: [["概念", `${baseEquation}，k不等于0。`], ["表示", "数值表、解析式和图像可以互相转换。"], ["参数", "k决定方向与陡缓，b决定y轴截距。"], ["方法", "求式、列表、描点、连线、检验。"], ["作业", "完成两道基础题；选一个生活情境建立一次函数模型并作图。"]],
      sections: [{ type: "tips-grid", title: "本课知识闭环", items: [
        { title: "概念", body: "结构与条件" }, { title: "表示", body: "表、式、图互相对应" }, { title: "参数", body: "k与b解释图像" }, { title: "应用", body: "由条件求式并检验" }
      ] }, { type: "callout", title: "作业延伸", body: "基础：完成课后题1-2；延伸：选择一个线性变化情境，写解析式、列表并作图。" }]
    }
  ];
  return pages.map((page, index) => {
    const pagePlan = input.slidePagePlans[index];
    const layoutPlan = input.layoutPlans[index];
    return {
      contentDraftId: `teacher-math-draft-${index + 1}`,
      planId: input.contentPlan.planId, pagePlanId: pagePlan.pagePlanId, layoutPlanId: layoutPlan.layoutPlanId,
      slideIndex: index + 1, pptType: "courseware", role: pagePlan.role, finalTitle: page.title, subtitle: page.subtitle,
      leadSentence: page.subtitle,
      visibleBlocks: page.blocks.map(([title, body, tag], blockIndex) => ({ type: blockIndex === 0 ? "point" as const : "example" as const, title, body, tag, priority: "must" as const })),
      evidenceSnippets: [{ text: "依据教师提供的课程材料与课堂目标生成。", reliability: "user_claim" as const, confidence: 88, visible: false }],
      actionText: page.action, speakerNotes: `${page.subtitle} 学生活动：${page.action}`, sourceUseSummary: "教师输入材料", confidenceNote: "",
      contentQualityChecks: { titleLengthOk: true, titleIsConclusion: true, visibleBlocksPresent: true, scaffoldFree: true, evidenceRealized: true, noInternalFields: true, lowConfidenceMarked: true },
      blockedScaffoldTerms: [], warnings: [], sections: page.sections
    };
  });
}
