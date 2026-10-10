# 第三方 YAML 订阅分发：分阶段工作边界

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: third_party_subscription_distribution_plan
  superseded_by: null
  last_verified_at: 2026-10-10
  production_authority: false
```

状态：**Draft / 第一阶段源码已落地（feature flag default-off；刷新调度器只有未安装的单元文件），未导入真实来源、未部署、不申请合并**。本记录仍是独立 Draft PR 的权威边界，不是已完成交付。

- Risk: A 功能与生产授权边界（新 SQLite schema + 订阅输出）；本次为 B 档源码核心，Draft、source-only。
- Process: 按已确定默认做法实现后台导入/分配/观测、渲染合并、手动刷新，以及未安装的 systemd 定时刷新文件。
- Expected PR count: 保持这一个 Draft PR 承接第一阶段；后续按独立验收边界切片。
- Validation: 第二轮 targeted、全量 `npm test` 与文档门禁见下文“实现状态”。全量：5417 tests / 5350 pass / 11 fail / 56 skipped；11 个失败项与未含本改动的基线 `c11f2291` 上的失败相同（Windows 环境类）。
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

下列边界在实施对应行为前需要遵守：

1. 用户曾提到“实际渲染分发的只有”但未给出后半句。每次下发节点数、筛选规则、每人独立或共享节点集，
   Ethan 已接受默认做法（见下节“已确定的默认做法”）：由用户所属订阅档位决定节点集合，同档共享；
   先前的“每 100 人一组”已作废；不默认下发全部来源或任意固定数量。
2. 第三方节点渲染进本站节点集合、合并为同一份订阅输出，已由 Ethan 决定（见下节）。
   合并后的命名与分组已按默认做法确定（见下节）；无论如何，不改变自营节点的既有条目、默认分组或订阅入口。
3. 本站到期后停止下发并在刷新时返回既有过期提示，已由 Ethan 决定（见下节）。已下载
   到客户端的第三方凭证不能仅靠本站渲染被吊销；若要求旧配置也立即停止连接，需要上游
   按用户吊销能力或另一个受控接入方案。Ethan 的决定是“云端不再下发”，不另行设计失效机制，
   也不能以刷新或轮换冒充吊销保证。
4. 上游来源须允许本站再分发。上游自己的到期、流量、设备与并发限制不因
   本站不计量而消失。真实来源和凭证不进入 Git、PR、日志或测试夹具。

## Ethan 的决定（2026-10-10）

已决定（Ethan，2026-10-10；以下均为其原话或据其原话的记录）：

- 自营与第三方的计量边界（Ethan：「自营节点走流量计量；第三方节点走轮换、定期更换」）：
  自营节点继续走流量计量；第三方线路独立于自营流量计量，不进入自营身份映射、
  collector、流量汇总或账务（与下文第一阶段第 6 条一致）。其中“轮换、定期更换”部分
  的周期长度从未确定，后来 Ethan 又说“订阅动态刷新”（见下面“按地区和国家、动态刷新”一条），
  后来 Ethan 以「按照你的来」接受“不再另设轮换，由动态刷新取代”（见下文“已确定的默认做法”）。本文先前出现的“每日更新/每日节点轮换/每日轮换”只是先前假设，
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

- 接受默认做法与名称解读（Ethan，2026-10-10，私聊：「按照你的来」）：Ethan 接受下文“已确定的默认做法”的全部内容
  （命名与分组、固定间隔刷新、按档位决定节点集合、取消单独轮换改由动态刷新取代、刷新失败的处理），并接受
  “档位采用仓库当前名称”的解读。轮换一事 Projects Manager 此前已按“已回答”处理，这里一并确认。

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
   不再使用 Go / Plus / Year”是对其意思的**解读**，不是完整引文。Ethan 随后在私聊回复「按照你的来」，接受该解读）。分配档位即：
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

最简字段（由 Lingxi 选择，Ethan 以「按照你的来」接受；表单的实际字段在实现时可微调）：

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
  `gccgw-platform-lead-retention.service`，执行 `scripts/platform-lead-retention.mjs`（2026-10-10 检索时
  `ops/systemd/` 下这一对定时器/服务之外还有 `proxy-gateway-console.service`、`proxy-gateway-ss.service`；
  第三方订阅刷新的 service/timer 是其后追加的未安装文件，见实现状态）；
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

### 已确定的默认做法（Ethan，2026-10-10 私聊：「按照你的来」，接受全部默认）

以下做法原为 Lingxi 的提议，现已由 Ethan 接受，不再是提议：

- 合并订阅中的命名与分组：第三方节点使用清晰的统一标记命名，按地区/国家分组，与自营节点并列；
  不覆盖、不改名自营条目。标记的具体文字在实现时再定（未决定的只是文案，不是做法）。
- 刷新方式：服务端定时任务按固定间隔刷新；间隔初值为每 6 小时，可在实现时调整（Ethan 接受的是做法，
  没有对 6 小时这个数字单独表态，数字按初值处理）。
- 每次下发多少节点、如何筛选：用户所属订阅档位决定其可得的节点集合，同档用户共享同一集合，不做每人独立；
  不另设条数上限或额外筛选，仅按地区/国家分组。
- 单独轮换：取消，不再另设轮换，由动态刷新取代（Ethan 先说轮换、后说动态刷新；Projects Manager 此前已按
  “已回答”处理，现经 Ethan 确认）。
- 刷新失败：保留上一次成功的节点，并告警；不因抓取失败下发空订阅。

目前**没有**待 Ethan 决定的事项。上文“可行性判断”中标为“未核实”的内容仍是未核实，实现前需要核对，
不因 Ethan 接受默认做法而变成已核实。

资格识别（已回答，非待答项）：按 `plan` ∈ {`monthly`, `yearly`}，或对外 plan id
`monthly_30d_50gb`、`monthly_30d_100gb`、`yearly_365d_200gb` 识别；50 GB、100 GB 两档月卡与年卡均已
回答为包含。实现不按这两个词或对外 plan id 直接放行，见下文“档位映射”：付费履约写入的是
offerVersionRef；只存 `monthly` / `yearly` / `trial` / `pilot` 的旧权益当前不下发第三方节点。
以下为只读检索到的现有表示（供实现时核对）：
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

目前没有待 Ethan 决定的事项。#762 保持 Draft，不请求合并。第一阶段首轮源码见下文
“实现状态（第一阶段首轮）”；生产接线仍须独立 Risk A Gate。

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
- **节点轮换**（先前草稿写作“每日节点轮换”，每日只是假设，不是决定；Ethan 已决定订阅动态刷新，并以「按照你的来」确认不再另设单独轮换，见上节“已确定的默认做法”；本条仅作为历史描述保留）：在指定时区按明确策略生成带版本的候选快照；校验后
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

## 实现状态（第一阶段首轮）

本轮是 Draft、source-only、feature flag default-off。生产代码不自动 apply schema；
schema 缺失或密钥未配置时功能报告 `third_party_unavailable`，渲染跳过第三方节点。

存在的源码：

- `server/services/platform/third-party-subscription-migrations.mjs`
- `server/services/platform/third-party-subscription-store.mjs`
- `server/services/platform/third-party-subscription-fetch.mjs`
- `server/services/platform/third-party-subscription-tier.mjs`
- `server/services/platform/third-party-subscription-render.mjs`
- `server/routes/admin-third-party-subscriptions.mjs`
- `scripts/platform-third-party-subscription-schema.mjs`
- `scripts/platform-third-party-subscription-refresh.mjs`
- `ops/systemd/gccgw-platform-third-party-subscription-refresh.service`
- `ops/systemd/gccgw-platform-third-party-subscription-refresh.timer`
- `server/tests/third-party-subscription-*.test.mjs`
- 接线：`server/state.mjs`、`server/app.mjs`、`server/routes/subscription.mjs`、
  `server/services/clash-subscription.mjs`
- npm script：`platform:third-party-subscription:schema`、`platform:third-party-subscription:refresh`
- env 占位：`.env.example` 与 `ops/edge-node/templates/env.example`（仍是前三个变量；最小间隔有代码默认值，本轮不改示例文件）

环境变量（功能开关默认关闭；最小间隔只给刷新脚本，未设置时用默认）：

- `THIRD_PARTY_SUBSCRIPTION_ENABLED`（默认 false。刷新脚本同样读取：不是 true 则退出码 0、status `disabled`，不打开数据库、不访问网络）
- `THIRD_PARTY_SUBSCRIPTION_DB_PATH`（独立 SQLite，不写入 control DB；刷新脚本要求绝对路径）
- `THIRD_PARTY_SUBSCRIPTION_SECRET_KEY`（32-byte，格式与 `USER_PORTAL_TOTP_SECRET_KEY` 相同，解析与 `server/state.mjs` 的 `createOptionalThirdPartySecretProtector` 相同，AES-256-GCM `v2:aes-256-gcm:` 信封；独立密钥）
- `THIRD_PARTY_SUBSCRIPTION_REFRESH_MIN_INTERVAL_SECONDS`（仅刷新脚本；默认 18000，即 5 小时，刻意低于 6 小时的 timer 间隔，避免 timer 稍早触发时被误跳过。`last_refresh_at` 落在该窗口内的来源跳过，避免误跑两次打上游。失败刷新不更新 `last_refresh_at`）

Admin 接口（console token；JSON；错误体仅 `{error: code}`；从不回显 URL）：

- `POST /api/admin/third-party-subscriptions/sources`
- `PATCH /api/admin/third-party-subscriptions/sources/:id`
- `GET /api/admin/third-party-subscriptions/sources`
- `GET /api/admin/third-party-subscriptions/summary`
- `POST /api/admin/third-party-subscriptions/sources/:id/refresh`

档位映射（纯函数，由 usage binding 的 `plan` 决定。付费履约把
`platform_entitlements.plan` 写成 `product.offerVersionRef`，见
`fulfillCommerceProduct`。冻结映射与 `subscription-control-db.mjs` 里未导出的
`WALLET_FIRST_RESOURCE_EFFECT_SUPPORTED_OFFERS` 对齐；tier 模块复制这三行，不导入该私有常量）：

- `offerv_plan_30d_50gb_monthly_v1` → `monthly_basic`（50 GB，交叉校验 `50 * 1024**3` 字节）
- `offerv_plan_30d_100gb_monthly_v1` → `monthly_plus`（100 GB，`100 * 1024**3`）
- `offerv_plan_365d_200gb_monthly_v1` → `yearly`（200 GB，`200 * 1024**3`）

binding 带有 `trafficLimitBytes` 时，必须等于该 offer 的 `GB * 1024**3`；不一致则 fail closed。
未带该字段时只认 offer ref。对外 plan id（`monthly_30d_50gb`、`monthly_30d_100gb`、
`yearly_365d_200gb`）不是 `entitlement.plan`，不能用来放行。旧路径和手工发放只存
`monthly` / `yearly` / `trial` / `pilot`，没有流量档位，无法区分 `monthly_basic` 与
`monthly_plus`。这些值、未知 ref、缺失 binding、tenant 非 `active` 一律不下发第三方节点。
因此 legacy 的 `monthly` / `yearly` 权益在后续另有决定之前收不到第三方节点。legacy `monthly` / `yearly` / `trial` / `pilot` 权益默认不下发第三方节点（Projects Manager 决定：更安全的默认值；仅当 Ethan 说明它们对应哪个档位时再重新评估）。过期路径仍走既有
`sendResolutionFailure` 到期提示。控制库那份 offer 表没有导出，本轮没有做“映射键等于控制库键”的跨模块断言。

本轮简单选择：

- 输入是订阅分享链接（ss/vless/hysteria2|hy2/tuic），明文或 base64 行列表；
  不做 YAML 解析、不加依赖。这与 Ethan「节点格式为订阅链接形式」一致；原第一阶段
  文案中的 Clash YAML 文件导入仍是后续切片。
- 节点名标记前缀：`[3P] <COUNTRY> <n> | <origin>`；国家分组名：`3P-<CC>`，
  类型 `url-test`，写入 GLOBAL。
- 第三方节点 `autoEligible: false`、无 quality class，并从 AUTO/STABLE/FALLBACK
  排除；自营这四组在无第三方节点时输出与改前一致（含 inline Mihomo 模板历史上无条件列出 AUTO 的行为）。
- 存在第三方节点时，provider 模式的 profile（`generateClashProviderSubscription` /
  `generateMihomoProviderTemplate`）改走与 inline 订阅相同的分组，避免 `use: provider`
  把第三方节点送进 AUTO/FALLBACK。
- 上游 share link 的 `insecure` / `skip-cert-verify` 不拷贝为 `skipCertVerify: true`。
- 刷新失败或解析出 0 个有效节点时保留上次成功节点，只记短错误码；未见节点标
  `active=0`，不硬删。
- 刷新调度以文件存在，未安装、未 enable，也没有进程内定时器。脚本
  `scripts/platform-third-party-subscription-refresh.mjs`：不带参数是 dry-run，只统计将刷新的启用来源，
  不访问网络、不改来源行；`--apply` 才按来源顺序刷新，每个来源单独 try/catch。
  启用开关不是 true 时退出码 0，stdout 一行 JSON，`status` 为 `disabled`，不打开数据库、不访问网络。
  退出码：`0` disabled / planned / completed；`20` blocked（缺路径、路径不是绝对路径、密钥缺失或无效、
  schema 不存在、store 不可用）；`30` 至少一个来源失败；`64` 参数不合法或最小间隔不是非负安全整数；
  `70` internal_error。告警是 stderr 一行 `third_party_refresh_failed count=N` 加上退出码 30，不写 URL。
  最小间隔默认 18000 秒（5 小时；timer 仍为 6 小时）。systemd 单元
  `ops/systemd/gccgw-platform-third-party-subscription-refresh.service`（oneshot，`ExecStart` 带 `--apply`，
  加固和 `EnvironmentFile`、`ReadWritePaths` 与 lead-retention 单元同一套候选路径）和同名 `.timer`。
  timer 初值 `OnUnitActiveSec=6h`、`OnBootSec=15min`、`RandomizedDelaySec=10m`、`Persistent=true`。
  6 小时是初值；改间隔用 drop-in override，不改仓库单元。本轮没有 systemctl enable 或 start，没有把单元装到任何主机。

已知限制：

- DNS rebinding：解析后到连接前 DNS 可能变化；本轮检查字面地址与当时解析结果
  （含 CGNAT、组播/保留段与十六进制 IPv4-mapped IPv6），不在此轮做 pin / happy-eyeballs 级防护。
- 无批量删除、无 Admin 前端、无真实上游抓取、无生产 schema apply。
- 已下载到客户端的第三方凭证不能由本站渲染吊销。

本轮测试核实（合成夹具，无真实第三方 URL）：

- 第二轮 targeted：`node --test server/tests/third-party-subscription-*.test.mjs` → 33 pass / 0 fail。
- `npm run docs:authority:strict` → 通过（416 个 document metadata block）。
- `git diff --check` 与 `git diff --cached --check` → 通过。Windows autocrlf 只提示 LF 将在 Git 下次触及这些文件时换成 CRLF，没有 whitespace error。
- `npm run validation:environment:source` → `state: ready`（Windows；warningKeys 为既有的 ALL_PROXY、HTTPS_PROXY、HTTP_PROXY、NODE_PATH）。
- 全量 `npm test`（第二轮，本工作区）：5417 tests / 5350 pass / 11 fail / 56 skipped。11 个失败项在未含本改动的基线（`c11f2291`，同一 Windows 机器、同一 node_modules）上以相同的文件/数量复现（artifact-manifest 2、control-plane-release-identity 1、welcome-coins-native-synthetic-runner 1、welcome-coins-runtime-closure 2、project-drift-report 1、project-export 1、project-state-check 1、validation-environment-preflight 2），属 Windows 环境类既有失败，不在 `third-party-subscription-*.test.mjs`。未改这些文件。

覆盖：schema 临时库 validate/apply 与缺失 fail-closed；加密 round-trip 与拒绝无前缀/损坏信封；admin 无 token 为 401；导入拒绝 non-https / 私网 / 非法档位；PATCH 分配与观测/刷新响应不含 URL；ss/vless/hy2/tuic 解析与 unsupported/malformed 计数；base64 与明文；地区识别；fetch 对私网、重定向到私网、超限、超时失败；keep-last-good 与 inactive 标记；档位按 offerVersionRef 映射，三档 offer、流量交叉校验不一致、legacy `monthly` / `yearly` / `trial` / `pilot`、未知 ref、缺失 binding、非 active 均 fail closed；flag-off YAML 与现有输出一致；flag-on 仅为对应档位增加带标记节点和国家分组；四条 YAML 入口一致；过期用户拿不到第三方节点；刷新脚本在 flag 关闭时不打开库也不访问网络，dry-run 不抓取不改来源行，成功路径，单来源失败保留 last-good 且退出码 30、stderr 告警不含 URL，最小间隔跳过，JSON 不含合成 URL 或口令；systemd 单元含必需键且 ExecStart 指向该脚本。

## 必须在测试环境走一遍

只在隔离的 candidate 或测试环境做。只用合成来源。不要对真实第三方 URL、生产库或 control DB 操作。

1. 不设置 `THIRD_PARTY_SUBSCRIPTION_ENABLED`，拉取一份现有订阅 YAML。
   预期: 与开启该功能前的输出一致。
2. 用 schema CLI 对一个空的新 DB 文件路径执行 apply，并带上 `--confirm-migration-id` 与 `--confirm-ddl-checksum`。
   预期: 该文件 schema ready；它不是生产库，也不是 control DB。
3. 在该测试进程设置 `THIRD_PARTY_SUBSCRIPTION_ENABLED=true`。
   预期: 只有该测试进程读到开启。
4. 把 `THIRD_PARTY_SUBSCRIPTION_DB_PATH` 指向上一步的新文件。
   预期: 路径不是 control DB，也不是生产订阅库。
5. 设置独立的 `THIRD_PARTY_SUBSCRIPTION_SECRET_KEY`（32 字节，格式与 `USER_PORTAL_TOTP_SECRET_KEY` 相同）。
   预期: 密钥只留在该测试环境，不进入 Git、日志或响应。
6. 用 admin token `POST /api/admin/third-party-subscriptions/sources` 导入一条合成 https URL（例如 `https://example.invalid/...`，或测试注入的 fake HTTPS）。
   预期: 请求成功，响应体不含该 URL。
