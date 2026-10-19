# 自有／第三方订阅配置切换

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: subscription_distribution_routing
  superseded_by: null
  last_verified_at: 2026-10-19
  production_authority: false
```

Risk: A（持久策略及显式宿主停启能力）。Process: 一个 PR 内完成设计、源码、合成 SQLite／HTTP／Admin 验证；生产另按本节分步执行。Expected PR count: 1。Production/AWS impact: 本次源码开发无。release_unit: control-plane-app、admin-static；frontend_surface: admin。identity_impact: true（新增可选三协议进程停启及 collector 调度控制；默认关闭，本轮未操作运行身份）。identity_gate.state: pending；production_state: not_deployed。

## 已确认的行为

用户继续使用原订阅链接。默认配置来源是自有节点；管理员可为既有 monthly_basic、monthly_plus、yearly 档位选择已导入、获准且启用的第三方节点。选择第三方时替换下发集合，不再追加自有节点；实际连接由客户端直接到第三方。未属于这三档的用户保留原自有资格规则，但 BWH 全局暂停期间不得继续取得自有节点。

自有节点作为系统来源出现在同一分发面板，可维护分发启停、显示名和国旗。覆盖值仅用于输出，不改内部节点引用、逐用户材料、权益、额度或历史计量。自有节点不接受 YAML 导入覆盖或物理删除。第三方继续遵守来源启停、单节点启停、套餐归属和本站有效期，且不计入自有流量账。

切换不轮换订阅链接。未知、撤销、重置后的旧链接、封禁、到期仍按既有规则拒绝；到期保留现有无凭证提示。已明确选用第三方的有效订阅，不因 BWH 运行节点停供、材料不可用或应用回执缺失而无法获取第三方配置。第三方资格必须独立验证有效账户、权益和订阅绑定，不能通过任意租户字段推断。

客户端须成功刷新才会取得新配置；现有 provider 默认间隔为 3600 秒，不能承诺全部客户端即时更新。BWH 旧连接停供后，未更新客户端可能短暂断连。控制面、订阅 HTTP 和用户面板继续服务。

## 客户端择优与 UTC 每日重排

用户已确认采用“每日重排已选节点池＋客户端自动择优”，不是每日只下发部分节点。新增 `SUBSCRIPTION_DISTRIBUTION_CLIENT_HEALTH_ENABLED` 和 `SUBSCRIPTION_DISTRIBUTION_DAILY_ROTATION_ENABLED` 两个默认关闭的运行配置；Admin 只读显示其状态，不把保存路由变成系统服务操作。能力设置参与 revision；保存时能力漂移会停止采纳并要求重新读取。不新增数据库表或修改原迁移 checksum。

- 开启客户端测速时，只有受信任的、全部为第三方的分发结果添加专用 `3P-AUTO`（url-test）和 `3P-FALLBACK`（fallback）组，覆盖所选节点；组名冲突自动避让。GLOBAL 默认首项为 AUTO，国家组和手动节点保留。固定沿用公开 204 检测地址及 300 秒间隔，不接收自定义探测 URL，不从控制面发起 DNS/TCP/协议探活。
- 实际健康判断由用户客户端通过对应协议连接完成。服务端只核验节点的启用、套餐和来源资格，不能把管理面“启用”当作网络连通或集中健康证明。测速请求可能消耗第三方配额，目标服务可能看到相应出口访问；不添加新的浏览追踪。
- 开启每日重排时，先按稳定目录完成显示名装饰，再按节点 ID 排序、根据 UTC 日期循环移动完整列表。当天多次刷新稳定，跨日优先序变化，不修改名称、凭证、权益或计量；未刷新配置不会午夜自变。AUTO 仍按实际延迟选可用节点，不保证每天更换出口；FALLBACK 可按轮换后的健康优先序选择。
- 自动模式允许从所选池移除已暂停、删除、失去来源／套餐资格的成员，余池非空才下发；空池仍拒绝，绝不切回 BWH 或 DIRECT。关闭自动模式时保留原严格规则：任一所选成员失效即拒绝整路。此过滤不是网络探测，也不会加入未选节点。
- 已有客户端的保存选择可能优先于新的 GLOBAL 默认项；使用自动模式需确认客户端当前选择 AUTO。裸 `provider.yaml` 仅能包含节点列表，测速／自动选择由其父配置负责；完整 Clash/Mihomo profile 才包含这些分组。

## 源码结构与存储

- 新功能开关 `SUBSCRIPTION_DISTRIBUTION_ENABLED` 默认关闭，关闭时沿用原输出。
- 在现有第三方 SQLite 数据库内增加来源覆盖、三档路由和自有节点覆盖三张策略表及显式迁移；不改控制、Commerce、用量表。运行时不自动建表或迁移。
- 策略只存三档路由、所选第三方节点 ID、自有来源开关和自有节点显示覆盖；不复制自有用户 YAML、地址、密码、UUID、凭证引用或客户记录。
- 自有节点 ID 为内部稳定名称的 SHA-256 截断投影；管理 API 只返回白名单展示字段。运行时目录仍是自有节点唯一事实来源。
- 变更须携带完整读取快照的 revision；目录、第三方来源版本或策略变化时拒绝覆盖。第三方暂停、删除或失效后不静默回落 BWH，以免继续消耗自有流量。
- 认证及有效期通过后，再由受信任的配置选择器决定自有或第三方。自有分支继续执行原应用回执及逐用户材料校验；第三方分支执行原第三方商业资格校验。最终无节点时拒绝，不生成直连兜底配置。
- 管理端点沿用受保护前缀 `/api/admin/third-party-subscriptions/distribution`，GET 读取、PUT 保存路由、PUT `/owned` 保存自有分发覆盖；复用 Admin 会话、CIDR 和角色，响应 no-store。保存失败或结果未知后先重新读取，不自动重试。
- 实际供流操作单独使用 PUT `/supply`，只接受策略 revision、宿主 supplyRevision 和 enabled 布尔值；还必须具备真实 Admin 会话、admin／super_admin 角色及已配置的精确同源 Origin。旧 console token 不获得该停启能力，客户端不能指定 unit、命令、路径或外部证明。

## 验收边界

合成数据库验证迁移校验、dry-run、应用与幂等，以及在副本恢复前态。验证并发 revision、错误输入、无敏感投影、默认自有、自有别名／国旗／启停、按档位选择第三方、暂停／删除后拒绝、四种 YAML 入口一致、原链接可继续刷新、重置／撤销／到期不可绕过、用户凭证隔离。测试 BWH gate 拒绝和材料缺失时已获准第三方仍可渲染，非合格用户仍被拒绝。

Admin 验证默认自有、第三方筛选选择、保存确认、未保存草稿、失败锁定和重新读取，复用既有节点导入管理。

## 生产切换及恢复（未执行）

1. 新鲜核对运行版本、策略库、待迁移对象、节点／用户覆盖及更新入口；确认第三方再分发许可和有效性。
2. 备份应用、Admin、策略库，副本验证迁移、策略恢复和代码回退。关闭开关安装候选，验证服务后再审批启用。
3. 将选定档位切到经过验证的第三方节点，验证同一订阅入口刷新、到期与撤销保护；不得禁用账户、权益或订阅链接来停止 BWH。
4. 最新业务选择是明确暂停整个 BWH 自有供流，而不是仅隐藏节点；先为三档保存有效第三方选择，再确认 Admin 的实际供流暂停。其他未获第三方资格、独立流量包或例外订阅不会自动迁移，暂停期间将失去 BWH 连接且不能取得自有配置；必须在生产批准中明确该影响，不伪造“原生消费者为零”的覆盖证明。保留身份材料、检查点和历史用量，记录停供边界。不能将路由保存成功当作旧节点已停供。
5. 停供后验证用户直接连接第三方、BWH 代理流量停止、控制及订阅接口仍可访问，并记录服务和自然计量结果。源码开发阶段不执行这些生产动作。
6. 回退先确认自有可供流及材料／计量续接条件，再恢复供流、切回自有配置并验证；不清零用量、不补扣第三方流量、不恢复历史业务数据库。

## Admin 实际供流控制（源码已接线，生产未安装）

`BWH_SUPPLY_CONTROL_ENABLED` 默认关闭。开启前须先完成下述宿主安装与验证；开启但宿主未初始化、不可验证或状态未知时，自有下发拒绝，不静默绕过。已经独立验证资格的第三方分支不依赖此许可。普通 YAML 请求只读 root-owned 持久状态和 marker，不在每次刷新时执行 sudo 或扫描管理目录。

链路为 Admin 确认 → 同源会话 API → `bwh-supply-service` → 固定无提权客户端 → 本机 Unix socket → 独立 root worker → Linux systemd adapter。固定目标为 BWH，固定三协议 unit 为 `xray-vless-reality.service`、`hysteria2.service`、`mihomo-tuic.service`，采集任务为 `gccgw-full-metering-collect.timer`／同名 `.service`。这些是源码 allowlist；2026-10-19 的一次生产元数据读取确认同名服务存在，但不替代安装时的新鲜读回。控制应用、Nginx 不在可变更列表。

### 保留 NoNewPrivileges 的本机调用边界

2026-10-19 生产只读预检确认应用使用 `proxy-gateway`、`NoNewPrivileges=yes`、`ProtectSystem=strict`。因此取消未部署的 sudoers 方案：不能为了调用 helper 关闭应用加固。应用使用固定 Node 和 root-owned bundle 中的 `scripts/bwh-supply-client.mjs`；不提权，不接受可变目标或 shell 参数。同步 Admin 状态接口仍使用限时无提权子进程，订阅热路径不启动子进程。

固定 socket `/run/gccgw-bwh-supply-control/control.sock` 由 systemd 建立，root 所属、准确应用组、0660；所有祖先目录须 root 所属且不可由应用写入。客户端校验类型、模式、有效组及连接前后／EOF 的 inode、device。权限依据本机文件系统组 ACL，不冒称 SO_PEERCRED 或逐浏览器用户认证；Admin 会话、CIDR、角色和 Origin 仍由应用接口校验。安装必须核对该组全部成员和同 UID 进程影响，不能扩大成共享运维组。

socket 使用 `Accept=yes`，每个连接启动一个独立 root worker，限制并发及触发速率，不开放 TCP 或公网端口。worker 本身保留 `NoNewPrivileges=yes`、`ProtectSystem=strict`，只接收 status／pause／enable；initialize 仅留给人工 root CLI，不对应用开放。协议要求单行 JSON 加 EOF：请求最多 256 字节／5 秒，响应最多 16 KiB；拒绝多帧、重复键、额外字段、BOM、非法 UTF-8、任意 unit／path／command。错误不返回原文。客户端断开不取消已开始的宿主操作，不自动重试。

暂停先写 durable `transitioning`，立即拒绝新的自有下发；然后停止 timer、等待正在采集的 service 空闲、安装三协议启动护栏，再逐路停止与读回。不会 kill 采集 writer。最终须三协议无运行进程和监听、timer 停止、writer 空闲及已加载护栏齐全，才能返回 paused。每个阶段写 root-private operation，Admin 不以一次 HTTP 成功替代物理读回。暂停标记为 `intentionally_paused`，不是缺测为零或计量健康。

启动护栏为独立 root-owned marker `/var/lib/gccgw-bwh-supply-control/native-supply-paused` 与三份专用 `ConditionPathExists=!<marker>` drop-in。核对文件准确内容、属主、模式、普通文件、单链接、父路径无符号链接，以及 systemd 实际加载的条件；不覆盖其他 drop-in。systemd 的条件语义依据 [systemd.unit](https://www.freedesktop.org/software/systemd/man/257/systemd.unit.html)；加载属性通过 [Unit.Conditions](https://www.freedesktop.org/software/systemd/man/257/org.freedesktop.systemd1.html) 的结构读回，而不是仅看磁盘文件。

启用逐协议解除本次护栏、启动及确认监听；同一源码、宿主、配置、材料与数据库身份须保持一致。独立只读 verifier 从固定配置、进程、应用入口、控制库绑定、identity gate 和既有 journal 验证上下文；不接受外部 JSON 布尔证明。三协议运行与 generation 对齐、`missing/changed/missingMaterial/unknown/stale` 为零、checkpoint 可续接且无 writer/pending 后才恢复 timer，再允许自有下发。不会初始化 journal、清空检查点、重置额度、恢复历史业务库、补扣停顿或第三方用量；已保存的三方路由不随启用按钮改回自有。

应用内与宿主锁分别阻止并发；结果未知、失败、持久过渡状态均拒绝原生下发。Admin 先重新读取，不自动重试。宿主超时最长 120 秒，浏览器等待 60 秒；浏览器超时不表示宿主已退出，也不授权再次点击重放。部分失败由 root operator 读取私有 stage 并核清实际效果后另行决定同方向续接或恢复，不删除锁、marker 或证据来强行解锁。

### 安装与回退门禁

- `ops/bwh-supply-control/` 仅提供 root CLI／verifier／worker launcher、socket／service 模板和故意不可直接启用的配置示例，**不自动安装**。后续绑定精确 source/artifact、Node 和依赖构件，放在全路径 root-owned、不可由应用写入的独立目录 `/opt/gccgw-bwh-supply-control`；所有传递 import、native module 和 node_modules 都属于同一不可变审查边界，不能指向应用可写 checkout 或 `current`。新 safe DTO、wire 和客户端也须纳入闭包。固定 launcher `/usr/local/libexec/gccgw-bwh-supply`、`gccgw-bwh-supply-verify`、`gccgw-bwh-supply-worker` 均 root:root 0755、LF 换行；verifier SHA 在每次调用前复核。
- 根配置 `/etc/gccgw-bwh-supply-control.json` 为 root:root 0600，绑定 BWH machine-id 摘要、精确 source commit、release identity 与现役 `local-three-v1` 采集配置摘要。verifier 仅支持该已知本地三路；不支持的结构失败停止，不改成全量重建或忽略检查点。
- 独立 `/var/lib/gccgw-bwh-supply-control` 为 root:root 0755，公开脱敏 `status.json` 0644；`operation.json` 与 marker 为 0600，锁为 0700。专用 drop-in 为 0644。不得顺手改业务父目录属主／权限，不删除数据库、WAL、checkpoint、pending 或旧回执。
- 先 dry-run 固定 helper/完整依赖及 socket／worker 模板，绑定 `__APP_SERVICE_GROUP__` 和 `__SQLITE_COORDINATION_DIRECTORY__`；任何占位未替换不得安装。worker 仅获 state、三份专用 drop-in 目录及获准 SQLite WAL/SHM 协调目录写权限，不扩大为整个 `/etc`、`/var` 或应用 release。逐项验收准确组权限、AF_UNIX 可达、root-owned socket、app/worker 加固仍启用、非授权组拒绝。应用不获 sudoers、通用 shell、Node、systemctl、verifier、initialize 或可变命令权限。首次 initialize 仅由 root operator 在确认现役三协议及采集调度运行后执行，不能由 Admin 发起。
- 实际暂停前必须先完成同源码 resume 只读准入预验；initialize 只确认正在运行，不证明将来能恢复。身份保留、材料、journal 或 activation 有未知时不得开放实际暂停按钮，禁止删 map/checkpoint/pending 或放宽检查来强行通过。
- 生产前新鲜核对确切 units、app identity、现役配置、身份保留状态与计量范围；备份应用/Admin、根权限配置和相关 unit/drop-in，保留控制库在线备份和 journal 证据。源码合成测试不替代真实 systemd、应用 sandbox、协议监听及停供／恢复演练。
- 暂停或启用后单独验收控制面与订阅入口、第三方直接连接、三协议物理状态及连续自然采集。timer active 只表示调度恢复，不能据此宣布用量入账正常；记录 aggregate-only identity_gate before/after、retention_state 与最终阶段。
- 代码回退不能自动重开供流或移除护栏。先核清当前 paused/failed 状态，使用同一受审 helper 恢复并验证；确认 runtime 与计量续接后才关闭功能开关或回退代码。禁止只关闭渲染门禁来伪装恢复，禁止为回退还原旧账本。

## 显式迁移命令

迁移 ID：`20261019_001_subscription_distribution`；DDL SHA-256：`36b0145d68ffd7f3b08c2e0f4416da34092f5bbe0e26dd80a49e7cb467f7b5ba`。
`npm run platform:subscription-distribution:schema -- --mode validate --db-path <absolute-path>`
只核验现有库；`--mode dry-run` 对在线备份副本应用迁移，再用原备份覆盖已迁移副本，
在内部比较 schema、全部表内容摘要及源文件身份。临时副本会清理，源库不被替换。
`--mode apply` 额外要求 `--confirm-migration-id` 和 `--confirm-ddl-checksum` 精确匹配；
生产执行仍须先绑定库、备份、回退及批准，本文命令不是生产执行授权。

路由每档最多 256 项，自有目录最多 256 项，管理候选最多 4096 项／256 个来源；超限拒绝而非截断。
完整自有列表 PUT 使用限定于该路径的 256 KiB 预算，其他新接口沿用原 100 KiB 限额。
自有订阅渲染只读自有覆盖；第三方渲染只核对对应路由和所选节点，避免逐次刷新扫描管理目录。

## 当前状态

首段提交 `6bae9881` 的源码、针对性测试和 Windows 本地完整检查已完成。服务端 6705 项：6636 通过、69 项既有跳过、0 失败；新增分发相关 68 项单独复跑通过。Admin 105 文件／1919 项通过，构建及 17 个静态文件安全检查通过；前端边界、文档检查和 diff 检查通过。这些数字是首段证据，不覆盖后续自动路由与实际供流增量；增量的最终提交和结果在 PR #796 单独绑定。

普通独立安全复核发现并修正了完整中文节点清单请求体预算问题，读回后无剩余具体发现；当前没有专用 Security Review 工具，不冒称其结果。桌面浏览器使用正式构建及内存合成 HTTP 完成 12 项交互验证；真实 SQLite／HTTP 的存储和权限另由自动化测试验证。390px 整页受既有固定侧栏挤压，移动端未验收通过。

`ce3dbfe2` 阶段接通了 Admin 停启 API、宿主 adapter 与只读 verifier，并移除不再调用的 generic 执行器；当时服务端 6825 项、Admin 1985 项及定向 Linux 201 项通过情况保留在 PR。独立通用代理复核修正了护栏撤销、marker 恢复、自然 writer 并发三项 P2，复跑 75 项后无剩余具体 P1/P2；不是专用 Security Review 工具结果。

生产预检发现的 NNP 兼容增量已取消应用 sudo，改为固定 AF_UNIX 客户端／worker。新完整服务端 6846 项：6777 通过、69 项既有跳过、0 失败；受影响边界 105 项通过，独立只读 transport 复核 27 项通过且无具体 P1/P2。Admin 未改，复用同一字节源码的 1985 项、构建和 17 文件检查，不重复运行或宣称新 UI 验收。

本机 WSL 一次性 mount／network namespace 中，使用官方摘要校验的 Node 22.23.1，真实 UID/GID 65534 客户端和 root worker 均设置 `NoNewPrivileges=1`：状态、合成暂停／启用、旧 revision 拒绝、内核拒绝错误组、initialize 拒绝、断连后完成已开始操作共 7 项通过。使用真实 Unix socket 与生产 worker/client 代码，但宿主 adapter 是合成对象；未操作真实 systemd、数据库或协议服务。临时 namespace／目录／归档清理已核验，按文件摘要绑定回执；不把它当作已完成生产 socket activation 或物理停供验收。

跟进索引：[Issue #795](https://github.com/FlyLink-com/proxy-gateway-minimal/issues/795)。源码包含自动路由／每日重排及 Admin 实际供流控制，**生产 helper、权限和配置尚未安装，物理停供／恢复未验收**。未合并、未迁移生产数据库、未切换配置来源、未暂停 BWH 供流。生产验证和最终构件、批准、停供回执仍按实际发布阶段补齐；本地通过不代表生产上线。
