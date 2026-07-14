---
title: Teacher AgentPPT 可视化汇报总览
type: project-report
project: 教师AI演示文稿
status: partial-verification
updated: 2026-07-15
tags:
  - 教师AI演示文稿
  - AgentPPT
  - 可视化汇报
  - 069
aliases:
  - Teacher AgentPPT 汇报页
  - 教师 AI PPT 运行逻辑图
---

# Teacher AgentPPT｜可视化汇报总览

> [!summary] 一句话结论
> 教师 AgentPPT 已从“固定页面演示”推进到具有真实策划状态机、不可变版本链、统一视觉场景和可编辑 PPTX 导出的产品候选；后端与视觉主干已有自动化证据，但真人按钮全流程、真实图片同源链和模板主入口仍在收口，因此当前状态保持 **PARTIAL / VERIFICATION**，不标记为客户可用。

## 01 / 汇报卡片

| 维度 | 当前结论 | 证据或边界 |
|---|---|---|
| 唯一入口 | `/teacher-ai-ppt` | 旧入口不进入教师主流程 |
| 公开代码仓 | [teacher-agentPPT](https://github.com/liaoj0330-bot/teacher-agentPPT) | `main`，提交 `f6e96df` |
| 冻结版本链 | 已建立并通过真实临时数据库 E2E | 版本读取、409 冲突、教材、对话、导出 Artifact 等 10/10 |
| 页面规划 | 已建立，不固定 9 页 | `TeacherDeckPlan + DeckSpec` 决定页数与页面职责 |
| 视觉编译 | 已建立 | 13 类教师布局、RenderScene、页面 Gate、视觉 QA |
| PPTX 导出 | 已进入统一场景绘制 | 原生文本、形状、表格和图表；不是整页截图 |
| 真人交互 | 部分完成 | 生成前后完整按钮验收仍需最终跑通 |
| 真实出图 | 待完整验收 | 火山/品川需分别验证鉴权、真实图片、超时与降级 |
| 模板能力 | POC 已完成，主入口未闭环 | 模板解析和评分已存在，选择/持久化/版本化待接入 |
| 商业状态 | 尚未成立 | 工程能力不等于真实教师采用和商业交付 |

## 02 / 项目关系图

```mermaid
flowchart LR
    EDU[高校 AI 教育体系<br/>现实事业主航道]
    P08[教师 AgentPPT<br/>教育场景产品候选]
    SUN[Sundun<br/>可复用工程能力]
    TS[TianShu<br/>判断与项目记忆底座]
    GH[GitHub teacher-agentPPT<br/>公开代码事实源]
    TEACHER[真实教师与教材<br/>需求和采用证据]

    TS --> P08
    SUN --> P08
    GH --> P08
    TEACHER --> P08
    P08 --> EDU

    classDef product fill:#e8f3ef,stroke:#11756d,color:#173d36
    classDef asset fill:#edf1f8,stroke:#3c66a6,color:#213c62
    classDef evidence fill:#fff4e8,stroke:#d27a23,color:#5b3514
    class P08 product
    class SUN,TS,GH asset
    class TEACHER,EDU evidence
```

边界：Sundun 是工程资产，教师 AgentPPT 是产品候选，高校 AI 教育体系是上层事业路径；三者不可混写。

## 03 / 真实用户运行逻辑

```mermaid
flowchart TD
    A[教师进入唯一主入口] --> B[选择备课任务]
    B --> C[填写学段 年级 学科 课题]
    C --> D[绑定教材 章节 教学要求]
    D --> E[对话澄清教学目标与课堂表达]
    E --> F[生成 ContentPlan]
    F --> G[大纲状态机规划页面职责和页数]
    G --> H[形成 DeckSpec + DesignSlide]
    H --> I[创建不可变 CoursewareVersion]
    I --> J[统一 RenderScene 编译]
    J --> K[浏览器逐页编辑与预览]
    J --> L[可编辑 PPTX 导出]
    K --> M{教师修改或 AI 建议?}
    M -->|是| N[基于当前版本提交新版本]
    N --> J
    M -->|否| O[教师复核与交付判断]
    L --> O

    O --> P{质量门通过?}
    P -->|通过| Q[生成版本绑定 Artifact]
    P -->|失败| R[阻断交付并定位失败页面]
    R --> N
```

关键变化：不是“点击一次生成固定 9 页”，而是先规划页面职责，再按课程内容决定页数，并允许逐页失败、逐页重试。

## 04 / 系统架构与事实来源

```mermaid
flowchart TB
    subgraph UX[教师交互层]
      ENTRY[/teacher-ai-ppt]
      CHAT[备课对话]
      EDITOR[课件编辑器]
    end

    subgraph PLAN[策划与内容层]
      CONTEXT[Teacher Context]
      STATE[TeacherDeckPlan 状态机]
      SPEC[DeckSpec]
      SLIDES[DesignSlide 数组]
    end

    subgraph TRUTH[服务器事实层]
      PROJECT[CoursewareProject]
      VERSION[CoursewareVersion<br/>不可变快照]
      HASH[DeckSpec Hash]
      ARTIFACT[CoursewareArtifact]
    end

    subgraph VISUAL[统一视觉编译层]
      CONTRACT[13 类 LayoutContract]
      SCENE[RenderScene]
      GATE[Page Gate]
      QA[Visual QA]
    end

    subgraph OUTPUT[输出适配层]
      BROWSER[BrowserSceneRenderer]
      PPTX[PptxSceneRenderer]
      TEMPLATE[PPTX Template Parser POC]
      IMAGE[Image Provider<br/>待完整同源验收]
    end

    ENTRY --> CHAT --> CONTEXT --> STATE --> SPEC
    SPEC --> SLIDES --> VERSION
    PROJECT --> VERSION --> HASH
    VERSION --> SCENE
    CONTRACT --> SCENE
    TEMPLATE -.候选布局.-> CONTRACT
    IMAGE -.版本化图片待闭环.-> SCENE
    SCENE --> GATE --> QA
    QA -->|通过或需复核| BROWSER
    QA -->|通过| PPTX --> ARTIFACT
    QA -->|失败| BLOCK[阻断导出]
    EDITOR --> VERSION
```

## 05 / 不可变版本链

```mermaid
sequenceDiagram
    participant T as 教师
    participant UI as Teacher Workspace
    participant API as Version API
    participant DB as CoursewareVersion
    participant VC as Visual Compiler
    participant EX as PPTX Export

    T->>UI: 修改标题/版式/教材/课堂问题
    UI->>API: projectId + baseVersionId + operation
    API->>DB: 检查 baseVersion 是否当前版本
    alt 版本已过期
        DB-->>API: conflict
        API-->>UI: 409 version_conflict
    else 版本有效
        API->>DB: 创建 V(n+1)，V(n) 保持不变
        DB-->>UI: 新 versionId + versionNumber
    end
    T->>UI: 导出指定版本
    UI->>EX: 只提交 projectId + versionId
    EX->>DB: 读取冻结 DeckSpec + slides
    DB->>VC: 编译 RenderScene + QA
    alt QA 失败
        VC-->>EX: failed
        EX-->>UI: 422，记录失败 Artifact
    else QA 通过
        VC->>EX: 场景列表
        EX->>DB: 写入绑定版本哈希的 PPTX Artifact
        EX-->>UI: 下载可编辑 PPTX
    end
```

## 06 / 规划状态机与单页重试

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Generating: 开始生成计划
    Generating --> Reviewing: 大纲生成完成
    Reviewing --> Confirmed: 教师确认大纲
    Confirmed --> Compiling: 逐页编译
    Compiling --> Ready: 全部页面通过
    Compiling --> Failed: 当前页 Gate 失败
    Failed --> Compiling: 仅重试失败页
    Reviewing --> Draft: 返回修改需求
    Ready --> Reviewing: 新版本继续调整
```

页面 Gate 的三类动作：

| 状态 | 动作 | 含义 |
|---|---|---|
| `passed` | `continue` | 当前页完成，进入下一页 |
| `review_required` | `review_page` | 页面可用，但需要教师复核 |
| `failed` | `retry_current_page` | 保留已完成页面，只重试当前页的内容、布局或渲染阶段 |

## 07 / 浏览器与 PPTX 同源视觉逻辑

```mermaid
flowchart LR
    SPEC[DeckSpec] --> SELECT[版式选择]
    SLIDE[DesignSlide] --> BUILD[Scene Builder]
    LAYOUT[LayoutContract] --> SELECT
    SELECT --> BUILD
    BUILD --> SCENE[RenderScene<br/>统一坐标与元素]
    SCENE --> QA[边界 重叠 字号 溢出 可编辑性]
    QA --> BROWSER[浏览器适配器]
    QA --> PPTX[PPTX 适配器]
    BROWSER --> PAGE[逐页真实变化]
    PPTX --> OBJECTS[原生可编辑对象]

    classDef truth fill:#e8f3ef,stroke:#11756d,color:#173d36
    class SCENE truth
```

当前真实边界：文本、形状、表格、图表已经进入统一场景；AI 图片仍需完成“供应商响应 → 版本绑定 → RenderScene → 浏览器/PPTX”闭环。

## 08 / 当前进度图

> [!warning] 估算口径
> 下图是工程推进估算，不是客户验收分数，也不代表商业成熟度。

```mermaid
pie showData
    title Teacher AgentPPT 当前工程推进估算
    "已完成并有证据" : 76
    "仍需收口" : 24
```

| 层级 | 估算 | 当前判断 |
|---|---:|---|
| 版本事实源与后端链 | 90% | 主链稳定，有 10/10 E2E |
| 策划状态机与页面 Gate | 85% | 已接入，仍需更多真实课程覆盖 |
| 统一视觉编译 | 80% | 浏览器/PPTX 同源主干建立 |
| 可编辑 PPTX 导出 | 80% | 结构验证通过，需更多视觉成品复核 |
| 浏览器真人交互 | 60% | 自动化脚本修复中，完整流程未最终通过 |
| 模板主入口 | 50% | 解析/评分完成，持久化交互待接入 |
| 市场交付成熟度 | 65% | 尚缺真实教师封闭验证和生产运行证据 |

## 09 / 验收证据矩阵

| 验收项 | 状态 | 证据 |
|---|---|---|
| TypeScript | 通过 | 全新安装后 `tsc --noEmit` |
| Production Build | 通过 | Next.js 生产构建；主入口及必要 API 进入路由表 |
| 大纲状态机 | 通过 | 6 页非固定页数回归，失败后单页重试 |
| 13 类教师版式 | 通过 | 概念、例题、练习等页面产生不同槽位结构 |
| 模板解析与评分 | 通过 POC | 读取 master/layout/theme/placeholder，低分明确回退 |
| 版本化交互 | 10/10 | 临时 SQLite、真实 HTTP、不可覆盖版本链 |
| PPTX 可编辑结构 | 通过 | 解包 PPTX，逐页存在独立文本和形状对象 |
| 真人按钮全流程 | 未最终通过 | 脚本已补逐步落盘和场景切页断言，需继续实跑 |
| 火山/品川真实出图 | 未最终通过 | 不能因生成前按钮阻塞而误判供应商失败 |
| 商业交付 | 未成立 | 无真实教师采用与持续生产运行证据 |

## 10 / 下一步优先级

```mermaid
flowchart TD
    P0[优先级 0<br/>跑通真人按钮全流程] --> P1[优先级 1<br/>分别实测火山与品川]
    P1 --> P2[优先级 2<br/>图片进入冻结版本和统一场景]
    P2 --> P3[优先级 3<br/>模板选择 持久化 版本追踪]
    P3 --> P4[优先级 4<br/>多课程视觉成品复核]
    P4 --> P5[优先级 5<br/>真实教师封闭验证]
```

### 汇报时应明确说

1. 已建立真实版本链、策划状态机和可编辑 PPTX 主干。
2. 已经不是固定 9 页的演示逻辑，每页职责与页数由课程策划决定。
3. 浏览器和 PPTX 已开始共用统一视觉场景。
4. 当前仍是产品候选，真人交互、出图同源和模板主入口尚未完成。

### 汇报时不能说

- 不能说已经商业化或可直接面向所有教师交付。
- 不能把 10/10 后端 E2E 写成完整产品 100% 通过。
- 不能把占位图、降级图或供应商未调用写成真实出图成功。
- 不能把 Sundun 工程能力等同于教师 AgentPPT 产品采用成立。

## 11 / 关联入口

- [[30_项目推进区/02_教师AI演示文稿推进台|教师 AI 演示文稿推进台]]
- [[06_项目记忆层/03_智能演示文稿系统/项目记忆首页|Sundun 工程能力现状]]
- [[06_项目记忆层/03_智能演示文稿系统/项目状态卡|项目状态卡]]
- [[06_项目记忆层/03_智能演示文稿系统/P08_教师AI_PPT_069_070_阶段裁定_20260713|069/070 阶段裁定]]
- [[07_资产索引层/03_智能演示文稿系统/03_当前事实来源表|当前事实来源表]]

