# Admin 线上界面与候选源码基线

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: admin_production_baseline_reconciliation
  superseded_by: null
  last_verified_at: 2026-09-12
  production_authority: false
```

## 范围和事实

- Risk: B；Process: Codex 规划和验收，Grok Build 实现；Expected PR count: 1。
- frontend_surface: admin；prospective release_unit: admin-static。
- Production/AWS impact: 无。本记录不授予发布、认证、数据库、资金、节点或真实业务读取权限。
- 工作基线：`master@ee86dab3cb043bd3b35a022e00142361e3c871c0`。主分支身份于 2026-09-12 重新读取；它不是生产 Admin 的构建来源证明。
- 用户指定目标是已登录的 `admin.gccwebos.com`，标题为 `GlobalCircle AI - Operator Console`。`#portal=start` 不代表页面属于客户 Portal。
- 该目标包含下方十个导航，而此前 ADM-03-A 使用了当前源码中的三页工作台。此前本地测试仍是其对应文件的历史证据，但 **目标不匹配，不能计为本阶段或线上 Admin 的功能验收**。原工作区改动保留，不合入本切片。

### 已证实的参考构件

2026-09-12 从用户已登录页面读取公开静态资源指针，再以不携带凭证的普通 HTTP 请求校验字节：

| 资源 | 大小（bytes） | SHA-256 |
| --- | ---: | --- |
| `index-DBS1EaJC.js` | 582452 | `7fe66a871c8e5f5094f29b7db09d448ba01c6b2e7a01a168277e8e7273713dcb` |
| `index-C8cV34to.css` | 382111 | `31bf29505a98d2a21285c30a1b8332afb97a49a1dbb26c933a71d61b59ea4944` |

两项均与保留的 `portal-entitlement-gate-20260706-205145/admin-dist` 一致；对应 Admin ZIP 的 SHA-256 为 `1922a6234ddefe6f43cc91643d3ed6fed8359e2e78ad605c36de6b1971691bab`，与 Git 对象 `ca9f5702:docs/production-replacement-records/2026-07-07-portal-entitlement-gate-activation.md` 的历史记录一致。

证明边界：以上只绑定所见主 JS/CSS 与保留构件，不证明完整部署、认证后端或所有资源的身份。原构件 `source_commit` 仍为 **UNKNOWN**。`ca9f5702` 是同族界面及历史记录候选，不能标为生产构建提交；历史 `a9cddeb3:docs/PRODUCTION_SURFACE_REPORT.md` 也明确记录了这一缺口。

## 分阶段交付

### ADM-00-A：十页本地对照基线（本切片）

建立从当前主分支可构建、可测试的隔离对照入口，明确这是新候选，不冒称恢复了丢失的原始构建提交。

- 同时要求开发构建、显式开关、loopback 主机和专用入口。
- 保留观测到的十项导航及主要布局区域；没有安全数据源的内容显示未接入，不能用旧固定值或静态成功状态代替。
- 日志页仅呈现权限和未接入提示，不注册真实日志读取、导出或其他管理动作。
- 正常 Admin 的路由、搜索、认证、权限和 API hooks 不变；生产构建不携带此对照入口。
- 不覆盖旧 `admin/` 整包，不回灌旧认证、Portal、支付、原始日志或后台写操作。
- 桌面优先；不新增手机设计或外部依赖。

本切片验收是 **源码对照基础**，不是十页业务实现完成、像素级等价、原始源码溯源闭合或生产 Ready。

### ADM-00-B：逐页数据与操作接线核对

每页分别记录已有安全 GET 接口、仅存在的领域方法、静态内容、读取反馈、权限和写操作边界。以下是目标页面清单，不是已接入接口承诺：

| 分组 | 页面 | 核对重点 |
| --- | --- | --- |
| 监测 | 运营总览 | 指标来源、窗口、更新时间、部分失败及钻取 |
| 监测 | 账户与资源 | 新旧账号主体、权益归属、资源与购买记录关联 |
| 监测 | 使用情况和渠道 | 流量、采集覆盖、新鲜度；读取不执行采集 |
| 管理 | 用户管理 | 列表/详情安全字段、分页、账号关联及越权拒绝 |
| 管理 | 订单记录 | 充值、商城消费、套餐服务分别建模；付款/扣币/履约独立状态 |
| 管理 | 节点健康状况 | 安全状态来源，不把旧节点列表当运行时健康证明 |
| 管理 | 节点带宽 | 单位、时间窗口、真实零值与缺失采集区分 |
| 日志 | 用户访问日志 | 独立授权、安全摘要、敏感字段和保留期限 |
| 日志 | 用户操作日志 | 操作者和对象关联、只读审计摘要，不等同财务账本 |
| 日志 | 节点日志 | 安全诊断摘要，不提供原始日志/配置/凭证入口 |

### ADM-01-A：账户、权益、用量只读消费者

用户已批准此切片；仍由 Grok Build 编写实现和测试、Codex 规划及验收。仅在上述十页候选中接入账户与资源、用户管理、使用情况和渠道三个页面，不回到此前目标不匹配的三页工作台。实现期间不调用生产业务 API，不改认证、后台路由或数据。

