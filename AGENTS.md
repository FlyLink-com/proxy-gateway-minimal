# Project Instructions

- 默认用中文回复，除非用户明确切换语言或任务本身要求英文。
- 对本机、CLI、配置、仓库、部署、网络、代理和日志问题，先在授权范围内实查，再给结论；不凭记忆猜路径、进程、端口或线上状态。
- 修改配置或代码前先确认当前文件内容、Git 状态和相关上下文；不要回滚用户已有改动。
- 对密钥、token、订阅链接、账号凭证和服务器敏感输出，只说明存在和位置，不在回复中复述原文。
- Windows 本机任务优先使用 PowerShell；涉及 Unicode 输出时注意编码问题。
- 不要在根目录或无明确项目上下文时加载过多技能、插件或外部服务；按当前项目和任务需要最小化启用对应能力。
- 订阅管理项目的固定本地仓库路径是 `D:\Projects\proxy-gateway-minimal`；`C:\Users\g\Projects\订阅管理\proxy-gateway-minimal` 是迁移前旧 checkout，不作为后续默认工作区；不要把 `C:\Users\g\OneDrive\文档\订阅管理` 当作真实代码仓库。
- 对 `proxy-gateway-minimal` 继续工作前，依次读取 `docs/CURRENT_RELEASE_STATE.md`、`RELEASE_MANIFEST.md`、`docs/PROJECT_CONTEXT.md`，核对 `git status --short --branch`，再读 `docs/README.md` 和任务相关 subsystem README；选择、排序或声明当前工作前必须 fresh 读取原生 Issue/PR，Project #1 仅作导航投影，`project-state` JSON 仅作带日期的兼容/分类依据。
- 项目发布或收尾前必须运行对应验证命令或核验同一验证边界内已完成的有效证据，并在回复中区分本轮运行、复用结果和未完成项。

## Project And Business Boundaries

- 项目是发布受控的模块化单体，覆盖账户/订阅交付、流量计量、Coins/支付/商品与受保护的 Admin。沿用领域契约；不因局部任务引入新服务、队列或第二套数据真相。
- Coin Ledger 是财务事实，钱包余额是投影；流量样本/汇总不是财务账本，充值/支付订单不是商品订单。Admin 消费领域接口与安全投影，不绕过领域授权直接修账。
- 金额/Coins 单位与精度遵守所属领域契约；支付、扣款与交付保持幂等。纠正使用获准的冲正/补偿/调整记录，不为匹配页面而覆写历史事实；生产数据修复另走 Risk A。
- `unknown`、`not_collected`、`partial` 与实测零不同；缺证据不等于无依赖或允许删除。历史证据不自动代表现状，也不因过期而自动解除回退、审计或保留保护。

## Task Framing And Evidence

- 区分评估与执行；按“项目目标 → 当前阶段 → 本次产出”明确范围、已有证据、非目标和验收标准。硬约束与偏好分开，不把局部任务扩展为全项目重构；复杂方案先检查冲突与最弱假设。
- 权威路由：架构/领域边界见 `docs/PROJECT_CONTEXT.md`，带日期的发布快照见 `docs/CURRENT_RELEASE_STATE.md`，发布身份与门禁见 `RELEASE_MANIFEST.md`；任务状态用原生 Issue/PR，实际生产结果用 Deploy Note/执行回执。不另建平行“当前状态”或万能记忆文件。
- 保留 `Source → Artifact → Release → Deployment → Runtime State`；按任务补业务验收的时间与范围，不以“最高状态”代替各层证据。汇报区分事实、推测、本轮执行、有效复用及未验证项，不强制固定长模板。

## Workflow Risk Tiers

