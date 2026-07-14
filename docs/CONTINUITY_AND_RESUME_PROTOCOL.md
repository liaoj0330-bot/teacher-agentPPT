# Teacher AgentPPT 连续推进与会话续跑协议

## 目的

本协议解决的不是“怎么保存聊天记录”，而是关闭浏览器、切换模型、重新接入 API 或更换执行者后，如何在不重复踩坑、不夸大进度、不污染主流程的前提下继续完成产品。

核心原则：**聊天不是事实源；可验证状态、版本、证据和失败案例才是事实源。**

## 五层连续性结构

```text
目标契约 Goal Contract
  ↓
当前事实快照 Current State
  ↓
运行事件账本 Run Ledger
  ↓
失败案例库 Failure Cases
  ↓
会话交接包 Session Handoff
```

### 1. 目标契约

长期不随会话变化的要求：

- 唯一主入口是 `/teacher-ai-ppt`。
- 做的是市场产品，不是单个 PPT 或固定流程演示。
- 页数由课程策划决定，不固定 9 页。
- 每页必须承担不同教学职责，并在切页后发生真实变化。
- 浏览器预览和 PPTX 必须来自同一内容/视觉事实源。
- 修改创建新版本，不覆盖历史版本。
- 不能用截图、占位图、前端假状态或退出码冒充成功。
- 工程通过不等于真实教师验收或商业可交付。

### 2. 当前事实快照

机器可读文件：`project-state/teacher-agentppt.current.json`。

它只记录：

- 当前公开仓库与提交；
- 已验证事实；
- 尚未验证的卡点；
- 下一步唯一动作；
- 最近一次测试与证据；
- 恢复工作需要的最小文件和命令。

不得写入聊天中的猜测、计划中的能力或没有证据的完成度。

### 3. 运行事件账本

未来 API 应以 append-only 事件记录运行，而不是覆盖一个模糊的 `status`：

```json
{
  "eventId": "evt-...",
  "projectKey": "teacher-agentppt",
  "sessionId": "session-...",
  "eventType": "test_failed",
  "scope": "browser_acceptance.generate",
  "occurredAt": "ISO-8601",
  "baseCommit": "git sha",
  "evidence": [{ "kind": "log", "path": "...", "sha256": "..." }],
  "summary": "生成请求没有发出",
  "nextAction": "先验证按钮点击和网络请求，不归因图片供应商"
}
```

重要事件包括：`session_started`、`code_changed`、`test_passed`、`test_failed`、`decision_confirmed`、`artifact_created`、`handoff_created`。

### 4. 失败案例库

机器可读文件：`project-state/teacher-agentppt.failure-cases.json`。

每个案例必须包含：

- 稳定编号和错误指纹；
- 当时看起来像什么；
- 根因是什么；
- 如何快速识别；
- 正确修复顺序；
- 防复发测试；
- 是否经过人类确认。

失败只能在“可复现 + 已修复 + 回归通过”后提升为规则，不能由模型自行把一次偶发现象写成永久规则。

### 5. 会话交接包

每次停止前必须输出：

1. 本轮实际改变了什么；
2. 哪些检查真实通过；
3. 哪些检查失败或未执行；
4. 当前服务/进程状态；
5. 工作区与 Git 状态；
6. 下一步唯一动作；
7. 恢复所需命令；
8. 不能重复执行或不能误判的事项。

## 新会话启动顺序

新 API 或新执行者必须严格按顺序恢复：

1. 读取 `README.md`。
2. 读取 `project-state/teacher-agentppt.current.json`。
3. 读取 `project-state/teacher-agentppt.failure-cases.json`。
4. 检查当前工作区、Git 分支、远端和未提交修改。
5. 检查 3002 端口及 `/teacher-ai-ppt` 健康状态。
6. 只执行 `nextAction` 指定的首个动作。
7. 产生证据后更新状态，不从聊天记忆猜测完成度。

## 计划中的 Resume API

以下接口是后续实现合同，当前不表示已经完成：

### `GET /api/project-resume?projectKey=teacher-agentppt`

返回目标契约、当前快照、最近事件、未关闭失败案例、下一步动作和必要证据路径。

### `POST /api/project-handoff`

提交本次会话的变更、验证、失败、风险和下一步，服务端生成不可覆盖的 handoff 版本。

### `POST /api/failure-cases`

登记失败候选。未经复现和人类确认，状态只能是 `candidate`。

### `POST /api/failure-cases/{id}/promote`

只有同时满足复现证据、修复提交、回归测试和人工确认，才能从 `candidate` 提升为 `active_rule`。

## 自我进化边界

允许的自我进化：

- 从重复失败中形成检测器；
- 从修复证据中形成回归测试；
- 调整启动检查顺序；
- 把已确认规则写入失败案例库；
- 提醒人类进行关键验收。

不允许的自我进化：

- 自动修改目标契约；
- 因一次失败永久禁用能力；
- 没有人工确认就把推断升级为事实；
- 用更多自动化替代真实用户验收；
- 自动覆盖历史版本或删除失败证据。

## 完成口径

任何任务只有满足以下四项才写为完成：

1. 实现存在；
2. 对应路径真实执行；
3. 结果有可复核证据；
4. 人类验收标准得到满足。

缺少任意一项，状态应为 `partial`、`verification` 或 `blocked`，不能写 `complete`。

