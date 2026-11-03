# E1-A · 注册绑定合同修订单（草案 v1.1）

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: e1a_registration_binding_amendment_draft
  superseded_by: null
  last_verified_at: 2026-11-02
  production_authority: false
```

**项目：** FlyLink.com / proxy-gateway-minimal
**日期：** 2026-11-02（v0.1 初稿，v0.2–v1.1 十轮修订同日）
**状态：** 修订单草案 v1.1，立项方向已获 Yi 批准；待 Yi 对本修订稿单独确认后才可进入源码实施（本稿通过合同审查不等于源码实施授权，更不自动授权 E4-E）
**上游依据：** E1 源码落地（PR #822 已合并，master `eb83197e`）；《E4-A Schema 草案（修订稿 v0.12）》§6；Yi 2026-11-02 对 R1 的裁定（第三锚 + PoP + E1 合同修订正式立项）及对 v0.1 的审查意见（P8 大小写矛盾、P9 依赖分层）
**与 E4 的关系：** 本修订单是独立合同修订任务。依赖按 **P9 分层**处理（见 §3 第 5 项与 §5）：E1-A 只依赖自己冻结的**验证接口**，不依赖 E4-E 的生产实现；E4-E 的签发实现依赖本修订先行落地。E4-A Schema 草案的确认不构成本修订单的确认，反之亦然。

**v0.2 修订摘要**：P8——指纹大小写规则与共享 normalizer 的实际代码行为对齐（§3 第 1 项、测试 9 重写），不改动共享函数；P9——E1-A 与 E4-E 的职责按接口分层（§3 第 5 项、§5 重写），并明确授权绑定的是**待注册的首启包与候选身份**、不要求先有已完成注册记录；测试清单新增成功路径与 PoP 原子消费两项（测试 11、12），总数 10 → 12。

**v0.3 修订摘要**（对应 Yi 对 v0.2 的单独审查）：PoP 唯一消费生命周期冻结为五步（消费点唯一化在 E4-E 签发环节，§5.1）；两个验证接口补齐正式合同——名称、输入结构、返回证据包字段、错误码、状态机（§5.2、§5.3）；版本标记规则补齐（已出现但非 `"2"` 的值一律拒绝，§4、测试 13）；测试 9 增加大写 `SHA256:` 前缀用例，测试 11 增加"重放不再次消费 challenge"断言，测试 12 锚定到生命周期第三步。测试总数 12 → 13。

**v0.4 修订摘要**（对应 Yi 的正式修订任务清单 · 任务 B）：
- **B1**：`consumedAt = evaluatedAt` 冻结——原子消费事务只捕获一次 BWH 时间戳，三处（接口入参、证据摘要、留存记录）同值；原子失败不留任何部分写入（§5.1、§5.2）。
- **B2**：接口 B 新增结构化输入 `verificationContext`（可信时间、Release Identity 验证证据、Trust Store 更新链、撤销验证上下文、PoP 权威记录视图），接口 B 的全部检查自此都有合同内的证据来源；`consumedPopEvidence` 必须是权威记录且与存储视图逐字段相等，调用方自构造的对象不予接受（§5.3）。
- **B3**：新增授权字段映射表（13 个身份字段 + 3 个摘要关系），逐项写明来源、对照、比较方式与错误码（§5.3.1）。
- **B4**：原测试 1 拆为两个场景，错误码归属分离（`authorization_binding_mismatch` 与 `registration_conflict` 不得混用）（§6）。
- **B5**：未知 challenge 状态 fail-closed，新增独立错误码 `pop_challenge_state_invalid`（§5.2）。
- **B6**：测试清单扩充并统一编号为 23 项（原 13 项全保留：测试 1 拆分计 +1、B6 新增 9 项、B6 第 10 项由拆分覆盖）（§6）。

**v0.5 修订摘要**（对应 Yi 对 v0.4 的第二轮审查批准项）：
- **B2 补强**：§5.3 为 `verificationContext` 五个子项逐项补齐**可信来源与证据链**，并立总则——上下文只能由验证组件在同一验证会话内自行取证生成；请求方提交的同名对象只作待核对的声明，不作证据。`releaseIdentityEvidence` 同时扩展为 Release 验证运行的完整产出（新增镜像清单与 BOM 三摘要字段）。
- **B3 补强**：§5.3.1 映射表改为六列，逐行写明两侧的**实际验证输入**（从哪个输入对象的哪个字段路径取值）；`firstBootPacketRef` 的对照值改为验证方本地重算，不采信包内自述。
- **B6 补强**：新增测试 24–29（可信时间来源、Release 证据绑定、Trust Store 接受日志一致性、撤销连续性派生而非断言、伪造 recordRef、镜像/BOM 摘要一致性）。原 23 项一项未删，清单共 29 项。

**v0.6 修订摘要**（对应 Yi 对 v0.5 的独立复审，编号从其任务清单）：
- **B1（P0）**：§5.3 冻结双层架构——可信证据采集层是唯一对外门面，纯验证层无请求方可达入口；证据对象只能由采集层产生，字段自洽不证明来源。三个输入的对应关系同时冻结（trustStore ↔ 接受日志末项、revocationManifest ↔ 本次验签的文档原件、expectedChannelRefs ↔ 本地批准映射）。
- **B2/B3（P0）**：新增 §5.3.2 PoP 三方绑定恒等式——`popEvidenceSha256`、nodeRef、第三锚在授权 / 凭证 / 权威记录三方相等，popChallenge 在凭证与权威记录之间相等（授权经摘要构成传递绑定）。
- **B4（P0）**：§5.3.1 后新增清单引用闭合规则——由 `imageManifestRef` 实际取得的清单原件，其 SHA-256 必须等于 Release Identity 的 `imageManifestSha256`，且制品摘要必须读自同一份原件。
- **B5（P1）**：映射表补齐第六列「对照侧来源类别」（上一轮交付说明称六列而实际只有五列，本轮实际拆出，并已在 §5.3.1 注明）；首启包字段路径与 packetRef 计算的实施前对齐要求正式写入合同注记。
- **B6（P1）**：新增测试 30–32（双伪造、PoP 摘要指向另一份真实 PoP、清单引用替换），清单共 32 项，原有项无删减。

**v0.7 修订摘要**（对应 Yi 对 v0.6 的第二轮独立复审，编号从其任务清单）：
- **B8（P0）**：`releaseRef` 解析绑定冻结——引用必须解析到本次实际验证的 Release Identity 原件，解析证明靠"同一定位原件 + 本地摘要等于 `releaseIdentitySha256`"，不靠引用字符串相等，也不要求引用与 `releaseId` 字段相等（§5.3 证据字段扩展、§5.3.1 解析绑定规则）。
- **B9（P0）**：接口 B 增加授权有效期三段校验（`expiresAt > issuedAt`、时长 ≤ 24 h、当前时刻在窗口内），新增错误码 `authorization_validity_window_invalid`。
- **B10（P0）**：§5.3.2 增加时间顺序恒等式 `popAuthoritativeRecord.consumedAt ≤ authorization.issuedAt`（同一 BWH 时钟域）。
- **B11（P0）**：签名者身份检查与 E4-A §0.7/§2.2 对齐——按签名时对应的**历史** Trust Store 版本与可信时间证据判定（四查：签名时状态、签名时窗口、状态转换证据、当前撤销回溯），不再一律要求现行店 `active`。
- **B12（P1）**：新增授权版本声明核验（trustStoreVersion / revocationVersion 五项逐项规则）。
- **B13（P1）**：测试 30 扩充为模块边界实证（导出检查、公共入口检查、门面调用轨迹、请求方同名字段不可覆盖）。
- 测试清单 32 → 36 项（新增 33–36），原有项无删减。

**v0.8 修订摘要**（对应 Yi 对 v0.7 的第三轮独立复审，编号从其任务清单）：
- **B14（P0）**：Deployment Authorization 补入「历史签名者判定」成为第四类（purpose、T_first 窗口、签发时状态、当前撤销优先四查），其证据由新增的 `authorizationSigningEvidence` 承载（BWH 签发审计 + 签发序号）。
- **B15（P0）/ B19（P1）**：`verificationContext` 增加统一的 `signingTimeEvidence` 结构（文档摘要、信封摘要、signerKeyId、signedDocumentType、purpose、T_event、T_first、时间来源、审计记录引用、验证结论），挂载到 Release Identity 与 Revocation Manifest 的证据上；类型与 purpose 绑定不符 ⇒ 新错误码 `authorization_time_evidence_invalid`。
- **B16（P0）**：`trustStoreChain.updates` 条目增加 `storeSha256`、`acceptedAt`、`acceptanceSequence`；同域顺序以序号为首要键，秒级时间戳只作辅助（同秒多事件不靠时间戳定序）。
- **B17（P1）**：PoP 与授权的先后改以同一 BWH 审计序列的序号证明（`popConsumptionSequence < authorizationSigningSequence`），`consumedAt ≤ issuedAt` 降为一致性检查（秒精度下时间相等不能证明顺序）。
- **B18（P0）**：新增 `revocationHistoryEvidence`（声明版本及其摘要、当前版本及摘要、版本链、声明后新增条目全集、各版接受时间与来源）；连续性改由纯验证层据该证据**派生**，`historyContinuous` 不再作为输入断言。测试 36 的变体②③补齐错误码。
- 测试清单 36 → 40 项（新增 37–40；测试 20、27 的措辞按 B18 的派生方式同步），原有项无删减。

**v0.9 修订摘要**（对应 Yi 对 v0.8 的独立复审，编号从其任务清单）：
- **B20（P0）**：`trustStoreChain.updates` 每项增加该版 Trust Store 自身的 `signingTimeEvidence`（含 T_event），不再以 `acceptedAt` 代替签发时间证据。
- **B21（P0）**：`trustStoreChain` 增加历版 Trust Store **原件**的可信解析（`originals`：按版本取原件、本地摘要与日志对账、会话内不可变）；任一被判定版本原件缺失即拒绝。判定历史签名者时从前一版原件读取密钥状态，不凭摘要推断。
- **B22（P0）**：`revocationHistoryEvidence` 增加 `historicalManifests`（声明版本及每个中间版本的原始清单原件）；纯验证层对原件重算摘要、逐版自算新增条目集，并要求自算全集与 `addedEntries` 完全相等——`addedEntries` 自此降为待核对的声明。
- **B23（P0）**：`versionChain` 每项增加 `acceptanceSequence`（验证方域序号，与 E4-A §0.7 的统一审计事件基础字段对齐）。
- **B24（P1）**：`authorizationSigningEvidence` 三绑定同记录恒等式——`auditRecordRef` 指向的审计记录，其 documentSha256 必须等于授权摘要、eventSequence 必须等于 signingSequence、signerKeyId 必须等于信封 signerKeyId，禁止跨记录拼接。
- **B25（P1）**：purpose 映射的引用改为 E4-A §0.3 公钥来源表（类型↔purpose 的冻结出处）；`signingTimeEvidence` 增加 `clockSyncAuditRef` 字段（其时间域当前时钟同步审计记录的引用，与 E4-A A15 的计算口径配套）。
- 测试清单 40 → 46 项（新增 41–46，对应复审 T9–T14），原有项无删减。

**v1.0 修订摘要**（对应 Yi 对 v0.9 的独立复审，编号从其任务清单）：
- **B26（P0）**：新增 §5.5 专用自举验证入口与 `BootstrapVerificationContext`——解决 A16 与正常接口 B 的闭环冲突：自举走独立入口（临时店证据、交换内 BWH 时间与撤销视图、自举版 PoP/签发证据），正常接口 B 的证据要求一字不放宽；genesis 建立前正常入口拒绝一切请求，自举成功后入口永久停用，失败不留任何可复用半成品证据。
- **B27（P0）**：`signingTimeEvidence` 拆为 `tEventEvidence` 与 `tFirstEvidence` 两个独立证据对象（各自的时间戳、来源、审计引用、时钟同步引用；T_first 侧带全部候选记录引用与最终选定记录），不再用单个 auditRecordRef 含糊承载两类时间。
- **B28（P0）**：同签发事件恒等式补全并通用化——审计记录 R 与证据 E 之间 documentSha256、envelopeSha256、signerKeyId、eventType（及适用时的 eventSequence）全等，且实际信封摘要必须等于 E.envelopeSha256。
- **B29（P0）**：撤销历史四向绑定冻结——声明端与授权 revocationVersion 及本地日志摘要绑定，当前端与 revocationContext、历史原件末份重算摘要、本地日志最高版本四者绑定。
- **B30（P1）**：`trustedTime` 增加自身时钟同步审计引用；Trust Store 与 Revocation 的接受事件各带覆盖其 acceptedAt 的时钟同步引用；`originals` 明确包含历版店的 detached 信封原件（"原件"的边界冻结）。
- 测试清单 46 → 54 项（新增 47–54），原有项无删减。

**v1.1 修订摘要**（对应 Yi 对 v1.0 的第二轮独立复审）：
- **B31（P0）**：§5.5 冻结自举入口的完整函数签名（与接口 B 同形：authorization、envelope、firstBootPacket、expectedChannelRefs、bootstrapVerificationContext 五参）与成功输出——返回与接口 B **完全同构**的已验证证据包，执行器只消费该结构；genesis 提交成功先于任何注册写入。
- **B32（P0）**：自举上下文补齐 PoP 消费后的完整证据三件套（接口 A 结果、`consumedPopEvidence`、`popAuthoritativeRecord` 含 consumedAt/challengeState/popConsumptionSequence），§5.3.2 在自举中逐字适用。
- **B33（P0）**：`bootstrapRevocationEvidence` 冻结为可独立复算的完整历史（声明版至当前版的清单原件全套 + 派生规则同 B22）；自举成功后经**自举接受记录**正式纳入本地撤销档案（来源如实标注为自举交换，不伪装成历史本地接受）。
- **B34（P0）**：genesis 接受记录持久化首店签发证据（firstStoreSigningEvidence + 文档/信封原件引用）；`trustStoreChain` 增加 `genesis` 成员，正常接口 B（含重启后）从 genesis 读取首店历史证据，不构造 fromVersion = 0。
- **B35（P0）**：同签发事件恒等式补 `timestamp === R.eventAt` 与 `timeSource === R.timeSource` 两条（B28 由四元升为六元）。
- **B36（P1）**：带外指纹改为结构化证据（预期值/复算值/比较结果/核对记录引用，布尔断言不算证据）；`releaseIdentityEvidence` 补 `trustStoreSha256`/`trustStoreVersion` 并冻结其与临时店原件的绑定；自举三时间（authorization.issuedAt / bootstrapConfirmedAt / acceptedAt）来源与恒等关系分开冻结。
- **B27 结构再修订（配合 E4-A A25）**：`tFirstEvidence` 改为候选数组结构——每条候选自带本域时钟同步引用，附查询范围声明；选择规则与跨域重叠处理按 A25。
- 测试清单 54 → 62 项（新增 55–62），原有项无删减。

**权限边界：** 本文件只立项与定义修订内容。不授权修改已合并的 E1 代码/合同、不授权任何 PR、不授权生产操作。修订实施须单独审查、单独 PR、单独验收。

---

## 1. 修订原因

E1 注册绑定（已关闭验收）只有两个身份锚：`wireguardPublicKeyFingerprint` 与 `agentAuthFingerprint`。E4 的 As-Run 身份由第三把独立密钥（Node Agent Signing Key）签名，其公钥指纹未被任何注册记录绑定，BWH 无法判定 As-Run 签名者的身份（E4 审查 R1）。本修订为注册绑定增加第三锚与持有证明要求，使 As-Run 验签具备预先登记的可信根。

## 2. 现行合同（v1，只读基线，不得改动其语义）

- `registrationBindingOf` 返回恰好 11 个字段：`nodeRef`、`providerRef`、`regionRef`、`roleRef`、`channelRefs`（排序）、`imageManifestRef`、`releaseRef`、`firstBootPacketRef`，以及 record metadata 中的 `wireguardPlanRef`、`wireguardPublicKeyFingerprint`、`agentAuthFingerprint`（缺失记 `null`）。
- `recordDigest` 与注册回执完全由该绑定对象（回读记录）派生；存储原语为 insert-if-absent；执行门 `EDGE_NODE_REGISTRATION_EXECUTION_ENABLED` 恒等匹配 `"true"`，在服务层写入边界强制；`node-vultr-jp-01` 经摄入入口一律 `registration_path_forbidden`。
- 以上均为 E1 六轮审查后关闭的状态。本修订**不重开** E1 的其他任何部分。

## 3. 修订内容

1. record metadata 新增字段 **`agentSigningPublicKeyFingerprint`**（第三锚）。格式与校验复用共享 `normalizeRegistrationAnchorFingerprint`，其实际行为（已按代码核对，P8 基准）为：**先将输入整体小写化，再按 `sha256:<64 位十六进制>` 模式校验**。因此：合法的大写/混合大小写十六进制输入会被规范化为标准小写指纹并接受；缺 `sha256:` 前缀、长度错误、含非十六进制字符的输入在小写化后仍不合模式，一律拒绝；空值返回缺失语义（`""`）。本修订**不修改该共享函数**，第三锚与另两锚共用同一行为。
2. record metadata 新增版本标记 **`registrationBindingVersion`**：`"2"` 表示 v2 绑定。v1 记录无此标记，**缺失即 v1**。
3. 新增 v2 绑定构成：绑定对象 = v1 的 11 个字段 + `agentSigningPublicKeyFingerprint` + `registrationBindingVersion: "2"` 标记键（共 13 个键），使 `recordDigest` 自带版本语义。
4. **v1 绑定函数逐字不变**：仍返回恰好 11 个字段、无标记键。既有 v1 记录的 `recordDigest` 在修订代码下必须逐字不变。
5. 执行器增加 v2 路径：构造 v2 记录时要求三锚齐全（执行器既有"双锚必填"扩展为三锚），并且要求一份**经验证接口确认的授权证据**（见 §5 的接口分层）：执行器只消费验证接口的输出（已验签的授权摘要、三锚与首启包的一致性结论、PoP 证据摘要），不直接解析授权文档、不直接与 PoP 签发侧交互。授权所绑定的是**待注册的首启包及其候选身份**（三锚来自首启包），不要求、也不得要求先存在一条已完成的注册记录——注册正是该授权的消费端。摄入入口对 JP-01 的既有拒绝不变。
6. 存储原语、执行门、门的位置（服务层）与严格程度一律不变；本修订不把任何校验下沉或上移。

## 4. 版本与兼容语义（冻结）

- **版本标记判定（冻结）**：`registrationBindingVersion` 缺失 ⇒ v1；等于 `"2"` ⇒ v2；**已出现但为任何其他值（包括 `"1"`、`"3"`、空字符串、非字符串）⇒ 拒绝**（错误码 `registration_binding_version_unknown`），不静默回落 v1、不尽力解析。v1 的身份来自"标记缺失"这一事实本身，任何显式标记都必须被认识。
- 相等/冲突判定**只在同版本内**进行。比较前先由标记判定记录版本，再按对应版本字段集判定。
- v2 尝试命中同 nodeRef 的 v1 记录 → `registration_conflict`，记录不变；v1 尝试命中 v2 记录同理。**不提供原地补锚或静默升级**；升级唯一路径为既有 supersede 流程（凭据集指纹变化触发），新记录以 v2 写入。
- **node-vultr-jp-01 只接受 v2**：v1 形式的三锚不全注册对该 nodeRef 一律拒绝（在摄入入口既有拒绝之上，执行器路径同样强制）。
- 其他节点可继续 v1 注册（旧兼容保留，行为与 E1 验收时一致）。
- **v1 记录永不能通过 V2 As-Run 身份验收**（无第三锚可验）。已有旧注册记录不自动获得第三锚身份；任何"旧记录已具备 V2 身份"的表述违规。
- 旧版兼容性结论由本修订单的新验收给出，并明确标注其取代 E1 验收中"绑定字段集"一项；E1 其余验收结论继续有效。

## 5. 持有证明（Proof of Possession）：生命周期与接口合同（P9 冻结）

**职责分层（冻结）**：

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| E1-A（本修订单） | v2 绑定字段与第三锚校验；版本隔离；v1 摘要稳定；本节两个验证接口的**合同定义**（名称、输入、输出、错误码、状态语义） | 不签发授权、不生成 challenge、不持有任何签名私钥 |
| E4-E | Deployment Authorization 的真实签发；BWH 侧 PoP challenge 的生成、记录与**原子消费**（生命周期第 3 步）；调用接口合同的生产实现；把已验证证据包交给执行器 | 不改动绑定合同与接口合同（以本修订单为准） |

### 5.1 PoP 唯一消费生命周期（冻结，全系统只有一个消费点）

1. **生成**：BWH（E4-E）生成一次性 challenge（32 B 随机数，hex 64 字符），绑定 nodeRef 与第三锚指纹，有效期与授权交换同窗；challenge 记录状态置 `issued`。
2. **证明**：节点以 Agent Signing 私钥对 Canonical JSON `{type: "agent_signing_pop", nodeRef, agentSigningPublicKeyFingerprint, popChallenge}` 的规范化字节签名（Ed25519，detached 形式随交换传递，不套用 E4-A §0.3 信封合同——PoP 是交换内证据，其完整性由当场验签与摘要留存保证）。
3. **原子消费（唯一消费点）**：BWH（E4-E）经接口 A 验签与校验，并在**同一原子存储操作**中把 challenge 状态由 `issued` 置 `consumed`、留存 `popEvidenceSha256`。消费成功后才签发 Deployment Authorization。并发提交同一 challenge 恰好一次成功，其余得到 `pop_challenge_consumed`。
4. **授权验证**：注册路径经接口 B 验证授权（含其引用的已消费 PoP 凭证）。**本步不再次消费 challenge**，只核对凭证。
5. **执行器消费证据包**：执行器只接受接口 B 输出的已验证证据包。同一注册请求重放时，由 E1 既有语义返回 already-registered（同绑定）或 registration_conflict（异绑定），**不重新进入 PoP 流程、不改变 challenge 状态**。

**状态区分（不得混同）**：challenge 状态机为 `issued → consumed`（终态）或 `issued → expired`（终态）。"challenge 已消费"只表示授权已签发，**不等于注册已完成**；注册完成以 E1 注册记录存在为准。两者由不同事实证明，任何回执或日志不得用其一冒充其二。

**原子消费与时间同一性（B1 冻结）**：第 3 步的原子事务中，E4-E 只捕获**一次** BWH 时间戳，并冻结恒等式 **`consumedAt = evaluatedAt`**：同一时间戳同时用作接口 A 的 `evaluatedAt` 入参、参与 `popEvidenceSha256` 计算、并作为 `consumedAt` 与状态翻转（`issued → consumed`）在同一原子事务中留存。原子事务任一环节失败，整体回滚——不得留下已消费标记、已保存的 `popEvidenceSha256` 或任何可被后续步骤引用的孤立凭证。

### 5.2 接口 A：PoP 证据验证接口

- 名称：`verifyAgentSigningProofOfPossession`（无状态纯函数；状态读写与原子消费由调用方 E4-E 在其外层完成）。
- 输入（单个对象）：`nodeRef`、`agentSigningPublicKey`（base64url，32 B）、`agentSigningPublicKeyFingerprint`（锚格式）、`popChallenge`（hex 64）、`popSignature`（base64url，64 B）、`challengeRecord`（`{ challenge, nodeRef, agentSigningPublicKeyFingerprint, issuedAt, expiresAt, state }`，BWH 侧记录的只读视图）、`evaluatedAt`（调用方提供的 BWH 时间戳）。
- 校验：公钥复算指纹与参数指纹、记录指纹三方一致；challenge 与记录一致且绑定 nodeRef；challenge 状态按下行规则判定；`issuedAt ≤ evaluatedAt < expiresAt`；对 5.1 第 2 步的规范化对象验签。
- **challenge 状态语义（B5 冻结）**：`issued` ⇒ 继续验证；`consumed` ⇒ 以 `pop_challenge_consumed` 拒绝（防重放）；`expired` ⇒ 以 `pop_challenge_expired` 拒绝；**任何其他值（包括缺失、空字符串、未知字符串、非字符串）⇒ 以 `pop_challenge_state_invalid` 拒绝（fail-closed）**，不猜测、不回落到任一已知状态。
- 成功输出（冻结字段）：`{ nodeRef, agentSigningPublicKeyFingerprint, popChallenge, popEvidenceSha256 }`，其中 `popEvidenceSha256` 为 Canonical JSON `{type: "agent_signing_pop_evidence", nodeRef, agentSigningPublicKeyFingerprint, popChallenge, popSignature, consumedAt}` 规范化字节的 SHA-256（裸 hex）。摘要中的 `consumedAt` **恒等于本次调用的 `evaluatedAt`**（B1 恒等式），由接口在计算时直接取用，调用方不得另行提供第二个时间值。
- 失败错误码（冻结，共 6 个）：`pop_challenge_unknown`（记录缺失或 challenge 不匹配）、`pop_challenge_consumed`（state 已为 consumed）、`pop_challenge_expired`（state 为 expired 或 evaluatedAt 越界）、`pop_challenge_state_invalid`（state 为任何其他未知值，B5 新增）、`pop_binding_mismatch`（nodeRef/指纹任一不一致）、`pop_signature_invalid`（验签失败或签名格式非法）。

### 5.3 接口 B：授权验证接口（执行器唯一入口）

**双层架构（B1 冻结）**：接口 B 是纯验证层，其全部可信输入由**可信证据采集层**产生，两层边界如下：
- **采集层**（BWH 可信域内的组件）是唯一对外门面：它亲自读取 BWH 可信时钟、Trust Store 接受日志、撤销清单原件、PoP 权威存储、本地批准映射，并亲自执行 Release Identity 的 §0.3 验证，然后把产出的证据对象交给纯验证层。执行器与注册请求方只能调用采集层门面。
- **纯验证层**（接口 B 本体）**没有请求方可达的入口**：请求方不得直接调用它并自备 `trustStore`、`revocationManifest`、`consumedPopEvidence`、`verificationContext`、`expectedChannelRefs`——这些参数在架构上只存在于采集层与验证层之间。证据对象只能由采集层的工厂路径产生；**两个对象字段相同，只证明它们彼此一致，永远不证明它们来自权威来源**——来源真实性由"只能经采集层产生"这一结构边界保证，不由字段比对补足。
- 三个输入的对应关系（冻结）：交给验证层的 `trustStore` 必须与采集层本地接受日志的**末项**（最新版本 + 摘要）对应，不一致即证据不成立；`revocationManifest` 必须是采集层本次会话实际验签的那份文档原件（字节、版本、摘要与 revocationContext 三者互指）；`expectedChannelRefs` 必须由采集层从**本地批准映射**读取，请求方随包提交的 channelRefs 只是待核对材料（映射表第 6 行）。
- 测试夹具须实现同构的采集层门面替身：测试通过门面驱动验证层；任何绕过门面直调验证层的用例，其结果不计入合同验收。

- 名称：`verifyNodeRegistrationAuthorization`（无状态纯函数；按上行架构，它只被采集层调用）。
- 输入（单个对象，共 8 项）：`authorization`（Deployment Authorization 文档）、`envelope`（其 detached 信封）、`firstBootPacket`（待注册首启包）、`expectedChannelRefs`（步骤 1 批准映射）、`trustStore`（验证方当前 Trust Store 视图）、`revocationManifest`（验证方当前撤销清单文档）、`consumedPopEvidence`（PoP 权威凭证，见下）、`verificationContext`（结构化验证上下文，见下）。**缺少任一输入、或上下文任一子项缺失/不可验证，整体拒绝**——接口 B 不得在证据不全时做部分验证后放行。
- `consumedPopEvidence`（B2 冻结字段）：`{ nodeRef, agentSigningPublicKeyFingerprint, popChallenge, popEvidenceSha256, consumedAt, challengeState, recordRef }`，其中 `challengeState` 必须为 `"consumed"`，`recordRef` 为 BWH PoP 权威存储中该消费记录的标识。**权威性要求**：接口 B 必须把该凭证与 `verificationContext.popAuthoritativeRecord`（调用方按 `popChallenge` 从 BWH PoP 权威存储取得的记录视图）**逐字段比对，完全一致才接受**；与权威记录有任何出入、或权威记录不存在的凭证一律以 `authorization_pop_evidence_mismatch` 拒绝。调用方自行构造的同名对象不构成证据。
- `verificationContext`（B2 冻结结构，七个子项）。**来源总则（v0.5 冻结）**：本上下文的每一个值都必须由**验证组件在同一验证会话内自行取证生成**——即由执行接口 B 的同一可信组件，在本次调用中亲自完成取时、验签、查库、比对后产出。注册请求方（节点或其调用方）提交的任何同名对象、同名字段或布尔断言（如 `signatureValid: true`）**只作待核对的声明，本身不构成证据**；上下文任一子项无法追溯到下述冻结来源的，接口 B 整体拒绝。测试夹具中，每个来源由实现同一生产者接口的测试替身提供（夹具时钟、夹具验证运行、夹具日志/存储），替身产出的上下文与生产同构。
- **统一签发时间证据结构 `signingTimeEvidence`（B15/B19 冻结，v0.9 按 B25 修订，v1.0 按 B27/B28 重构）**：`{ documentSha256, envelopeSha256, signerKeyId, signedDocumentType, purpose, tEventEvidence, tFirstEvidence, verdict }`，其中 `tEventEvidence = { timestamp, timeSource, auditRecordRef, clockSyncAuditRef }`、`tFirstEvidence = { candidates, selectedRecordRef, timestamp, queryScope }`，`candidates` 每项为 `{ auditRecordRef, timestamp, timeSource, clockSyncAuditRef }`。**B27 拆分（v1.1 按 A25 再修订）**：T_event 与 T_first 是两类独立证据，各自绑定自己的来源记录、时间域与时钟同步记录——不再允许单个 `auditRecordRef` 含糊承载两类时间；T_first 侧为**候选数组**：每条候选自带其所属时间域的同步证据，`queryScope` 是查询范围声明（按文档摘要向 E4-A A25 冻结的指定来源集合查询的完整结果：来源清单与各来源返回条数）；`selectedRecordRef` 指向按 A25 规则选定的候选且顶层 `timestamp` 等于该候选的时间，纯验证层逐条复核全部候选后独立复算选择（选错、漏列更早记录、只验被选中者 ⇒ 证据无效）。各 `clockSyncAuditRef` 必须满足 E4-A A21 的**覆盖规则**：指向覆盖对应事件时刻的同步审计记录（历史事件用历史记录），而非该域最新记录。`verdict` 是采集层对该证据的核验结论。纯验证层必须复核绑定：`documentSha256` 等于所涉文档的本地摘要、`envelopeSha256` 等于所涉信封的本地摘要、`signerKeyId` 等于信封的 signerKeyId、**`signedDocumentType` 等于该文档的固定类型常量、`purpose` 等于该类型在 E4-A §0.3 公钥来源表中冻结的对应用途**（类型↔purpose 映射的出处是 §0.3 的来源表与 §2.2 的 purpose 字段规则，二者一致；不得把"purpose 属于三个允许值之一"当作映射检查）。**同签发事件恒等式（B28 通用冻结，v1.1 按 B35 补时间字段）**：设 R 为 `tEventEvidence.auditRecordRef` 实际解析出的审计记录、E 为本证据对象，必须同时成立 `R.documentSha256 === E.documentSha256`、`R.envelopeSha256 === E.envelopeSha256`、`R.signerKeyId === E.signerKeyId`、`R.eventType` === 该文档类型在 E4-A A26 冻结的签发事件类型常量、**`E.tEventEvidence.timestamp === R.eventAt`**、**`E.tEventEvidence.timeSource === R.timeSource`**——同一事件要求同文档、同信封、同签发者、同类型、同**实际事件时间**与同时间来源，任一不符或证据缺失 ⇒ `authorization_time_evidence_invalid`（v0.8 新增错误码）。原则：凡合同要求按时间/历史状态执行的检查，其所需的时间证据必须以此结构实际传入，不允许"检查在文字里、证据不在输入里"。
  1. `trustedTime`：`{ now, source, clockSyncAuditRef }`（B30：本项自身带时钟同步证据）。**来源**：验证组件在 BWH 本机从其可信时钟读取，`source` 固定为 `"bwh-verification-clock"`。**证据链**：该时钟与签发授权的 BWH 时钟同属一个时钟域（授权的 `issuedAt` 由同一时钟域产生）；`clockSyncAuditRef` 指向覆盖 `now` 的 BWH 域时钟同步审计记录（E4-A A21 结构），使 `now` 参与跨域比较（如与 CI 域签发时间比较）时有同步证据可查；接口 B 交叉校验 `authorization.issuedAt ≤ now < authorization.expiresAt`，`now < issuedAt` 同样拒绝（防时钟倒退注入）。请求方传入的任何时间值一律忽略，不进入判定。与 E4-A §0.6 一致：节点本地墙钟不作数；跨重启场景下 `now` 的可信性由 E4-E 的重新交换保证（本合同只消费结果）。
  2. `releaseIdentityEvidence`：`{ documentSha256, signerKeyId, documentType, signatureValid, imageManifestSha256, imageArtifactSha256, bomSha256, trustStoreSha256, trustStoreVersion, resolvedReleaseRef, signingTimeEvidence }`（`trustStoreSha256`/`trustStoreVersion` 为 RI 文档内绑定的店摘要与店版本，取自同一会话冻结的 RI 原件字段，B36 补）（`signingTimeEvidence` 为该 Release Identity 文档的统一时间证据，结构见上行定义；其 T_event 来自 CI 签名操作记录、T_first 来自 CI 发布记录或验证方首次取得记录）。**来源**：验证组件本次会话内对 Release Identity 文档 + 信封按 E4-A §0.3 全局路径**亲自执行验证**的运行产出。**取证方式（B8 冻结）**：文档由采集层以被验授权的 `releaseRef` 经引用解析器自发布制品库定位取得（`releaseRef` 是不透明引用，解析结果记入 `resolvedReleaseRef`），`documentSha256` 由验证组件对取回原件的实际字节本地计算——**引用解析到的原件与摘要指向的原件必须是同一份**，由本地摘要等于 `authorization.releaseIdentitySha256` 证明（映射表第 14 行），不以引用字符串相等代替，也不要求 `releaseRef` 与文档的 `releaseId` 字段相等。解析结果在同一验证会话内**不可变**：原件字节随证据一同冻结于本会话，后续全部比对只用该原件，会话内不重新解析（防引用映射变化的 TOCTOU）。**证据链**：`signerKeyId` 取自信封，其合法性按 B11 的历史判定规则核对（签名时状态/窗口/转换证据/当前撤销，见本节末「历史签名者判定」），不要求其在现行店中仍为 `active`；`signatureValid` 是该次验证运行的实际结果而非输入断言；其后三字段的派生方式冻结为——`imageManifestSha256`、`bomSha256` 取自文档字段；`imageArtifactSha256` 必须由验证组件以被验授权/首启包的 `imageManifestRef` **实际取得清单原件**、本地计算其 SHA-256 并确认等于文档的 `imageManifestSha256` 后，**从同一份原件**读出（闭合规则见 §5.3.1 清单引用闭合）。证据与文档字节不绑定（例如来自另一次对另一文档的验证运行）⇒ 视为无证据。接口 B 复核：`documentType === "release_identity"`、`signatureValid === true`、`documentSha256 === authorization.releaseIdentitySha256`（不等 ⇒ `authorization_binding_mismatch`）。
  3. `trustStoreChain`：`{ genesis, currentVersion, currentSha256, updates, originals }`，其中 **`genesis`（B34 冻结，v1.1 新增）** 为首店的 genesis 接受记录：`{ storeVersion, storeSha256, acceptedAt（= bootstrapConfirmedAt）, acceptanceSequence（日志首序）, firstStoreSigningEvidence, originalRef }`——首店的时间证据（T_event/T_first 及全部引用）**随 genesis 持久化**，正常接口 B 判定涉及首店的历史检查时从 genesis 读取（与 `originals` 中首店的文档/信封原件配套复核）；链的版本序列自 genesis 的 storeVersion 起算，`updates` 只含 genesis 之后的更新，**不构造 fromVersion = 0 的条目**；genesis 缺失、其 firstStoreSigningEvidence 缺失或与原件摘要对不上 ⇒ `authorization_signature_invalid`（含重启后读取的情形）；`updates` 每项为 `{ fromVersion, toVersion, signerKeyId, storeSha256, acceptedAt, acceptanceSequence, acceptanceClockSyncAuditRef, signingTimeEvidence }`（B16/B20 冻结：每项必须携带该版 Trust Store **自身**的签发时间证据——其 `documentSha256` 等于该项 `storeSha256`、`signedDocumentType` 为 `release_trust_store`、`purpose` 为 `release-signing`；`acceptedAt` 是接受时间，**不代替** T_event。B30：`acceptanceClockSyncAuditRef` 为覆盖该 `acceptedAt` 的验证方域时钟同步审计记录——接受事件本身也是跨域比较的一方，必须自带同步证据）。**来源**：验证方本地的 **Trust Store 接受日志**（append-only，随每次接受更新按 E4-A §2.3/§2.4 流程追加完整条目；该日志是验证方本地事实，不经网络取得、不可由请求方提供）。**历版原件解析（B21 冻结，B30 明确边界）**：`originals` 为按版本索引的历版 Trust Store「原件」集合（采集层自验证方本地已接受店档案取得），覆盖本链涉及的全部版本；**「原件」的冻结定义**：每版 = `{ storeDocument（文档原件）, detachedEnvelope（该版 detached 信封原件）, documentSha256, envelopeSha256 }`——只存文档 JSON 而没有信封原件不算原件（无信封即无法复核 A14 的签发事件绑定）；纯验证层对文档与信封分别重算摘要并与日志/时间证据对账，判定某次更新的签发者合法性时，从其**前一版原件**的文档中读取该 keyId 的条目（status/purpose/有效窗口）——不凭摘要或版本号推断历史状态。任一被判定版本的原件缺失、摘要对不上或会话内被替换 ⇒ `authorization_signature_invalid`；原件在会话内不可变（与 B8 的解析冻结相同）。**证据链**：`updates` 数组必须与接受日志逐项对账——每一版的摘要、接受时间与序号与日志记录一致、版本衔接无缺口、当前版等于日志末项。**顺序判定**：同一验证方域内的事件顺序以 `acceptanceSequence` 为首要键，`acceptedAt` 只作辅助与跨域比较之用——同秒发生的多个接受事件不得仅凭秒级时间戳定序。与日志对不上、日志有缺口或签发者在对应历史店中非 `active` release-signing ⇒ `authorization_signature_invalid`（信任链不可证明时，不把授权签名视为已验证）。
  4. `revocationContext`：`{ manifestVersion, manifestSha256, signatureValid, nextUpdate, signingTimeEvidence }`（`signingTimeEvidence` 为该清单文档的统一时间证据，结构见上行定义）。**来源**：验证组件本次会话内亲自取得当前撤销清单文档 + 信封并按 E4-A §0.3 验签的运行产出。**证据链**：`manifestSha256` 本地计算；`signatureValid` 为实际验签结果（签发者的合法性按 B11/B14 的历史判定规则核对——签名时在其对应历史店版本中为合法 revocation-signing 且未被当前撤销清单反噬，见本节末「历史签名者判定」）；新鲜度以 `trustedTime.now < nextUpdate` 判定（过期 ⇒ `authorization_revoked`，fail-closed）；**历史连续性不再以布尔断言传入**——纯验证层据第 7 项 `revocationHistoryEvidence` 自行派生（v0.8 起删除原 `historyContinuous` 输入字段）。接口 B 据此上下文与历史证据执行 E4-A §5.2 全部回溯检查。
  5. `popAuthoritativeRecord`：**来源**：验证组件按 `popChallenge` **直接查询 BWH PoP 权威存储**得到的记录原件（存储与签发/消费同属 BWH 权威域）。**证据链**：查询由验证组件发起，不接受请求方转交的"存储截图式"对象；取得的记录即 `consumedPopEvidence` 的唯一对照基准（逐字段相等规则见上行）。记录必须包含 `popConsumptionSequence`（B17：该次消费事件在 BWH 权威审计序列中的序号，由存储在消费事务中分配，请求方不可提供或修改）。查无记录 ⇒ 无证据。
  6. `authorizationSigningEvidence`（B14/B17 冻结，v0.9 按 B24 补同记录绑定）：`{ authorizationSha256, signingTimeEvidence, signingSequence }`。**来源**：BWH 签发审计——授权签发事务即时写入的记录。**同记录恒等式（B24，v1.0 按 B28 补全）**：`signingTimeEvidence.tEventEvidence.auditRecordRef` 必须解析到一条确定的 BWH 签发审计记录 R，且同时成立：`R.documentSha256` === 本项 `authorizationSha256`（并等于被验授权文档的本地摘要）、`R.envelopeSha256` === `signingTimeEvidence.envelopeSha256`（并等于被验授权信封的本地摘要）、`R.eventSequence` === 本项 `signingSequence`、`R.signerKeyId` === 授权信封的 signerKeyId、`R.eventType` === 授权签发事件类型（E4-A A26 常量）、**`signingTimeEvidence.tEventEvidence.timestamp` === `R.eventAt`**、**`signingTimeEvidence.tEventEvidence.timeSource` === `R.timeSource`**（B35）——时间、信封、序号、签发者、实际事件时间与时间来源必须同出一次签发事件，任何跨记录拼接（时间取自授权 A 的记录、序号取自授权 B 的记录、信封摘要指向另一份信封、时间戳与记录 eventAt 不符）⇒ `authorization_time_evidence_invalid`。`signingSequence` 是该签发事件在**与 PoP 消费同一条 BWH 权威审计序列**中的序号，与 `popConsumptionSequence` 可直接比较（见 §5.3.2 的顺序规则）。此项是「历史签名者判定」对 Deployment Authorization 一类执行四查的证据载体，也是 B10 时间顺序的序号基准。
  7. `revocationHistoryEvidence`（B18 冻结，v0.9 按 B22/B23 修订，v1.0 按 B29/B30 补绑定与时钟证据）：`{ declaredVersion, declaredManifestSha256, currentVersion, currentManifestSha256, versionChain, addedEntries, historicalManifests }`，其中 `versionChain` 为自声明版本至当前版本的逐版记录 `{ version, manifestSha256, acceptedAt, acceptanceSequence, acceptanceClockSyncAuditRef, timeSource }`（B23：接受事件带验证方域序号，与 E4-A §0.7 统一审计事件基础字段对齐，同域定序以序号为准；B30：每项带覆盖其 acceptedAt 的验证方域时钟同步审计引用）；`historicalManifests` 为**声明版本及每个中间版本直至当前版本的原始清单原件**（每份含其版本与原件字节）；`addedEntries` 降为采集层的**待核对声明**。**来源**：采集层自验证方本地留存的撤销清单接受记录与累计清单原件档案组装。**派生规则（B22）**：纯验证层必须亲自完成——① 对每份历史原件本地重算 SHA-256 并与 `versionChain` 对应版本的摘要及本地接受记录对账；② 校验版本逐版连续；③ **逐版自算新增条目集**（相邻两版条目集的差集），汇总得到声明版本至当前版本的完整新增全集；④ 要求自算全集与 `addedEntries` 声明**完全相等**（多一条、少一条都拒绝）；⑤ 对自算全集执行 E4-A §5.2 的完整回溯。只有摘要而没有原件时，新增全集不可自算，连续性与完整性都不可派生 ⇒ 拒绝。连续性是派生结论，不是任何一方的输入断言。**起止四向绑定（B29 冻结）**：起点——`declaredVersion` === `authorization.revocationVersion`，且 `declaredManifestSha256` === 验证方本地接受日志中该版本记录的 manifestSha256；终点——`currentVersion` === 上文第 5 项 `revocationContext.manifestVersion`，`currentManifestSha256` === `revocationContext.manifestSha256` === `historicalManifests` 末份原件的重算摘要 === 本地接受日志最高版本记录的 manifestSha256。任一绑定不成立 ⇒ `authorization_revoked`（区间错位即撤销完整性不可证明，按撤销处理，不新增错误码）。
- 校验：按 E4-A §0.3 全局顺序验信封与授权（含 signerKeyId 一致、purpose）；授权字段按 §5.3.1 映射表逐项比对；三锚在场且经共享 normalizer 校验；PoP 凭证按上行权威性要求核对并执行 §5.3.2 全部恒等式；撤销回溯按 `revocationContext` 执行（E4-A §5.2：授权所依据的 release 摘要、链上 keyId、**授权绑定的第三锚**均未被撤销，命中 ⇒ `authorization_revoked`）。
- **授权有效期三段校验（B9 冻结）**：`authorization.expiresAt > authorization.issuedAt`；`authorization.expiresAt - authorization.issuedAt ≤ 24 h`（E4-A §3 的最长有效期，本合同独立复核，不因 E4-A 已规定而省略）；`authorization.issuedAt ≤ trustedTime.now < authorization.expiresAt`。前两项不满足 ⇒ `authorization_validity_window_invalid`（v0.7 新增错误码）；第三项的右界不满足 ⇒ `authorization_expired`，左界不满足（now < issuedAt）⇒ `authorization_validity_window_invalid`。仅"当前未过期"不构成有效期合格。
- **历史签名者判定（B11 冻结，v0.8 按 B14 补入第四类，与 E4-A §0.7/§2.2 对齐）**：Release Identity、Trust Store 更新、Revocation Manifest、**Deployment Authorization** 四类文档的签名者合法性，一律按**签名时**对应的历史 Trust Store 版本与可信时间证据判定，不要求签发者在现行店中仍为 `active`。四查缺一不可：① 签名时状态——以该文档的签发事件时间 T_event（E4-A §0.7 三层模型；证据经各文档的 `signingTimeEvidence` 传入）对照接受日志重建的状态时间线，签发者在当时为对应 purpose 的 `active`；② 签名时窗口——T_event 落在该密钥 `[validFrom, validUntil)` 内且 T_first 不晚于窗口关闭；③ 状态转换证据——涉及的状态转换（active → retiring 等）以接受日志的实际接受时间为准，回填时间不算数；④ 当前撤销回溯——签发者 keyId 若已被当前累计撤销清单撤销或现行店置 `revoked`，按 E4-A §2.2 的优先级规则，其历史签名仍不被信任（撤销压倒历史有效性）。其中 Deployment Authorization 的四查证据由 `authorizationSigningEvidence` 承载：purpose 在签发时历史店版本中为 `deployment-authorization`、签发审计的 T_event/T_first 落在窗口内、签发时状态合法、且通过当前撤销优先检查。
- **授权版本声明核验（B12 冻结）**：对 `authorization.trustStoreVersion` 与 `authorization.revocationVersion` 逐项核验：① 声明的 trustStoreVersion 必须存在于本地接受日志，且授权签发者在其对应历史版本中的状态合法（按上行历史判定）；② 声明的 revocationVersion 必须能在本地撤销清单连续历史中定位（留存的历史版本或累计清单的版本谱系）；③ 当前撤销清单 version 不得低于声明的 revocationVersion（低于 ⇒ 证据倒退，拒绝）；④ 从声明版本到当前版本之间新增的撤销条目，必须按 E4-A §5.2 完整回溯（命中即拒）；⑤ 任一版本缺失、倒退或连续性无法证明 ⇒ 拒绝（`authorization_revoked`；其中 trustStoreVersion 无法定位 ⇒ `authorization_signature_invalid`）。
- 成功输出——**已验证证据包（冻结字段，执行器只消费此包）**：`{ nodeRef, providerRef, regionRef, roleRef, channelRefs, imageManifestRef, releaseRef, firstBootPacketRef, wireguardPlanRef, wireguardPublicKeyFingerprint, agentAuthFingerprint, agentSigningPublicKeyFingerprint, authorizationSha256, popEvidenceSha256, generation }`。
- 失败错误码（冻结）：`authorization_envelope_invalid`、`authorization_signature_invalid`、`authorization_binding_mismatch`、`authorization_anchor_invalid`、`authorization_pop_evidence_mismatch`、`authorization_revoked`、`authorization_expired`、`authorization_validity_window_invalid`（B9 于 v0.7 新增：有效期结构非法——`expiresAt ≤ issuedAt`、时长超过 24 h 或 now 早于 issuedAt）、`authorization_time_evidence_invalid`（B19 于 v0.8 新增：`signingTimeEvidence` 缺失，或其文档摘要/信封摘要/signerKeyId/signedDocumentType/purpose 任一绑定不符，或时间证据不可验证）。

### 5.3.1 授权字段映射表（B3 冻结）

接口 B 的字段比对以下表为唯一依据，不接受"逐项相等"式的概括表述。两侧取值都必须来自表中写明的**实际验证输入**（具体输入对象 + 字段路径）；从其他来源（请求方附带声明、缓存旧值、包内自述摘要）取得的值不构成验证输入。比较方式中"直接相等"指字符串逐字相等；"规范化后相等"指经共享 normalizer 处理后相等（仅锚字段）；"集合相等"指排序后逐项相等。

| # | 授权侧输入（authorization 文档字段） | 对照侧输入（实际验证输入） | 对照侧来源类别 | 比较方式 | 不一致错误码 |
| --- | --- | --- | --- | --- | --- |
| 1 | `nodeRef` | 接口输入 `firstBootPacket` 原件的 `node.nodeRef` | 请求方材料（待核对） | 直接相等 | `authorization_binding_mismatch` |
| 2 | `physicalNodeRef` | `firstBootPacket.node.physicalNodeRef` | 请求方材料（待核对） | 直接相等 | `authorization_binding_mismatch` |
| 3 | `providerRef` | `firstBootPacket.node.providerRef` | 请求方材料（待核对） | 直接相等 | `authorization_binding_mismatch` |
| 4 | `regionRef` | `firstBootPacket.node.regionRef` | 请求方材料（待核对） | 直接相等 | `authorization_binding_mismatch` |
| 5 | `roleRef` | `firstBootPacket.node.roleRef` | 请求方材料（待核对） | 直接相等 | `authorization_binding_mismatch` |
| 6 | `channelRefs` | `firstBootPacket.node.channelRefs` **且** 接口输入 `expectedChannelRefs` | 请求方材料 + **本地批准映射**（采集层读取） | 集合相等（三方一致） | `authorization_binding_mismatch` |
| 7 | `imageManifestRef` | `firstBootPacket.image.imageManifestRef` | 请求方材料（待核对） | 直接相等（引用闭合另见下行规则） | `authorization_binding_mismatch` |
| 8 | `releaseRef` | `firstBootPacket.image.releaseRef`，**且**两侧引用经解析器定位的原件必须是同一份（解析绑定见 §5.3 的 B8 取证方式与第 14 行的摘要证明） | 请求方材料（待核对） | 直接相等 + 解析目标同一 | `authorization_binding_mismatch` |
| 9 | `wireguardPlanRef` | `firstBootPacket.wireguard.planRef` | 请求方材料（待核对） | 直接相等，且须通过 E1 `WG_PLAN_REF_PATTERN` | `authorization_binding_mismatch` |
| 10 | `wireguardPublicKeyFingerprint`（锚 1） | `firstBootPacket.wireguard.publicKeyFingerprint` | 请求方材料（待核对） | 规范化后相等；任一侧缺失或格式非法 ⇒ 右列错误码 | `authorization_anchor_invalid`（缺失/格式） |
| 11 | `agentAuthFingerprint`（锚 2） | `firstBootPacket.agent.authFingerprint` | 请求方材料（待核对） | 同上 | `authorization_anchor_invalid`（缺失/格式） |
| 12 | `agentSigningPublicKeyFingerprint`（锚 3） | `firstBootPacket.agent.signingPublicKeyFingerprint` **且** `verificationContext.popAuthoritativeRecord.agentSigningPublicKeyFingerprint` | 请求方材料 + **BWH 权威存储**（采集层直查） | 规范化后相等（三方一致）；缺失/格式 ⇒ 前者，与权威记录不一致 ⇒ 后者 | `authorization_anchor_invalid` / `authorization_pop_evidence_mismatch` |
| 13 | `firstBootPacketRef` | 验证组件对收到的 `firstBootPacket` 原件规范化字节**本地重算**的 packetRef（不采信包内自述的引用值） | 验证组件本地计算 | 直接相等 | `authorization_binding_mismatch` |
| 14 | `releaseIdentitySha256` | `verificationContext.releaseIdentityEvidence.documentSha256`（本次验证运行对实际文档字节的本地计算，见 §5.3 来源总则） | 采集层验证运行产出 | 直接相等 | `authorization_binding_mismatch` |
| 15 | `imageArtifactSha256` | `verificationContext.releaseIdentityEvidence.imageArtifactSha256`（按清单引用闭合规则自同一份清单原件读出） | 采集层验证运行产出 | 直接相等 | `authorization_binding_mismatch` |
| 16 | `bomSha256` | `verificationContext.releaseIdentityEvidence.bomSha256`（取自已验证的 Release Identity 文档字段） | 采集层验证运行产出 | 直接相等 | `authorization_binding_mismatch` |

注 1：第 10–12 行的对照侧即首启包提交的候选身份材料；三锚与 PoP 的绑定关系另由第 12 行的三方一致（含权威记录一侧）与 §5.2 的验签共同保证。表中任一行失败，接口 B 整体拒绝，执行器不得收到证据包，注册零写入。
注 2（实施前对齐，P1）：本表中的首启包字段路径（`node.*`、`image.*`、`wireguard.*`、`agent.*`）与第 13 行 packetRef 的规范化计算方式，是合同层定义；源码实施前必须对照真实首启包的生产代码与既有 E1 合同逐一核实。发现出入时先修订本修订单并重新确认，不得在实现中静默适配。

**清单引用闭合（B4 冻结）**：第 7 行的引用相等只是第一步，引用指向的内容必须同时满足两条恒等式，缺一即以 `authorization_binding_mismatch` 拒绝：
- `SHA256(由 imageManifestRef 实际取得的清单原件) === releaseIdentityEvidence.imageManifestSha256`（即 Release Identity 签名覆盖的那份清单）；
- 该**同一份原件**的 `imageArtifactSha256` 字段 === `authorization.imageArtifactSha256`（并因此与映射表第 15 行一致）。
两条恒等式的取值必须来自同一份清单原件：制品摘要不得从首启包、授权文档或缓存副本读取后与清单摘要拼凑成"闭合"。

### 5.3.2 PoP 三方绑定恒等式（B2/B3 冻结）

接口 B 放行前，以下恒等式必须全部成立；任一不成立以 `authorization_pop_evidence_mismatch` 拒绝，注册零写入：

- `authorization.popEvidenceSha256 === consumedPopEvidence.popEvidenceSha256 === verificationContext.popAuthoritativeRecord.popEvidenceSha256`
- `authorization.nodeRef === consumedPopEvidence.nodeRef === verificationContext.popAuthoritativeRecord.nodeRef`
- `authorization.agentSigningPublicKeyFingerprint === consumedPopEvidence.agentSigningPublicKeyFingerprint === verificationContext.popAuthoritativeRecord.agentSigningPublicKeyFingerprint`
- `consumedPopEvidence.popChallenge === verificationContext.popAuthoritativeRecord.popChallenge`（授权文档不直接携带 challenge；它对 challenge 的绑定经 `popEvidenceSha256` 传递——该摘要的构成（§5.2）包含 popChallenge，故摘要三方相等即蕴含三方指向同一次 challenge 消费）
- **时间与事件顺序（B10 冻结，v0.8 按 B17 修订）**：主判定为**事件序号**——`verificationContext.popAuthoritativeRecord.popConsumptionSequence < verificationContext.authorizationSigningEvidence.signingSequence`，两序号同出一条 BWH 权威审计序列、由 BWH 在各自事务中分配，请求方不可提供。辅判定为时间一致性——`verificationContext.popAuthoritativeRecord.consumedAt ≤ authorization.issuedAt`（同属 BWH 时钟域）；因时间戳为秒精度，同一秒内的先后**不能**只靠时间相等证明，故时间项只作一致性检查、不作顺序证明。任一不满足 ⇒ 违反 §5.1 生命周期（先消费、后签发），以 `authorization_pop_evidence_mismatch` 拒绝，注册零写入。

本节的意义：凭证与权威记录彼此一致（§5.3 既有规则）只证明"这份 PoP 是真的"；本恒等式进一步证明"**这份 PoP 就是本授权所依据的那一份**"。一份真实存在、权威存储可查、但摘要与授权不一致的 PoP，不得为另一份授权背书。

### 5.4 夹具与生产实现的兼容要求

E1-A 的实施与测试使用**固定测试夹具**实现接口 A/B（测试专用密钥与合成数据），不依赖 E4-E 生产实现先行存在。接口合同测试套件随 E1-A 落地；E4-E 的生产实现必须通过**同一套件**（同输入 ⇒ 同输出/同错误码）作为其验收的一部分。接口签名、证据包字段与错误码在本修订单确认后冻结，任何一方不得单方面漂移；确需变更时先修订本修订单并重新确认。

### 5.5 自举验证入口（B26 冻结，v1.0 新增）

**存在理由**：E4-A A16/A20 规定首店在 genesis 建立前只有临时自举信任、无正式接受日志；而 §5.3 正常接口 B 要求七个子项齐全（含日志支撑的 trustStoreChain 与 BWH trustedTime）。两者不冲突的前提是：**首次授权的验证走本节的专用自举入口，正常接口 B 的证据要求一字不放宽**。在 genesis 建立前，正常接口 B 对一切注册验证请求拒绝（见测试 53）；本入口不是接口 B 的"宽松模式"，是独立入口、独立上下文、独立权限边界。

**入口与权限边界**：自举入口（语义名 `verifyBootstrapAuthorization`）只在验证方处于**无 genesis 状态**（本地接受日志不存在 genesis 记录）时可达，且只接受与 E4-A §2.4 锚定的候选密钥及本次首启包绑定的**首份**授权；普通注册请求无任何参数可以导向本入口（入口选择由验证方自身状态决定，不由请求方指定）。自举成功并写入 genesis 后，本入口对该验证方**永久停用**；genesis 已存在时调用本入口 ⇒ 拒绝。

**函数签名（B31 冻结）**：`verifyBootstrapAuthorization({ authorization, envelope, firstBootPacket, expectedChannelRefs, bootstrapVerificationContext })`——与接口 B 同形：前四参的语义与接口 B 完全一致（`firstBootPacket` 为首启包原件、本地重算其 packetRef；`expectedChannelRefs` 由验证方本地批准映射读取，**不接受首启包或请求方提供的值作为批准映射**），第五参替换为自举上下文。入口不接受任何"模式开关"参数。

**输入 `BootstrapVerificationContext`**（采集层组装，来源逐项冻结）：
- `temporaryTrustStore`：`{ storeDocument（原件）, storeSha256（本地重算）, candidateKeyId, candidateFingerprintEvidence }`——来源为首启渠道取得的临时店（E4-A §2.4 第二步）；候选唯一性按八步规则，多候选/零候选 ⇒ 中止。**带外指纹证据（B36）**：`candidateFingerprintEvidence = { expectedFingerprint（验证方本地受保护存储中的带外核对值）, computedFingerprint（对候选公钥本地复算）, comparedEqual, verificationRecordRef（本次核对的本地记录） }`——请求方提交的 `candidateFingerprintVerified: true` 一类布尔断言不构成证据（B1 总则）。
- `firstStoreSigningEvidence`：首店自身的 `signingTimeEvidence`（其 T_event 来自店自身签发记录；T_first 按 E4-A A20 的 RI 路径——RI 发布记录绑定的店摘要）。本对象在自举成功后随 genesis 持久化（B34），不是一次性输入。
- `releaseIdentityEvidence`：与 §5.3 第 2 项同构，但其验签在**临时信任**下完成（候选密钥临时授信，E4-A §2.4 第 7 步口径），并包含八步的双重验证结果。**店绑定（B36）**：验证必须包含 `SHA-256(temporaryTrustStore.storeDocument 原件) === releaseIdentityEvidence.trustStoreSha256`（E4-A §2.4 第 5 步）——RI 绑定的正是这份临时店，摘要由验证方对原件本地计算，不取任何一方的自报值。
- `bootstrapExchangeEvidence`：首次 BWH 授权交换的产出——`{ authorizationSigningEvidence, popVerificationResult（接口 A 的验证通过产出）, consumedPopEvidence, popAuthoritativeRecord, bootstrapRevocationEvidence, exchangeCompletion }`。其中（B32）：`consumedPopEvidence` 与 `popAuthoritativeRecord` 是 BWH **原子消费完成后**的证据与权威记录原件（后者含 consumedAt、challengeState = consumed、recordRef、popConsumptionSequence）——接口 A 验证通过 ≠ 已消费，三件套缺一不可，§5.3.2 的三方恒等式与序号规则在自举中**逐字适用**。（B33）：`bootstrapRevocationEvidence` 不是"当前视图"四个字——它必须携带可独立复算的完整撤销历史：`{ currentManifestOriginal（当前清单文档+信封原件）, currentVersion, currentManifestSha256（本地重算）, declaredBaselineSha256（授权声明版本对应的清单摘要）, historicalManifests（声明版至当前版的清单原件全套）, currentSigningTimeEvidence, nextUpdate }`；纯验证层对它执行与 §5.3 第 7 项**相同的 B22 五步派生**（逐版重算、自算新增集、完整回溯），连续性无法由所给原件证明 ⇒ 按 E4-A §5.2 fail-closed 拒绝；新鲜度以 exchangeCompletion 的确认时间对 `nextUpdate` 判定。（B36 时间分离）：`exchangeCompletion = { bootstrapConfirmedAt, completionRecordRef }` 是 BWH 交换完成记录——三个时间严格分开：`authorization.issuedAt`（授权签发锚，文档内、签名覆盖）、`bootstrapConfirmedAt`（首次交换成功确认时间，取自 BWH 交换完成记录）、genesis 的 `acceptedAt` === `bootstrapConfirmedAt`（恒等），且 acceptedAt **不等于**也不得回填为 authorization.issuedAt；自举阶段的时间窗判定（B9 的 now）取自交换确立的 BWH 时间锚（E4-A §0.6 机制），不取节点本地时钟。

**判定范围**：授权本身的全部检查照常执行——信封验签（在双重验证建立的临时信任下判定 RI 与授权签发者）、§5.3.1 映射表恒等式、§5.3.2 PoP 三方恒等式与序号定序、B9 有效期三段校验（now 取时间锚）、撤销回溯（对 `bootstrapRevocationEvidence` 执行 B22 五步派生）、第三锚一致性。**被替代的只有证据来源**（临时店代替日志链、BWH 时间锚代替本地 trustedTime、自举撤销证据代替本地撤销档案），检查项与拒绝口径不变。

**成功输出（B31 冻结）**：自举入口成功时返回与接口 B **完全同构**的已验证证据包（同一结构、同一字段集，含授权摘要、首启包摘要、PoP 摘要与三锚绑定结论）。**注册执行器只消费该证据包**——不接受原始 `BootstrapVerificationContext`、不读自举上下文的任何字段；自举入口不是第二套执行器。**顺序冻结**：证据包产出后，先提交 genesis（含 B34 的首店证据持久化与 B33 的撤销自举接受记录），**genesis 提交成功之前不得发生任何注册写入**；genesis 提交失败 ⇒ 本次证据包作废、不注册、不留半成品状态。genesis 建立后，后续授权统一走正常接口 B。

**成功与失败的后置状态**：成功 ⇒ genesis 建立（acceptedAt = bootstrapConfirmedAt，见上），且（B33）经验证的撤销历史以一条**自举接受记录**正式写入本地撤销档案——记录类型与来源如实标注为"自举交换导入，其内容已经 B22 五步派生验证"，历史原件随记录归档；此后本地撤销历史以该记录为起点、后续接受正常追加，正常接口 B 读到的本地状态其源头是这条可审计的自举接受记录，**不伪装成验证方过去逐版接受过这些清单**。失败 ⇒ 不建立 genesis、不写自举接受记录、不留任何正式接受状态、临时证据不得转入正常路径复用（下次自举必须重新取证）；失败原因按接口 B 的对应错误码返回，不新增自举专用错误码。

## 6. 冻结测试清单（共 62 项，实施验收必须全数具备；另须通过 §5.4 的接口合同测试套件）

编号说明：1–23 为 v0.4 时的清单（原 13 项全保留，其中原测试 1 按 B4 拆为 1、2 两项；15–23 为 B6 第一批新增）；24–29 为 v0.5 新增；30–32 为 v0.6 新增（测试 30 于 v0.7 扩充模块边界实证）；33–36 为 v0.7 新增；37–40 为 v0.8 新增；41–46 为 v0.9 新增（对应独立复审 T9–T14）；47–54 为 v1.0 新增；55–62 为 v1.1 新增（eventAt/timeSource 恒等式、自举 PoP 权威记录、自举批准映射、自举输出同构、首店证据持久化、自举撤销完整性与正式纳入）；测试 20、27 于 v0.8 按 B18 改述（连续性改为证据派生）。任何版本修订不得删减既有项。本清单与 E4-A 的 TV-K/TV-T 等向量均为**合同级测试要求**，不是已经执行通过的测试结果。

1. **授权侧锚不一致（B4 场景一）**：首启包第三锚与 Deployment Authorization 第三锚不一致 → `authorization_binding_mismatch`；第三锚缺失 → `authorization_anchor_invalid`。两种情形均**不得发生任何注册写入**，且不得以 `registration_conflict` 返回（授权验证失败与存量冲突严格分离）。
2. **存量记录冲突（B4 场景二）**：同 nodeRef 已有注册记录，授权本身有效但新绑定身份与存量记录不一致 → `registration_conflict`，存量记录保持不变。
3. 密钥替换：其余字段全同、仅签名密钥不同 → `registration_conflict`。
4. 签名伪造：PoP 签名由未登记私钥生成 → 授权不签发、注册不发生。
5. PoP 重放：同一 challenge 第二次提交 → 拒绝。
6. 跨版本冲突：v1 记录 + v2 尝试、v2 记录 + v1 尝试 → 均冲突，均不升级。
7. 旧路径回归：其他节点 v1 注册（含锚缺失的旧式首登记）行为与 E1 验收时完全一致。
8. **摘要稳定性**：修订代码下，既有 v1 记录的 `recordDigest` 与修订前逐字相同（以 E1 的既有测试夹具记录验证）。
9. 入口限制回归：JP-01 经摄入入口带锚/不带锚均仍被 `registration_path_forbidden` 拒绝（E1 第六轮测试不失效）。
10. 锚格式（P8 按共享 normalizer 实际行为冻结）：合法大写/混合大小写十六进制输入经规范化后必须得到标准小写指纹并被接受，**含大写 `SHA256:` 前缀的输入同样被接受**（normalizer 对整个输入小写化，前缀一并处理——以实际代码行为为准）；缺 `sha256:` 前缀、长度错误、含非十六进制字符必须拒绝；空值按既有缺失语义处理。第三锚与另两锚在同一组用例下行为一致。不允许为迁就测试而改动共享函数。
11. 门回归：执行门九态表对 v2 路径同样成立（门未开时 v2 注册零写入）。
12. **成功路径**：有效三锚 + 有效 PoP 夹具证据 + 有效授权夹具证据 → v2 注册成功；回执与 `recordDigest` 由 v2 绑定（13 键）派生；同证据包重放得到 already-registered 且摘要一致，**且断言 challenge 状态与消费记录未被再次触碰**（重放不进 PoP 流程）。
13. **PoP 消费原子性（锚定生命周期第 3 步）**：同一 challenge 在消费环节并发提交两次（接口夹具以原子消费存储桩模拟），恰好一次成功、一次以 `pop_challenge_consumed` 拒绝；消费标记与 `popEvidenceSha256` 留存不可分割。生产侧（BWH 存储层）的原子性由 E4-E 的并发测试再次证明，不以本项代替。
14. **版本标记未知值**：记录中 `registrationBindingVersion` 已出现但为 `"1"`、`"3"`、空字符串或非字符串时，一律以 `registration_binding_version_unknown` 拒绝，不回落 v1；缺失仍判 v1、`"2"` 判 v2。
15. **时间同一性（B1）**：一次消费流程中，接口 A 收到的 `evaluatedAt`、参与 `popEvidenceSha256` 计算的 `consumedAt`、留存记录中的 `consumedAt` 三者逐字相等。
16. **原子消费失败无部分写入（B1）**：在消费事务中注入存储失败 → challenge 仍为 `issued`、无 `popEvidenceSha256` 留存、无可被接口 B 接受的凭证产生。
17. **可信时间上下文缺失（B2）**：接口 B 输入缺少 `verificationContext.trustedTime`，或其 `source` 不是冻结值 → 拒绝；授权已过期（now ≥ expiresAt）→ `authorization_expired`。
18. **Release Identity 证据不一致（B2）**：`releaseIdentityEvidence.documentSha256` 与授权的 releaseIdentitySha256 不等，或 `signatureValid` 非 true，或 documentType 不是 `release_identity` → 拒绝。
19. **Trust Store 更新链不可证明（B2）**：updates 链断裂、跳号，或某次更新的 signerKeyId 在其对应历史店版本中不是 `active` 的 release-signing 条目 → 拒绝（`authorization_signature_invalid`）。
20. **撤销上下文失效（B2）**：撤销清单已过期（now ≥ nextUpdate），或 `revocationHistoryEvidence` 缺失/版本链派生不连续，或清单签名证据无效 → 拒绝（`authorization_revoked`）。
21. **非权威 PoP 凭证（B2）**：consumedPopEvidence 与 popAuthoritativeRecord 任一字段不一致，或权威记录不存在 → `authorization_pop_evidence_mismatch`。
22. **授权字段逐项错配（B3）**：以 §5.3.1 映射表 16 行为参数集，逐行构造一处错配，每行均按表中错误码拒绝且注册零写入（参数化测试，缺行即未覆盖）。
23. **未知 challenge 状态（B5）**：challengeRecord.state 为未知字符串、缺失或非字符串 → `pop_challenge_state_invalid`；`issued`/`consumed`/`expired` 三态各自回到其既定错误码。
24. **可信时间来源（v0.5 新增）**：请求方随注册请求附带一个较早的"当前时间"并提交已过期授权 → 接口 B 只采信验证组件时钟（夹具时钟替身），仍以 `authorization_expired` 拒绝；另构造 now < issuedAt 的时钟回退场景 → 同样拒绝。
25. **Release 证据绑定（v0.5 新增）**：releaseIdentityEvidence 来自对**另一份** Release Identity 文档的验证运行（其 documentSha256 与本次授权指向的文档不一致）→ `authorization_binding_mismatch`；证据对象由请求方手工拼凑（无对应验证运行）→ 同样拒绝（视为无证据）。
26. **Trust Store 接受日志一致性（v0.5 新增）**：trustStoreChain.updates 中某一版摘要与验证方接受日志记录不符，或日志缺失中间版本 → `authorization_signature_invalid`。
27. **撤销连续性派生（v0.5 新增，v0.8 按 B18 改述）**：`revocationHistoryEvidence` 的版本链存在缺口、声明版本摘要与本地记录不符，或 `addedEntries` 相对累计清单缺失条目 → 纯验证层按派生结果拒绝（`authorization_revoked`）；任何随请求附带的"连续性已确认"式断言字段被忽略，不影响派生。
28. **伪造 recordRef（v0.5 新增）**：consumedPopEvidence 内部自洽、格式完好，但其 recordRef 在 BWH PoP 权威存储中查无此记录（popAuthoritativeRecord 查询为空）→ `authorization_pop_evidence_mismatch`。
29. **镜像/BOM 摘要一致性（v0.5 新增）**：授权的 imageArtifactSha256 与 releaseIdentityEvidence.imageArtifactSha256 不符，或 bomSha256 与证据不符 → `authorization_binding_mismatch`（与测试 22 的包侧错配区分：本项错配发生在授权与 Release 验证证据之间）。
30. **证据双伪造与模块边界（B1/B13，v0.6 新增、v0.7 扩充）**：请求方同时伪造 `consumedPopEvidence` 与一份字段完全相同的 `popAuthoritativeRecord`（两两自洽），并试图绕过采集层门面直接驱动验证 → 不被接受；经门面的真实采集流程对同一请求取得的权威记录与伪造凭证不一致 → `authorization_pop_evidence_mismatch`。同构的真实证据经采集层门面产生时正常通过（正对照）。**模块边界实证（B13）**：① 导出检查——纯验证函数不得出现在所属模块的公共导出面上；② 入口检查——HTTP 路由、CLI 命令与注册请求处理路径均无法直接到达纯验证层（以路由/调用图测试证明唯一调用方是采集层门面）；③ 轨迹检查——一次通过的验证，其全部可信证据必须留有采集层取证轨迹（如采集调用记录），无轨迹的证据不被接受；④ 覆盖检查——请求方在注册请求中附带与证据同名的字段时，这些字段被忽略，不得覆盖采集层实际取得的证据。
31. **PoP 摘要指向另一份真实 PoP（B2/B3，v0.6 新增）**：权威存储中真实存在 PoP-B（凭证与记录完全一致），但授权的 `popEvidenceSha256` 指向另一份 PoP-A 的摘要 → `authorization_pop_evidence_mismatch`，注册零写入；nodeRef 或第三锚在三方间任一处不一致的变体同码拒绝。
32. **清单引用替换（B4，v0.6 新增）**：`imageManifestRef` 实际取得的清单是另一份清单，其内 `imageArtifactSha256` 与授权相同（制品相同），但清单原件 SHA-256 ≠ Release Identity 的 `imageManifestSha256` → `authorization_binding_mismatch`，注册零写入。
33. **releaseRef 解析错位（B8，v0.7 新增）**：授权与首启包的 `releaseRef` 字符串相等，但引用解析实际定位到 Release-B，而授权的 `releaseIdentitySha256` 指向 Release-A（或反之）→ `authorization_binding_mismatch`，注册零写入；引用解析到正确原件时通过（正对照）。
34. **授权有效期超长（B9，v0.7 新增）**：授权签名有效、当前时刻未过期，但 `expiresAt - issuedAt` 为 48 h → `authorization_validity_window_invalid`，注册零写入；`expiresAt ≤ issuedAt` 的变体同码拒绝；恰 24 h 通过本项（正对照）。
35. **PoP 消费晚于授权签发（B10，v0.7 新增）**：PoP 真实有效、权威记录真实存在、三方摘要全等，但 `popAuthoritativeRecord.consumedAt` 晚于 `authorization.issuedAt` → `authorization_pop_evidence_mismatch`，注册零写入；consumedAt 等于 issuedAt 通过本项（正对照）。
36. **授权版本声明核验（B12，v0.7 新增，v0.8 补齐错误码）**：① trustStoreVersion 不存在于接受日志 → `authorization_signature_invalid`；② revocationVersion 无法在 `revocationHistoryEvidence` 的版本链中定位（声明版本不存在或摘要不符）→ `authorization_revoked`；③ 当前清单 version 低于授权声明 version（证据倒退）→ `authorization_revoked`；④ 声明版本至当前版本之间新增的撤销条目命中授权链（如第三锚）→ `authorization_revoked`。四变体分别构造、分别断言。
37. **接受序号定序（B16，v0.8 新增）**：同一秒内发生两次 Trust Store 接受事件，`acceptedAt` 相同——顺序只按 `acceptanceSequence` 判定：以错误顺序组装的 updates 链（序号与版本衔接矛盾）→ `authorization_signature_invalid`；序号正确时不因时间戳相同而误判。
38. **时间证据绑定（B15/B19，v0.8 新增）**：`signingTimeEvidence` 缺失 → `authorization_time_evidence_invalid`；其 `signedDocumentType` 与文档固定类型常量不符（例如把 Release Identity 的证据挂到 Revocation Manifest 上）→ 同码；`purpose` 与类型映射不符 → 同码；`documentSha256`/`envelopeSha256`/`signerKeyId` 任一与实际文档不符 → 同码。四变体分别构造。
39. **事件顺序证明（B17，v0.8 新增）**：consumedAt 与 issuedAt 同秒相等，但 `popConsumptionSequence ≥ signingSequence` → `authorization_pop_evidence_mismatch`；序号严格小于且时间一致性成立 → 通过本项（正对照，证明秒级时间相等不单独构成顺序证明）。
40. **授权签发者历史判定（B14，v0.8 新增）**：① Deployment Authorization 由签发时合法、现已轮换为 retiring 的 deployment-authorization 密钥签发，`authorizationSigningEvidence` 完整且四查通过 → 签发者检查通过（正对照，不因现行店中非 active 而误拒）；② 授权的签发审计 T_event 早于该密钥 validFrom → 拒绝（`authorization_signature_invalid`）；③ 签发密钥已被当前撤销清单命中 → 按撤销优先拒绝（`authorization_revoked`）。三变体分别构造。
41. **Trust Store 更新缺 T_event（B20，对应复审 T9）**：某历史 Trust Store 更新的 `signingTimeEvidence` 缺失（只有 acceptedAt 与摘要）→ 拒绝（`authorization_time_evidence_invalid`）；双证据齐备的同链更新通过本项（正对照）。
42. **历史店原件缺失（B21，对应复审 T10）**：trustStoreChain 中被判定版本的前一版原件不在 `originals` 中，或其重算摘要与日志 storeSha256 不符 → `authorization_signature_invalid`。
43. **撤销新增条目漏报（B22，对应复审 T11）**：`addedEntries` 声明故意漏掉一条自算新增条目（历史原件完整）→ 纯验证层自算全集与声明不相等 → `authorization_revoked`；声明与自算一致时通过本项（正对照）。
44. **撤销历史原件摘要不符（B22，对应复审 T12）**：`historicalManifests` 中某中间版本原件的重算摘要与 `versionChain` 记录不一致 → 拒绝（`authorization_revoked`）。
45. **同秒撤销接受定序（B23，对应复审 T13）**：同一秒内接受两个撤销清单版本，`acceptedAt` 相同——版本链顺序只按 `acceptanceSequence` 判定；序号与版本衔接矛盾的组装 → 拒绝，序号正确 → 通过本项。
46. **签发证据跨记录拼接（B24，对应复审 T14）**：`authorizationSigningEvidence` 的时间证据指向授权 A 的审计记录、signingSequence 取自授权 B 的审计记录（两者各自真实存在）→ 同记录恒等式不成立 → `authorization_time_evidence_invalid`。
47. **撤销历史起点与授权不一致（B29，v1.0 新增）**：`revocationHistoryEvidence.declaredVersion` 与 `authorization.revocationVersion` 不相等（历史证据本身完整连续）→ `authorization_revoked`；两者相等且摘要与本地日志对账一致时通过本项（正对照）。
48. **撤销历史终点与当前清单不一致（B29，v1.0 新增）**：`revocationContext.manifestSha256` 与 `revocationHistoryEvidence.currentManifestSha256` 不相等，或末份历史原件重算摘要与之不符 → `authorization_revoked`。
49. **审计记录信封摘要不符（B28，v1.0 新增）**：审计记录的 documentSha256、signerKeyId、eventSequence 均正确，但其 envelopeSha256 指向另一份信封 → 同签发事件恒等式不成立 → `authorization_time_evidence_invalid`。
50. **双时间证据跨域完整性（B27，v1.0 新增）**：T_event 与 T_first 来自不同时间域，两证据对象各自带本域审计引用与时钟同步引用且覆盖规则满足 → 通过时间证据检查；任一侧引用缺失或跨域不确定度超限 → `authorization_time_evidence_invalid`。
51. **历史同步记录不覆盖事件时刻（B30/A21，v1.0 新增）**：所引时钟同步审计记录本身在有效期内，但其覆盖区间不包含目标历史事件的发生时刻 → 该事件时间不得用于跨域比较 → 拒绝（`authorization_time_evidence_invalid`）。
52. **自举入口完成首次验证（B26，v1.0 新增）**：无 genesis 状态下经 §5.5 自举入口验证首份授权——临时店、双重验证、交换内时间锚与撤销视图、PoP 证据齐备 → 验证通过并建立 genesis（acceptedAt = 交换确认时间）；随后同一验证方走正常接口 B 可正常验证（正对照续）。
53. **正常入口在自举前拒绝（B26，v1.0 新增）**：genesis 尚不存在时，经正常接口 B 提交注册验证（无论上下文如何组装）→ 拒绝，且不产生任何正式接受状态；普通注册请求指定"走自举入口"的参数 → 忽略/拒绝（入口由验证方状态决定）。
54. **签发中途故障无孤立证据（A14 衔接，v1.0 新增）**：模拟签名已产出、审计提交前故障的签发事件——该签名没有可解析的审计记录 → 其时间证据不可采信，使用该签名的授权 → `authorization_time_evidence_invalid`。
55. **审计 eventAt 与 T_event 不一致（B35，v1.1 新增）**：审计记录的摘要/信封/签发者/类型/序号全部正确，但其 eventAt 晚于证据所载 tEventEvidence.timestamp（记录在密钥过期后、时间戳填成过期前）→ 恒等式不成立 → `authorization_time_evidence_invalid`。
56. **timeSource 与审计记录不一致（B35，v1.1 新增）**：tEventEvidence.timeSource 与所引审计记录的 timeSource 不同（其余字段一致）→ `authorization_time_evidence_invalid`。
57. **自举 PoP 缺消费后权威记录（B32，v1.1 新增）**：自举上下文只有接口 A 验证通过产出、缺少 consumedPopEvidence 或 popAuthoritativeRecord（或其 challengeState ≠ consumed、无 popConsumptionSequence）→ 拒绝，§5.3.2 无法执行即不放行。
58. **自举缺少本地批准映射（B31，v1.1 新增）**：expectedChannelRefs 由首启包或请求方提供（而非验证方本地批准映射读取）→ 拒绝；同一用例改由本地映射提供且与包内声明一致 → 通过本项（正对照）。
59. **自举成功输出同构（B31，v1.1 新增）**：① 自举验证成功 → 返回与接口 B 同构的证据包，执行器据此注册（正路径）；② 构造执行器直接消费 BootstrapVerificationContext 的调用 → 执行器拒绝（只认证据包）；③ genesis 提交失败时证据包已产出 → 不得发生注册写入。
60. **首店证据持久化与重启（B34，v1.1 新增）**：① 自举成功后重启验证方，正常接口 B 从 genesis 读取首店 T_event/T_first 并完成涉及首店的历史判定（正路径）；② genesis 中 firstStoreSigningEvidence 缺失或被篡改 → `authorization_signature_invalid`。
61. **自举撤销历史不完整（B33，v1.1 新增）**：bootstrapRevocationEvidence 缺少声明版至当前版之间的某个中间版本原件，或新增集自算与声明不符 → 按连续性不可证明拒绝（`authorization_revoked`）。
62. **自举后撤销状态正式纳入（B33，v1.1 新增）**：① 自举成功后，正常接口 B 能基于本地档案（含自举接受记录）完成 B29 起止绑定判定（正路径）；② 自举成功但撤销自举接受记录未写入本地档案 → 后续正常接口 B 拒绝（本地撤销历史起点缺失）。

## 7. 验收标准（本修订单的关闭条件）

- 上述 62 项测试与 §5.4 接口合同测试套件全部具备且通过；受影响测试文件与全量套件在最终头复跑通过（口径同 E1：本地结果 + PR 的 Linux/Node 22 CI 为准）。
- 独立审查落在最终头上，审查范围明确包含 §4 的版本语义与 §6-7 的摘要稳定性。
- PR 正文明确声明：本 PR 修订 E1 注册绑定合同，E1 原验收的绑定字段集结论由本 PR 的验收取代（其余不变）。
- 合并后更新 E4-A Schema 草案 §6 的引用状态（由"立项"改为"已落地，master 提交号"）。

## 8. 非目标

- 不改动 E1 的存储原子性、执行门、摄入入口限制、回执派生方式。
- 不为任何已注册节点补锚或迁移数据（生产侧动作另行立项）。
- 不实现 Deployment Authorization、As-Run 或 Trust Store（那是 E4-E/F/D 的范围；本修订只提供它们依赖的绑定根）。