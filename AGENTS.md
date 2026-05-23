# Project Instructions

- 默认用中文回复，除非用户明确切换语言或任务本身要求英文。
- 对本机、CLI、配置、仓库、部署、网络、代理和日志问题，先实际运行命令核查，再给结论。
- 不要凭记忆猜路径、进程、端口、模型、代理或线上状态；能读文件、跑命令、查日志时优先实查。
- 修改配置或代码前先确认当前文件内容、Git 状态和相关上下文；不要回滚用户已有改动。
- 对密钥、token、订阅链接、账号凭证和服务器敏感输出，只说明存在和位置，不在回复中复述原文。
- Windows 本机任务优先使用 PowerShell；涉及 Unicode 输出时注意编码问题。
- 不要在根目录或无明确项目上下文时加载过多技能、插件或外部服务；按当前项目和任务需要最小化启用对应能力。
- 订阅管理项目的固定本地仓库路径是 `C:\Users\g\Projects\订阅管理\proxy-gateway-minimal`；不要把 `C:\Users\g\OneDrive\文档\订阅管理` 当作真实代码仓库。
- 对 `proxy-gateway-minimal` 继续工作前，先读取 `docs/PROJECT_CONTEXT.md` 并核对 `git status --short --branch`。
- 项目发布或收尾前必须运行对应验证命令，并在回复中说明实际通过/失败结果。

## Prompt Framework

- 把提示词当作项目管理工具，而不是一次性命令；核心目标是约束方向、边界、标准和输出方式。
- 长期项目按三层提示词工作：项目提示词回答“我们到底要做什么”，阶段提示词回答“现在做到哪一步”，任务提示词回答“这一次具体产出什么”。
- 新建或调整项目方向时，先明确项目总目标、背景、范围、角色、长期项目记忆和输出标准。
- 阶段性工作开始前，先明确当前阶段、已有成果、下一步任务、范围边界和验收标准；不要把阶段任务扩展成全项目重构，除非用户明确要求。
- 具体任务开始前，先区分这是思考型任务还是执行型任务；复杂任务先整理上下文、信息缺口和不确定性，不要直接生成最终答案。
- 提示词约束要区分硬约束和软偏好：必须遵守的规则写清楚，优先考虑的偏好不要当成绝对要求，避免约束互相冲突。
- 输出要尽量做到可理解、可执行、可检查；重要方案要给出可验证的验收标准，而不是只给概念解释。
- 对不确定内容要明确标注，区分已知事实、合理推测、信息缺口和建议行动；不要把未经验证的推测写成事实。
- 复杂方案需要做反向检查，主动检查逻辑漏洞、执行风险、遗漏项和最弱假设，再形成执行版。
- 长期项目要维护项目记忆和阶段记录，避免每轮重新理解项目；重要提示词应沉淀为项目、阶段、任务三类模板。
- 不要在提示词、文档、提交信息或回复中写入密钥、token、订阅链接、账号凭证、客户隐私或未公开敏感数据。

## Workflow Risk Tiers

- 每个任务开始前先分类并写清楚：`Risk: A/B/C`、`Process`、`Expected PR count`、`Validation`、`Production/AWS impact`。
- 默认原则是风险决定流程重量、验证命令固定化、PR 数量最小化；C 档直接，B 档紧凑，A 档严格。
- C 档适用于 docs-only 任务，例如 README、PROJECT_CONTEXT、NETWORK_FORWARDING、DEPLOYMENT_FLOW、STAGING_PROVISIONING、CI_MANUAL_VALIDATION、runbook、状态记录、小型决策同步、错别字或过期状态修正。流程是从 `master` 新建 `docs/<topic>` 分支，直接改文档，运行 `git diff --check origin/master...HEAD`，开 Draft PR，review 后 ready + merge，再本地收尾。C 档不单独写 spec/plan，不跑 `npm test`，除非文档本身很大或涉及命令/测试基线。
- B 档适用于中低风险代码任务，例如 server 小型 refactor、测试覆盖、HTTP bridge 小修、PowerShell 诊断脚本小修、Admin UI 局部交互、SQLite busy_timeout/lastUsed 策略、非生产 runtime 小行为修正。流程是一个 `fix/<topic>`、`test/<topic>` 或 `refactor/<topic>` PR 内完成简短设计说明、代码、测试和必要文档，不拆 spec PR + implementation PR。后端/server 运行 `git diff --check origin/master...HEAD` 和 `npm test`；Admin UI 运行 `git diff --check origin/master...HEAD`、`npm run admin:test`、`npm run admin:build`、`npm test`；PowerShell/HTTP bridge 小修先跑对应 targeted test，再跑 `npm test`。
- A 档适用于 AWS、production、节点、Nginx、systemd、security group、ss-server/ss-local、production node config、订阅 token/auth model 高风险变更、SQLite schema/migration、production deploy/rollback、真实公网连通性测试。流程必须包含 spec/runbook、dry-run checklist、read-only inventory、explicit operator approval、staging 或 clean validation environment、implementation、validation、promotion decision、production gate、closeout。
- A 档必须保留门禁：不得直接动 production；不得把 historical stopped node 当 staging；不得复制 production `.env`、token、SQLite 或 `SS_PASSWORD`；不得公开 Admin UI；不得开放 `3456`、`18180`、`1080` 到公网；不得跳过 backup、endpoint verification 或 rollback plan。
- GitHub Actions billing/spending-limit blocker 期间按 `docs/CI_MANUAL_VALIDATION.md` 执行。C 档默认只需要 `git diff --check`；B 档本地验证足够时用本地，确需 clean 环境时才按 manual CI；A 档里的 manual CI 不等于 staging，不等于 production approval。
- closeout 不要用于每个小 PR。只有完成阶段、改变 `docs/PROJECT_CONTEXT.md` 长期事实、合并 A 档生产/运维变更、引入新的长期运行边界，或完成一串相关 B 档工作时才做 closeout。