- 每个任务开始前先分类并写清楚：`Risk: A/B/C`、`Process`、`Expected PR count`、`Validation`、`Production/AWS impact`。
- 默认原则是风险决定流程重量、验证命令固定化、PR 数量最小化；C 档直接，B 档紧凑，A 档严格。
- 仅需任务排序时说明 Priority 与理由：P0 为正在发生或迫近的严重风险，P1 为核心交付阻塞，P2 为非阻塞改进。Priority 不代替 Risk，不因 Risk A 或治理任务自动设 P0，也不放宽门禁。
- 每个 PR 提交前必须形成完整闭环：设计/意图、执行变更、验证证据都要在 PR body、文档、代码或执行记录中可追溯。未完成闭环的 PR 只能保持 Draft，不能标记 Ready、不能请求合并、不能当作已完成工作汇报。
- 发生生产部署、回退或线上静态替换后，不要求长篇发布文档，但必须在相关 PR 追加一个简短 `Deploy Note`：`deployed_at`、`release_unit`、`source_commit`、`artifact_or_release`、`target`、`backup`、`validation`。
- `release_unit` 只用少量固定值：`control-plane-app`、`company-site-static`、`portal-static`、`admin-static`、`japan-runtime-config`、`sgp-runtime-config`、`subscription-rendering`、`attribution-appsflyer`。静态前端 PR 还必须用 `frontend_surface` 明确声明 `company-site`、`portal` 或 `admin`；如果实际部署单元和 PR 声明不一致，先停止并说明风险，不继续扩大变更。
- Runtime identity 是发布影响维度，不是新的 `release_unit`。会改变 Xray/Mihomo runtime principal、protected usage map、material binding 或 collector identity resolution 的 PR/Change Record 必须声明 `identity_impact: true`；生产 Deploy Note 还必须记录 `docs/IDENTITY_LIFECYCLE.md` 定义的 aggregate-only `identity_gate` before/after、retention state 和最终状态。
- Identity Gate 禁止输出 UUID、credentialRef、controller payload、raw config/env、数据库行或客户数据。只要 `missing`、`stale`、`changed` 或 `missing_material` 非零，就不得声明 identity healthy；stale map 项必须先经过独立只读 retention inventory，不能把 map 当作历史账本直接长期保留或无证据删除。
- 不允许把“只写设计但没有执行/验证”的 PR 当作完成，除非用户明确批准该 PR 就是 spec-only / runbook-only / inventory-only，并且 PR body 写清楚非目标、未执行事项和下一审批门禁。
- C 档适用于 docs-only、runbook、状态记录与文案修正：从 `master` 新建 `docs/<topic>` 分支，直接改文档，执行 `docs/VALIDATION_BASELINE.md` 既有 C 档检查（含 `git diff --check origin/master...HEAD`），开 Draft PR，review 后 ready + merge，再本地收尾。不单独写 spec/plan，不跑 `npm test`，除非文档很大或涉及命令/测试基线。
- B 档适用于中低风险源码变化，如 server refactor/测试、PowerShell/HTTP bridge 小修、Admin UI 局部交互：在一个 `fix/<topic>`、`test/<topic>` 或 `refactor/<topic>` PR 完成意图、代码、测试及必要文档，不拆 spec/implementation PR。均运行 `git diff --check origin/master...HEAD`；后端/server 运行 `npm test`；Admin UI 运行 `npm run admin:test`、`npm run admin:build`、`npm test`；PowerShell/HTTP bridge 先跑 targeted test，再跑 `npm test`。遵循 `docs/VALIDATION_BASELINE.md`。
- A 档适用于 AWS、production、节点、Nginx、systemd、security group、ss-server/ss-local、production node config、订阅 token/auth model 高风险变更、SQLite schema/migration、production deploy/rollback、真实公网连通性测试。流程必须包含 spec/runbook、dry-run checklist、read-only inventory、explicit operator approval、runbook-bound validation environment、implementation、validation、promotion decision、production gate、closeout。验证环境可由对应 runbook 选择 staging、clean host，或隔离 immutable candidate/临时 `current` pointer fixture；隔离 fixture 只构成 Source/Merge 证据，不是 Git branch 发布身份，也不替代 Production Gate。
- A 档必须保留门禁：不得未经对应 Gate 和明确授权修改 production；不得把 historical stopped node 当 staging；不得复制 production `.env`、token、SQLite 或 `SS_PASSWORD`；不得公开 Admin UI；不得开放 `3456`、`18180`、`1080` 到公网；不得跳过 backup、endpoint verification 或 rollback plan，变更前须具备对应备份与回退准备。
- Agent 交互式访问 Vultr、AWS、Cloudflare、Vercel、DNS 等 provider 时必须遵守 `docs/INFRASTRUCTURE_ACCESS_RULE.md`：禁止持久本地凭证，未知权限按 full access 评估，先完成无凭证本地/网络 precheck，再经 exact Risk A Gate 临时注入；命令必须显式白名单，执行后必须清理并 readback。删除本地副本不等于 provider key 已撤销。
- GitHub Actions billing/spending-limit blocker 期间按 `docs/CI_MANUAL_VALIDATION.md` 执行。C 档沿用 `docs/VALIDATION_BASELINE.md` 的文档检查，不额外启动 manual CI；B 档本地验证足够时用本地，确需 clean 环境时才按 manual CI；A 档里的 manual CI 不等于 staging，不等于 production approval。
- closeout 不要用于每个小 PR。只有完成阶段、改变 `docs/PROJECT_CONTEXT.md` 长期事实、合并 A 档生产/运维变更、引入新的长期运行边界，或完成一串相关 B 档工作时才做 closeout。

## Authorized Task Progression

- 风险按实际动作、目标和影响判断，不按 Agent 名称、工具名称或报告类型判断；原有项目补充不必重走全项目流程，但 production/auth/schema 等边界不因此降级。
- 任务和授权边界明确后，连续完成范围内剩余步骤，不因换轮、交接或工具切换重复索要同一授权；只读诊断不代表获准修复，获准实现也不代表获准合并或部署。
- 先核对已完成阶段和证据，再补缺口。精确 source/artifact、依赖、验证环境约束及检查范围未变且仍满足对应 Gate 时，复用已核验结果；不因上下文恢复而重跑全部 CI/Linux 验证。发生变化只重验受影响或未覆盖部分；要求 fresh 的目标状态和精确 head 检查仍须满足。
- 普通工具兼容问题先在已授权的本地或验证环境内定位修复，不自动扩大业务范围或退回全部验证阶段；涉及冻结工具、目标、权限、风险或副作用边界变化时，按对应 Gate 更新授权后再执行。
- 生产执行器的 wrapper/parser/guard/controller 与核心分别绑定实际源码和验证；核心 CI 不覆盖另改的本地脚本。限范围诊断与失败续接遵守 `docs/MULTI_AGENT_OPERATING_MODEL.md`，不把换包名当作重试权限。
- 关键前提失败、越界或执行结果不明时，停止受影响动作并说明事实、剩余步骤和所需决定；可继续已授权且不依赖该未知状态的安全工作。严格遵守单次授权、有效期、`retry false` 和 `RELEASE_MANIFEST.md` 的 Gate 终止规则，不能将续接解释为重试或复用已消费授权。
- Agent 按独立子任务需要选用，不设置固定人数、串行审查流水线或逐角色报告；复用现有 PR、测试和执行记录。详细续接、证据复用与交接规则见 `docs/MULTI_AGENT_OPERATING_MODEL.md`。
