# Teacher AgentPPT

> 从教材和教学目标出发，生成可编辑、可追溯、可复核的课堂课件。

Teacher AgentPPT 是面向教师真实备课流程的 AI 课件产品。教师可以从课题、教材章节、教学要求、已有教案或旧课件开始，让系统完成课程策划、逐页设计、课前检查和可编辑 PPTX 导出。

它不是把任何主题套进固定九页模板，也不是生成一组无法继续修改的图片。页面数量、例题、练习、课堂提问和内容节奏由教学任务决定；教师或 AI 的每次修改都会形成新版本，原稿不会被静默覆盖。

当前项目处于持续验证中的产品候选阶段，适合教育产品团队、开发者和试用教师参与测试，尚未标记为商业正式版。

## 解决什么问题

教师制作课件通常不是从一句提示词开始，而是从教材、课标、教案和课堂目标开始。通用 PPT 生成工具容易遇到几个问题：

- 内容脱离教材，只是围绕课题扩写通用知识。
- 每次生成相似的固定结构，无法反映真实教学节奏。
- 输出变成整页图片，教师下载后难以继续修改。
- AI 修改直接覆盖原稿，无法比较、回退和追踪。
- 页面看起来完整，但文字溢出、层级混乱或不适合课堂投影。

Teacher AgentPPT 围绕这些问题建立一条完整链路：

```text
教学任务
  -> 教材与材料绑定
  -> 课程内容策划
  -> 逐页目标与版式规划
  -> 课堂可读性检查
  -> 可编辑 PPTX
  -> 教师复核与版本交付
```

## 三种典型用法

### 从教材章节开始备课

填写学段、年级、学科、课题、教材章节和教学要求。系统先澄清教学任务，再规划导入、概念讲解、例题、练习、反馈和小结等页面职责。

### 把现有材料整理成课件

上传教案、教材节选、PDF、Word 或旧课件，让已有材料进入内容策划和页面证据链，而不是脱离材料从零生成。

### 优化课件但保留原稿

教师可以要求 AI 修改标题、重做某一页、增加课堂提问或补充练习。每次确认后的修改都会形成新版本，旧版本继续保留。

## 为什么不只是另一个 PPT 生成器

| 产品能力 | 教师获得的结果 |
|---|---|
| 动态课程策划 | 页数和结构由教学内容决定，不套固定页数模板 |
| 教材与证据绑定 | 课件优先使用教师提供的教材、教案和补充材料 |
| 13 类教师课件版式 | 导入、概念、例题、练习、活动和总结拥有不同页面结构 |
| 原生 PPTX 输出 | 文字、形状、表格和图表可在 PowerPoint 中继续编辑 |
| 不可覆盖版本链 | AI 修改不会静默覆盖原稿，可追踪、比较和回退 |
| 页面 Gate 与视觉 QA | 导出前检查重叠、溢出、字号和课堂可读性 |
| 单页修复与重试 | 某一页失败时保留其他页面，只处理当前问题页 |

## 当前已经做到

- 教师备课对话、教学上下文和教材信息采集。
- `DeckSpec` 驱动的动态逐页策划，不限制固定页数。
- 13 类教师课件版式协议及逐页内容预算。
- 页面 PASS / REVIEW / FAIL Gate、单页重试和视觉 QA。
- 不可覆盖的课件版本链、过期版本冲突检测和冻结版本导出。
- 浏览器预览与版本化 PPTX 共用 `RenderScene` 视觉模型。
- PPTX 使用原生文本、形状、表格和图表，核心内容保持可编辑。
- PPTX 模板解析与运行时版式评分 POC，不合格模板会明确回退内置版式。
- 版本事实源 E2E 最近一次验证为 10/10 通过。

## 当前仍在收口

- 完整真人按钮流程的最终验收。
- 图片供应商真实调用、失败降级与版本同源链路。
- 模板选择、持久化和版本追踪进入教师主工作区。
- 更多学科、教材和真实课堂场景的封闭测试。
- 生产部署、监控、备份和容量验证。

这些边界不会被包装成已经完成。详细状态见 [进度与剩余风险](docs/STATUS.md)。

## 快速开始

要求：Node.js 20+、npm。

```bash
git clone https://github.com/liaoj0330-bot/teacher-agentPPT.git
cd teacher-agentPPT
npm install
cp .env.example .env.local
npm run dev
```

打开：

```text
http://127.0.0.1:3002/teacher-ai-ppt
```

模型和图片供应商通过 `.env.local` 配置。不要把真实密钥提交到 Git。数据库初始化方式以 `prisma/schema.prisma` 和 `prisma/migrations/` 为准，本地 `prisma/dev.db` 不进入仓库。

## 产品架构

```text
Teacher Brief
  -> ContentPlan / Teacher Context
  -> TeacherDeckPlan state machine
  -> DeckSpec + DesignSlide[]
  -> immutable CoursewareVersion
  -> RenderScene[]
  -> Browser renderer / PPTX renderer
  -> Visual QA + CoursewareArtifact
```

架构的核心原则：

1. 先规划每页要解决的教学问题，再生成页面。
2. 用户或 AI 修改创建新版本，旧版本保持不变。
3. 导出只读取服务器冻结版本，不信任浏览器中的临时副本。
4. 浏览器预览与 PPTX 使用同一视觉场景模型。
5. 视觉 QA 失败时阻断交付，不把失败产物标记为完成。

详细设计见 [架构说明](docs/ARCHITECTURE.md)。

## 验证

```bash
npm run lint
npm run teacher-outline:domain-test
npm run teacher-template-poc:test
npm run teacher-visual-contract:test
npm run teacher-render-scene:test
npm run teacher-visual-qa-v2:test
npm run teacher-page-gate:test
npm run teacher-layout-protocol:test
npm run teacher-template-layout:test
node scripts/teacher-069-version-truth-e2e.mjs
```

版本化 E2E 使用临时数据库和独立端口，验证冻结版本、不可覆盖编辑、409 冲突、教材附加、对话应用、导出 Artifact、视觉生成绑定，以及 PPTX 内部可编辑对象结构。

## 项目资料

- [进度与剩余风险](docs/STATUS.md)
- [架构说明](docs/ARCHITECTURE.md)
- [安全与数据合规](SECURITY.md)
- [连续推进与会话恢复合同](docs/CONTINUITY_AND_RESUME_PROTOCOL.md)
- [失败防复发手册](docs/FAILURE_PLAYBOOK.md)
- [自媒体复盘素材库](docs/SELF_MEDIA_REVIEW_BANK.md)
- [Obsidian 可视化汇报总览](docs/obsidian/TEACHER_AGENTPPT_可视化汇报总览_20260715.md)
- [卡点复盘与续跑协议](docs/obsidian/TEACHER_AGENTPPT_卡点复盘与续跑协议_20260715.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)

## 安全与仓库边界

仓库不应包含：

- 真实密钥、Token、Cookie 或 `.env.local`。
- 教师上传的教材、教案、学生信息和私人文件。
- SQLite 开发数据库、日志和浏览器会话。
- 导出的 PPTX、PDF、验收截图或临时补丁。
- `.next`、本机缓存和其他生成产物。

教师材料默认视为私有数据。接入外部模型前，部署方需要确认数据处理协议、材料授权和适用的安全要求。

