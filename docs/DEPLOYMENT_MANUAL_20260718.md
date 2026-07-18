# Teacher AgentPPT 云端部署与更新手册

适用版本：2026-07-18 的 `main` 分支。目标读者是第一次部署 Next.js 项目的负责人。

## 1. 先说清楚 GitHub 和部署的区别

GitHub 只保存代码，不会替你运行图片接口、数据库、文件上传或 PPTX 导出。

| 方式 | 当前是否适合 | 原因 |
| --- | --- | --- |
| GitHub 仓库 | 适合保存和协作 | 只保存代码，不提供运行服务 |
| GitHub Pages | 不适合 | 只能托管静态页面，当前项目需要 Next.js 服务端 API |
| Vercel/Netlify 默认 Serverless | 不建议用于正式内测 | 当前使用 SQLite、本地文件和进程内图片任务，实例文件可能丢失，长任务也可能超时 |
| 带持久磁盘的单台 Linux 云服务器 | 当前推荐 | 可以保存 SQLite、上传材料、导出文件并运行长任务 |
| 多实例集群 | 暂不支持 | 需要先迁移 PostgreSQL、对象存储和外部任务队列 |

当前最稳妥的方案是：**GitHub 保存代码 + 一台有持久磁盘的云服务器运行应用 + HTTPS 域名访问**。

## 2. 当前上线边界

可以部署验证的能力：

- 注册、登录和 30 天会话。
- 教材章节、教案材料、已有 PPT 三条备课入口。
- 课堂方案确认、动态页数生成、版本保存和 PPTX 导出。
- 教师主动图片生成、异步图片任务和成功后扣积分。
- 500 初始积分、管理员补额接口、反馈入口和管理员监控页。
- 图片总开关和消防队处置规范。

仍未达到多实例商业化上线的能力：

- `BETA_MASTER_INVITE_CODES` 目前是共享主码列表，不是“一码一人、激活即失效”的数据库邀请码。
- 每日课件/图片配额目前主要是运营政策，尚未全部做成服务端硬限制。
- 数据库是 SQLite，文件保存在本机 `artifacts/`，不能直接横向扩容。
- 异步图片任务由 Web 进程内执行，不是独立 Worker 队列。
- 管理看板读取数据库事实，但云主机、网关和供应商的外部告警尚未自动接入。

因此首轮必须按 `10 + 20 + 30 + 40` 分批，不应一次性让 100 位老师同时生成。

## 3. 服务器准备

建议起步配置不是容量承诺：

- Ubuntu 22.04/24.04 或同类 Linux。
- Node.js 20 或更高版本，npm 可用。
- Python 3，用于部分材料解析。
- 起步可使用 4 vCPU、8 GB 内存和至少 50 GB 持久磁盘。
- 域名、HTTPS 证书和反向代理。
- 服务器时间设为 Asia/Shanghai，或至少确保日志使用统一时区。

100 人是否可以扩批，必须以真实监控数据决定，不能只根据服务器规格判断。

## 4. 第一次安装

```bash
git clone https://github.com/liaoj0330-bot/teacher-agentPPT.git
cd teacher-agentPPT
npm ci
cp .env.example .env.production
```

将 `.env.production` 权限限制为服务账号可读：

```bash
chmod 600 .env.production
```

不要把 `.env.production`、`.env.local`、数据库、上传材料、导出文件或 API Key 提交到 GitHub。

## 5. 生产环境变量

最低配置示例。尖括号内容必须在服务器上替换，不能照抄到仓库。

```dotenv
NODE_ENV=production
DATABASE_URL=file:/var/lib/teacher-agentppt/prod.db
AUTH_COOKIE_SECURE=true

OPENAI_API_KEY=<文本模型服务端密钥>
OPENAI_BASE_URL=<文本模型兼容接口地址>
OPENAI_MODEL=<已验证的文本模型名>
OPENAI_WIRE_API=chat
OPENAI_TIMEOUT_MS=120000

BETA_REQUIRE_INVITE=true
BETA_MASTER_INVITE_CODES=<逗号分隔的内测共享主码>
BETA_INITIAL_CREDITS=500
BETA_ENABLE_REFERRAL_REWARD=false
BETA_REFERRAL_CREDITS=0
BETA_ADMIN_EMAILS=<逗号分隔的管理员登录邮箱>

BETA_IMAGE_GENERATION_ENABLED=true
BETA_MAX_IMAGE_PAGES=10
OPENAI_IMAGE_API_KEY=<图片模型服务端密钥>
OPENAI_IMAGE_BASE_URL=https://api.xcode.hk
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_IMAGE_ENDPOINT=/v1/images/generations
OPENAI_IMAGE_QUALITY=low
OPENAI_IMAGE_SIZE=1024x1024
OPENAI_IMAGE_TIMEOUT_MS=240000
OPENAI_IMAGE_CONCURRENCY=3
OPENAI_IMAGE_MAX_IMAGES=4

REAL_SEARCH_ENABLED=true
PUBLIC_SEARCH_PROVIDER=bing
PUBLIC_SEARCH_TIMEOUT_MS=12000
PUBLIC_SEARCH_MAX_RESULTS=8
PUBLIC_SEARCH_MAX_CONTENT_CHARS=12000
PUBLIC_SEARCH_REQUIRE_URL=true
```

说明：

