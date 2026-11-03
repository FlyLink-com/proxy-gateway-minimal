# E4-A · 发布身份 V2 Schema 与信任合同草案（修订稿 v0.12）

**项目：** FlyLink.com / proxy-gateway-minimal
**日期：** 2026-11-02（v0.1 初稿、v0.2–v0.12 十一轮修订均同日）
**状态：** 修订稿 v0.12，待 Yi 确认；正式冻结（E4-A-4）尚需 §10 的剩余条件齐备（本稿通过文档审查不等于冻结）
**依据：** 《E4 · JP-01 发布身份与制品可信机制设计》（2026-11-02）、Yi 对 R1–R4 的正式裁定、Yi 对 v0.1 的逐字段审查结论（有条件通过，P1–P5 必须修正，D-1 批准、D-2 附条件批准、D-3/D-4 批准、D-5 部分批准）
**范围：** 六个合同的字段级定义 —— Release Identity V2、Trust Store、Deployment Authorization、As-Run Identity、Revocation Manifest、E1 注册绑定修订（E1-A，另有独立修订单文件）
**权限边界：** 本草案只定义合同。不修改任何现有代码或合同，不创建密钥，不构成 E4-B 及后续阶段的实现授权。

**v0.2 修订摘要**（与 v0.1 的差异，逐项对应审查编号）：
- **P1**：As-Run 增加 `signerPublicKey` 自带公钥字段，信任仍由第三锚决定（§4）。
- **P2**：Trust Store 轮换规则去矛盾：只有 `active` 密钥可签新 Trust Store，`retiring` 只验旧签（§2.2、§2.3）。
- **P3**：签名信封增加一致性约束（signerKeyId 与文档一致、类型常量表、信封字节上限、严格 base64url、验签顺序冻结）（§0.3）。
- **P4**：Trust Store 自举改为临时信任过程（v0.2 时为七步；v0.4 起扩为八步，见 P11；现行流程以 §2.4 的八步为准）。
- **P5**：跨重启时间规则冻结（§0.6）。
- **一致性 1**：Release Identity V2 的 `type` 改为通用值 `release_identity`；V1 的 `control_plane_release_identity` 不动（§1、§7）。
- **一致性 2**：`workflowRef` 单独定义 Git Ref 格式，不再套用不透明引用模式（§1、§0.4）。
- **D-1** 已批准（`jp-node-image` 固定值）；**D-2** 附条件批准内容落入 §5.3；**D-3/D-4** 数值冻结（24 h / 1 h / 24 h）；**D-5** Trust Store 上限 32 冻结，As-Run 文件数与字节上限**暂不冻结**（见 §4.3、§10）。

**v0.3 修订摘要**（对应 Yi 对 v0.2 的第二轮审查）：
- **P6**：§0.3 第四步改为按文档类型分列的公钥来源双路径表，As-Run 的公钥来源与信任判定在总则层与 §4.2 统一；§4.2 补全 As-Run 专用验签顺序与三项相等拒绝条件。
- **P7**：撤销清单改为**累计式**（条目永不消失、历史连续性可证明、无法证明即 fail-closed）；新增指纹级撤销目标（Agent Signing 公钥指纹 + nodeRef）；回溯检查扩展为完整四方签名链（§5.1、§5.2）。
- **P10**：`workflowRef` 校验改为与 `git check-ref-format` 等价的完整规则集（§1）。
- **X5 裁定落文**：合同层/流水线层两层关系写入 §9 的 X5 行与 §3 引用处；E4-C 必须用真实流水线产物验证，缺字段先修流水线合同，不得在 E4-E/F 绕过。
- **§4.3 实测状态**：本地盘点确认当前**不存在可复现的 JP 镜像构建产物**（无构建自动化、镜像从未构建），按 Yi 裁定保持未冻结，不以估算数字填空（见 §4.3 末段）。

**v0.4 修订摘要**（对应 Yi 对 v0.3 的第三轮审查）：
- **P6 顺序统一**：§0.3 明确声明 As-Run 专用顺序是全局验签顺序的**唯一顺序例外**（其 signerKeyId 一致性检查在第三锚比对之后），X16 据此真正闭合。
- **P7 两项修正**：X17 结论改写（累计式不豁免历史连续性证明，版本跳号取不到中间版本仍 fail-closed）；§5.2-2 回溯目标增加"被验授权所绑定的第三锚"，并冻结三项对应测试（签发后撤销旧授权拒绝、部署后撤销 As-Run 拒绝、不得以已撤销锚签新授权）。
- **P10 正名**：总长 ≤ 255 字节改列为**项目附加限制**，与 Git 原生规则分开表述，两套条件都必须通过。
- **P11 新增**：Trust Store 自举增加"验证首店自身信封"一步（双重验证：Release Identity 摘要比对 + 首店信封以临时信任公钥验签），流程扩为八步（§2.4）。
- **§4.3**：六项实测证据逐条列明，避免验收口径漂移。

**v0.5 修订摘要**（对应 Yi 的正式修订任务清单 · 任务 A）：
- **A1**：§2.4 补齐自举候选密钥的选择条件（purpose + `active` + 指纹带外一致 + 唯一匹配；`retiring`/`revoked` 禁止用于自举），八步流程与双重验证不变。
- **A2**：全文交叉引用核对，自举步数统一为八步（§8 验收映射的旧「七步」表述已修正；历史修订摘要中的步数已加注现行口径）。
- **A3**：新增 §8.1 正式测试向量（P6 验签顺序、P10 Git Ref、P11 自举），作为冻结稿组成部分。
- **A4**：既有冻结条件（六项实测、错误码表、累计撤销、第三锚双向效力、密钥用途隔离、V1/V2 双路径）全部保留，未作任何绕过性修改。

**v0.6 修订摘要**（对应 Yi 对 v0.5 的第二轮审查批准项）：八步自举与四项候选条件保持不变；§8.1 的 TV-P11 新增两项——首份 Trust Store 信封 `signedDocumentType` 错误、信封 `signerKeyId` 与候选 keyId 不匹配，均须拒绝（TV-P11-9、TV-P11-10）。§10 冻结条件实质内容未动，仅条件 ①③ 中的版本号引用按惯例同步为当前版本。

**v0.7 修订摘要**（对应 Yi 对 v0.6 的独立复审）：
- **A1**：修正 TV-P11-10 的字段矛盾——Trust Store 文档本身没有 `signerKeyId` 字段（§0.3 规则 2 的唯一例外），原文中"文档自称的 signerKeyId 与信封一致"的表述自相矛盾，已删除；测试改为"另一把密钥生成的、数学上有效的店签名，因 envelope.signerKeyId 不是锚定候选 keyId 而在签发者身份检查步被拒绝"。
- **A2**：§2.2 新增密钥有效期判定规则（窗口 `[validFrom, validUntil)` 与 status 共同决定可用性；历史签名按文档内嵌的签名时刻判定，不以验证当下时间否定历史合法签名），§8.1 新增 TV-K 有效期测试向量组。
- **B7**：§9 的 X13 状态与既有裁定对齐（回溯规则已经 Yi 在 P7 裁定中确认，不再写作"请 Yi 确认"）。

**v0.8 修订摘要**（对应 Yi 对 v0.7 的第二轮独立复审）：
- **A3**：新增 §0.7「签名时间的可信证据」——数字签名只能证明密钥签了含 `issuedAt` 的文档，不能证明签名发生在 `issuedAt`；历史签名的时刻判定改以**可信首次接受时间**（文档摘要首次出现在可信记录中的时间）为准，四类文档各定证据来源，证据必须绑定文档摘要、签发者 keyId 与签发类型。
- **A4**：retiring 等状态转换的生效时间以 Trust Store 接受日志的实际接受时间为准；回填 `issuedAt` 不能改变由接受时间证明的事实（TV-K-7）。
- **A5**：撤销与有效期的优先级冻结——撤销（现行店 revoked 或累计清单 key 条目）压倒一切历史有效性论证，`revokedAt` 不产生豁免（与 §5.2-1 一致）。
- **A6**：未来时间判定改为确定性比较 `issuedAt ≤ trustedNow`，无时钟容差（"明显"一词删除）；新增回填类测试 TV-K-6/7/8。
- **A7**：§10 条件④的测试向量清单纳入 P12 / TV-K 全部向量。

**v0.9 修订摘要**（对应 Yi 对 v0.8 的第三轮独立复审）：
- **A8**：§0.7 改为三层时间模型——签发事件时间 T_event（受保护的签名操作记录证明签名下界）、首次可信存在时间 T_first（只证明存在上界，不单独证明签名时刻）、声明时间 `issuedAt`（仅一致性检查）。需要主张历史合法性而缺乏 T_event 证据时保守拒绝，不作推断。
- **A9**：冻结跨域时间关系——各可信域时钟须有同步审计、跨域比较的偏差不确定带冻结为 5 秒且边界情形按对签名不利方向判定；跨域顺序不得用序号比较，只能用经上述规则的时间比较；同域顺序以域内单调序号为准。（注：不确定带数值已由 v0.11 的 A22 修正为单域 ≤ 2 秒、合计 ≤ 4 秒。）
- **A10**：首份 Trust Store 的时间证据来源补齐——以随附 Release Identity 的 CI 签发事件记录为其内容定型时间证据，接受日志由自举接受动作创世纪建立，不形成循环。
- **A11**：§0.3 公钥来源表中 Revocation Manifest 与 Release Identity 两行改为按签发时历史状态判定，删除"现行 active"的硬条件（撤销优先不变）；Trust Store 行维持 §2.3 的新店签发规则（那是签发资格，不是历史验证规则）。
- **A12**：TV-K-1～4 全部改以 T_first / T_event 判定（不再用文档 `issuedAt`），并增加 `T_first = validFrom` 通过、`T_first = validUntil` 拒绝两个边界对照。
- **A13**：§2.2 中 trustedNow 的来源引用修正（§0.6 是节点侧时间锚机制，不是 trustedNow 的定义）。

**v0.10 修订摘要**（对应 Yi 对 v0.9 的独立复审）：
- **A14**：§0.7 冻结签发事件的原子性——签名成功、信封摘要、审计记录提交是不可拆分的同一事件；签名失败不产生可用作 T_event 的记录；时间证据必须指向产出**所验信封本身**的那条审计记录，禁止用同一文档的其他签发记录拼接。
- **A15**：§0.7 跨域时间规则补齐计算口径——单域最大允许偏差 2 秒、同步审计有效期 24 小时、合计不确定度 ≤ 5 秒才可比较、区间比较定先后。（注：合计数值已由 v0.11 的 A22 修正为 4 秒，本行保留 v0.10 当时的表述。）
- **A16**：首店时间重定义——Trust Store 的 T_event 用其**自身**签发操作记录（RI 时间只证明店内容定型上界）；自举三时间分离（bootstrapLoadedAt / bootstrapConfirmedAt / acceptedAt），genesis 记录在首次 BWH 交换成功后才建立，确认时间不冒充实际接受时间。
- **A17**：§5.1 Revocation Manifest 的 signerKeyId 字段删除"status = active"硬条件，改为签发资格（签发时）与历史验证资格（按时间证据）分层。
- **A18**：§0.3 表下注明 Trust Store 行的适用范围（新更新对现行店判定；历史更新对前一已接受版本判定）。
- **A19**：TV-K-5 按同域/跨域拆分五种情形；§2.2 补 validUntil 缺省时的判定（无上界，但双证据要求不变）。另按 B16 跨文件同步：§2.3 审计记录纳入 acceptanceSequence 与统一审计事件基础字段，genesis 记录单独定义。