- 固定读取 `accounts`、`entitlements`、`subscription-usage-monitor` 三个 GET；不暴露采集、签发、启停、退款、导出或日志读取动作。
- 复用已有同源 Admin Cookie 传输，不读取 Cookie 内容、不增加登录流程。候选默认不查询，操作者主动读取后才调用接口；本机无代理预览不代表已登录生产。
- 三个来源分别显示加载、查询结果为空、失败、权限不足；失效会话和接口缺失独立提示。重试只重试对应来源，断开或卸载取消未完成请求，旧结果不得覆盖新请求。
- 只显示字段白名单；账户更新时间不称最后访问，权益逐条保留自己的套餐和期限，只按非空账户 ID 精确关联。未知数值不转为零。
- 用量显示已记录样本，不称本月总量、实时速率或全渠道完整计量。`generatedAt` 是响应生成时间；`lastUsageObservedAt` 才是观测时间。`not_collected` 与 `measured_zero` 必须区别。
- 账户和权益的合法空响应没有完整性证明；空结果不代表后台完整库存为零。筛选、分页仅针对本次返回记录。

实现和验收进度单独记录；本段授权与设计不是已通过验证、合并或部署的声明。

### 后续实现顺序

用户随后明确 Admin 定位为项目运行监控和问题诊断，而不是客户数据管理后台。以下顺序替代此前围绕用户、钱包和订单管理的扩展设想；保留十页候选导航作为当前接线基础，不把旧导航名称当作管理权限。

1. 第一阶段（本地只读监控）：在账户、权益、历史用量三项读取基础上加入 `traffic-collector-status`。统一名称/状态筛选、历史时间范围、分页、可切换刷新间隔、暂停、手动更新及失败反馈；资源报表只读且去除私人联系信息。安全采集摘要不是原始日志，历史流量不是实时带宽。
2. 第二阶段：根据实际缺口补齐脱敏日志查询、时间/级别/服务筛选及游标增量读取；单独定义字段白名单、查询上限与保留期限。没有安全接口前不读取原始日志冒充。
3. 第三阶段：接入来源明确的节点和进程观测，再按单位、窗口、新鲜度建立仪表盘；CPU、内存、实时带宽没有来源时不显示示例数字或零值。
4. 服务启停及现有功能开关另按 A 档边界确认权限、执行状态、幂等、审计和恢复方法；浏览器角色或按钮本身不授予操作权限。
5. 发布前核对精确 source/artifact 与访问边界。当前第一阶段授权不是合并或生产切换授权，不改变认证、数据库、套餐权益或资金。

第一阶段由 Grok Build 编写代码和测试、Codex 规划和验收。四项 GET 使用既有同源认证传输，候选默认断开；只有主动开始后才查询。自动更新需防请求重叠、取消过期请求，页面隐藏时暂停；401/403 不无限自动重试。固定历史窗口与实时状态的刷新策略分别处理，防止查询参数仅有界面没有作用。

本阶段使用无后端代理的 loopback 预览和本地合成响应验收，不读取生产业务 API。限定实现结果见下方第一阶段验收；这里的设计约束不是整体 Admin 或生产可用声明。

