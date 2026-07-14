# Teacher AgentPPT

面向教师备课场景的 AI 课件产品。主入口为：

```text
http://127.0.0.1:3002/teacher-ai-ppt
```

项目目标不是生成固定页数的演示稿，而是建立一条可追溯的真实产品链：教师需求澄清 → 教材与证据绑定 → 课程策划 → 逐页内容与版式规划 → 可编辑 PPTX → 版本与审核交付。

## 当前能力

- 教师备课对话、教学上下文和教材信息采集。
- `DeckSpec` 驱动的逐页策划，不限制固定 9 页。
- 13 类教师课件版式协议及逐页内容预算。
- 页面 Gate、单页重试、视觉 QA 和失败阻断。
- 不可覆盖的课件版本链、冲突检测和冻结版本导出。
- 浏览器预览与版本化 PPTX 共用 `RenderScene` 视觉模型。
- PPTX 以原生文本、形状、表格和图表输出，核心内容保持可编辑。
- PPTX 模板解析与运行时版式评分 POC；未通过门槛时明确回退内置教师版式。

## 运行

要求：Node.js 20+、npm。

```bash
npm install
cp .env.example .env.local
npm run dev
```

打开 `http://127.0.0.1:3002/teacher-ai-ppt`。

数据库初始化方式以 `prisma/schema.prisma` 和 `prisma/migrations/` 为准。不要提交本地 `prisma/dev.db`。

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

版本化 E2E 会使用临时数据库和独立端口，验证冻结版本、不可覆盖编辑、409 冲突、教材附加、对话应用、导出 Artifact、视觉生成绑定和 PPTX 内部可编辑对象结构。

## 当前成熟度

当前是持续开发中的产品候选，不应标记为商业正式版。版本事实源、视觉编译和可编辑导出主干已建立；完整真人按钮验收、真实图片供应商链路、模板主入口持久化仍在收口。

详细信息：

- [Obsidian 可视化汇报总览](docs/obsidian/TEACHER_AGENTPPT_可视化汇报总览_20260715.md)
- [卡点复盘与续跑协议](docs/obsidian/TEACHER_AGENTPPT_卡点复盘与续跑协议_20260715.md)
- [连续推进与会话恢复合同](docs/CONTINUITY_AND_RESUME_PROTOCOL.md)
- [失败防复发手册](docs/FAILURE_PLAYBOOK.md)
- [自媒体复盘素材库](docs/SELF_MEDIA_REVIEW_BANK.md)
- [架构说明](docs/ARCHITECTURE.md)
- [进度与剩余风险](docs/STATUS.md)
- [安全与数据合规](SECURITY.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)

## 仓库合规

仓库不应包含：真实密钥、`.env.local`、SQLite 数据库、教师上传材料、导出的 PPTX/PDF、浏览器验收产物、Next.js 缓存、日志或临时补丁。