**v0.11 修订摘要**（对应 Yi 对 v0.10 的独立复审）：
- **A20**：§0.7 冻结首店 T_first 的来源分工表（首店用 RI 绑定摘要 + 可信发布记录；genesis 时间不是首店 T_first），并冻结自举验证与 genesis 的完整流程口径（与 E1-A v1.0 §5.5 的专用自举入口对接；正常验证入口的证据要求不放宽）。
- **A21**：§0.7 定义时钟同步审计记录的结构与**覆盖区间**规则——历史事件必须用覆盖其发生时刻的同步记录，当前有效记录不能证明历史时刻的偏差。
- **A22**：不确定度数值统一——单域 ≤ 2 秒保留，合计上限由冗余的 5 秒改为实际可达的 **4 秒**；TV-T-3、TV-K-5(d) 同步修正。
- **A23**：§0.7 的上界判定改为条件式（validUntil 存在才执行比较），与 §2.2 缺省规则一致；§0.3 适用范围注补入 Deployment Authorization 的历史状态规则（与 E1-A B11/B14 同口径）。

**v0.12 修订摘要**（对应 Yi 对 v0.11 的独立复审）：
- **A24**：§0.7 时钟同步审计记录补自身可信性——指定生产者、哈希链 append-only 留存（序号单调 + 前记录摘要链接，事后插入/替换可检出）、覆盖区间链式衔接且单段 ≤ 24 h、`maxOffsetSeconds` 必须 ≤ 2 方有效；"24 小时"由此有了精确计算口径。
- **A25**：§0.7 T_first 多候选规则冻结——候选集必须是指定来源按文档摘要查询的完整结果（附查询范围声明），每候选自带本域同步证据；选择取最小时间戳且不可跳过更早候选，跨域区间重叠时由判定环节的对签名不利规则处理，不许验证方挑选有利记录。
- **A26**：§0.7 冻结四类签发事件的 eventType 常量映射，并明确签发事件记录的 `eventAt` 即 T_event 本身（E1-A B35 的恒等式以此为据）。
- 另配合 E1-A v1.1 的 B34：genesis 接受记录必须同时保存首店签发证据与原件引用（§0.7 A16 与 §2.3 已同步注明）。

---

## 0. 总则（六个合同共用）

### 0.1 规范化与文档模型

- 每个合同都是一份 **Canonical JSON 文档**：严格字段白名单（fieldOrder 之外的字段一律拒绝）、字段顺序固定、UTF-8、无空白填充，序列化/解析一律复用仓库既有 `server/services/deployment/canonical-json.mjs`（与 V1、Artifact Ingress V2 同一规范化器，不另造第二套"规范"定义）。
- 每份文档有 `maxBytes` 上限，读取必须走与 V1 loader 相同的安全文件读取纪律（拒绝符号链接、单链接、大小有界、读前读后身份一致）。具体 loader 在 E4-B/D 实现，本草案只冻结合同。
- 文档本身**不内嵌签名**。签名一律为 detached signature（见 0.3）。

### 0.2 摘要与指纹格式（全草案统一，不许混用）

| 用途 | 格式 | 依据 |
| --- | --- | --- |
| 文档/文件摘要字段（字段名以 `Sha256` 结尾） | 裸小写十六进制 `^[a-f0-9]{64}$` | 与 V1 合同一致 |
| 身份锚指纹（三个锚，见 §6） | `sha256:<64 位小写十六进制>` | 与 E1 `normalizeRegistrationAnchorFingerprint` 一致 |
| 公钥指纹（Trust Store 内 `publicKeyFingerprint`、As-Run 公钥复算） | `sha256:<64 位小写十六进制>`，对 Ed25519 原始公钥字节（32 B）计算 | 与锚格式一致，便于跨合同比对 |
| sourceCommit / workflowCommit | 裸小写十六进制 `^[a-f0-9]{40}$` | 与 V1 一致 |

### 0.3 签名信封（Detached Signature Envelope）与验签顺序（P3 修订）

每个被签文档配一份独立的签名信封文档（同一 Canonical JSON 纪律）。信封 `maxBytes`：**1024**。

| 字段 | 必填 | 格式 | 说明 |
| --- | --- | --- | --- |
| schemaVersion | 是 | `"1"` | 信封自身版本 |
| type | 是 | `"detached_signature"` | 固定值 |
| signedDocumentType | 是 | 必须与被签合同的固定 `type` 常量**完全相等**（常量表见下） | 防止跨文档类型替换签名 |
| signedDocumentSha256 | 是 | 裸 hex | 被签文档**规范化字节**的 SHA-256 |
| signerKeyId | 是 | `^[a-z0-9][a-z0-9-]{2,63}$` | 见一致性约束 |
| algorithm | 是 | `"Ed25519"` | 固定值，不接受算法协商、降级或缺省推断 |
| signature | 是 | 严格 base64url：字符集 `^[A-Za-z0-9_-]+$`、无填充、解码后恰 64 B | 含填充符、非法字符或长度不符一律拒绝 |

各合同的固定 `type` 常量（信封 `signedDocumentType` 只能取被签文档的这一行）：

| 合同 | type 常量 |
| --- | --- |
| Release Identity V2 | `release_identity` |
| Trust Store | `release_trust_store` |
| Deployment Authorization | `node_deployment_authorization` |
| As-Run Identity | `node_as_run_identity` |
| Revocation Manifest | `release_revocation_manifest` |

**一致性约束（硬规则）**：
1. 被签文档自身带 `signerKeyId` 字段的（Release Identity、Deployment Authorization、As-Run、Revocation Manifest），必须 `envelope.signerKeyId === document.signerKeyId`，不等即拒绝——不允许"文档声称 A 签、信封实际 B 签"的双重身份。
2. Trust Store 文档自身不带 `signerKeyId` 字段，其信封的 signerKeyId 按 §2.3 的签发规则解析与校验（唯一例外，且只此一处）。
3. As-Run 的信封 signerKeyId 必须等于其文档内 `signerKeyId`，且由 `signerPublicKey` 复算的指纹必须等于第三锚（§4）。

**验签顺序（冻结，不得调换）**：① 信封结构与格式校验（含 maxBytes、base64url 严格校验）→ ② 按被签合同重序列化文档并比对 `signedDocumentSha256` 与 `signedDocumentType` → ③ signerKeyId 一致性约束 → ④ 按下表取得公钥并核对信任判定 → ⑤ Ed25519 验签 → ⑥ 文档语义校验（有效期、版本、绑定字段、撤销状态）。

**唯一顺序例外（P6 冻结）**：As-Run Identity 的专用验签顺序（§4.2）是上述全局顺序的**唯一例外**——其 signerKeyId 一致性检查在第三锚比对之后执行（因为 As-Run 的公钥信任判定先于一切文档自称字段）。除 As-Run 外，任何文档类型不得援引例外；实现中全局顺序与 As-Run 顺序必须是两条显式独立的代码路径，不允许以参数开关混用。

**公钥来源双路径（P6 冻结）**——第 ④ 步按被签文档类型分列，不得混用：

| 文档类型 | 公钥来源 | 信任判定 |
| --- | --- | --- |
| Release Identity | Trust Store（自举期为 §2.4 临时信任材料） | 条目 purpose = `release-signing`；签发者合法性按**签发时**历史状态、有效窗口与 §0.7 时间证据判定（与 B11 四查一致），不要求现行店中仍为 `active`；当前撤销命中仍优先拒绝 |
| Trust Store | 现行已接受店（首份为镜像内置 + 带外指纹） | 签发者须为现行店中 `active` 的 release-signing 条目（§2.3） |
| Deployment Authorization | Trust Store | 条目 purpose = `deployment-authorization` 且 status 合法 |
| Revocation Manifest | Trust Store | 条目 purpose = `revocation-signing`；签发者合法性按**签发时**历史状态、有效窗口与 §0.7 时间证据判定（A11：不要求现行店中仍为 `active`）；签发者当前被撤销或被累计清单命中时仍优先拒绝（§2.2 优先级） |
| As-Run Identity | **文档自带 `signerPublicKey`** | 复算指纹必须等于 **E1 v2 注册绑定的第三锚**（专用顺序见 §4.2）；不查 Trust Store |

As-Run 是唯一不走 Trust Store 的验签路径：它的信任根是注册时预先登记的第三锚，而不是可在线更新的公钥目录。任何把 As-Run 公钥改从 Trust Store 或文档自称 keyId 取得的实现都属违规。

**Trust Store 行的适用范围（A18）**：表中 Trust Store 行的"现行已接受店中 active"是**新店更新的签发/接受判定**（§2.3）；验证一份**历史** Trust Store 更新时，签发者合法性按其**前一已接受版本**（接受日志中的上一版店内容）与 §0.7 时间证据判定，不以当前版本店中的状态代替历史状态。Release Identity 与 Revocation Manifest 两行同理按历史判定（见各行注记）。**Deployment Authorization 行同属历史判定范围（A23 补）**：其签发者合法性按签发时对应的历史 Trust Store 版本判定——purpose 必须为 `deployment-authorization`、T_event 证明签发时处于合法窗口与合法状态、T_first 满足上界规则、当前撤销优先于历史合法性、当前已转 `retiring` 不自动否定其历史授权（与 E1-A §5.3 的 B11/B14 四查同口径）；新授权的**签发资格**仍要求签发时为合法 active，此处只规定历史授权的验证资格。

### 0.4 其他共用格式

- 时间戳：`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$`（UTC、秒精度），且必须是真实日历时间。
- 引用类字段（releaseRef、imageManifestRef、firstBootPacketRef 等）：不透明引用，模式 `^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$`，只做跨文档**相等性**核对，不从字符串本身推导信任。**例外**：`workflowRef` 使用 Git Ref 专用格式（§1），不套用本模式。
- 版本整数（version、generation、trustStoreVersion、revocationVersion）：安全整数，≥ 1（个别注明者除外）。
- 错误码风格：沿用仓库 snake_case，每个合同一个主错误码，校验失败不区分细节对外返回（防探测），细节只进本地审计日志且不含秘密。正式错误码表在 E4-A-4 冻结稿中给出。

### 0.5 版本总则

- `schemaVersion` 按合同独立演进。Release Identity 是 V1 的继任合同，用 `"2"`；其余五个是全新 schemaId 的首版，用 `"1"`。
- 任何合同的未知 `schemaVersion` 一律拒绝（与 V1 loader 行为一致），不做"尽力解析"。

### 0.6 时间与跨重启规则（P5 冻结）

- 授权有效期的计算基准是 **BWH 签名时间锚 + 本地单调时钟**：节点在授权交换时以授权的 `issuedAt`（BWH 签名覆盖）为时间锚，此后以单调时钟的增量推算当前时刻，不单独信任本地墙钟。
- **单调基准只在同一 `bootId` 内有效**。`bootId` 变化（重启）后，旧单调基准失效：节点必须重新与 BWH 完成一次授权交换、重建时间锚，才能恢复 V2 授权状态。
- 不得仅凭本地保存的旧授权文件加不可信墙钟恢复信任状态。重启后未完成重新交换前，V2 相关判定一律 fail-closed（不影响"不自动停止已运行服务"的既有裁定——fail-closed 作用于新的信任判定，不作用于存量服务进程）。
- As-Run 中的 `bootIdSha256` 使 BWH 能识别一份 As-Run 属于哪次启动，防止跨重启拼凑证据。