- 图片权限只有在 `BETA_IMAGE_GENERATION_ENABLED=true` 且 `OPENAI_IMAGE_API_KEY` 有效时才真正可用。
- 正式搜索建议配置 Tavily、Serper 或 Brave 的 Key；无 Key 的 Bing HTML 仅是实验回退。
- `BETA_ADMIN_EMAILS` 必须与管理员注册时使用的邮箱完全一致。
- 正式环境必须使用 HTTPS，并保持 `AUTH_COOKIE_SECURE=true`。
- 用户曾经在聊天、截图或公开位置发过的 Key，正式上线前应在供应商后台轮换。

## 6. 初始化、检查和构建

```bash
npm run db:push
npm run lint
npm run teacher-private-beta:check
npm run teacher-fire-response-agent:test
npm run teacher-beta-monitoring:test
npm run image-provider:test
npm run build
```

`image-provider:test` 默认只检查供应商适配和密钥保护，不会自动进行付费生图。需要真实付费验收时，应由负责人限定页数后单独执行。

启动：

```bash
npm run start
```

应用默认监听 `3002` 端口。反向代理应把 HTTPS 域名转发到 `127.0.0.1:3002`。

## 7. 建议使用系统服务守护

可使用 systemd、PM2 或云平台进程守护。systemd 的核心配置示例：

```ini
[Unit]
Description=Teacher AgentPPT
After=network.target

[Service]
Type=simple
User=teacherppt
WorkingDirectory=/opt/teacher-agentPPT
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

服务账号必须能读 `.env.production`，并能写入数据库目录和项目下的 `artifacts/`。

## 8. 部署后检查

先访问：

```text
https://你的域名/api/health-ai
```

检查：

- `text.configured` 为 `true`。
- `image.configured` 为 `true`。
- `image.enabled` 为 `true`。
- `image.host`、模型名和并发数符合配置。
- 返回内容中绝不能出现完整 API Key。

然后用内部测试账号完成一次真实冒烟：

1. 使用有效邀请码注册，确认得到 500 积分。
2. 从教材章节生成一套无图课件。
3. 关闭页面后重新登录，确认项目和版本仍存在。
4. 导出 PPTX，下载两次并在 WPS/PowerPoint 中打开。
5. 主动生成 1 张图片，确认只在成功后扣分。
6. 提交一条测试反馈，记录反馈 ID。
7. 管理员访问 `/teacher-ai-ppt/admin`，确认 24 小时指标可见。

以上任一步失败，都不应继续发放下一批邀请码。

## 9. 监控入口

- 教师工作台：`/teacher-ai-ppt`
- 管理员看板：`/teacher-ai-ppt/admin`
- 监控 API：`/api/admin/beta-monitor?hours=24`
- AI 配置健康检查：`/api/health-ai`

管理员看板每 60 秒刷新一次。当前主要监控注册、活跃、生成、导出、图片、积分、反馈、成功率、P50/P90 延迟和排队时间。

## 10. 图片开关

正常开放：

```dotenv
BETA_IMAGE_GENERATION_ENABLED=true
```

图片供应商故障、费用异常或大量超时时，先改为：

```dotenv
BETA_IMAGE_GENERATION_ENABLED=false
```

修改后重启应用。关闭图片不会阻止无图课件和 PPTX 导出。不要通过删除失败记录或重复整套生图来“处理”故障。

## 11. 数据与备份

必须备份两部分：

- SQLite 数据库：用户、会话、项目、版本、积分、任务和反馈。
- `artifacts/`：上传材料、导出 PPTX 和相关产物。

建议每天备份，发布前额外备份一次。SQLite 可以用官方 `sqlite3` 工具的 `.backup` 命令生成一致性副本；不要在写入过程中直接复制数据库文件。备份后必须做恢复演练，确认账号、项目、版本和 PPTX 可重新打开。

默认运营政策：源材料、产物和应用日志保留 30 天；反馈和安全审计记录保留 180 天；删除请求在 7 天内完成。正式实施前还需把清理任务自动化。

## 12. 更新版本

每次更新按以下顺序：

1. 暂停新邀请码发放，记录当前发布提交号。
2. 备份数据库和 `artifacts/`。
3. `git pull --ff-only origin main`。
4. `npm ci`。
5. `npm run db:push`。
6. 运行类型检查、内测策略检查和本次改动相关回归。
7. `npm run build`。
8. 重启服务。
9. 检查健康接口并完成内部账号冒烟。
10. 先恢复 5 位老师，再恢复原批次。

不要在没有备份和验收证据时直接覆盖线上数据库或全量恢复流量。

## 13. 回退原则

- 优先关闭受影响功能，例如先关闭图片，而不是停掉整个产品。
- 回退到最近一个已经记录并通过冒烟的 Git 提交。
- 数据库结构不兼容时，不要自行删除表；先保存数据库副本并评估迁移。
- 回退后重新验证登录、上传、无图生成、导出、重下载、版本重开和反馈入口。
- 事故处理遵循 `agents/private-beta-fire-response-agent.md`。

## 14. 正式发首批码前的硬门槛

- HTTPS、持久磁盘、数据库和 `artifacts/` 备份恢复通过。
- 文本模型和图片模型密钥只存在服务器秘密环境。
- 管理员看板可访问，普通老师访问返回无权限。
- 生产环境开启邀请制。
- 至少完成一次真实 WPS 和一次真实 PowerPoint 打开验收。
- 10 位种子老师的联系人、学科和支持群已准备。
- 值班负责人、工程负责人、内容审核和隐私负责人已经实名确定。
- 一次性邀请码未实现前，邀请码只能人工登记和私发，不能公开扩散。

未满足以上条件时，状态应写为“代码已发布、云端内测未放量”，不能写成“正式上线”。