7. `PATCH /api/admin/third-party-subscriptions/sources/:id`，把该来源的 tiers 设为 `monthly_basic`、`monthly_plus`、`yearly`。
   预期: 响应 tiers 为这三档，且不含 URL。
8. `GET /api/admin/third-party-subscriptions/sources`。
   预期: 响应不含订阅 URL、节点凭证、host 或 password。
9. `GET /api/admin/third-party-subscriptions/summary`。
   预期: 响应不含订阅 URL、节点凭证、host 或 password。
10. 对这条合成或本地 fake HTTPS 来源调用 `POST /api/admin/third-party-subscriptions/sources/:id/refresh`。
    预期: 状态为 ready，活动节点数大于 0，响应不含 URL。
11. 用 active 权益 `plan=offerv_plan_30d_50gb_monthly_v1` 且 `trafficLimitBytes` 为 `50 * 1024**3` 的用户拉取 `/sub/clash.yaml`。
    预期: YAML 含分配给 `monthly_basic` 的节点。
12. 用 active 权益 `plan=offerv_plan_30d_100gb_monthly_v1` 且 `trafficLimitBytes` 为 `100 * 1024**3` 的用户拉取 `/sub/clash.yaml`。
    预期: YAML 含分配给 `monthly_plus` 的节点。