### 0.7 签名时间的可信证据（A3 冻结，v0.9 按 A8–A10 修订）

**基本事实**：数字签名证明"某密钥签署了包含某 `issuedAt` 的文档"，**不能独立证明签名发生在 `issuedAt` 声明的时刻**。过期的密钥完全可以在过期后生成文档并把 `issuedAt` 回填到有效期内。因此本合同严格区分三种时间，任何判定不得混用：

| 时间 | 含义 | 能证明什么 | 证据来源 |
| --- | --- | --- | --- |
| **T_event**（签发事件时间） | 签名操作实际发生的时刻 | 签名时刻的**下界与当时状态**（T_sign = T_event） | 受保护的签名操作记录：签名动作发生时由签发系统即时写入、不可事后补记的审计/流水线记录（见下行映射） |
| **T_first**（首次可信存在时间） | 文档摘要首次出现在可信记录中的时间 | 文档**最迟**在该时已经存在（T_sign ≤ T_first）——只是存在**上界**，单独不能证明 T_sign ≥ 任何时刻 | 验证方接受日志 / CI 发布记录 / BWH 审计记录中的首次出现 |
| `issuedAt`（声明时间） | 文档自称的签发时刻 | 什么都不独立证明 | 仅作一致性检查（§2.2） |

各类文档的两类证据映射（证据必须绑定文档摘要、签发者 keyId 与签发类型）：

| 文档 | T_event 证据 | T_first 证据 |
| --- | --- | --- |
| Trust Store | 发布签发操作记录（与 Release Identity 同属受保护发布记录；记录含店摘要、signerKeyId、签发时刻） | 验证方 append-only 接受日志中该版本的首次接受时间 |
| Release Identity | CI 签名操作记录（流水线在签名动作时即时写入） | 受保护 CI 发布记录中的首次出现 / 验证方取得时的记录 |
| Deployment Authorization | BWH 签发审计（签发事务内即时写入，含审计序列号） | 同左（签发即入审计，T_first = T_event 所在记录） |
| Revocation Manifest | BWH 撤销签发审计（D-2 操作审计，签发事务内即时写入） | 同左 |

**判定规则（冻结）**：
- 一致性：`issuedAt ≤ T_first` 且 `T_event ≤ T_first` 必须成立；不成立即拒绝。
- **T_first 的唯一取值（A8 补，A25 补完）**：同一文档可能在多个可信记录中出现（CI 发布记录、验证方取得记录等）。T_first 冻结为**全部可采信记录中最早的一条**所载时间；各记录所指摘要必须一致（不一致说明所指并非同一文档，该记录不采信）。来源渠道只影响证据的可追溯性评级，不改变取值规则——任何验证方按同一证据集必须得出同一 T_first；证据集中最早记录不可验证时，取次早的可验证记录并在结论中注明证据降级，不允许验证方自行挑选有利取值。**多候选完整性（A25）**：候选集必须是按文档摘要向**冻结的指定来源集合**（该文档类型的 T_first 来源所列各来源）查询得到的**完整结果**，证据中附查询范围声明（查询了哪些来源、各来源返回条数）；知悉存在另一条可采信记录而未纳入候选集的，证据无效。每条候选自带其所属时间域的时钟同步证据（覆盖其时间戳），纯验证层逐条复核后才参与"最早"比较——只验被选中者不算完成选择证明。**跨域重叠时的选择**：选择是确定性的（取各候选时间戳的最小值）；不同域候选的不确定区间重叠、以致无法证明谁真正更早时，不改变选择（最小时间戳是最强的存在上界），保守性由判定环节的区间规则承担（与窗口边界比较时按对签名不利方向结算）；验证方不得以重叠为由改选较晚记录，也不得跳过更早的候选。
- **下界判定（防"未生效先签"与状态回填）**：签名被视为在合法时期产生，要求 **T_event** 落在签发密钥的有效窗口内、且签发者在 T_event 时的状态（按接受日志时间线重建）为对应 purpose 的合法状态。只有 T_first 时无法证明下界——例如密钥 validFrom 之前生成、生效之后才首次提交的签名，T_first 在窗口内也不能放行。
- **上界判定（防过期回填）**：**当 `validUntil` 存在时**，要求 **T_first < validUntil**（T_sign ≤ T_first 保证签发不晚于窗口关闭）；文档在窗口关闭后才首次出现可信记录的，无论 `issuedAt` 如何回填都不获得窗口内待遇。**`validUntil` 缺省时不执行上界比较**（无预定上界，A23，与 §2.2 一致），但 T_event、T_first 证据要求与全部其他判定照常。
- **证据缺失的保守策略**：当验证需要主张历史合法性（签发密钥当前已非 `active` 在窗状态）而该类文档的 T_event 证据缺失或不可验证时，**拒绝**，不以 T_first 推断 T_event。签发密钥当前仍为 `active` 且在窗口内时，验签不依赖历史时刻判定，按现行状态判定即可。
- **签发事件类型常量与时间字段绑定（A26 冻结）**：四类文档的签发事件 `eventType` 常量冻结为——Release Identity → `release_identity_signing`、Trust Store → `trust_store_signing`、Deployment Authorization → `deployment_authorization_signing`、Revocation Manifest → `revocation_manifest_signing`；验证时间证据时 eventType 必须与被验文档类型**精确相等**（只属于某个宽泛签发类集合不算通过）。签发事件记录的 `eventAt` **就是**该次签发的 T_event 本身（定义性绑定）；`timeSource` 是该记录所属时间域的标识。证据结构中的 T_event 时间戳与来源必须与所引审计记录的 eventAt/timeSource 逐字相等（E1-A B35 恒等式以此为据）。
- **签发事件的原子性（A14）**：T_event 证据所指向的审计记录，必须是与**本次签名成功**不可拆分地绑定的同一事件：签名操作成功产出签名后，签发系统在同一事务/同一流水线步骤内提交审计记录，记录同时绑定**文档摘要与信封摘要**（信封摘要对产出的 detached signature envelope 计算）、signerKeyId、签发类型与事件时间。签名失败或未产出信封的操作不生成可用作 T_event 的记录（失败可以另记失败事件，但失败事件在证据结构上与签发事件异型、永不被采作 T_event）。验证时，时间证据的审计记录引用必须解析到其信封摘要等于**所验信封**摘要的那一条记录；同一文档的其他签发记录（摘要相同、信封不同）不得拼接替代。
- **跨域时间关系（A9，v0.10 按 A15 补齐计算口径）**：三类证据分属 CI、验证方、BWH 三个时间域。冻结数值：① 每个可信时间域的最大允许时钟偏差为 **2 秒**（以该域时钟同步审计记录声明并证明的偏差为准；超过 2 秒的域在偏差纠正前不是可信时间域）；② 时钟同步审计记录的有效期为 **24 小时**，过期或缺失时该域时间不得用于跨域比较；③ 跨域比较的**最大合计不确定度冻结为 4 秒**——即两域单域上限之和（2 + 2），不另设不可达的第二阈值（A22 统一）；两域审计偏差之和超过 4 秒（必然意味着至少一域已超单域上限、失去可信时间域资格）时，该次跨域时间判定不成立，fail-closed。判定方法为**区间比较**：每个跨域时刻展开为 `[t − 自域偏差, t + 自域偏差]` 的可信区间；事件 X 被证明早于事件 Y，当且仅当 X 的区间上界严格小于 Y 的区间下界；区间重叠或无法证明先后的，按**对签名不利**的方向判定。跨域**不得**用各自的事件序号比较顺序；序号只在同一域内定序。同域内的事件顺序以该域单调审计序列为准（见 E1-A §5.3.2 的 PoP/授权序号规则）。
- **统一审计事件基础字段**：四类可信事件（Trust Store 接受、Revocation Manifest 接受——验证方域；PoP 消费、Authorization 签发——BWH 域）与各类签发事件的审计记录共享基础字段 `{ eventId, eventType, documentSha256, signerKeyId, eventAt, eventSequence, timeSource }`，各事件类型在此基础上扩展自身字段（如信封摘要、nodeRef、challenge）。`eventSequence` 由所属域生成、同域内单调递增、重启后不得重复或回退。
- **时钟同步审计记录（A21 冻结，v0.12 按 A24 补自身可信性）**：每个可信时间域须持续产生时钟同步审计记录，结构为 `{ domain, recordSequence, previousRecordSha256, recordedAt, coverageFrom, coverageUntil, maxOffsetSeconds, auditMethod, recordRef }`，声明该域时钟在 `[coverageFrom, coverageUntil)` 区间内与 UTC 的偏差不超过 `maxOffsetSeconds`。**自身可信性（A24）**：① 生产者为该域指定的时钟审计方（CI 域 = CI 平台审计、BWH 域 = BWH 本机审计进程、验证方域 = 验证方审计进程），记录在校准完成时即时产生（`recordedAt` = 校准完成时刻，`coverageFrom` = `recordedAt`，覆盖自产生时刻起算）；② 全部记录进入该域的 **append-only 哈希链**：`recordSequence` 单调递增、`previousRecordSha256` 链接前一条记录——事后生成一条声称覆盖历史区间的记录必然破坏序号/链接连续性，可检出，检出即该域记录整体不可信；③ **"24 小时有效期"的精确口径**：`coverageUntil − coverageFrom ≤ 24 h`，且相邻记录的覆盖区间链式衔接（下一条的 coverageFrom 不晚于上一条的 coverageUntil，间隔空缺时段无有效覆盖）；④ `maxOffsetSeconds` 必须 ≤ 2（A15 单域上限），大于 2 的记录不使该域成为可信时间域。**覆盖规则**：一个事件时间被用于跨域比较时，必须存在一条覆盖**该事件发生时刻**的同步审计记录——历史事件用历史记录，验证当下有效的记录不能证明过去时刻的偏差；事件时刻不落在任何有效同步记录覆盖区间内（缺失、过期、区间外）时，该事件时间不得用于跨域比较，按证据缺失处理。各证据结构中的 `clockSyncAuditRef` 必须指向满足此覆盖规则的那一条记录，而不是"该域最新的一条"。
- **首份 Trust Store 的时间证据与自举接受（A10，v0.10 按 A16 重定义）**：自举时接受日志尚不存在，首店的时间证据不取自接受日志，且**不得借用 Release Identity 的签发时间冒充店自身的签发时间**：
  - 店自身的 **T_event** 取自其**自身**的签发操作记录（发布签发记录，含店摘要、信封摘要、signerKeyId、事件时间）。RI 的 T_event 只证明**店内容最迟在 RI 签发时已经定型**（RI 签名覆盖 `trustStoreSha256`），它构成店内容存在的时间上界证据，不构成店签名的 T_event。候选密钥在自举时的窗口/状态判定用店自身的 T_event 与 T_first 类证据（RI 记录可作其内容存在上界）。
  - 自举三时间严格分离：`bootstrapLoadedAt`（节点临时加载店的本地时刻，**不可信**，只作运维记录）、`bootstrapConfirmedAt`（首次 BWH 授权交换成功确认的可信时间）、`acceptedAt`（正式接受生效时间）。在确认完成前，首店只处于**临时自举信任**状态（即 §2.4 的临时信任材料），只可用于自举链本身（验 RI、验首份 Deployment Authorization）；首次 BWH 授权交换的验证**不依赖**尚不存在的接受日志，只依赖 §2.4 的临时信任路径与店自身签发证据。
  - **genesis 接受记录只在首次 BWH 授权交换成功后建立**：其 `acceptedAt` = `bootstrapConfirmedAt`（正式接受自确认时生效），同时记录 `bootstrapLoadedAt` 备查但**不得**把确认时间写成加载时刻的"实际接受时间"，也不得把 acceptedAt 回填为 loadedAt。交换失败则不建 genesis、自举中止。§2.2 A4 的"状态转换生效时间取实际接受时间"，对首店而言即该 genesis 的 acceptedAt。此构造下日志不需要在首店之前存在，不构成循环。**genesis 的证据持久化（配合 E1-A B34）**：genesis 接受记录必须同时保存首店的完整签发时间证据（`firstStoreSigningEvidence`，含 T_event/T_first 及其审计与时钟同步引用）与首店文档、信封原件的档案引用——首店不是普通更新，不构造 `fromVersion = 0` 的更新条目；后续正常验证（含重启后）从 genesis 记录读取首店的历史证据，缺失任一部分即信任链断裂、拒绝。
  - **首店 T_first 的来源分工（A20 冻结）**：证据映射表 §0.7 中 Trust Store 的通用 T_first 定义（接受日志首次接受时间）只适用于**后续** Trust Store；**首份** Trust Store 的 T_first 取自 RI 的可信发布记录——即以其摘要被 RI 绑定（`trustStoreSha256`）且 RI 本身有 CI 发布记录证明的那个最早可信存在时刻，按 T_first 唯一取值规则（最早可采信记录）确定。genesis 的创建时间（bootstrapConfirmedAt）是**正式接受事实**，单独留存，**不是**首店的 T_first，不得以 genesis 时间代替内容首次存在时间。genesis 建立之后，首店在接受日志中有了正式记录，后续判定同时引用两类事实（内容存在时间 = RI 路径的 T_first；正式接受时间 = genesis 的 acceptedAt），各按其语义使用，不混用。
  - **自举验证入口（A20/B26 对接）**：首次授权的验证走 E1-A §5.5 的专用自举验证入口（独立上下文、独立权限边界），不走正常接口 B；正常接口 B 的证据要求（完整 verificationContext、接受日志、trustedTime）**不因自举而放宽**——在 genesis 建立前，正常入口对注册请求一律拒绝。自举成功并建立 genesis 后，验证切换到正常接口 B，自举入口对该验证方永久停用。

