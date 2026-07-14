# 架构说明

## 唯一产品入口

`/teacher-ai-ppt` 是教师课件主入口。旧页面不得与其争夺主流程；可复用能力应通过领域模块、API 或适配器迁移，而不是复制旧交互。

## 事实链

```text
Teacher Brief
  → ContentPlan / Teacher Context
  → TeacherDeckPlan state machine
  → DeckSpec + DesignSlide[]
  → immutable CoursewareVersion
  → RenderScene[]
  → Browser renderer / PPTX renderer
  → Visual QA + CoursewareArtifact
```

核心原则：

1. `DeckSpec` 决定页面目标、顺序、证据和版式意图，不使用固定页数模板代替策划。
2. 用户或 AI 修改必须基于当前版本提交并创建新版本；旧版本保持不变。
3. 版本化导出只读取服务器冻结版本，不信任浏览器提交的页面副本。
4. 浏览器预览和 PPTX 适配器消费同一 `RenderScene` 坐标与元素模型。
5. 视觉 QA 失败时阻断交付，不能把失败产物伪装为完成。

## 主要模块

- `lib/teacher-deck-plan-state.ts`：教师大纲与页面规划状态机。
- `lib/courseware-version.ts`：版本事实源及导出源读取。
- `lib/visual-compiler/`：版式协议、场景编译、页面 Gate、QA、浏览器/PPTX 适配。
- `lib/pptx-template-poc/`：PPTX 模板解析隔离 POC。
- `app/api/courseware-version/`：版本读取与提交。
- `app/api/export-pptx/`：冻结版本验收、渲染及 Artifact 写入。
- `components/TeacherWorkspace.tsx`：教师课件工作区。

## 模板隔离

外部 PPTX 模板先解析为只读 manifest 和 `LayoutContract`，再由运行时评分器选择。解析阶段不得修改模板注册表、项目版本或数据库。模板候选低于门槛时明确回退教师内置协议。

## 外部工具边界

第三方项目仅作为思路或协议参考。引入代码前必须核对许可证、保留声明并隔离不兼容许可证。当前相关声明见 `THIRD_PARTY_NOTICES.md`。