13. 用 active 权益 `plan=offerv_plan_365d_200gb_monthly_v1` 且 `trafficLimitBytes` 为 `200 * 1024**3` 的用户拉取 `/sub/clash.yaml`。
    预期: YAML 含分配给 `yearly` 的节点。
14. 用已过期用户拉取 `/sub/clash.yaml`。
    预期: 仍是既有到期提示，没有第三方节点。
15. 用 `plan` 为 `monthly` 的 legacy 用户拉取 `/sub/clash.yaml`。
    预期: 没有第三方节点。
16. 用 `plan` 为 `yearly` 的 legacy 用户拉取 `/sub/clash.yaml`。
    预期: 没有第三方节点。
17. 用 `plan` 为 `trial` 的用户拉取 `/sub/clash.yaml`。
    预期: 没有第三方节点。
18. 用 `plan` 为 `pilot` 的用户拉取 `/sub/clash.yaml`。
    预期: 没有第三方节点。
19. 打开步骤 11 的 YAML，核对第三方节点名和分组名。
    预期: 节点名带 `[3P]`，国家分组名为 `3P-<CC>`，自营节点名称不变。
20. 让同一次来源的下一次 refresh 失败（断开 fake 源，或让它返回空内容）。
    预期: 上次成功的节点仍在，订阅不变成空的第三方列表。