---

## 1. Release Identity V2

证明制品的构建来源与内容（设计层 A）。签发者：受保护的 CI 发布流程（Release Signing Key）。`maxBytes`：8192。

| 字段 | 必填 | 格式/取值 | 说明 |
| --- | --- | --- | --- |
| schemaVersion | 是 | `"2"` | V1 为 `"1"`；V1 loader 拒绝 `"2"`，V2 loader 拒绝 `"1"`（见 §7） |
| type | 是 | `"release_identity"` | **v0.2 修正**：V2 使用通用类型名；V1 的 `control_plane_release_identity` 保持不变，两个 type 值互不通读 |
| state | 是 | `"issued"` | 与 V1 的 `"verified"` 刻意不同：V2 文档只断言签发事实，信任来自签名，不自称已验证 |
| releaseId | 是 | `^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$` | 一次发布的唯一标识 |
| releaseUnit | 是 | `"control-plane-app"` 或 `"jp-node-image"` | D-1 已批准新增 `jp-node-image`；不允许 JP 镜像复用控制面单位值；固定值清单的文档与测试在实现阶段同步 |
| repository | 是 | `"FlyLink-com/proxy-gateway-minimal"` | 固定值 |
| sourceCommit | 是 | 40 hex | 构建所用精确提交，必须来自受保护 master |
| workflowRef | 是 | **Git Ref 专用格式，与 `git check-ref-format` 规则等价**（P10 冻结，见下方规则集；不套用 §0.4 不透明引用模式） | 如 `refs/tags/v1.2.3`、`refs/heads/master` |

`workflowRef` 校验分两层，两层都必须通过（P10 正名）：
- **Git 原生合法性**：必须通过 `git check-ref-format` 的规则。合同等价规则集（任一不满足即拒绝；实现阶段须以 `git check-ref-format` 的实际行为做对照测试，不得以单一正则冒充完整校验）：① 至少包含一个 `/`；② 任一路径段不得以 `.` 开头，不得以 `.lock` 结尾；③ 不得含 `..`；不得含 ASCII 控制字符、空格、`~`、`^`、`:`、`?`、`*`、`[`、`\`；④ 不得以 `/` 开头或结尾；不得含 `//`；不得以 `.` 结尾；⑤ 不得含 `@{`；不得恰为单个 `@`。
- **项目附加限制**（非 Git 原生规则，不得冒充）：总长 ≤ 255 **字节**。测试必须同时覆盖 Git 原生合法/非法边界与该项目限制的边界。
| workflowCommit | 是 | 40 hex | workflow 文件所在提交（防 workflow 被单独篡改） |
| workflowRunId | 是 | `^[0-9]{1,20}$` | CI 运行 ID |
| workflowRunAttempt | 是 | 安全整数 ≥ 1 | 重跑次数计入身份，重跑产物不与首跑混同 |
| artifactRelease | 是 | 同 V1 RELEASE 模式 | 制品发布标识 |
| artifactManifestSha256 | 是 | 裸 hex | 制品清单摘要（沿 V1） |
| sourceArtifactSha256 | 是 | 裸 hex | 源码制品摘要（沿 V1） |
| dependencyArtifactManifestSha256 | 是 | 裸 hex | 依赖清单摘要（沿 V1） |
| dependencyArchiveSha256 | 是 | 裸 hex | 依赖归档摘要（沿 V1） |
| bomSha256 | 是 | 裸 hex | 本次构建所依据 BOM 文档的摘要；JP 发布必须等于已批准 BOM 的摘要 |
| imageManifestSha256 | 条件 | 裸 hex | **仅当 releaseUnit = `jp-node-image` 时必填且必须出现；releaseUnit = `control-plane-app` 时禁止出现。** 使 B 层引用的镜像清单能回溯到 A 层签名集合 |
| trustStoreSha256 | 是 | 裸 hex | 本次发布随附的 Trust Store 文档摘要（R2：Trust Store 进入 Release 签名覆盖） |
| trustStoreVersion | 是 | 安全整数 ≥ 1 | 随附 Trust Store 的 version |
| targetPlatform | 是 | `"linux/amd64"` | 首期固定值 |
| issuedAt | 是 | 时间戳 | CI 签发时间 |
| signerKeyId | 是 | keyId 模式 | Release Signing Key；受 §0.3 一致性约束（信封必须同值） |

签名：detached 信封，Release Signing Key 签。PR CI 无此密钥；只有受保护发布流程在独立授权后可签（E4-C 的密钥启用另行授权，不在本草案）。

---

## 2. Trust Store

验证方持有的公钥信任集。签发/更新只走 Release 信任链（R2）。`maxBytes`：32768，`keys` 条目上限 **32（D-5 已冻结）**。

### 2.1 文档字段

| 字段 | 必填 | 格式/取值 | 说明 |
| --- | --- | --- | --- |
| schemaVersion | 是 | `"1"` | |
| type | 是 | `"release_trust_store"` | |
| version | 是 | 安全整数 ≥ 1，单调递增 | 低版本不得覆盖高版本 |
| issuedAt | 是 | 时间戳 | |
| keys | 是 | 数组，条目见 2.2，按 keyId 字典序 | |

### 2.2 公钥条目与状态语义（P2 修订）

| 字段 | 必填 | 格式/取值 | 说明 |
| --- | --- | --- | --- |
| keyId | 是 | keyId 模式 | 全店唯一 |
| purpose | 是 | `"release-signing"` / `"deployment-authorization"` / `"revocation-signing"` | 用途域分离：验签时必须核对被签文档类型与 purpose 的对应关系，错配即拒绝 |
| algorithm | 是 | `"Ed25519"` | |
| publicKey | 是 | base64url 无填充，解码后恰 32 B | |
| publicKeyFingerprint | 是 | `sha256:<hex>` | 对原始公钥字节计算，验证方加载时必须重算比对，不信任文档自填 |
| status | 是 | `"active"` / `"retiring"` / `"revoked"` | **状态语义（P2 冻结）**：`active` = 可签新文件、可验签；`retiring` = **只允许验证历史签名，不允许签署任何新文件（含新 Trust Store）**；`revoked` = 任何用途均拒绝 |
| validFrom | 是 | 时间戳 | |
| validUntil | 否 | 时间戳 | 缺省表示无预定到期（仍可被撤销） |
| revokedAt | 否 | 时间戳 | 仅 status = `revoked` 时出现 |
| replacementKeyId | 否 | keyId 模式 | 轮换指向；必须指向店内另一条目 |

**密钥有效期判定规则（A2 冻结，v0.9 按 A8 修订）**：可用性由 status 与有效窗口 `[validFrom, validUntil)` **共同**决定，status 不能替代时间检查。本节所有"签名时刻"一律按 §0.7 的三层时间模型判定——**T_event 定下界与当时状态，T_first 定上界**；文档内嵌的 `issuedAt` 只是声明，永远不单独作为时间证据。
- **尚未生效**：T_event 早于 `validFrom` 时，该密钥的签名不被接受。仅有 T_first 在窗口内、而 T_event 早于 validFrom（生效前生成、生效后提交）或 T_event 证据缺失的，按 §0.7 保守策略拒绝。
- **到期**：T_first 到达或晚于 `validUntil` 时，该签名不被视为窗口内产生；`active` 但已过期的密钥按已过期处理——§2.3 的签发规则（只有 active 密钥可签新店）在判定"active"时必须同时满足"在窗口内"，窗口外视同不可签发。**不以验证当下的时间否定历史签名**：T_event 与 T_first 双证据都落在合法区间内、且签发者当时未被撤销的历史签名（典型为 `retiring` 密钥的旧签），在窗口外验证时仍然有效。**`validUntil` 缺省时**（A19）：视为无预定窗口上界，上界判定（T_first < validUntil）不适用、自动满足；但 T_event 证据、T_first 证据与其他全部判定（状态、撤销、签发时合法性）照常要求，缺省不构成任何证据豁免。
- **状态转换的生效时间（A4）**：密钥状态从 `active` 转为 `retiring`/`revoked` 的生效时间，以**记载该转换的 Trust Store 版本被验证方接受日志实际接受的时间**为准（不是新店文档自称的 `issuedAt`）。判定一份签名产生时签发者的状态，就用 T_event 与接受日志重建的状态时间线比对。文档回填 `issuedAt` 不能把转换后的签名伪装成转换前产生——其 T_event 在转换生效之后，按转换后状态判定。
- **未来时间（A6/A13，确定性比较，无容差）**：任何被验文档必须满足 `issuedAt ≤ trustedNow`。`trustedNow` 的来源是验证方所属可信时钟域的当前时间（在接口层即 E1-A §5.3 `verificationContext.trustedTime.now`，BWH 验证时钟）；§0.6 定义的是**节点侧**以 BWH 时间锚 + 单调时钟推算时间的机制，不是 `trustedNow` 的定义，不得再以 §0.6 作为 trustedNow 的来源引用。自举阶段尚无 BWH 时钟可用时，不做 now 类判定，时间判定只用 §0.7 A10 的 CI 事件证据。本合同不设时钟容差（跨域比较的不确定带按 §0.7 A9 处理，与本条是两回事）；确需容差时只能以修订本合同、冻结具体秒数的方式引入，不得以"明显""大约"等措辞留给实现判断。TV-K-5 据此判定。
- **优先级（A5）：撤销压倒历史有效性**。判定顺序冻结为：① 撤销检查——签发密钥当前在现行店中为 `revoked`，或其 keyId 出现在当前累计撤销清单的 key 条目中（§5.2-1），则该密钥的**全部签名立即不被信任，包括撤销前合法产生的历史签名**；`revokedAt` 只记录事实，不构成"撤销前签名豁免"的依据。② 有效期与状态时间线检查（本节其余各条）。③ 文档语义检查。①不通过直接拒绝，不进入②③。此口径与 §5.1 的 key 条目定义（"全部签名立即失去信任"）及 §5.2-1（撤销优先于 Trust Store 状态）一致，三处不得分别解释。

