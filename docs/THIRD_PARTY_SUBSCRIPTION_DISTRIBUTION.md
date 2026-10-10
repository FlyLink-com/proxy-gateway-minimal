# 第三方 YAML 订阅分发：分阶段工作边界

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: third_party_subscription_distribution_plan
  superseded_by: null
  last_verified_at: 2026-10-09
  production_authority: false
```

状态：**Draft / 阶段提案，未实现、未导入、未部署**。本记录用于在一个独立
PR 中承接第一阶段实现，不是已完成的 spec-only 交付，也不申请合并。

- Risk: A 功能与生产授权边界；本次仅新增文档，按 C 档验证。
- Process: 先固定阶段与未决事项，再逐项实现及隔离验收；发布另经精确授权。
- Expected PR count: 先一个 Draft PR 承接第一阶段；后续按独立验收边界切片，
  不预先制造多篇 spec/plan 或固定数量的 PR。
- Validation: 当前仅 `git diff --check origin/master...HEAD`；功能验收尚未执行。
- Production/AWS impact: 无；不访问生产、第三方真实订阅或云平台。
- capability: `third-party-subscription-distribution`
- release_unit: `subscription-rendering`（后续后端接线需同时明确
  `control-plane-app`；本次文档不是发布构件）。
- production_state: `not_deployed`
- identity_impact: `false`；不改变自营运行身份、材料绑定或 collector。

## 用户目标与尚待确定的选择

第三方来源构成可管理的路由池，支持批量导入、批量删除和订阅动态刷新（Ethan
2026-10-10 已决定，见下节）；只向本站有权使用订阅的用户重新渲染分发，不纳入本站自营流量计量。
先完成受限 YAML 输入到本站订阅输出的路径，不要求一次完成整个管理系统。

下列边界不能从目前请求中推定，实施对应行为前需要遵守或确定：

1. 用户曾提到“实际渲染分发的只有”但未给出后半句。每次下发节点数、筛选规则、
   每人独立或共享节点集，仅有提议默认值（见下节），Ethan 尚未决定（先前的“每 100 人一组”已作废）；
   不默认下发全部来源或任意固定数量。
2. 第三方节点渲染进本站节点集合、合并为同一份订阅输出，已由 Ethan 决定（见下节）。
   合并后的命名与分组仅有提议默认值（见下节），Ethan 尚未决定；在确定前，不改变自营节点的既有条目、默认分组或订阅入口。
3. 本站到期后停止下发并在刷新时返回既有过期提示，已由 Ethan 决定（见下节）。已下载
   到客户端的第三方凭证不能仅靠本站渲染被吊销；若要求旧配置也立即停止连接，需要上游
   按用户吊销能力或另一个受控接入方案。Ethan 的决定是“云端不再下发”，不另行设计失效机制，
   也不能以刷新或轮换冒充吊销保证。
4. 上游来源须允许本站再分发。上游自己的到期、流量、设备与并发限制不因
   本站不计量而消失。真实来源和凭证不进入 Git、PR、日志或测试夹具。

## Ethan 的决定（2026-10-10）与待 Ethan 回答

已决定（Ethan，2026-10-10；以下均为其原话或据其原话的记录）：

- 自营与第三方的计量边界（Ethan：「自营节点走流量计量；第三方节点走轮换、定期更换」）：
  自营节点继续走流量计量；第三方线路独立于自营流量计量，不进入自营身份映射、
  collector、流量汇总或账务（与下文第一阶段第 6 条一致）。其中“轮换、定期更换”部分
  的周期长度从未确定，后来 Ethan 又说“订阅动态刷新”（见下面“按地区和国家、动态刷新”一条），
  二者关系见下文“提议默认值”与“待 Ethan 决定”。本文先前出现的“每日更新/每日节点轮换/每日轮换”只是先前假设，
  不是决定，不得按“每日”实现或承诺。
- 资格（Ethan：「三方节点只给月卡订阅用户」，同日澄清：「订阅用户都算，月卡/年卡」）：
  第三方节点分发给月卡和年卡的订阅用户，即门户套餐 `plan` 为 `monthly` 或 `yearly`；
  对外 plan id 为 `monthly_30d_50gb`、`monthly_30d_100gb`、`yearly_365d_200gb`。月卡 50 GB 与
  100 GB 两档、年卡均包含。7 天试用已下线（Ethan：「现在7天试用已经下线了，不存在这个用户
  模型了」），因此资格只涉及月卡和年卡订阅用户，不再讨论试用是否包含。
- 节点格式与渲染（Ethan：「节点格式为订阅链接形式，渲染也是走我们正常渲染」）：第三方节点以订阅链接的
  形式存在，渲染走本站现有的正常渲染流程。
- 渲染进本站节点集合（Ethan：「我们渲染把地方的节点配置渲染到我们的节点里」；其中“地方”被理解为
  “三方”的笔误或语音转写之误，Ethan 已确认这一理解：「是这个意思」）：本站渲染器把第三方节点配置渲染
  进本站自己的节点集合，用户拿到的是同一份订阅，其中既有自营节点也有渲染后的第三方节点，而不是把
  第三方链接原样转交。与上一条合读：“订阅链接形式”描述的是第三方节点在导入池中的存在形式，
  对用户的输出由本站渲染生成。
- 到期（Ethan：「订阅到期后云端不再下发订阅」）：到期后云端停止下发订阅。先前“到期后旧配置是否
  立即失效”一项按“云端停止下发”处理，不另行设计失效机制；已下载到客户端的凭证仍不能由本站渲染吊销
  （见上文第 3 项）。月卡到期或未续期后的处理亦以此为准。
- 导入（Ethan：「三方订阅池由后台表单导入」）：第三方订阅池通过后台表单导入。随后 Ethan 补充：
  「我觉得前端不暴露导入功能，只开放分配和观测」，即前端（面向用户或运营的界面）不暴露导入功能，
  只开放“分配”和“观测”；导入本身仍是上述已决定的后台表单。
- 地区/国家与动态刷新（Ethan：「订阅还是按照地区和国家来，订阅动态刷新，到期不再下发」）：第三方订阅
  仍按地区和国家组织；订阅动态刷新；到期不再下发。
- 面板不需要（Ethan：「面板我觉得不需要其实」）：Ethan 先提出过一个导入面板的设想（展示节点名称、地区、
  延迟、是否机房 IP、速度，以及分配到哪个订阅档位（Ethan 当时称 Go/Plus/Year，后改为采用仓库当前名称，见下文），并将第三方订阅配置拆成可直接渲染的
  配置表、存本地或云端数据库、通过代理 agent 自动拉取），之后又说不需要面板。该设想不是决定；
  其中真正保留的两项需求与范围划分见下文“范围与两项需求”。
- 已作废（Ethan：「100人作废」）：~~「节点池每100人用一组三方订阅」~~ 该规则已作废，不再是决定，
  也不得按“每 100 人一组”实现；依赖它的“组满/第 101 个用户”和“用户固定在某一组”两个问题随之取消。

### 范围与两项需求（Ethan 2026-10-10 的表态；Projects Manager 的范围划分，同日）

范围外（不属于 #762，不在本 PR 或其后续实现里做；若要做需 Ethan 另行决定）：

- 导入面板（展示节点名称、地区、延迟、是否机房 IP、速度等的界面）。
- 延迟/速度检测。
- 机房 IP 识别。
- 通过代理 agent 自动拉取。

保留的两项真实需求（取代先前待答项“后台导入表单需要哪些字段”）：

1. **按订阅档位分配**：导入的第三方订阅可以被分配给某个订阅档位。档位名称采用仓库当前的名称
   （Ethan，2026-10-10，私聊，针对“仓库里没有 Go，实际套餐是 monthly_basic 基础月付 20 元、monthly_plus 标准月付
   30 元、yearly 年度套餐 200 元”的说明：「那就按照目前的名称，」——这句话**被截断**，后半句没有收到，因此“采用当前名称、
   不再使用 Go / Plus / Year”是对其意思的**解读**，不是完整引文；如与 Ethan 本意不符再改）。分配档位即：
   - `monthly_basic`（基础月付，20 元 / 月，50 GB / 月；英文 “Basic monthly”）；
   - `monthly_plus`（标准月付，30 元 / 月，100 GB / 月；英文页面 “Monthly member”，管理端 “Standard Monthly”）；
   - `yearly`（年度套餐，200 元 / 年，200 GB / 月；英文 “Yearly plan”）。
   以上取自门户前端（`admin/src/features/user-portal/user-portal-page.tsx`、`user-portal-parsers.ts`、
   `user-portal-types.ts`，`PortalPlanId` 还含 `trial` 与 `monthly`；`trial` 已下线，不作为分配档位）。
   “Go / Plus / Year”曾是 Ethan 的叫法，不再使用；2026-10-10 只读检索 `server/`、`docs/`（排除 `docs/superpowers/` 与
   `docs/archive/` 的历史计划）、`admin/` 未发现任何叫 Go 的套餐标签。
   与币套餐的对应（仓库已核实的数字）：`server/services/platform/coin-commerce-production-catalog.mjs` 的
   `baseCoinUnits` 为 20 / 30 / 200，对应商城 offer：
   20 币 `offerv_plan_30d_50gb_monthly_v1`（50 GB 月度套餐，对外 plan id `monthly_30d_50gb`）；
   30 币 `offerv_plan_30d_100gb_monthly_v1`（100 GB 月度套餐，`monthly_30d_100gb`）；
   200 币 `offerv_plan_365d_200gb_monthly_v1`（200 GB 年度套餐，`yearly_365d_200gb`）
   （offer 到对外 plan id 的映射见 `server/services/platform/subscription-control-db.mjs`）。
   因此档位与币套餐按价格和流量一一对应：`monthly_basic` ↔ 20 币 / 50 GB，`monthly_plus` ↔ 30 币 / 100 GB，
   `yearly` ↔ 200 币 / 200 GB。**说明**：这一对应是按两边的价格与流量数字对上得出的；我没有逐条追踪代码把门户
   plan id `monthly_basic` 等直接连到具体 offer，实现时以代码中的实际映射核对。
   “档位”一词在 `admin/src` 中只出现在 Coins 充值档位（`portal-recharge-offers.tsx`，充值面额），与订阅档位无关。
2. **拆分后的配置直接参与渲染分发**：第三方订阅被拆分出的节点配置直接进入本站渲染与分发（与上文
   “渲染进本站节点集合”一致），不经另一套并行的输出路径。

前端边界（Ethan）：不暴露导入功能；只开放分配和观测。导入仍是已决定的后台表单。

提议的最简字段（Lingxi 自行选择，**提议，非 Ethan 决定**）：

- 后台导入表单：来源名称/备注；订阅链接 URL（敏感：加密存储，导入后不回显，不进日志）；
  地区/国家（能从节点解析出则自动，否则手填）；分配档位（`monthly_basic` / `monthly_plus` / `yearly`，即 20 / 30 / 200 币套餐，可多选）；启用开关。
- 分配（可开放）：对已导入的来源或节点选择分配到哪些档位。
- 观测（可开放，只读）：来源列表、节点数量、最近一次刷新时间与结果、各档位当前下发的节点数；
  不显示订阅链接或凭证。

### 可行性判断（判断，不是实现；除下列已检索的文件外未对照代码核实）

以下“已核实”仅指 2026-10-10 在本分支代码与 `package.json` 中的只读检索结果；“判断”为 Lingxi 的意见，未做原型或运行验证。

已核实（后端已有的基础设施）：

- **数据库层：有。** `package.json` 的 `dependencies` 为 `better-sqlite3`、`dotenv`、`express`、`express-rate-limit`、
  `node-fetch`、`socks`、`socks-proxy-agent`；没有其他数据库驱动或 ORM。多个服务直接使用 `better-sqlite3`（SQLite），
  例如 `server/services/subscriptions/repository.mjs`（订阅仓库，`journal_mode = WAL`）、
  `server/services/platform/subscription-control-db.mjs`、`coin-wallet-store.mjs`、`coin-commerce-store.mjs`、
  `payment-store.mjs`，并有成套迁移文件（如 `coin-commerce-migrations.mjs`、`coin-wallet-migrations.mjs`）。
- **定时/后台任务：有，但没有通用调度框架。** `dependencies` 中没有 cron/队列类库。已找到的两种方式：
  (1) systemd 定时器：`ops/systemd/gccgw-platform-lead-retention.timer`（`OnCalendar=hourly`）触发一次性服务
  `gccgw-platform-lead-retention.service`，执行 `scripts/platform-lead-retention.mjs`（`ops/systemd/` 下只有这一对
  定时器/服务，另有 `proxy-gateway-console.service`、`proxy-gateway-ss.service`）；
  (2) 进程内定时器：`server/services/platform/portal-referral-service.mjs` 在启用奖励时用 `setInterval`（30 秒）
  处理持久化事实，并 `unref()`。
- **静态加密存储敏感值：有先例，没有通用的密钥管理模块。** 已找到 `node:crypto` 的 AES-256-GCM 用法：
  `server/services/platform/portal-totp-verifier.mjs`（带 `v2:aes-256-gcm:` 前缀的受保护密文，密钥来自配置，见
  `server/state.mjs` 中 `USER_PORTAL_TOTP_SECRET_KEY`）和 `server/services/platform/wallet-first-setup-delivery-escrow.mjs`
  （`v1:aes-256-gcm:` 信封）；密码使用 scrypt（`portal-password-credentials.mjs`）。检索未发现 KMS、sops 或通用的
  “加密存储任意密钥”的服务。这些是各自功能的实现，**未核实**它们能否直接复用于第三方订阅 URL。
- **未核实：** 现有代码里是否已有抓取第三方订阅 URL 的任务（未检索）；SQLite 在多实例、定时刷新并发写入下是否合适
  （未评估）；生产环境实际如何部署、保存密钥。

判断（基于以上，未做原型）：

- 存放位置：云端服务端数据库是合适的位置。到期停止下发和动态刷新都发生在服务端；本地存储不适合。
- 定时抓取：由服务端定时任务拉取第三方订阅 URL，并拆成逐节点的行，判断为可行。
- 主要风险：
  - 第三方订阅 URL 本身带凭证：加密存储，绝不写日志、不回显。
  - 上游故障或格式变化：保留最后一次成功的节点并告警，不下发空列表。
  - 去重与来源追踪：同一节点可能来自多个来源，需要稳定去重并记录来源。
  - 机房 IP、速度、延迟检测只能是近似值，且必须从本站自己的服务器测量；这些现在不在范围内。

### 提议默认值（**提议，非 Ethan 决定**；如 Ethan 回复「按你的来」，即采用这些）

- 合并订阅中的命名与分组：第三方节点使用清晰的统一标记命名（标记具体文字待定），按地区/国家分组，
  与自营节点并列；不覆盖、不改名自营条目。
- 刷新方式：服务端定时任务按固定间隔刷新。间隔仅是提议（初值如每 6 小时），不是已定事实。
- 每次下发多少节点、如何筛选：用户所属订阅档位决定其可得的节点集合，同档用户共享同一集合，
  不做每人独立；不另设条数上限或额外筛选，仅按地区/国家分组。
- 单独轮换：提议不再另设轮换，由动态刷新取代（Ethan 先说轮换、后说动态刷新）。
- 刷新失败：保留上一次成功的节点，并告警；不因抓取失败下发空订阅。

待 Ethan 决定（#762 仍为仅文档、Draft；只有这两点真正需要 Ethan）：

1. 是否确认上述提议默认值（或直接回复「按你的来」）。
2. 是否取消单独轮换、改由动态刷新取代。

资格识别（已回答，非待答项）：按 `plan` ∈ {`monthly`, `yearly`}，或对外 plan id
`monthly_30d_50gb`、`monthly_30d_100gb`、`yearly_365d_200gb` 识别；50 GB、100 GB 两档月卡与年卡均已
回答为包含。以下为只读检索到的现有表示（供实现时核对）：
- 门户套餐 `plan` 取值为 `trial` / `monthly` / `yearly`：`docs/COMMERCIAL_MODEL_V1.md`、
  `server/services/platform/portal-access-requests.mjs`。
- 商城产品中的月卡（30 天，50 GB 或 100 GB 每月重置）对应 offer 版本
  `offerv_plan_30d_50gb_monthly_v1`、`offerv_plan_30d_100gb_monthly_v1`，年卡为
  `offerv_plan_365d_200gb_monthly_v1`：`docs/COINS_FIRST_COMMERCIAL_DECISION.md`、
  `server/services/platform/coin-commerce-production-catalog.mjs`。
- offer 到 `portalPlan` 的映射（时长为 365 天记为 `yearly`，其余记为 `monthly`）
  与对外 plan id（`monthly_30d_50gb`、`monthly_30d_100gb`、`yearly_365d_200gb`）：
  `server/services/platform/coin-commerce-production-subscription-fulfillment.mjs`、
  `server/services/platform/subscription-control-db.mjs`。
- 在 `server/` 与 `docs/` 中检索，“月卡”字样仅见于商城产品标题、测试和归档计划，没有名为“月卡”的后端字段。

7 天试用已下线（Ethan 原话：「现在7天试用已经下线了，不存在这个用户模型了」），
不属于 #762 的资格范围。仓库代码与文档中可能仍有遗留的 `trial` 套餐值（上文第一条
所列文件即含该取值）：遗留引用存在于代码/文档中，未核实是否已无用；它们不是现行
用户模型，#762 不需要处理。

#762 保持仅文档（docs-only），不写代码；保持 Draft，不请求合并。目前只有上面“待 Ethan 决定”
的两点需要 Ethan 回答：确认提议默认值，以及是否取消单独轮换、改由动态刷新取代。

## 第一阶段：受限 YAML 到认证分发

以下是实现目标，**不是当前已存在的功能**：

1. 接受明确提交的 YAML 文件内容；先用合成样例实现解析和预览。选择经过
   审查的解析方式，限制输入大小、节点数、嵌套与别名扩展，拒绝重复键及
   不支持的结构；不运行配置，也不自行编写一个宽松的完整 YAML 解析器。
2. 仅提取白名单协议及字段，转换为独立的第三方节点模型。节点名称规范化
   并稳定去重；错误输出仅含条目序号、类别和计数，不回显原始配置或凭证。
3. 不继承上游 `rules`、DNS、监听器、TUN、控制端口、脚本、远程 provider
   或其他执行/获取入口；按本站受控模板重新渲染。未知字段不得静默变成
   获准执行的功能，不以关闭 TLS 校验来“兼容”异常来源。
4. 先验证原有用户权限与订阅链接状态，再解析获准发布的节点快照。不能
   绕过 disabled、revoked、rotated、临时链接期限、认证或权益判断；不能
   新增匿名下载入口或使用长期有效的上游 URL 替代本站认证入口。
5. 仅已有的、经类型区分的订阅到期结果可走过期提示配置。失效/撤销链接
   不因第三方源存在而恢复访问；续期与充值余额不是同一行为。
6. 第三方节点不写入自营身份映射、collector、流量汇总或账务；既有自营
   计量不变。未采集不等于实测零用量。客户端必须获得的节点凭证仍属于
   敏感材料，不能宣称经过重新渲染便对接收用户不可见。
7. 第一阶段输出可在隔离环境由合成账户获取并通过客户端解析和刷新验证。
   持久存储、Admin 写接口、生产接线和发布范围必须在实际实现前分别收敛；
   当前文档不授权写生产数据或将真实上游内容落到本机。

现有可参考边界：

- `server/services/subscriptions/core.mjs`：订阅权限与链接状态。
- `server/services/subscriptions/subscription-route-resolver.mjs`：HTTP 解析边界。
- `server/routes/subscription.mjs`：现有 YAML 输出及到期响应。
- `server/services/clash-subscription.mjs`：受控订阅模板与分组。
- [现有到期提示说明](SUBSCRIPTION_EXPIRY_NOTICE.md)：客户端缓存和刷新限制。

这些位置仅用于评估复用，不意味着把外部配置塞进自营配置或跳过原有校验。
不将 #753 的独立流量包工作或 #755 的会话续期工作并入本 PR。

## 后续切片：路由池管理和轮换

后续能力可在同一 PR 内按已确定边界补齐；若形成独立可验收功能，再拆为
关联 PR。未完成前保持明确待办，不阻塞无依赖的第一阶段开发。

- **Admin 批量导入/更新**（仅后台表单；前端不暴露导入，只开放分配和观测）：受保护的写权限、逐项解析预览、去重、部分失败
  结果、明确发布确认、脱敏审计；拒绝将来源密钥作为普通列表字段返回。
- **Admin 批量删除**：固定 ID 清单与确认、当前引用校验、明确部分失败与
  原子切换策略；先从活动分发快照移除，受保护历史与审计按保留规则处理。
  不使用通配符删除，不联动删除用户、权益、账务或自营身份。删除本站源
  不代表已经吊销客户端持有的上游凭证。
- **URL 来源抓取**：单独审查 HTTPS、重定向、DNS 重绑定、私网/元数据地址
  阻断、长度/时间/解压上限及来源凭证保管；文件导入不得暗中触发网络抓取。
- **健康选择**：区分解析有效、服务器探测成功与用户真实连通；未测不是
  健康。限定探测并发、流量和超时，客户端自动选择不能代替鉴权或上游授权。
- **节点轮换**（先前草稿写作“每日节点轮换”，每日只是假设，不是决定；Ethan 已决定订阅动态刷新，是否仍需单独的定期轮换及周期见上节“提议默认值”与“待 Ethan 决定”）：在指定时区按明确策略生成带版本的候选快照；校验后
  原子生效，可恢复上一个仍有效版本。重复执行不能重复换代；全部不可用、
  来源撤销或超过可用期限时停止该池下发，不能无限沿用旧凭证。
- **稳定订阅入口**：轮换池版本与重置用户订阅凭证是两个操作；计划中的
  轮换不自动变更用户链接，也不清零任何用量或权益。

## 分步验收与发布边界

实现阶段先补边界测试，再逐项验证解析、转换、权限和输出；最终汇总各
功能的精确源码与验收索引，不用一次黑盒执行的成功替代分项证据。

- [ ] 恶意/超限/重复/不支持 YAML、敏感错误输出、禁止的远程引用。
- [ ] 多用户、禁用、撤销、链接重置、临时链接到期、权益到期与续期。
- [ ] 第三方输出正确，自营模板/身份/计量不变，任何缓存不跨用户泄漏。
- [ ] 合成输入的真实客户端解析、刷新到期提示和续期恢复；明确旧缓存限制。
- [ ] 精确最终源码的 targeted tests、`npm test`、diff 检查及独立审查。
- [ ] 如新增 Admin UI，执行 `npm run admin:test` 和 `npm run admin:build`。
- [ ] 独立发布边界：新备份、精确构件、default-off/受限启用、操作批准、
  分步切换与接口验收；失败回退本次节点快照/代码，不恢复旧账务数据库。
- [ ] 实际发布后追加 Deploy Note；没有执行则明确记为 `not_deployed`。

当前完成：阶段与边界文档。当前未完成：以上实现与功能验收全部未完成。
不得据此标为 Ready、请求合并、承诺真实节点可用或宣布生产功能上线。