21. 对测试库执行 `node scripts/platform-third-party-subscription-refresh.mjs`，不带 `--apply`。
    预期: 退出码 0；stdout 只有一行 JSON，`status` 为 `planned`；不访问网络；来源行不被刷新改写。
22. 对同一测试库执行 `node scripts/platform-third-party-subscription-refresh.mjs --apply`。
    预期: 已超过最小间隔的启用来源被刷新；若有来源失败，退出码为 30，stderr 为 `third_party_refresh_failed count=N`。
23. 检查步骤 21、步骤 22 的 stdout 和 stderr，以及该测试进程的服务日志。
    预期: 都不含订阅 URL 或节点凭证。
24. 取消 `THIRD_PARTY_SUBSCRIPTION_ENABLED` 后再拉一次订阅。
    预期: 输出回到自营 YAML，没有第三方节点。

## 上线前才能做

本节各项都还没有做。它们是 Risk A 生产步骤，需要另一次明确批准。现在不要执行。

1. 取得覆盖本次生产变更的 Risk A Gate 书面批准。
   预期: 批准写明 schema、密钥、systemd 与 flag 的范围。
2. 备份 control DB 和将要写入的第三方 DB，并写下回退步骤。
   预期: 备份位置和回退命令有记录，备份不进入 Git。