### 2.3 更新与轮换规则（P2 修订，消除 v0.1 矛盾）

1. **只有 `active` 的 release-signing 密钥可以签署新 Trust Store。** 具体判定：新店（version N+1）的信封 signerKeyId 必须对应**现行已接受店（version N）中 status = `active` 的 release-signing 条目**。`retiring` 密钥签的新店一律无效。
2. 正常轮换时序（冻结）：① 现行 active 旧钥签署新店，新店同时收录新旧公钥（新钥 `active`、旧钥 `retiring`）；② 自下一版本起，由新 active 密钥签署（它在现行店中已是 `active`，满足规则 1）；③ 过渡期内旧钥只验旧签；④ 过渡期结束后旧钥置 `revoked`（新店中更新其条目，并可叠加 §5 的 key 撤销条目双保险）。
3. 新店的摘要必须出现在一份有效的 Release Identity V2 的 `trustStoreSha256` 中，且 version 严格大于现行版本，才可被验证方采纳（发布链与店更新双通道互锁）。
4. Deployment Authorization Key（purpose = `deployment-authorization`）签的 Trust Store 一律无效——域分离硬规则，验签时按 purpose 拒绝。
5. 新店必须至少含一个 status = `active` 的 release-signing 条目，否则拒绝（防把信任根签发能力签没）。
6. 每次更新产生独立审计记录，采用 §0.7 的统一审计事件基础字段（eventId、eventType、documentSha256、signerKeyId、eventAt、**eventSequence**、timeSource），并扩展旧/新 version、旧/新摘要；`eventSequence` 即验证方域的接受序号（acceptanceSequence），由验证方生成、同域单调递增、重启后不得重复或回退。记录不含任何私钥材料。首份 Trust Store 的 genesis 记录单独定义（见 §0.7 A16）：它没有前一版本，不使用 `fromVersion = 0` 之类的隐含约定，其 eventType 为创世纪接受、acceptedAt 按 A16 的确认规则取值。

### 2.4 自举（Bootstrap）（P4 临时信任过程 + P11 双重验证，共八步）

JP 首启时按以下顺序执行，顺序冻结：

1. 从镜像内置 Trust Store 中**提取候选 Release 公钥**。候选必须同时满足以下全部条件（A1 冻结，不得仅凭 purpose 选择）：
   - 条目 purpose = `release-signing`；
   - 条目 status = `active`（`retiring`、`revoked` 的密钥**不得**用于首次自举）；
   - 由公钥复算的指纹与操作员带外核对值一致；
   - 满足以上三项的条目**恰好一个**，从而能唯一确定其 keyId；零个或多个候选都中止首启（不猜测、不按顺序取第一个）。
2. 记录上一步唯一确定的候选 keyId，作为本次自举的临时信任锚标识；后续步骤中 Release Identity 与首店信封的 signerKeyId 都必须与该 keyId 对应，不对应即中止。
3. 此时**只**把该公钥作为临时验证材料；Trust Store 的其余内容（其他密钥、状态、版本）一律不予信任。
4. 用临时材料按 §0.3 顺序验证 Release Identity 的 detached signature。
5. 比对 Release Identity 中的 `trustStoreSha256` 与内置 Trust Store 文档的实际摘要。
6. **验证首份 Trust Store 自身的信封（P11）**：以临时信任的候选公钥按 §0.3 顺序验证 Trust Store 的 detached signature——核对 `signedDocumentType` = `release_trust_store`、信封 signerKeyId 与候选 Release 公钥条目对应、验签通过。首店没有"现行已接受店"，其信封签发者即候选 Release 密钥本身，这是 §2.3 签发规则在自举点的唯一适用形态；摘要比对（第 5 步）与信封验签（本步）必须**双重通过**，任一失败即中止。
7. 以上全部通过后，加载整份 Trust Store——此时为 §0.7 A16 的**临时自举信任**状态（正式接受尚未生效）。
8. 此后才验证 Deployment Authorization。首次授权交换成功后，首店才按 A16 建立 genesis 接受记录并转为正式接受；交换失败则自举中止、不建 genesis。

镜像验收时由操作员将镜像内指纹与 Yi 保管的带外指纹比对，一致才接受镜像（属镜像验收阶段动作，不在 E4-A 实现范围；本合同只冻结"镜像必须内置首份店 + 指纹带外核对"这一要求）。BWH 侧：Deployment 公钥是本机自有密钥对的公钥半，不经自举；BWH 的 Trust Store 由操作员在本机以同一更新规则维护（首份由操作员带外装入）。

Release 公钥轮换除 2.3 的链式授权外，还保留带外恢复路径：新基础镜像内置新公钥指纹并经操作员带外核对（与首份自举同级），不允许任何在线文档单独替换信任根。

---

## 3. Deployment Authorization

证明某发布制品被授权部署到某个具体节点（设计层 B）。签发者：BWH 部署授权流程（Deployment Authorization Key，操作员 CLI 签发，应用只验签）。`maxBytes`：8192。

| 字段 | 必填 | 格式/取值 | 说明 |
| --- | --- | --- | --- |
| schemaVersion | 是 | `"1"` | |
| type | 是 | `"node_deployment_authorization"` | |
| authorizationId | 是 | 引用模式 | 一次授权的唯一标识 |
| nodeRef | 是 | `^[a-z0-9][a-z0-9-]{0,63}$` | JP-01 为 `node-vultr-jp-01` |
| physicalNodeRef | 是 | 引用模式 | 与 E1 注册记录的对应字段相等性核对 |
| providerRef | 是 | 引用模式 | 同上 |
| regionRef | 是 | 引用模式 | 同上 |
| roleRef | 是 | 引用模式 | 同上 |
| channelRefs | 是 | 数组，字典序，恰好为批准映射的集合 | JP-01 为三条 `channel-vultr-jp-01-*`；多一条少一条都拒绝 |
| releaseRef | 是 | 引用模式 | 必须能解析到一份有效的 Release Identity V2 |
| releaseIdentitySha256 | 是 | 裸 hex | 所依据 Release Identity 文档的摘要（把"引用"钉成"内容"） |
| imageManifestRef | 是 | 引用模式 | |
| imageArtifactSha256 | 是 | 裸 hex | 镜像制品摘要；必须等于 Release Identity（releaseUnit = `jp-node-image`）的 `imageManifestSha256` 所指镜像清单中记录的制品摘要（清单内部结构属制品流水线合同，本合同只冻结这条相等关系） |
| bomSha256 | 是 | 裸 hex | 必须等于 Release Identity 的 bomSha256 |
| wireguardPlanRef | 是 | E1 `WG_PLAN_REF_PATTERN`（`^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`） | 复用 E1 已冻结规则，不另设 |
| wireguardPublicKeyFingerprint | 是 | 锚格式 | 锚 1 |
| agentAuthFingerprint | 是 | 锚格式 | 锚 2 |
| agentSigningPublicKeyFingerprint | 是 | 锚格式 | **锚 3（R1）** |
| firstBootPacketRef | 是 | 与 E1 首启包 packetRef 完全一致的不透明引用 | 执行器核对 `authorization.firstBootPacketRef === packet.packetRef` |
| popEvidenceSha256 | 是 | 裸 hex | 持有证明记录（见 §6.4）的摘要；无 PoP 的授权对 JP-01 无效 |
| trustStoreVersion | 是 | 安全整数 ≥ 1 | 签发时 BWH 所依据的 Trust Store 版本 |
| revocationVersion | 是 | 安全整数 ≥ 1 | 签发时 BWH 所依据的撤销清单版本；验证方的回溯检查规则见 §5.2 |
| generation | 是 | 安全整数 ≥ 1 | 同一 nodeRef 单调递增；低 generation 授权不得覆盖高 generation |
| nonce | 是 | `^[a-f0-9]{64}$` | 一次性；BWH 记录已用 nonce，重放即拒绝 |
| issuedAt | 是 | 时间戳 | **BWH 签名时间，即 §0.6 的可信时间锚** |
| expiresAt | 是 | 时间戳 | 必须晚于 issuedAt；**`expiresAt - issuedAt ≤ 24 h`（D-4 已冻结）** |
| signerKeyId | 是 | keyId 模式 | Deployment Authorization Key（purpose = `deployment-authorization`）；受 §0.3 一致性约束 |

签名：detached 信封，Deployment Authorization Key 签。节点验证顺序：Trust Store 在位且已正式加载（§2.4）→ 按 §0.3 验签 → 三锚与本机密钥比对 → channelRefs 与批准映射比对 → generation 大于本地已接受的最大值 → 有效期按 §0.6 计算（同 bootId 内用单调增量；bootId 已变则先重新交换，不做有效期判定直接要求重新授权）。

---

## 4. As-Run Identity

证明目标机实际安装与运行的内容（设计层 C）。生成者：JP 节点 Agent；签名者：Node Agent Signing Key（锚 3 对应私钥）。`maxBytes` 与 `installedFiles` 上限**暂不冻结**（见 4.3）。

### 4.1 字段

| 字段 | 必填 | 格式/取值 | 说明 |
| --- | --- | --- | --- |
| schemaVersion | 是 | `"1"` | |
| type | 是 | `"node_as_run_identity"` | |
| nodeRef | 是 | 同 §3 | 必须等于授权的 nodeRef |
| authorizationSha256 | 是 | 裸 hex | 所依据 Deployment Authorization 文档摘要 |
| releaseIdentitySha256 | 是 | 裸 hex | |
| imageManifestSha256 | 是 | 裸 hex | 实际安装镜像的清单摘要 |
| signerPublicKey | 是 | base64url 无填充，解码后恰 32 B | **P1 新增（方案 A）**：As-Run 自带验签公钥。BWH 解码后自行计算其 SHA-256 指纹，**必须与 E1 注册记录（v2 绑定）中的 `agentSigningPublicKeyFingerprint` 完全一致**，不一致立即拒绝。公钥本身不产生信任——信任只来自预先登记的第三锚；自带公钥只是免除额外的公钥查询路径 |
| signerKeyId | 是 | keyId 模式 | 节点签名密钥的 keyId；受 §0.3 一致性约束（信封同值）。注意：keyId 只是检索标签，身份判定以 signerPublicKey 复算指纹对锚 3 为准，不以 keyId 为准 |
| installedFiles | 是 | 数组，按 path 字典序，path 唯一 | 条目：`path`（绝对路径，`^/[A-Za-z0-9._/@+-]{1,255}$`，禁止 `..` 段）、`sha256`（裸 hex）。只覆盖安装域文件（应用、运行时二进制、单元文件）；业务数据、SQLite、配置中的秘密一律不在内 |
| runtimeVersions | 是 | 对象，键固定为 `node`、`xray`、`hysteria2`、`mihomo`、`wireguardTools` | 各值为版本字符串（`^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$`）。仅作信息记录；**证据效力来自 installedFiles 中对应二进制的摘要**，版本字符串与 BOM 不一致时以摘要比对为准 |
| serviceUnits | 是 | 数组，按 unit 字典序，上限 32 | 条目：`unit`（`^[A-Za-z0-9@._-]{1,128}$`）、`unitFileSha256`（裸 hex）、`enabledState`（`enabled`/`disabled`/`static`/`masked`） |
| hostIdentitySha256 | 是 | 裸 hex | 对本机 `/etc/machine-id` 原始字节的 SHA-256；只存摘要，原始值永不离开本机 |
| bootIdSha256 | 是 | 裸 hex | 对本次启动 `/proc/sys/kernel/random/boot_id` 的 SHA-256；配合 §0.6 区分重启前后的证据 |
| observedAt | 是 | 时间戳 | 本机观测时间（审计参考；信任判断不单独依赖它） |

