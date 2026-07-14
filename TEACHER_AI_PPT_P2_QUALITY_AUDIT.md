# TEACHER AI PPT P2 Quality Audit

## 审计范围

本审计只分析当前 069 工程闭环之上的教学产品质量，不修改 069 版本链、CoursewareProject、导出 Artifact 或既有接口。

## 结论

当前系统已经具备真实上传、版本化生成、后端对话、PPTX 导出、图片嵌入和基础质量检查能力；但三种教师模式仍共享较多 Deck Pipeline，尚未形成面向教师工作的独立教学策略。

当前最明显的产品问题是：三份课件通常只有一张封面 AI 图片，内页主要依赖固定原生版式；“优化已有课件”仍接近重新生成，而不是逐页诊断和修改。

## 1. 三种模式流程审计

### 章节备课

当前支持：课题、学段、学科、教材材料、章节内容和教学目标进入统一生成链路。

缺口：没有强制生成“章节定位、教材分析、重难点、知识结构图、典型例题、课堂活动、评价设计”的独立结构；教材分析还没有成为页面主线。

### 教案生成

当前支持：能生成目标、导入、讲授、例题、练习、总结等页面。

缺口：教学过程的时间、师生活动、教师话术、学生任务和板书设计没有形成独立数据结构，页面仍可能表现为知识点摘要。

### 优化已有课件

当前支持：上传 PPT、解析页面、绑定来源、生成新版本、保留版本关系。

缺口：缺少页面级诊断对象和前后对比对象；当前没有稳定输出“原页面、问题、优化策略、优化后页面、变化说明”，因此仍可能重新生成一套课件。

## 2. 当前 DeckSpec 与 SlideRole

当前已有 `DeckSpec`、`SlideSpec`、`SlidePagePlan`、`LayoutPlan`、`visualSlots`、`evidenceSourceIds` 和 `pageIntent`。

这些字段已经能支撑结构化生产，但目前主要是通用页面规划字段，尚未完全绑定教师专属的教学角色，例如：章节教材分析、师生活动、探究任务、板书设计、课堂反馈和迁移任务。

## 3. 当前视觉生成审计

当前支持：火山生图、后端统一视觉入口、封面视觉策划、图片嵌入 PPTX。

当前问题：

- 默认生产结果通常只有封面图片；
- 导入页没有稳定的真实情境图策略；
- 探究页没有稳定的过程视觉策略；
- 例题页仍以文字卡片为主；
- 练习页没有课堂互动视觉组件；
- 图片生成计划没有与每个 `SlideRole` 强绑定；
- 前端、验收脚本和后端曾存在不同提示词入口，已开始统一但仍需全链路约束。

## 4. 当前 Example / Practice 结构

当前已有题目、步骤、答案、反馈等可见内容，能够通过基础内容检查。

缺口：尚未稳定使用以下产品级结构：

- `ExampleProblem.question`
- `givenConditions`
- `thinkingQuestion`
- `solutionSteps`
- `keyDecision`
- `commonMistakes`
- `teacherExplanation`
- `studentTry`
- `PracticeDesign.difficulty`
- `interaction`
- `teacherFeedback`
- `time`

## 5. 当前教材来源链路

当前支持上传文件解析、来源文档绑定、证据块和版本保存。

缺口：教材来源尚未稳定展示在具体 PPT 页面；教师看不到每页来自哪本教材、哪一章节、哪一个例题或哪一页材料。

## 6. 当前质量评分

当前已有工程状态、教师就绪度、视觉检查和内容检查，但 `review_required` 仍主要作为人工审核状态，尚未完全落实 Engineering Score、Visual Score、Teaching Score 三项阈值门禁。

## 7. 升级路线

### P0 优化已有课件真实化

建立页面级 `OriginalSlideDiagnosis`、`OptimizationPlan`、`OptimizedSlide` 和前后对比 Artifact。优化模式必须以原课件页面为主输入，禁止无依据地重建整套课件。

### P1 三种模式结构分流

建立 `Scenario → TeachingStrategy → DeckStructure`，分别实现章节备课、教案生成、优化已有课件的页面结构。

### P2 例题教学化

建立 `ExampleProblem` 数据结构，使例题包含教师讲解、学生思考、关键决策、易错点和迁移问题。

### P3 课堂练习真实化

建立 `PracticeDesign`，绑定难度、时间、互动方式、教师观察点和反馈策略。

### P4 视觉生成策略化

建立 `SlideRole → VisualRequirement → ImageGeneration`，让导入、探究、例题、练习、总结各自拥有视觉策略，而不是只有封面图。

### P5 教材映射展示

在页面角标或来源面板展示教材版本、章节、页码、例题来源和证据状态。

### P6 教学质量门

实现工程、视觉、教学三项评分，并根据阈值决定 `ready_for_teacher` 或 `review_required`。

## 当前执行阶段

`P0：优化已有课件真实化`

完成标准：教师能明显看出系统是在分析并优化上传课件，而不是重新生成一套模板课件。