3. 用 schema CLI 对生产绑定的第三方 DB 文件执行 apply，并带上 `--confirm-migration-id` 与 `--confirm-ddl-checksum`。
   预期: 该文件 schema ready，且没有对 control DB 执行 apply。
4. 生成 `THIRD_PARTY_SUBSCRIPTION_SECRET_KEY`，只写入受保护的环境文件。
   预期: 密钥不在仓库、PR、日志或文档里。
5. 安装并 enable `gccgw-platform-third-party-subscription-refresh.service` 和同名 timer。
   预期: timer 处于 enabled；以后改间隔用 drop-in，不改仓库里的单元文件。
6. 在生产环境把 `THIRD_PARTY_SUBSCRIPTION_ENABLED` 设为 true。
   预期: 只有 Gate 批准后的目标进程读到开启。
7. 导入真实第三方来源。
   预期: 响应和日志都不含订阅 URL。
8. 人工值守第一次真实刷新。
   预期: 刷新成功，或失败时保留 last-good，并且 stderr 告警看得见。
9. 用真实 `offerv_plan_30d_50gb_monthly_v1` 用户拉取订阅。
   预期: 能看到分配给 `monthly_basic` 的第三方节点。
10. 用真实 `offerv_plan_30d_100gb_monthly_v1` 用户拉取订阅。
    预期: 能看到分配给 `monthly_plus` 的第三方节点。
11. 用真实 `offerv_plan_365d_200gb_monthly_v1` 用户拉取订阅。
    预期: 能看到分配给 `yearly` 的第三方节点。
12. 在相关 PR 追加 Deploy Note，字段为 `deployed_at`、`release_unit`、`source_commit`、`artifact_or_release`、`target`、`backup`、`validation`。
    预期: 这些字段都有值；`release_unit` 用 `AGENTS.md` 里的固定值，并与实际部署单元一致。
13. 做一次回退演练：关掉 `THIRD_PARTY_SUBSCRIPTION_ENABLED`。
    预期: 订阅输出回到自营 YAML。
14. 决定 legacy `monthly` / `yearly` 权益是否以及如何获得第三方节点。
    预期: 有书面决定之前，这两类权益继续不下发第三方节点。

当前完成：阶段与边界文档，第一阶段 source-only 实现（default-off），以及未安装的刷新脚本和 systemd 单元文件。
当前未完成：YAML 文件导入、Admin 前端、真实上游、生产 schema、密钥安装、systemd 安装与 enable、flag 开启、发布。
不得据此标为 Ready、请求合并、承诺真实节点可用或宣布生产功能上线。