**结构性禁载**（沿设计 §C，靠字段白名单实现而非靠填写自觉）：Agent Token 明文、WireGuard 私钥、协议密码、UUID、用户/订单/SQLite 业务数据——以上没有任何字段可以承载。

### 4.2 BWH 侧验证规则（本合同冻结判定，E4-F/G 实现）

**As-Run 专用验签顺序**（§0.3 的特化，冻结）：① 信封结构与文档摘要校验（§0.3 第 ①② 步）→ ② 读取 `signerPublicKey` 并严格解码（base64url 无填充、恰 32 B）→ ③ 计算其 SHA-256 指纹 → ④ 与 E1 注册记录（v2 绑定）的第三锚比较，不等即拒绝 → ⑤ 核对信封 signerKeyId 与文档 signerKeyId 一致（§0.3 一致性约束）→ ⑥ 用该公钥执行 Ed25519 验签 → ⑦ 下列语义与相等校验。

**相等拒绝条件（P6 补全，任一不成立即拒绝）**：
- `As-Run.nodeRef` ＝ 所依据 Deployment Authorization 的 `nodeRef`；
- `As-Run.releaseIdentitySha256` ＝ 该授权的 `releaseIdentitySha256`；
- `As-Run.imageManifestSha256` ＝ 该 Release Identity 的 `imageManifestSha256`；
- `As-Run.authorizationSha256` ＝ 所依据 Deployment Authorization 文档的实际摘要。

其后：installedFiles 集合与 Image Manifest 文件集逐项比对（多、少、摘要不符任一即不一致）→ serviceUnits 与批准单元集比对 → runtimeVersions 与 BOM 对照（信息性，摘要已由文件比对覆盖）→ 第三锚未出现在未过期撤销清单的 agent-signing-key 条目中（§5.1）。As-Run 文档只记录测量，**"是否一致"的结论由 BWH 验证回执给出，不由节点自称**（回执格式复用 E1 回执范式，在 E4-F 定稿）。

### 4.3 规模上限暂不冻结（D-5 部分批准）

v0.1 的 `installedFiles ≤ 4096` 与 `maxBytes = 1 MiB` 未做字节核算：按每条记录含最长 256 字符路径 + 64 字符摘要 + JSON 结构开销估算，单条最坏约 350 B，4096 条最坏约 1.4 MB，与 1 MiB 上限冲突。**冻结前必须取得的六项实测证据（逐条冻结，验收按此清单核对）**：① 以实际 JP 镜像构建内容生成镜像文件清单；② 统计安装域文件总数；③ 统计最长文件路径（字符数与字节数）；④ 以该清单按本合同生成一份 Canonical JSON 的 As-Run 样本；⑤ 测量样本规范化后的实际总字节数；⑥ 据 ②–⑤ 确定 `installedFiles` 上限与 `maxBytes` 并写入冻结稿。据此在 E4-A-4 冻结稿中一并确定数值（预计 2 MiB 量级，以实测为准）。在此之前，任何实现不得自选上限。

**实测状态（2026-11-02 盘点）**：Yi 已批准本实测为 E4-A-4 前置任务（仅本地隔离构建与离线测量，不连接 BWH/Vultr、不创建生产密钥、不部署、不触发 CI、不建 PR）。经盘点，当前**不存在可复现的 JP 镜像构建产物**：镜像构建无自动化脚本，BOM 虽已批准锁定，但镜像从未实际构建（生产准入包中镜像构建属后续受 Gate 的阶段）。按 Yi 的裁定（无可复现构建产物时保持未冻结、不用估算数字填空），本项**保持未冻结**；解锁条件 = 首个可复现的本地隔离镜像构建产物出现（构建本身按其所属 Gate 另行批准），届时按上列六项内容执行实测并回填本节。

---

## 5. Revocation Manifest

撤销的可信分发（R3）。签发者：purpose = `revocation-signing` 的密钥（托管见 5.3；**Deployment Key 无权签发**）。`maxBytes`：262144，`entries` 上限 1024。

### 5.1 字段

| 字段 | 必填 | 格式/取值 | 说明 |
| --- | --- | --- | --- |
| schemaVersion | 是 | `"1"` | |
| type | 是 | `"release_revocation_manifest"` | |
| version | 是 | 安全整数 ≥ 1，全局单调递增 | **防回滚：验证方保存已接受的最高 version；低版本拒绝，同版本不同摘要拒绝** |
| issuedAt | 是 | 时间戳 | |
| nextUpdate | 是 | 时间戳 | **`nextUpdate - issuedAt ≤ 24 h`（D-3 已冻结）**。超过 nextUpdate 未取得新清单即 fail-closed（拒绝新授权签发与接受、新 Gate 晋升、新发布接受；**不自动停止已运行服务**——隔离/停止另需生产处置授权）。**BWH 签发授权时必须使用 issuedAt 距签发时刻不超过 1 h 的新鲜视图（D-3）** |
| entries | 是 | 数组，按 (entryType, 目标) 字典序 | 条目见下 |
| signerKeyId | 是 | keyId 模式 | 必须在 Trust Store 中解析为 purpose = `revocation-signing` 的条目；受 §0.3 一致性约束。**资格分层（A17）**：新清单的**签发资格**要求签发时该密钥为合法 `active` 的 revocation-signing（按签发时判定）；**历史清单的验证资格**按 §0.7/§2.2 的历史签名者判定（T_event、T_first、签发时状态与窗口），签发者当前已转 `retiring` 不自动否定其历史清单；签发者当前被撤销或被累计清单命中时仍优先拒绝。此处不得再以"现行 active"作为历史清单的验证条件 |

条目：

| 字段 | 必填 | 格式/取值 | 说明 |
| --- | --- | --- | --- |
| entryType | 是 | `"key"`、`"release"` 或 `"agent-signing-key"` | 三种撤销独立记录（R3 裁定 + P7 扩展） |
| keyId | 条件 | keyId 模式 | entryType = `key` 时必填：该 keyId 的全部签名立即失去信任 |
| releaseIdentitySha256 | 条件 | 裸 hex | entryType = `release` 时必填：该 Release Identity 文档摘要所指发布失去信任 |
| agentSigningPublicKeyFingerprint | 条件 | 锚格式 | entryType = `agent-signing-key` 时必填（P7）：被撤销的第三锚。Agent Signing Key 的身份认定依据是指纹而非 keyId，故撤销必须落到指纹级 |
| nodeRef | 条件 | 同 §3 nodeRef 模式 | entryType = `agent-signing-key` 时必填：被撤销锚所属节点；指纹与 nodeRef 必须同时命中才生效（防跨节点误伤同指纹的理论碰撞情形） |
| revokedAt | 是 | 时间戳 | |
| reasonCode | 是 | `"key-compromise"` / `"key-retired"` / `"release-defect"` / `"release-superseded"` / `"operator-decision"` | 只记类别，不记自由文本（防敏感信息入清单） |

### 5.2 验证方适用规则

0. **累计式清单（P7 冻结）**：撤销清单是累计账本——已出现的条目**不得在后续版本中消失**，新版本只能新增条目。验证方接受新版本时必须校验其条目集是已接受最高版本条目集的超集；不满足（条目缺失、被改写）即拒绝该版本并 fail-closed。历史版本清单必须留存，以支持回溯检查；验证方无法证明历史连续性（版本跳号且无法取得中间版本比对）时 fail-closed。低版本拒绝、同版本不同摘要拒绝（沿 §5.1 防回滚）。
1. **撤销优先于 Trust Store 状态**：keyId 出现在未过期清单的 key 条目中，即按已撤销处理，即使 Trust Store 中该条目仍为 `active`（店更新可能滞后于紧急撤销）。
2. **授权与证据的回溯检查（P7 扩展为完整签名链）**：验证方当前清单 version 高于被验对象所依据的 `revocationVersion` 时，必须回溯检查其间新增的条目；任一条目命中以下任一目标即拒绝被验对象：① 该对象所依据的 releaseIdentitySha256；② Release Identity 的签名 keyId；③ 相关 Trust Store 更新的签名 keyId；④ Deployment Authorization 的签名 keyId；⑤ **As-Run 的第三锚指纹**（agent-signing-key 条目，指纹 + nodeRef 双命中）；⑥ **被验 Deployment Authorization 所绑定的第三锚指纹**（agent-signing-key 条目，指纹 + nodeRef 双命中）——授权本身不持私钥，但它绑定的锚一旦被撤销，该授权即失去根基，必须拒绝。此规则防止"撤销前签发的授权/证据在撤销后被拿来使用"。冻结测试（E4-A-4 测试向量必须包含）：(a) 授权签发后、部署前第三锚被撤销 → 旧授权拒绝；(b) 部署后、As-Run 提交前第三锚被撤销 → As-Run 拒绝；(c) 已撤销锚不得签发新授权（§5.2-3）。
3. **第三锚撤销的效力**：某 (nodeRef, 指纹) 出现在未过期清单中时——该锚签出的 As-Run 一律拒绝；不得再为该 (nodeRef, 指纹) 签发新授权；节点恢复信任的唯一路径是新签名密钥经首启/ supersede 流程重新登记第三锚（新指纹），旧指纹的撤销不因新清单版本而解除（累计式保证）。
4. 分发走现有期望状态/Agent 同步通道，不新开生产通信通道。节点接受新授权/新发布时，必须持有未过期、且 version 不低于授权中 `revocationVersion` 的清单。

### 5.3 签发托管与审计（D-2 附条件批准的落地）

- 密钥托管：BWH 受保护密钥存储，独立 keyId，purpose = `revocation-signing`；仅**操作员专用撤销 CLI** 可调用。
- **应用进程不得调用；Deployment Authorization 签发流程不得调用**；私钥不得进入仓库或镜像。
- 每次撤销签发必须生成审计记录：操作者身份、reasonCode、目标（keyId 或 releaseIdentitySha256）、清单 version、时间。审计记录与清单一同留存。
- 生产密钥的创建与导入仍需独立授权，不在本草案与 D-2 批准范围内。

---

## 6. E1 注册绑定修订（E1-A 摘要）