原生任务：2026-09-12 已重新读取 [OPS-002 #559](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/559)，仍为 Open / Blocked；本切片不自行改变其整体完成状态，不新建重复 Epic。

## 十页后端读取核对（2026-09-12，源码静态证据）

下表读取的是上述精确主分支源码，没有调用业务 API。接口存在不代表生产挂载、权限完整或 UI 已接入；尤其不能用三页当前源码推断生产十页的数据来源。

| 页面 | 可复用读取及源码 | 未完成项／禁止混淆 |
| --- | --- | --- |
| 运营总览 | `GET /api/admin/overview`、`GET /api/admin/operations/overview`；[admin-subscriptions](../server/routes/admin-subscriptions.mjs) | 后者只有四项订阅计数，需授权开关及 `operations.read`；不能推导营收、在线用户或节点健康 |
| 账户与资源 | `GET /api/admin/platform/accounts`、`/accounts/:id/entitlements`、`/entitlements`、`/portal-access-requests`；[admin-platform](../server/routes/admin-platform.mjs) | 需组合正确主体和关联；签发、额度修改、拒绝及交付确认 POST 不属于读取 |
| 使用情况和渠道 | `GET /api/admin/platform/subscription-usage-monitor`、`/traffic-collector-status`；[admin-platform](../server/routes/admin-platform.mjs) | 第一阶段候选已接入安全 GET 消费者；验收响应为本地合成数据，不代表生产挂载验证。`/subscription-usage-monitor/collect` 是有写入副作用的 POST，不调用 |
| 用户管理 | 账户/权益/用量 GET；已有 [账户摘要映射](../admin/src/app/admin-user-management-safe-read.ts) | 第一阶段候选使用独立白名单读取客户端显示只读资源诊断；不添加客户资料管理，旧订阅启停不是平台账号冻结 |
| 订单记录 | [Commerce](../server/routes/portal-coin-commerce.mjs) 与 [充值](../server/routes/portal-coin-recharge.mjs) 的 Portal GET，以及账户范围内 store 读取 | 未发现 Admin 全局订单 GET；不能冒充 Portal 当前用户或把用量行当支付订单，需 Admin 安全适配 |
| 节点健康状况 | `GET /api/admin/nodes` 是配置清单；[diagnostics](../server/routes/diagnostics.mjs) 提供代理/Nginx 状态 | 配置清单不是健康证明；诊断 GET 会主动探测，不能纳入纯读取自动刷新；缺完整远端健康摘要 |
| 节点带宽 | usage-monitor 的 `nodeId/from/to/bucket` 查询与 [小时/天时序](../server/services/platform/subscription-usage-monitor.mjs) | 是历史上传/下载字节，不是实时 bps、网卡吞吐或带宽利用率；页面打开不能启动采集/测速 |
| 用户访问日志 | [订阅列表](../server/routes/admin-subscriptions.mjs) 可读 `lastUsedAt` | 未发现访问事件列表 GET；最后使用时间不是访问日志，不引入客户访问目的地记录 |
| 用户操作日志 | [control store](../server/services/platform/subscription-control-db.mjs) 的 `getAuditEvent` 与账户摘要 `auditEvents` | 是领域能力而非 Admin 日志列表；需安全过滤/分页，禁止直接透传整个控制摘要或修改历史 |
| 节点日志 | collector-status 可提供采集状态摘要 | 未发现安全节点日志 GET；状态摘要不是运行日志，不直连原始 journal、代理配置或日志 |

实际接入还须核对 [app 装配](../server/app.mjs) 中的认证、allowlist 和能力门禁。第一批接口消费者只接允许的读取；订单和日志等缺失适配另按领域切片补齐，不使用默认演示记录掩盖失败。

## ADM-00-A 历史验证与完成状态

以下为十页布局基线的既有验收记录，不覆盖后来新增的只读监控实现；新阶段必须运行其受影响测试、构建和浏览器验收，不能沿用下方 Admin 通过数作为新结果。

- 验证：隔离门禁和十页模型测试、路由/呈现测试、`npm run admin:test`、`npm run admin:build`、生产输出排除检查、文档和差异检查。
- 后端未变更时仅复用同一源码/依赖/运行时/验证边界内已核验的基线结果，明确保留失败和跳过项，不宣称全仓库绿色。
- 本轮最终运行：`npm run admin:test`，64 个测试文件、1092 项通过、0 失败；`npm run admin:build` 通过，保留已有大体积构件警告。
- 实际生产构建检查通过：常规构建不包含候选入口、代码、样式、文案或预览开关名；显式带入开关的生产构建同样剔除候选代码，既有整包环境对象中保留开关名不等于入口可用。
- Chrome 本机验收通过：十页导航、前进/后退、四/五列表头同一行、选中状态及空数据/日志未接入提示；最后检查捕获到 0 error / 0 warning。未填写凭证、连接业务 API 或操作生产标签页。
- 后端复用证据：同基线验证为 5049 总数、4982 通过、11 失败、56 跳过；本轮未重跑或修复这些既有 Windows/CRLF 失败，不宣称全仓库绿色或 Linux/CI 通过。
- 本地切片 **ADM-00-A 已实现并通过限定验收**；ADM-00-B 的十页源码接口盘点已完成，真实挂载、授权及页面数据接入仍待实施。原始构建源码溯源没有闭合，整体 Admin 没有完成。
- 本轮没有提交、PR、合并或部署。当前源码在独立 `codex/admin-production-baseline-20260912` 工作树；此前目标不匹配的工作树保持原样。

## 第一阶段：只读监控与查询（2026-09-12）

> 验收口径修正（2026-09-12，用户要求重新核对）：**第一阶段未完成，状态为待补齐、待端到端验收**。下列测试与浏览器记录仅证明四个读源、请求状态和局部表格的限定实现；不证明完整监控工作流。保留历史证据，不用测试通过数抵扣视觉、服务状态、日志关联和后端读模型缺口。最新核对见“社区项目适配复查”。

Risk: B；一个紧凑实现切片；Grok Build 编写代码和测试，Codex 规划、机械应用补丁、独立复核及本地验收。没有发布 PR、合并或部署。本段只覆盖十页候选的第一阶段，不替代原生产源码溯源与访问门禁。

- 接入四项固定同源安全 GET：账户、权益、用量、采集器状态。默认不请求，主动开始；不读取 Cookie 内容、不引入令牌或生产凭证。
- 名称/状态本地筛选、20 条分页、页面切换保留条件；历史范围支持近 24 小时、近 7 天、最长 31 天自定义，以及小时/天粒度和单个节点资源范围。筛选和分页只针对返回记录，历史范围不改变当前资源行。
- 自动更新可选暂停、10/30/60 秒；可手动更新或单来源重试。请求防重叠，15 秒超时，隐藏页面暂停，取消与旧响应隔离；失败的 401/403 不持续自动重试。
- 缺失、真实零、停用、观测过期分别展示；保留白名单状态和诊断，不透传原始异常、客户联系方式或原始日志。历史流量按 GiB 展示，不称实时带宽。订单、访问日志及操作日志仍明确未接入；采集器摘要不是节点全部进程健康。
- 新功能测试：5 文件、84 项通过；全部修正后再次运行完整 `npm run admin:test`：69 文件、1176 项通过、0 失败。
- `npm run admin:build` 通过 TypeScript 和 Vite；保留已有大体积构件警告。常规生产输出检索无候选入口/样式/预览开关名命中，候选不会混入正式构件。
- `git diff --check` 和 `git diff --check origin/master...HEAD` 通过；后端/server、脚本、测试、根依赖文件未变。全仓库后端仅复用上文已核验的 4982 通过、11 失败、56 跳过基线，不宣称本轮全仓库绿色或新的 Linux 验证。
- 独立源码复核：已知客户端、轮询和 UI 的 P1/P2 问题已闭合。桌面本地合成验收覆盖四来源返回、导航筛选保留、权限失败隔离与单来源重试、中文诊断筛选、空结果、默认折叠详情、历史参数；没有真实业务读写。

验收证据保存在当前项目 `.codex-artifacts/admin-functional-plan-20260912/ADM_MONITOR_STAGE1_ACCEPTANCE.md` 与同目录截图。已有适配层实现可保留复用，但第一阶段不能结项；以下复查替代以四 GET 接线作为阶段完成标准的口径。受控启停仍独立于只读监控，不因这次复查获得执行授权。

### 社区项目适配复查（2026-09-12）

Risk: C；Process: 只读研究、桌面候选浏览器核对、前后端源码追踪及验收记录修正；Expected PR count: 0；Validation: 文档 diff check；Production/AWS impact: 无。没有安装参考项目、迁入依赖、修改业务代码或读取生产业务数据。

审查绑定：候选 HEAD `ee86dab3cb043bd3b35a022e00142361e3c871c0` 加现有未提交文件；四读源客户端、Hook、工作区组件 SHA-256 与此前限定验收记录一致。本次没有复跑 Admin 全套测试，1176 项通过是前一次执行证据，不是本轮新增结果。

#### 参考选择与不采用范围

Exa 四次检索请求合计 23 条候选结果额度（含重复和不相关结果，不代表 23 个独立项目）；随后读取社区原帖、项目源码和官方文档，实际查看公开参考截图及组件演示。

| 参考 | 证据与适合借鉴部分 | 不直接迁入的原因 |
| --- | --- | --- |
| OpenAI Apps SDK UI（官方组件库，不是 Admin 成品） | [源码](https://github.com/openai/apps-sdk-ui)、[日期范围演示](https://openai.github.io/apps-sdk-ui/?path=/docs/components-daterangepicker--docs)：白色细线表面、排版层级、统一按钮/状态/空态、日期快捷筛选；本轮展开了日期控件 | 面向 ChatGPT Apps；要求 React 18/19 和 Tailwind 4。本仓库为 React 19，但 admin/package.json 没有 Tailwind 4；先复用视觉约定，不为相似外观强制迁移 CSS 或引入 Apps SDK 宿主能力 |
| yusuf-eren/openai-agents-tracing（社区作者项目，非 OpenAI 官方产品） | [原始社区发布帖](https://community.openai.com/t/open-source-openai-tracing-dashboard/1357976/3)、[精确源码](https://github.com/yusuf-eren/openai-agents-tracing/tree/d8de59253de8ff43a715cd861e67d57fb9334093)：顶部筛选、URL 条件、紧凑列表、点击详情、执行步骤与右侧属性；本轮查看作者发布的列表和详情截图 | React/Vite + Node/Express 接近现有技术栈，但依赖 MongoDB，数据对象是 AI trace/span，不是节点服务。参考条件与层次，不复制原始输入输出、任意 metadata 或另一套 JWT。未安装运行该项目，不能宣称其生产可靠性已验证 |
| Langfuse（社区讨论提及的独立开源项目） | [官方实现说明](https://langfuse.com/blog/2025-05-21-customizable-dashboards)：指标定义含单位、维度、聚合和时间字段，前后端围绕统一查询模型；用于避免卡片、曲线、明细各说各话 | [自托管架构](https://langfuse.com/self-hosting) 包含 Postgres、ClickHouse、Redis/Valkey、对象存储与 worker；不符合本项目本阶段的轻量目标。仅借鉴指标/查询契约，不引入 LLM 成本、prompt 或评测系统 |

社区 tracing 源码核对不是仅阅读 README：`TracesPage.tsx:31` 将筛选写入 URL，`:118` 发起过滤请求，`:541` 从行进入详情；API `traces/routes.ts:96` 校验参数、`:137` 过滤时间、`:154` 分页、`:278` 计算匹配总数、`:301` 返回指定 trace 详情。与此同时，该 API 错误分支返回异常 message，详情保留 span 内容，不能作为本项目脱敏规范直接复制。参考项目的查询竞态、安全与运维未作完整审计。

#### 当前候选：视觉 → 交互 → 后端的实际断点

| 项目 | 本轮实际证据 | 缺口及验收要求 |
| --- | --- | --- |
| 总览层级 | `admin-monitor-workspace.tsx:493` 显示四类“本次返回记录”；`:707` 每页另放四来源卡。桌面截图出现大块重复来源信息和小型原生控件 | 来源返回成功不能当服务健康。首屏应以服务/采集异常与新鲜度为主，查询状态降为紧凑辅助信息；卡片需能定位对应异常 |
| 异常详情 | 筛选“失败”能得到对应采集行；客户端 `admin-monitor-read-client.ts:537` 只保留 name/state/observedAt/reasons | 后端已有独立 sourceRef/channelRef、lastCollectorSuccessAt、部分 producer timer 状态，前端尚未利用。应先接现成安全字段，分开“快照更新”“最近成功”“timer 状态”，不把缺口全推给后端 |
| 节点日志断点 | `admin-monitor-workspace.tsx:629` 后的节点健康/节点日志走同一表；浏览器从失败行转节点日志仍只看到同一摘要，没有事件下钻 | 现有 `traffic-collector-status` 读最新快照，缺事件历史 GET/cursor。需有脱敏事件读契约及来源/渠道/时间关联；安全占位不能计为日志完成 |
| 节点带宽与图表 | `admin-monitor-workspace.tsx:262` 是无坐标轴/刻度的 48px 采样柱；`:412` 先按表格页切点，`:629` 带宽页返回 historyBlock | 当前只有 GiB 历史流量，不是 Mbps、带宽利用率、CPU 或内存。趋势应有时间轴/单位/缺口表达且不随明细分页改变；真正速率和节点资源需各自 producer/read model |
| 查询语义 | 本轮浏览器切换近 7 天/按天/本地节点值，确实只发一个 usage GET，包含 from/to/nodeId/bucket；筛选并非完全空壳 | `subscription-usage-monitor.mjs:214` 按资源筛节点，`:449` 按 request 加入样本，可能含其它渠道；from/to 只裁 series，主表仍当前周期。UI、API 与数据必须统一目标维度，不能把整条资源总量包装成该节点单独用量 |
| 数据规模与完整性 | accounts/entitlements 返回 items，usage `:455` 遍历样本；前端分页是返回数组 slice | 需要查询上限、可辨识的截断/部分结果、稳定排序与分页/游标；日志轮询不得全量重下。图与表使用同一条件，不把未知/未采集当零 |
| 资源诊断与权限 | 已有账户权益 GET、内部 audit 存储；四 GET 有外层 Admin 鉴权，但未逐条用细粒度 read capability；账户原响应含联系字段 | 保留只读资源核验，不做 CRM。安全信息应在后端投影而非仅浏览器隐藏；复用现有 operations overview 的安全读模式。认证/权限变更实施时单独按其风险处理 |
| 可发布入口 | `App.tsx:35,91` 仍 DEV + opt-in + loopback 的候选入口，正常构建排除 | 这是开发隔离而非交付路径。必须落实当前十页目标的正式源码/构件入口和实际认证读取验证，不能将旧三页或生产构建排除测试当作目标已交付 |

后端复用位置：`server/routes/admin-platform.mjs:697,722,836,872,887`；采集投影 `traffic-collector-admin-projection.mjs:116,142`；producer 安全 timer 字段 `traffic-collector-status-producers.mjs:353`；内部 audit `subscription-control-db.mjs:5746`；安全读范例 `server/routes/admin-subscriptions.mjs:160`。这些都是本轮源码事实，不是生产启用声明。

#### 第一阶段重新验收的最小闭环

第一阶段保持未完成。下一实现应先完成一条能实际使用的路径，而非继续增加占位导航：

1. 总览看到明确的异常来源、最近观测与过期标记；没有数据时如实未知。
2. 点击异常带入来源/渠道/时间/状态；列表筛选和详情查询都作用于同一后端范围，返回后保留条件。
3. 详情展示已知安全状态、最近成功、原因码、可追溯脱敏事件；事件暂未采集须明确，不生成虚构历史。
4. 可在同一上下文核对对应资源只读摘要；日志的有界查询、增量读取、脱敏和一个月保留边界有实际实现证据。
5. 针对健康、失败、观测过期、来源缺失、权限不足、大于一页、查询切换/返回七类场景验收；不仅检查组件渲染，还检查 HTTP 参数、producer 语义和页面显示是否一致。

CPU/内存/实时速率等尚未具备来源的指标仍逐项待实现，不能用现有流量读源替代。服务启停属于受控操作切片，不与只读问题定位混为一谈，也不因只读验收阻止后续已授权任务正常推进。

本轮新截图位于 `.codex-artifacts/admin-functional-plan-20260912/community-fit-audit/`：`02-desktop-overview.png`、`03-collector-failure.png`、`04-node-log-dead-end.png`、`07-current-bandwidth.png` 是当前本地候选与合成响应；`05-community-traces-reference.png`、`06-community-detail-reference.png` 是浏览器查看作者公开截图的记录（非项目实时运行）；`08-openai-date-range-reference.png` 是官方组件演示。默认窄侧栏截图 `01-current-overview.png` 不作为本次桌面视觉验收依据；不在此轮增加手机端设计。

### 用户查验切片：路线与口径（2026-09-12，源码及本地验收完成）

用户明确 Admin 需要基于现有用户模型核验业务数据，为后续技术支撑和分析提供依据；这不等同 CRM，也不要求重建用户模型。本切片完成注册增长、用户 Coins、用户流量三项只读查验的源码接入及本地验收；此前视觉和四读源成果独立保留，正式生产入口和整个 Admin 阶段仍未完成。

Risk: B；Process: Codex 定义查询模型、Grok Build 编写实现和测试、Codex 独立验收；Expected PR count: 最多 1，本轮不合并或发布；Production/AWS impact: 无。仅使用一次性本地 SQLite 与已有 Admin 候选验证，不改 schema、认证模型、资金、套餐权益或采集任务。

| 查验对象 | 权威数据与关联 | 展示口径 |
| --- | --- | --- |
| 注册增长 | `platform_accounts` 的创建时间与 `metadata.registrationSource` | 仅 `self_service_portal` 计为自助注册；其余创建账户单列，不能把 active 状态当活跃用户 |
| 用户目录 | 现有平台账户 ID | 全历史目录，精确 ID/状态筛选与服务端游标；不随增长日期缩小范围，不暴露邮箱、姓名或原始 metadata |
| 用户 Coins | 账户 ID → 后端解析现有钱包 → 当前余额投影与账变 | Coins 为整数单位；当前余额不是历史余额，账变当前页不是区间消费总额；预留/释放/确认与实际消费、过期、冲正分开 |
| 用户流量 | `platform_usage_samples.account_id` 精确关联历史样本 | 按观测时间 `[from,to)` 汇总，小时/天可切换；缺采样为未知，已采样且为零才显示零；不冒充实时带宽、剩余额度或采集器健康 |

新增 Admin 只读适配根路径为 `/api/admin/platform/user-monitor`：`growth`、`accounts`、`accounts/:accountId/coins`、`accounts/:accountId/traffic`。每条路由沿用现有会话与能力门禁；分别要求 `users.read`，以及 Coins 的 `wallet.read`、流量的 `runtime.read`。查询范围最多 31 天，目录/账变页最多 100 条；服务端投影白名单，错误不透传 SQL 或原始数据。结果条数有上限不等同底层扫描成本有上限，现有创建时间索引缺口留作测量后再决策，不暗中加迁移。

交付顺序为：查询口径与安全 DTO → 真实 store 的只读适配与边界测试 → 现有 `userManagement` 页面接线 → 独立 HTTP/桌面浏览器验收。详情默认关闭，日期仅影响增长和流量；当前钱包与近期账变分别标注。日志只用于后续解释流程与异常，不能替代用户表、Coins 账本或计量样本计算业务事实。服务启停、日志平台和生产入口不包含在这个切片内。

验收覆盖：跨账户隔离、游标跨页不重漏、日期边界、预留不重复算消费、无采样/零值/故障区分、白名单无敏感字段、读取前后数据库 `total_changes()` 不变，以及查询切换和后台轮询不展示过期响应。流量总计与分桶已使用同一读取事务快照，经真实双连接 WAL 并发验证。Coins 投影与账本仍不是同一原子财务快照，不冒充结算对账工具。

最终实际结果：新增后端 16/16（含既有相关回归 39/39）、独立 WAL 7/7、真实 HTTP 检查 41 项及实际前端解析器读取 9 次；新增 UI/客户端/hook 57/57；完整 Admin 73 文件 / 1237 项通过，构建通过（保留大 chunk 警告）。完整 `npm test` 为 5065 项、4996 通过 / 13 失败 / 56 跳过；13 个失败标题与实施前基线一致，不宣称全仓通过。桌面浏览器已实查分页、筛选、日期、按需详情、Coins/流量准确显示与零值/未知区别；仅使用一次性本地数据，无生产请求或写入。

最终独立结论及边界记录于 `.codex-artifacts/admin-functional-plan-20260912/ADM_USER_MONITOR_ACCEPTANCE.md`。本次未提交、创建 PR、合并或部署。下一步处理既有正式 Admin 源码/构建入口差异，再接脱敏流程日志下钻；不把本切片完成等同整个 Admin 阶段完成。

### 先前已实现部分的桌面视觉收尾（2026-09-12，用户查验切片之前）

该轮只收尾已有页面，不使用 Figma、不扩展监控读模型或生产入口；其范围不替代上方新增的用户查验切片。Grok Build 编写视觉代码与测试，Codex 应用补丁、审查和浏览器验收。第一阶段整体仍保持待补齐状态，不能把视觉收尾等同端到端完成。

- 统一白色细线卡片、标题/正文/辅助文字层级、36px 按钮与筛选控件；四来源改为紧凑状态条，保留独立错误、时效和重试。
- 筛选增加可见标签，历史查询说明与已应用范围分层；详情仍默认折叠，字段纵向排列避免挤压，保留键盘焦点。
- 真实零值保持信息态；已知与未知枚举的“未知”显示中性。请求返回成功不替代服务健康。没有伪造缺失指标或日志。
- 新增视觉测试 4/4 通过；完整 `npm run admin:test`：70 文件、1180 项通过；`npm run admin:build` 通过，保留大构件警告。差异检查通过。
- 本地合成浏览器验收覆盖来源权限失败隔离/独立重试、无效和有效日期查询、详情默认关闭及键盘切换、控件尺寸与页面横向溢出检查。没有生产请求或真实账户操作。
- 本轮完整 `npm test` 退出 1，明确观察到 13 项失败（输出截断，不声明总通过数），包含 Windows/CRLF 环境类和现有候选入口合同问题；运行发生在视觉改动应用前，未在本切片修复。Admin 构建成功不代表正式入口或全仓验收通过。

具体证据：项目 `.codex-artifacts/admin-functional-plan-20260912/ADM_VISUAL_FINISH_ACCEPTANCE.md`。本次没有提交、创建 PR、合并或发布。

### 用户查验切片的源码对齐与生产更新（2026-09-12，执行中）

用户已接受上述本地验收，并要求先将当前切片与正式源码对齐，再更新生产。此次授权不是整个 Admin 规划完成或其他未实现功能上线的声明。

- Risk: A（正式入口接线为 B 档代码，生产切换为 A 档）；Process: 复用已验收口径，补正式入口、增量验证、精确构件与现场绑定、备份、受控更新和验证；Expected PR count: 最多 1。
- Release units: `admin-static`、`control-plane-app`；frontend_surface: `admin`；identity_impact: false。用户增长、目录、Coins 与流量四项 GET 是本轮新增后端接口；此前四读源与桌面布局一并完成源码收齐，不扩展其既有业务口径。
- 源码已在保留原有 31 项工作区差异的前提下快进到 `b10d06499c498c75bdc91c0d67c9f3465d376064`。这是对齐基线，不是最终发布提交或构件身份。
- 正式 Admin 必须能够复用既有账户密码和 TOTP 会话登录，未登录不能发业务查询；会话失效须有可用的重新登录入口。不增加认证模型、账号、角色、权限或客户端凭据存储，不以旧 `consoleToken` 非空判断替代服务端会话。
- 保留 DEV、显式开关、loopback 的本地预览隔离及现有 Portal/company-site 入口契约。正式包应包含实际用户查验入口，不包含预览横幅、合成数据或旧品牌；构件验证不能仅证明旧三页构建成功。
- 不包含日志下钻、服务启停、订单/余额/权益修改、schema 迁移、支付配置、Nginx、DNS、节点、身份发放或历史流量追扣。现役计量 helper 与两个已恢复的采集任务须独立保留，不把上午已过时的停止状态套用于新发布。

#### 本次发布的最小门禁与回退

1. 只读核对当前应用 pointer、服务进程与版本、Admin 静态目录和构件、现役访问保护、认证功能状态、采集任务及 helper 绑定；不得根据旧文档猜测。所有现场输出仅含枚举、路径、哈希、布尔或汇总，不记录凭据或客户行。
2. 完成正式入口、登录/TOTP/会话失效、查询错误与权限、构件真实标记及隔离负测；跑受影响测试及既定 Admin/后端验证，分别标明当轮结果、可复用证据与既有失败。Linux 验证以本次精确代码或构件为准，不重做无变化的模型验收。
3. Source/Merge 就绪后冻结提交、官方源码/依赖/Admin 构件哈希与新执行记录。旧发布包及其已消费/过期授权只作实现参考，不能直接复跑。
4. 切换前保留现役应用和 Admin 静态版本，并取得新的有效数据库快照；任何必要暂停只作用于现场已确认写入者，完成后恢复各自原状态。先更新控制面，再更新匹配的 Admin 静态包，不修改受保护入口配置。
5. 验证版本、应用健康、新 GET 的未授权拒绝及受保护会话链、Admin 静态内容、原 Portal 可用性、采集恢复与独立 helper 不变。若已知失败且回退前提仍有效，按新包协调恢复原应用/静态指针；不做数据库回滚、重复扣款或旧计量 reader 回退。状态不明则停止受影响动作并保留证据。
6. 每个实际变更单元留下简短 Deploy Note；未执行切换前不得标注生产完成。最终精确身份与执行结果保存在本次 `.codex-artifacts/admin-user-monitor-production-20260912-01/`，而不是覆盖旧发布回执。

#### 当前源码与正式入口（本轮实际观察：2026-09-13 UTC）

前文 ADM-00-A、第一阶段四读源、社区复查及用户查验初次验收均保留为各自阶段的历史结果。其中“正式入口尚未实现”“生产构建排除候选”描述的是当时的 DEV 预览路径，不代表下述新增正式入口仍未实现；历史测试数不改写、不累加为本轮通过数。完整日志关联、服务启停和整个 Admin 规划仍未完成，本次仅收齐已授权的只读查验与正式登录入口。

- 用户查验与正式入口的实现已完成接线：[App.tsx](../admin/src/App.tsx) 的正式 Admin 由 [admin-auth-boundary.tsx](../admin/src/pages/admin-auth-boundary.tsx) 保护，并进入共享的 [admin-operations-shell.tsx](../admin/src/pages/admin-operations-shell.tsx)。未通过既有密码/TOTP/Cookie 会话流程时不挂载业务查询工作区，不以本地 token 非空代替登录状态。
- 正式共享十页框架承载既有四读源和 `userManagement` 的增长、用户目录、Coins、流量查验；DEV 预览继续单独隔离。正式包含实际业务入口，但不把未实现导航、日志占位或状态摘要描述为已完成业务功能。
- 实现接线完成不等于合并或生产完成。当前仍以 `b10d06499c498c75bdc91c0d67c9f3465d376064` 加本轮工作区改动为源码证据；最终发布提交、构件和新执行门禁待冻结。完整 Admin 最终复验已通过，结果见下表。

#### 新一轮实际验证与尚未通过项

以下仅记录本轮实际结果。测试、生产构建浏览器、现场只读取证和 Linux 合成文件测试是不同证据，不互相替代。

| 检查 | 实际结果与边界 |
| --- | --- |
| 正式认证/共享框架定向测试 | 64/64 通过；涵盖正式入口与既有登录会话路径 |
| 完整 Admin 复验 | 首轮 1273 项：1265 通过 / 8 失败，均为旧入口相关 fixture 预期。Grok 仅调整两份测试，保留旧导航覆盖并分别验证正式 Cookie/Portal 隔离；定向 136/136 通过。根线程最终完整复验：78 文件、1273/1273 通过、0 失败；产品源码未因测试适配而改动 |
| Admin 构建与构件校验 | `npm run admin:build`、`npm run admin:verify` 通过，10 个输出文件；保留大于 500 kB 的 chunk 警告，不因构建成功宣称功能全部完成 |
| 源码/构件合同 | `frontend:boundaries:check` 实际无 issues；两个相关 contract 测试合计 125/125 通过 |
| 文档权威元数据 | `npm run docs:authority:strict` 通过，实际校验 401 个 document metadata blocks；401 是文档数量，不是 HTTP 鉴权结果 |
| 完整后端/仓库测试 | `npm test`：5118 项，5051 通过 / 11 失败 / 56 跳过，仍为失败退出。独立定向复现同一 11 项；8 个测试文件及 17 个直接输入与 b10d064 的 Git blob 在 LF 归一化后逐字一致。7 项由固定 LF 匹配或重复 CRLF 转换触发，4 项涉及 Windows 路径假设；未发现这 11 项由本次 Admin 语义增量引入，但没有运行完整基线替代本轮红色结果 |
| 本地真实 HTTP/Auth probe | 26/26 通过，真实应用/认证/只读适配链配合合成 TOTP 和隔离 fixture；包含新增接口匿名 401、会话与业务只读边界，不是生产账户验收 |
| Linux 原生静态文件机制 | 本机 WSL Ubuntu 24.04、Linux 6.6.114.1，以 root 在隔离 net/mount namespace 运行本轮静态 native 测试，9/9 通过。只作用于 `/var/tmp/admin-static-physical-20260912-01` 合成文件，该目录保留；不是 Aliyun、生产或完整 systemd/数据库发布演练 |

主线程另通过 loopback-only 验收服务，在 1280×900 浏览器中打开本轮真实 `admin/dist`：验证合成密码/TOTP 登录、十项导航、开始用户监控、自助注册 21 个与其它账户 2 个、目录 20+3 分页、所选用户 120 Coins、无流量采样显示未知；刷新保留认证会话但停止查询，退出后再次刷新回到登录。共观察到 9 次业务 GET，业务数据库保持 `readOnly: true`；认证会话操作与业务只读请求分别计量，不冒称所有交互都没有状态变化。本次自有浏览器 tab 与本地服务均已关闭，没有真实客户操作。

#### 现场绑定与生产待执行状态

- 本轮仅完成现场只读取证。`inventory/before-01.json`、`detail-01.json` 绑定现役 a017 应用、服务/PID/CWD 与零重启；两组现役采集 timer 保持原状态，计量 helper 独立保留，旧 disabled collector 不因本次发布重置或启用。
- `inventory/static-01.json` 已取得 Admin 现役 `admin-preview/current` 的 symlink 本体、目标及父目录身份和完整 10 文件清单；目标仍为 `admin-preview/releases/portal-entitlement-gate-20260706-205145`。Nginx 保护配置未改，匿名 loopback session GET 返回既有 `portalAccount` 模式且 `setupRequired: false`，这不是已登录生产浏览器或有效配置全量解析的证明。
- 保留旧树是回退条件，不自动证明旧活动 tab 在切换后的资源 URL 连续可用；是否存在旧 lazy 依赖、是否需要 retained assets，必须依据完整清单和实际引用单独决策，不将旧 fixture 或品牌无条件混入新包。
- 截至本段记录，生产切换、发布成功及 Deploy Note 均待后续精确门禁和实际执行结果；不复跑旧已消费执行器，不关闭 #557 或 #559。详细记录位于 `.codex-artifacts/admin-user-monitor-production-20260912-01/SOURCE_ALIGNMENT_RECORD.md` 及同目录新回执。

### 本机复现

在本工作树的 `admin` 目录、完成对应依赖安装后执行：

```powershell
$env:VITE_ADMIN_BASELINE_PREVIEW = 'true'
node --input-type=module -e "import {createServer} from 'vite'; import react from '@vitejs/plugin-react'; const s=await createServer({configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:5191,strictPort:true,proxy:{}}}); await s.listen(); s.printUrls();"
```

访问 `http://127.0.0.1:5191/#/admin-baseline/dashboard`。这条本机启动方式不加载项目代理配置，没有后端代理或登录要求；不要把它用于发布或对外服务。开关仅对当前命令环境生效，结束预览时停止本次启动的进程。
