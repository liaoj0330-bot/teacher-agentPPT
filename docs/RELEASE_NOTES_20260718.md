# Teacher AgentPPT 2026-07-18 发布说明

## 本次新增

- 教师课件生产 Skill 和可恢复的异步图片任务。
- 六学科真实生成、版本、导出和重开链路验收。
- 学段、学科、课时动态策划，不再固定 8 或 9 页。
- 教材目录库和教材匹配 API，匹配结果可贯穿方案确认。
- 8 个核心学科的初级策划覆盖矩阵。
- V3 评分、教师试用证据、反馈入口和问题追踪。
- 500 统一积分、成功结算和管理员批量补额接口。
- 100 人分批内测方案、消防队 Agent 和机器策略。
- 管理员使用率与稳定性看板。
- 教师主动图片权限、异步生图和服务端熔断开关。

## 主要入口

- 教师工作台：`/teacher-ai-ppt`
- 管理员看板：`/teacher-ai-ppt/admin`
- AI 健康检查：`/api/health-ai`
- 监控 API：`/api/admin/beta-monitor?hours=24`

## 发布状态

本次是“本地 RC 和内测能力加固”，不是多实例商业正式版。首批云端部署必须使用持久磁盘和单实例服务，并按 10 位种子老师开始验证。

## 已知上线门槛

- 一次性邀请码尚未数据库化。
- SQLite、本地文件和进程内图片 Worker 尚未迁移到云原生基础设施。
- 每日配额尚未全部服务端硬限制。
- 云端备份恢复、外部告警和容量压测需要在目标服务器完成。

## 配套文档

- `docs/DEPLOYMENT_MANUAL_20260718.md`
- `docs/TEACHER_USER_MANUAL_20260718.md`
- `docs/ADMIN_OPERATIONS_MANUAL_20260718.md`
- `docs/WAVE_100_PRIVATE_BETA_PLAYBOOK_20260718.md`
- `agents/private-beta-fire-response-agent.md`