本节只作摘要与交叉引用。**E1-A 是独立合同修订单，其完整草案见单独文件 `e1a-registration-binding-amendment-order-draft-2026-11-02.md`**，单独确认、单独审查、单独验收；本 Schema 草案的批准不构成对 E1-A 的批准，反之亦然。

摘要要点：v1 绑定 11 字段与既有 `recordDigest` 逐字不变（v1 绑定函数不修改）；v2 绑定 = 11 字段 + `agentSigningPublicKeyFingerprint` + `registrationBindingVersion: "2"` 标记键；跨版本同 nodeRef 命中即 `registration_conflict`，不静默升级，升级只走 supersede；`node-vultr-jp-01` 只接受 v2 且三锚齐全并附 PoP 证据（`popEvidenceSha256` 与授权对应）；v1 记录永不能通过 V2 As-Run 验收。本合同中所有"锚"格式与 E1-A 的绑定字段格式由同一共享校验（`normalizeRegistrationAnchorFingerprint` 语义）定义，任何一方不得另设格式。

---

## 7. V1/V2 双路径（冻结规则）

| 项 | V1（保持不变） | V2（本草案） |
| --- | --- | --- |
| 身份文件路径 | `CONTROL_PLANE_RELEASE_IDENTITY_PATH` | 新环境变量 `CONTROL_PLANE_RELEASE_IDENTITY_V2_PATH` |
| 文档 type | `control_plane_release_identity` | `release_identity`（v0.2 起与 V1 显式区分，杜绝同名异义） |
| Loader | `loadControlPlaneReleaseIdentity`（只接受 schemaVersion `"1"`） | 新 loader（只接受 `"2"` 且 type = `release_identity`），与 V1 loader 独立实现、互不回退 |
| Trust Store 路径 | 无 | 新环境变量 `RELEASE_TRUST_STORE_PATH` |
| BWH Supply Verification | 继续以 V1 合同解析 V1 文件，**输入与逻辑不动** | 不接入 V2（接入与否是未来独立裁定） |
| 文件替换 | —— | **严禁用 V2 文件替换 V1 文件路径，反之亦然** |
| 历史解释 | 2026-11-02 as-run 清单与 V1 身份保持历史依据 | **V1 历史身份不得被重新解释为 V2 已签名身份**；正式 BWH Release V2 必须重新构建、签名、部署、核验 |

新环境变量名在本草案冻结，实现阶段不得另名。两个新变量的默认值均为未设置（= V2 身份不可用，fail-closed 语义与 V1 loader 的 `unavailable` 一致）。

---

## 8. 与最终验收条件（设计 §九）的映射

| # | 验收条件 | 落点 |
| --- | --- | --- |
| 1 | 未签名制品不能进入可信发布流程 | §1 签名信封 + §2.4 八步自举 |
| 2 | 错误签名不能通过 | §0.3 验签顺序（冻结版） |
| 3 | 过期和撤销密钥不能通过 | §2.2 状态语义 + §5（含 5.2 优先与回溯规则） |
| 4 | 制品摘要变化必须被发现 | §1 摘要字段全集 + §4 文件级比对 |
| 5 | 错误 nodeRef 被拒绝 | §3 nodeRef 相等性核对（授权/注册/As-Run 三处） |
| 6 | 错误 channelRefs 被拒绝 | §3 channelRefs 精确集合 |
| 7 | 错误 WG Plan 被拒绝 | §3 wireguardPlanRef（E1 规则复用） |
| 8 | WG 公钥指纹变化被拒绝 | 锚 1（§3、§6） |
| 9 | Agent 身份指纹变化被拒绝 | 锚 2（§3、§6） |
| 10 | 旧授权重放被拒绝 | §3 nonce 一次性 + generation 单调 + expiresAt（≤24 h）+ §0.6 跨重启规则 |
| 11 | As-Run 与批准发布不一致必须阻断 | §4.2 BWH 侧判定规则（结论在回执，不在节点自述） |
| 12 | Identity Gate 不通过不得晋升 | E4-G 集成（本合同提供 §4.2 验证结果作为 Gate 输入） |
| 13 | 全流程不泄露秘密 | §4 结构性禁载 + §5 reasonCode 枚举 + §0.4 错误码纪律 |
| 附 | As-Run 签名伪造必须被拒绝 | 锚 3 + §4 signerPublicKey 复算比对 + §6 PoP（伪造私钥无法通过指纹比对，PoP 防首启替换） |

### 8.1 正式测试向量（A3 新增，冻结稿组成部分）

以下测试向量为合同级要求：实现阶段的测试必须逐项对应，缺一不可；标注"顺序"者必须验证**实际执行顺序**（如以可观测的步骤轨迹断言），只验证最终接受/拒绝结果不算通过。

**P6 · 验签顺序**
- TV-P6-1：全局路径与 As-Run 专用路径是两条独立代码路径——以一份 As-Run 文档送入全局路径（及反向）必须因路径不符被拒绝，不得被"兼容处理"。
- TV-P6-2（顺序）：As-Run 验证中，第三锚比对**先于** signerKeyId 一致性检查执行——构造"锚不符且 keyId 也不符"的 As-Run，拒绝点必须落在锚比对一步（以错误码/轨迹区分），而不是 keyId 一步。
- TV-P6-3：不存在任何配置项、参数或环境变量可以交换两条路径的顺序或把 As-Run 送入全局路径（代码审查 + 配置面测试双证）。

**P10 · Git Ref（workflowRef）**
- TV-P10-1：以 `git check-ref-format` 的实际行为为对照预言机：从 Git 官方规则生成的合法集合（如 `refs/tags/v1.2.3`、`refs/heads/feature/x`）必须全部通过本校验。
- TV-P10-2：非法集合必须全部拒绝：段以 `.` 开头、段以 `.lock` 结尾、含 `..`、含空格/`~`/`^`/`:`/`?`/`*`/`[`/控制字符、首尾 `/`、含 `//`、以 `.` 结尾、含 `@{`、恰为 `@`、无 `/` 的顶层名。
- TV-P10-3：项目附加限制单独成组：总长恰 255 字节通过、256 字节拒绝（与 Git 原生合法性分别断言：该用例在 Git 原生规则下合法、仅因项目限制被拒，错误归属必须可区分）。
- TV-P10-4：两套规则分别测试、同时通过才算 workflowRef 合法；任一层的测试缺失即视为未覆盖。

**P11 · Trust Store 自举（§2.4 八步）**
- TV-P11-1：唯一 `active` 候选 + 指纹一致 + 双重验证全过 → 接受整店。
- TV-P11-2：候选为 `retiring` → 在选择步拒绝（即使指纹一致、签名全对）。
- TV-P11-3：候选为 `revoked` → 在选择步拒绝。
- TV-P11-4：候选公钥指纹与带外值不一致 → 中止。
- TV-P11-5：满足 purpose/`active`/指纹的候选为零个或两个以上 → 无法唯一确定，中止（不得取第一个）。
- TV-P11-6：Trust Store 信封签名错误（摘要比对通过、信封验签失败）→ 拒绝。
- TV-P11-7：Release Identity 摘要与随附店摘要不一致（信封本身有效）→ 拒绝。
- TV-P11-8：Release Identity 信封 signerKeyId 与候选 keyId 不对应 → 中止。
- TV-P11-9：首份 Trust Store 信封的 `signedDocumentType` 不是 `release_trust_store`（如误用其他文档类型常量）→ 在信封验证步拒绝，即使签名本身对某份文档有效。
- TV-P11-10：使用**另一把** Ed25519 密钥（非候选密钥）对首份 Trust Store 生成**数学上有效的**签名，其信封 signerKeyId 指向那把钥匙的 keyId → 必须在**签发者身份检查**步中止：`envelope.signerKeyId` 与第 2 步锚定的候选 keyId 不对应。注意 Trust Store 文档本身没有 `signerKeyId` 字段（§0.3 规则 2 的唯一例外），本项只比信封与锚定候选，不存在文档字段比对；拒绝原因必须记为签发者身份不符，不得误记为签名无效——本项证明"签名数学有效 ≠ 签名者身份可信"，与 TV-P11-6（候选密钥签名但签名值错误）严格区分。
- 完成条件：TV-P11-1 至 TV-P11-10 全部具备，且 TV-P11-6/7 证明双重验证缺一不可（单过一项不接受整店）。

**P12（A2 新增，v0.9 按 A12 修订）· Trust Store 密钥有效期与时间证据（§0.7、§2.2）**
- TV-K-1（下界·T_event）：签名操作记录证明 T_event 早于签发密钥的 `validFrom`（含"生效前生成、生效后才提交、T_first 已在窗口内"的情形）→ 拒绝。边界正对照：`T_first = validFrom` 且 T_event = validFrom → 通过本项。
- TV-K-2（上界·T_first）：密钥 status 为 `active` 但文档的 T_first 已到达 `validUntil`，其签署的新 Trust Store → 拒绝（过期不得签发，status 不能替代时间检查）。边界：`T_first = validUntil` → 拒绝（窗口为 `[validFrom, validUntil)` 半开区间）。
- TV-K-3（历史合法·双证据）：`retiring` 密钥的历史签名，T_event 与 T_first 均落在窗口内、签发时状态合法、当时未撤销 → 验证通过（不因验证当下已过窗口或密钥已转 retiring 而否定）。
- TV-K-4（证据缺失·保守拒绝）：需要主张历史合法性，但该文档的 T_event 证据缺失（只有 T_first 与自称的 `issuedAt` 在窗口内）→ 拒绝，不作推断（§0.7 保守策略）。
- TV-K-5（A6 × A9 边界，v0.10 按 A19 拆分）：(a) **同域**比较 `issuedAt === trustedNow` → 通过本项；`issuedAt > trustedNow` → 拒绝。(b) **跨域**且两时刻相等或差值落在合计不确定度内（区间重叠、先后不可证明）→ 按对签名不利方向 **拒绝**。(c) 跨域差值明确超过不确定带、且顺序合法（issuedAt 的区间上界 < trustedNow 的区间下界）→ 通过。(d) 任一域缺少覆盖被比时刻、且在有效期内（24 h）的时钟同步审计记录，或任一域偏差超过单域上限 2 秒 → 跨域判定不成立，拒绝。
- TV-K-6（回填·过期）：密钥 validUntil 为 T，文档在 T 之后才首次出现在可信记录中（T_first > T），但其 `issuedAt` 被回填到 T 之前 → 按 T_first 判定为窗口外签名，拒绝（§0.7）。
- TV-K-7（回填·retiring）：密钥已在接受日志时间线中转为 `retiring`，此后用该密钥签署新文件并把 `issuedAt` 回填到转换前 → 拒绝（签发时状态按 T_event 与接受日志时间线判定，A4）。
- TV-K-8（撤销优先）：密钥的某历史签名 T_event/T_first 落在窗口内且当时合法，但该 keyId 后被累计撤销清单 key 条目撤销（或现行店置 revoked）→ 该历史签名不被信任（A5 优先于有效期结论，`revokedAt` 不产生豁免）。

**P13（v0.10 新增，对应复审 T1–T8、T15）· 时间证据完整性**
- TV-T-1（T1）：签名操作失败（未产出信封）→ 不得存在可用作 T_event 的签发事件记录；以失败事件冒充 T_event 的证据 → 拒绝。
- TV-T-2（T2）：时间证据引用的审计记录，其信封摘要与所验信封不一致（同文档另一次签发的记录拼接）→ 拒绝。
- TV-T-3（T3，v0.11 按 A22 修正）：跨域比较时两域审计偏差之和分别为 2 秒（可比较，区间判定）、4 秒（可比较，合计上限边界，按区间规则判定）→ 按区间结论判定；任一域审计偏差为 3 秒（超单域上限、该域失去可信时间域资格）→ 跨域判定不成立，拒绝。三档分别构造，不得以"合计 5/6 秒"这类在单域上限下不可达的数值充当用例。
- TV-T-4（T4）：任一域时钟同步审计缺失或已过期（> 24 h）→ 跨域时间判定不成立，拒绝。
- TV-T-5（T5）：首店仅完成临时加载（bootstrapLoadedAt 已记录、无确认）→ 不得产生 genesis 接受记录，不得以加载时间主张正式接受或历史合法性。
- TV-T-6（T6）：首次 BWH 授权交换成功后才建立 genesis 记录，且 acceptedAt = bootstrapConfirmedAt（不等于 bootstrapLoadedAt）；交换失败 → 无 genesis、自举中止。
- TV-T-7（T7，正对照）：retiring 密钥在其 active 时期合法签发的历史 Revocation Manifest，T_event/T_first 双证据齐备、当前未被撤销命中 → 验证通过（A17 历史验证资格）。
- TV-T-8（T8）：以已转 retiring 的密钥签署**新** Revocation Manifest → 按签发资格拒绝（A17 签发资格分层）。
- TV-T-15（T15，正对照）：`validUntil` 缺省的合法密钥，T_event/T_first 证据齐备、状态合法 → 验证通过（缺省只免上界判定，不免证据）。
- TV-T-16（v0.11 新增·首店 T_first）：首份 Trust Store 的 T_first 按 RI 发布记录路径取值（早于 genesis 创建时间）→ 判定使用该 T_first 而非 genesis 时间；以 genesis 时间冒充首店 T_first 的证据组装 → 拒绝。
- TV-T-17（v0.11 新增·DA 历史签发者）：① deployment-authorization 密钥在签发时合法、现已 retiring 的历史授权，T_event/T_first 双证据齐备 → 验证通过；② 以已转 retiring 的密钥签发**新**授权 → 按签发资格拒绝（与 A17 的分层同构）。
- TV-T-18（v0.11 新增·同步覆盖区间）：目标事件时间不落在所引时钟同步审计记录的覆盖区间内（记录本身未过期、但覆盖的是另一时段）→ 该事件时间不得用于跨域比较，拒绝（A21）。
- TV-T-19（v0.12 新增·同步记录事后补造）：一条声称覆盖历史区间的时钟同步审计记录被事后插入该域记录链（序号/previousRecordSha256 链接断裂）→ 检出并拒绝，该域记录整体不可信（A24）。
- TV-T-20（v0.12 新增·T_first 候选遗漏）：证据的候选集遗漏了一条指定来源中实际存在、时间更早的可采信记录（查询范围声明与实际返回不符）→ 证据无效，拒绝（A25）。
- TV-T-21（v0.12 新增·T_first 跨域重叠）：两条不同域候选的不确定区间重叠、无法证明谁真正更早 → 选择仍取最小时间戳，判定与窗口边界比较时按对签名不利方向结算；构造验证方改选较晚记录的组装 → 拒绝（A25）。

---

## 9. 六合同交叉校验记录（E4-A-2，2026-11-02 执行）

沿身份链 `Release Identity → Trust Store → Deployment Authorization → E1 注册（v2 绑定） → As-Run → Revocation` 逐项核对字段引用、摘要方向与签名关系：

| # | 交叉引用 | 两端定义 | 结果 |
| --- | --- | --- | --- |
| X1 | RI.trustStoreSha256 / trustStoreVersion → Trust Store 文档 | §1 摘要+版本 ↔ §2.1 version | 一致（摘要对规范化字节计算，版本单调） |
| X2 | RI.signerKeyId → Trust Store 条目 | §1 ↔ §2.2 purpose = `release-signing` | 一致；自举期为例外路径（§2.4 步骤 1–4），已显式定义 |
| X3 | Trust Store 更新签名者 | §2.3 规则 1（现行店中 `active` 的 release-signing 钥） | 与 §2.2 状态语义无矛盾（P2 后）；`retiring` 不能签新店，轮换时序闭合 |
| X4 | Deployment.releaseIdentitySha256 / releaseRef → RI | §3 ↔ §1 文档摘要与 releaseId | 一致（引用 + 摘要双钉） |
| X5 | Deployment.imageArtifactSha256 ↔ RI.imageManifestSha256 | §3 相等关系 ↔ §1 条件必填 | 一致。**Yi 裁定（两层）**：合同层——RI 的 imageManifestSha256 必须能确定唯一镜像清单；流水线层——实际镜像清单必须含镜像制品摘要、镜像文件清单及每文件路径与摘要（可供 As-Run 对照的完整内容），Deployment 的 imageArtifactSha256 必须等于清单中实际记录的制品摘要。E4-C 必须以**真实流水线产物**验证此关系（不得以手写测试 JSON 代替）；清单缺制品摘要字段时先修流水线合同，不允许在 E4-E/E4-F 绕过 |
| X6 | Deployment.bomSha256 = RI.bomSha256 = 已批准 BOM 摘要 | §3 ↔ §1 | 一致（双相等链） |
| X7 | Deployment 三锚 → E1-A v2 绑定三锚 | §3 ↔ §6/E1-A | 一致（同名、同格式、同共享校验） |
| X8 | Deployment.firstBootPacketRef = 首启包 packetRef = E1 记录 firstBootPacketRef | §3 ↔ §6.1 | 一致（三方相等） |
| X9 | Deployment.popEvidenceSha256 → PoP 记录 | §3 ↔ E1-A PoP 条款 | 一致 |
| X10 | As-Run.authorizationSha256 → Deployment 文档摘要；As-Run.releaseIdentitySha256 → RI 摘要；As-Run.imageManifestSha256 → RI.imageManifestSha256 | §4.1 ↔ §3/§1 | 一致（As-Run 三向回指全部可达） |
| X11 | As-Run.signerPublicKey 复算指纹 = 锚 3（Deployment 与 v2 绑定同值） | §4.1/§4.2 ↔ §3/§6 | 一致（P1 闭环点）；keyId 只作标签不作身份 |
| X12 | Revocation key 条目 → Trust Store keyId；release 条目 → RI 摘要 | §5.1 ↔ §2.2/§1 | 一致；适用优先规则见 §5.2-1 |
| X13 | Deployment.revocationVersion / trustStoreVersion → 验证方新鲜度与回溯 | §3 ↔ §5.2-2、§2.3 | 一致；回溯规则为本次交叉校验补强并写入 §5.2-2，**已经 Yi 在第二轮审查（P7）裁定中确认**（含 v0.4 的授权第三锚回溯扩展），状态与 §10 及全文裁定记录一致 |
| X14 | 信封 signedDocumentType 常量 ↔ 各合同 type | §0.3 常量表 ↔ §1–§5 | 一致（五种被签文档全覆盖；信封自身不被签） |
| X15 | signerKeyId 一致性约束的例外 | §0.3 规则 2 ↔ §2（Trust Store 无 signerKeyId 字段） | 已显式声明唯一例外，无其他文档缺此字段 |

**第二轮交叉校验（v0.3，2026-11-02）新增项**：

| # | 交叉引用 | 两端定义 | 结果 |
| --- | --- | --- | --- |
| X16 | As-Run 公钥来源在总则与专章的一致性 | §0.3 双路径表 ↔ §4.2 专用顺序 | 已统一（P6）：总则明列 As-Run 为唯一不查 Trust Store 的路径，信任判定 = 第三锚 |
| X17 | 撤销清单累计性与回溯完备性 | §5.2-0 超集校验 ↔ §5.2-2 按版本差回溯 | **已按第三轮审查修正**：累计式只保证"已接受版本之间"的条目不丢失（超集校验），**不豁免历史连续性证明**——版本跳号且无法取得中间版本比对时，按 §5.2-0 fail-closed。原 v0.3 中"回溯不依赖缺失的中间版本"的表述已删除 |
| X18 | 第三锚撤销的双向效力 | §5.1 agent-signing-key 条目 ↔ §4.2 末项检查、§5.2-3 | 闭合：验 As-Run 时查撤销、签新授权时查撤销，恢复只走重新登记 |
| X19 | PoP 证据的产生与消费边界 | E1-A 接口定义 ↔ §3 popEvidenceSha256、E4-E 签发职责 | 闭合（P9 分层）：E1-A 冻结接口与消费一次语义，E4-E 负责 challenge 签发与生产侧原子消费，E1-A 以夹具独立验证 |

结论：第一轮 15 项交叉引用全部闭合或已显式标注依赖（X5 的流水线验证留待 E4-C，已按 Yi 裁定分层）；第二轮新增 4 项（X16–X19）全部闭合。v0.2 新增的 §5.2 回溯规则已经 Yi 在第二轮审查中确认并扩展（P7），不再是待裁定项。

---

## 10. 裁定记录与冻结条件

| 编号 | 内容 | 状态 |
| --- | --- | --- |
| D-1 | `releaseUnit` 新增 `jp-node-image` | **已批准**（2026-11-02），已落入 §1 |
| D-2 | Revocation Signing Key 托管（BWH 受保护存储 + 操作员专用 CLI） | **附条件批准**，条件已落入 §5.3；生产密钥创建/导入另行授权 |
| D-3 | 撤销清单 `nextUpdate - issuedAt ≤ 24 h`；BWH 签发用 ≤ 1 h 新鲜视图；超时 fail-closed，不自动停服 | **已批准**，已落入 §5.1 |
| D-4 | 授权 `expiresAt - issuedAt ≤ 24 h`、nonce 一次性、generation 单调、跨重启重建时间锚 | **已批准**，已落入 §3、§0.6 |
| D-5 | Trust Store 上限 32 | **已批准冻结**，已落入 §2 |
| D-5 | As-Run 文件数与 maxBytes | **暂不冻结**：待真实镜像清单实测（§4.3 的证据要求），E4-A-4 冻结稿必须给出实测数据与最终数值 |

**E4-A-4 正式冻结的剩余条件（四项，缺一不可）**：① Yi 确认本修订稿 v0.12；② §4.3 的六项 As-Run 规模实测全部完成并据此冻结数值（**当前阻塞于"无可复现镜像构建产物"**，见 §4.3 实测状态；该实测不得推迟到 E4-C，构建产物出现后须在冻结前完成）；③ E1-A 修订单 v1.1（独立文件）经 Yi 单独确认；④ 冻结稿补齐正式错误码表，并落实全部测试向量（§8.1 的 P6/P10/P11/**P12（TV-K 全部）/P13（TV-T 全部）** 向量 + P7 的累计性/指纹级撤销/授权第三锚回溯三项测试）。四项齐备前，E4-A 状态保持"有条件通过"，不进入 E4-B。

---

## 11. 本草案的效力

本草案冻结的是**字段与规则**，不是实现。E4-B 起每个阶段仍按裁定顺序单独审查、单独授权；E1-A 作为独立合同修订单独走审查与验收。本草案经 Yi 确认并完成 E4-A-4 冻结后，成为 E4-B 至 E4-H 与 E1-A 的合同基线；任何字段变更必须先修订本草案并重新批准，不得在实现中静默漂移。