# M0 第 2 步执行包（送审稿 v2.4）：正式 Identity Gate 重跑

- 日期：2026-11-03（PST）；v2.4 文档修订：2026-11-03（PST）
- 版本：v2.4 draft；在 v2.3 基础上修订，不覆盖 v1 / v2 / v2.1 / v2.2 / v2.3 原件
- 性质：专用执行包编制与送审；**生产读取未授权、不得执行**
- 执行人：Muse；预定路径：B2（`ssh bwh`）
- 适用范围：Yi 独立审查并签署本执行包，仅表示确认并冻结执行合同；**该签署本身不授权任何 BWH 操作**。只有在签署之后，Yi 再对正式 Identity Gate 作出单独、明确、范围受限的执行授权，才可按本包执行一次封闭 Gate。执行或停止后该次授权耗尽；重跑必须重新取得单独授权。

> **当前状态：REVIEW_PENDING / NOT SIGNABLE（R8 为唯一正式签署候选；完整文档静态复核已完成，但 R8 runner harness/清理证据仍未补齐）。** Yi 已于 2026-11-03 正式裁定 Y-3 选甲、Y-4 选甲，并在第二轮独立终审后明确选择 R8 修订线。R6 的 18 项冻结包保留为历史证据，不覆盖、不删除。R8 helper/test 已在固定依赖栈 Node v22.23.1 / better-sqlite3 12.10.0 / SQLite 3.53.1 上全项 PASS，R8 的 18 项 manifest/tarball 已冻结并经独立复算。两份文档的 Snapshot sidecar 合同已对齐；当前执行包 15 个 Bash 代码块已全部 `bash -n` 15/15 PASS，58 个 exit 使用点现已全部唯一。R8 动态验收仅在隔离 VM 完成，没有连接 BWH 或读取生产 DB；R7 曾有一次 BWH 专用合成 fixture 复现，已在本包如实披露。R8 runner harness 版本/哈希及退出后精确 realpath、清理前后原始记录仍缺。第一层签署仍为空白，第二层正式 Gate 授权仍未授予；M0 继续 BLOCKED。

## v2.4 修订裁定与证据来源

本版基于 v2.3 送审稿（本地源文件 SHA-256：`ecb4e15ec87103cfd82f7b6d5db0ed5b2668852b0a276fa88761215514d4c26f`）及第四轮动态验收回执（2026-11-03）和 Yi 的 Y-3/Y-4 正式裁定形成。v2.4 只按两项裁定修改 census 身份字段与 sidecar/SHM 合同；不改变 Gate 面映射、冻结 checker 闭包、两级授权、生产读取范围或 M0 最终裁定边界。

| 本轮项 | v2.4 修订 | 验证口径 |
| --- | --- | --- |
| Y-3 · schemaVersion | 从 census JSON 输出和身份稳定指纹移除 `schemaVersion`；仅保留 `schemaDigest` 作为模式身份指纹 | 第四轮实测 live=2 / snapshot=1、其余字段及 schemaDigest 全等；新 fixture 明确验证 cookie 差异不再影响 census 相等性 |
| Y-4 · sidecar 成对规则 | 取消 WAL/SHM 必须成对存在或成对缺失的合同要求；每个已存在 sidecar 仍须为普通文件且非符号链接 | 与当前 helper 的逐文件 `lstat` 保护一致；不把 SQLite 本身对无效数据库状态的错误包装成 pair gate |
| Y-4 · SHM 缺失路径 | 允许缺失 SHM 时使用正常只读/WAL-aware 打开；明确接受 SQLite 可能创建 transient SHM 协调状态 | 固定 SQLite 3.53.1 动态测试必须记录实际行为；主 DB/WAL 不得变化 |
| Y-4 · inode/SHM 记录 | 删除 sidecar inode 不变及 SHM before/after 哈希作为硬门槛；metadata/hash 可保留为观察项 | helper 实际只保证 sidecar 类型/非符号链接；不得在包文中声称有 inode 级保护 |
| F1/F2/M1/M2 | 沿用 v2.3 已修正的路径、WAL 证据归属、工作目录权限和 exit-code 分配 | 不回退 v2.3 已通过的静态修正 |

R8 固定栈动态验收与 18 项冻结包已完成；执行包 §6.4.2、§7.1–§7.4、§8.1、§9.3–§9.4 与本决策附录的 Snapshot census 后 sidecar 合同现已对齐。2026-11-04 完整文档静态复核已完成；动态 fixture PASS 不等同于正式 Identity Gate，也不代表已执行任何 BWH 生产读取。

| 项目 | v2.4 裁定 | 证据状态 |
| --- | --- | --- |
| B1 · SHA256SUMS | 修正为从冻结源码重新计算的 64 位值；历史 BWH 12/12 实测不因 v2.1 归档错误而被追溯否定 | Yi 提供三轮执行事实；本轮从 GitHub 冻结文件重新读取并复算 |
| B2 · runner | R6 与 R8 原始 WAL runner 均报告 PASS（R8：ok=true、failures=[]）；runner 原件 SHA-256 已固定 | R8 回执未提供本轮 harness 版本/哈希及退出后精确 realpath、清理前后原始记录；正式 Gate 前仍须补齐受控清理证据，不把其他轮次的清理记录外推到 R8 |
| B3 · 数据读取合同 | 明确运行时配置、protected material、精确 channel DB 绑定及 census 的内存读取/比对范围；只允许聚合字段和摘要输出 | 本轮读取冻结 checker 与 census 源码核对 |
| B4 · WAL/SHM | R8 fixture 已验证 live Source DB/WAL 指纹不变、Snapshot census 后 absent→0-byte WAL 与 transient SHM、symlink/非普通 sidecar 拒绝 | 固定栈动态验收 PASS；Snapshot census 后协调 sidecar 合同已按 §6.4.2 / §7 / §9.4 对齐；2026-11-04 完整文档静态复核 PASS |
| B5 · 执行身份 | `ssh bwh` 固定 root 登录，使用专用 `id_ed25519_bwh`；不再使用 sudo 包装 | Yi 提供 TOOLS.md 事实及 2026-11-01 两次验证记录；本轮未读取私钥或连接 BWH |
| B6 · 网络边界 | 唯一网络例外为 Tailscale SSH/SCP 传输通道；Gate/helper 本身不发起网络请求 | 按 Yi 本轮明确口径写入 |
| R1 · 时间与 mtime | 四时点和 30 个监视样本均记录 UTC 时间戳；snapshot A/B 记录 size、mtime、SHA-256 | 文档命令待复审，未执行 |
| R2 · live census | R8 活动 WAL 下 live census 与 Backup snapshot census 逐字段相等，包含 WAL-only 行；输出不含 schemaVersion，仅用 schemaDigest | 固定栈动态验收 PASS；R8 raw census 输出已单独归档并固定 SHA-256 |
| R3 · SHM | 缺失 SHM 时允许只读打开；SQLite transient SHM 协调不要求 inode/哈希恒定；Snapshot census 后另允许 absent→0-byte WAL | R8 已在固定 SQLite 3.53.1 上实测；Snapshot WAL 例外仅适用于 $WORK 内快照，不扩展到生产 Source DB/WAL |

### B1 范围说明

Yi 提供的历史事实是：三轮 BWH 实际执行的 SHA256SUMS 均为 64 位，且每轮 `sha256sum -c` 12/12 通过；62 位值只在 v2.1 归档件及其 §4 内嵌 manifest 中出现，不污染三轮已执行证据。本包将该历史事实作为 Yi 提供的执行记录，不反向改写历史回执。

本轮从冻结 commit `eb83197e47155943087655ff7d4aad7a6c954849` 重新读取目标源码文件，并以 SHA-256 复算得到：`74125e4ca9a3148652c360e5e0ab91a3cffa97489984ab28210b38550c71bdb2`（64 位）。注意：当前可读取的 Library v2 草案副本也显示 62 位旧值，这与 Yi 所指的本地 v2 草案口径不一致；本包不假定两者为同一字节版本，统一以冻结源码的 64 位复算值为准，并要求最终 bundle 再执行 `sha256sum -c`。

### B2 runner 归档与复现边界

- runner：`fixture-wal-rerun-runner-2026-11-03.mjs`；Drive 原件：[runner](https://drive.google.com/file/d/1RxcDho7QzC0ho8fCDGThAQPIAJIV2Ffa/view?usp=drivesdk)。
- 本轮实际读取的文件为 10,355 bytes / 159 lines；本地 `sha256sum`：`096ca7e2d7a143e3b454f6153b0e22d1641d65de4e5217fb17a17d83bbf4e112`，与 Yi 在 Notion 补档记录的哈希一致。
- runner 不是独立可执行的单文件 bundle：它通过相对路径依赖完整仓库中的 `server/services/platform/subscription-control-db.mjs`、冻结 checker、snapshot helper 和既有 `better-sqlite3`。复跑必须在完整仓库 checkout 中进行，checker 固定 `eb83197e`，snapshot helper 使用第三轮固定 helper 版本；不得只把 runner 单独放入空 bundle 后宣称可复现。
- runner 将合成工作目录固定为 `fixtures/wal-rerun-work`，本体没有自动删除该目录。复跑 harness 必须在退出后校验该路径是本次创建的普通目录、realpath 精确匹配后清理，并验证不存在；若清理失败即 `blocked(fixture_cleanup)`。不得扩大删除路径。
- runner 的普通只读连接计数证明活动 WAL 下能读到 WAL-only 行，但它没有调用 `m0-gate-census.mjs`；因此它不替代 R2 新增的 live census 动态用例。

### 原始输出日志的归档口径

第三轮回执引用以下三个原始输出文件：`fixture-census-output-r3-2026-11-03.txt`、`fixture-helper-test-output-r3-2026-11-03.txt`、`fixture-wal-rerun-output-r3-2026-11-03.txt`。Yi 表示它们与 runner 同存于归档位置。本轮可读取的第三轮回执确认了这些文件名，但连接器未把三个 hidden_files 原始输出作为独立文件 materialize 到当前工作区；这不等于断言它们不存在。v2.4 最终 bundle 构建必须将三份原始输出逐一纳入证据目录并计算哈希，缺任一项则不生成最终归档。

### 本次授权边界

- 已授权：按 Y-3 甲 / Y-4 甲修订 helper/test 与 v2.4 执行包 Draft；读取现有 Drive/Notion/GitHub 证据；执行静态检查与固定依赖栈离线重测准备。
- 未授权：BWH 连接、BWH 生产 DB 读取、生产快照、正式 Identity Gate 执行、BWH 目录创建或文件传输、任何服务/Timer/Collector 操作、数据库/配置/retention 写入、JP-01 实例创建或真实流量接入。
- 本轮没有使用 `id_ed25519_bwh`，没有读取或复制私钥；凭据不进入 bundle、Notion 或 Drive。
- **两级授权不变：** 第一层仅审查/签署执行合同；第二层须由 Yi 另行明确、一次性授权正式 Gate。第一层不蕴含第二层。
- Tailscale SSH/SCP 是未来正式执行时唯一允许的 BWH 网络传输通道；Gate/helper 不主动发起任何网络请求。
- 三个 staged 数据面服务、Collector、Timer、投影写入方及生产状态继续冻结；M0 继续 BLOCKED。

## Y-3 / Y-4 正式裁定记录（2026-11-03）

- **Y-3：甲。** Census 输出、live/snapshot 逐字段比较和身份稳定指纹均移除 `schemaVersion`；`schemaDigest` 是唯一模式身份指纹。SQLite `schema_version` 仅是 DDL 变更计数器，不是模式内容身份。
- **Y-4：甲。** 执行包升级为 v2.4，追认当前 helper 实现口径：已存在的 WAL/SHM 分别必须是普通文件且非符号链接；不强制成对存在；缺失 SHM 时允许正常只读打开并接受 SQLite 可能创建 transient SHM；inode 与 SHM before/after metadata/hash 不再是硬性通过条件。
- **安全边界：** 主 DB/WAL 不得变化；sidecar symlink / 非普通文件必须 fail-stop；不因此放宽任何生产 Gate、服务、配置、Collector、Timer 或 retention 写入权限。

## 0. Yi 已确认的决策（本版冻结，不再作为开放问题）

| 决策 | 确认结果 | 执行含义 |
| --- | --- | --- |
| D-1 Gate 结构 | **方案甲** | 第一部分：既有 `vultr-japan-a` 三面正式文件态重跑；第二部分：JP-01 三通道 DB-only 聚合普查附则。不得把附则描述成 JP-01 运行时 Gate。 |
| D-2 检查器版本 | **master `eb83197e47155943087655ff7d4aad7a6c954849`** | 冻结原 Identity Gate 检查器 8 文件闭包；离线 WAL/Backup fixture 证据为生产快照前硬前置。检查器闭包不混入其他提交。 |
| D-3 顺序 | **先测量、后裁定** | 不先处理 stale，不修改 retention；先取得当期正式证据，再由 Yi 对结果和后续 retention 单独裁定。 |

### 本次授权边界

- 已授权：按 Y-3/Y-4 正式裁定修订 helper/test、v2.4 文档与离线验收包；不包含任何 BWH 生产读取或生产写入。
- 未授权：BWH 连接、文件传输、生产目录创建、生产 DB 读取、生产快照、正式 Gate、服务/Timer/Collector 操作、数据库/配置/retention 写入、JP-01 实例创建或真实流量接入。
- 第一层为 Yi 对 v2.4 执行合同的审查/签署；第二层为 Yi 另行作出的正式 Gate 单独执行授权。第一层不蕴含第二层。
- 未来唯一传输例外是 Tailscale `ssh bwh` / `scp bwh:` 通道；Gate/helper 本身不主动联网。
- 本轮没有连接 BWH，也没有读取生产状态；M0 继续 BLOCKED。

## 1. Gate 目标与身份边界

### 1.1 第一部分：既有 `vultr-japan-a` 三面正式重跑

三面必须一次一面、分别计算。每条检查命令均显式传入 `--node-ref vultr-japan-a`，不依赖 legacy 默认映射。

| 逻辑面 | runtime-kind | DB channel | 唯一 runtime 配置 | 数据面 unit |
| --- | --- | --- | --- | --- |
| `japan-vless` | `xray` | `channel-vultr-a-vless-reality-tcp` | `/etc/xray/config.json` | `xray-vless-reality.service` |
| `japan-hy2` | `hy2` | `channel-vultr-a-hy2` | `/etc/hysteria/config.yaml` | `hysteria2.service` |
| `japan-tuic` | `mihomo` | `channel-vultr-a-tuic` | `/etc/mihomo/config.yaml` | `mihomo-tuic.service` |

固定输入：

- 生产 DB：`/opt/proxy-gateway-minimal-candidate/shared/state/subscription-control.sqlite`
- protected material：`/opt/proxy-gateway-minimal-candidate/shared/state/edge-credential-material.json`
- catalog 指纹旁证：`/etc/gccgw-bwh-catalog/proxy-servers.json`
- 当前发布指针：`/opt/proxy-gateway-minimal-candidate/current`
- 2026-11-03 最近回执记录的期望指针目标：`/opt/proxy-gateway-minimal-candidate/releases/control-plane-pr799-eadefd98357a-mixed`
- 主机名最近回执值：`elegant-box-1.localdomain`

如果主机名或 current 目标与上述锚点不一致，立即停止；不得自行改用其他发布树。

### 1.2 第二部分：JP-01 DB-only 普查附则

从同一批 A/B 快照的 census 结果中，单独记录以下三通道绑定行数：

- `channel-vultr-jp-01-vless-reality-tcp`
- `channel-vultr-jp-01-hy2`
- `channel-vultr-jp-01-tuic`

预期均为 0。任一非零即停止并报告，不自行解释、不执行 JP-01 检查器比较、不继续生产 Gate。

本附则只证明 `platform_portal_edge_credentials` 中上述三条 channel 的 DB 绑定计数；不证明 JP-01 runtime 已存在或健康，也不证明数据库其他位置没有任何 JP-01 相关记录。

### 1.3 明确排除项

- SGP（`channel-sgp-a-*`）不进入三面比较，不记为零，不据此宣称 SGP 身份健康，也不删除其历史映射。
- census 的 `otherChannelsTotal` 只用于总量勾稽，包含六条指定 channel 之外的全部 channel；不能把它解释为 SGP 专项计数。
- 不对 `node-vultr-jp-01` runtime 执行 Gate。该 nodeRef 对应另一组 JP-01 channel，不能与本包 `vultr-japan-a` 的三份 runtime 配置混面。

## 2. 冻结源码与工件清单

### 2.1 Identity Gate 检查器闭包

冻结基线：`eb83197e47155943087655ff7d4aad7a6c954849`。2026-11-03 核验 `master` 与该提交 identical（ahead 0 / behind 0）。以下 8 文件 SHA-256 沿用 v1，BWH Phase 0 必须逐项复算，任一不一致即停止。

| SHA-256 | 文件 |
| --- | --- |
| `ae820ab6cc6b436615d6b0b8a91342807976b1ec469d137b10766426ace9a2d2` | `scripts/identity-gate-check.mjs` |
| `4f79117e384e1bb7d9b3dece580efeb34237a69525f1cd0d36350bcc07aa4425` | `scripts/lib/full-metering-data-pack-bindings.mjs` |
| `b952af4ad16af95611f82d0d2804e07e006d4daf9acac15ddf59d5650acd36c4` | `scripts/lib/traffic-vless-recovery-baseline.mjs` |
| `c3ed625964b61ff43dc91ad688e04c4459220aa4094c2b6e3d76795decf9d010` | `server/services/deployment/strict-json-scan.mjs` |
| `f2e96b44c8de82d8974b4f07a1fd91275b74018babdaebefc565e5656809fa9d` | `server/services/edge/credential-material-store.mjs` |
| `2abd97e84cfd7f5bcc3b77803faebc86db9fa3086a3ee4113f3d921a4d8e5ec9` | `server/services/edge/runtime-config-readonly-proof.mjs` |
| `74125e4ca9a3148652c360e5e0ab91a3cffa97489984ab28210b38550c71bdb2` | `server/services/platform/portal-subscription-link-reset-store.mjs` |
| `8e247f1b1adf11e0e8f632707b51ee0ccc31830078bc47832ea22959357d2a6e` | `server/services/platform/usage-billing-cycle.mjs` |

### 2.2 辅助程序与测试锚点（R6 历史冻结线 + R8 选定修订线）

历史第三轮通过的 helper 基线：

- 分支：feat/m0-identity-gate-v2-helpers-20261103
- 历史测试 HEAD：aed3d0a049c85684604b678adef74746100baf90（相对 checker commit eb83197e：7 ahead / 0 behind）
- census SHA-256：56bb9d47d6dda64ec9d9d48dfab62bb59ef1fe04cfcc2e6ac3774b53890395e9
- snapshot SHA-256：a684e1ecc669642fc2b91fcadf4e638636a917d4050c9be71b92e0d3fc0a826b
- fixture test SHA-256：1f1545021dc08fa6de49645b41030809cba5b8eccd682646ba57f3fe241be29a

上述是第三轮历史通过锚点，不代表 v2.4 最终签署闭包。

**R6 历史冻结线（保留，不再作为签署候选）：**

- Helper/Test HEAD：2e55ba3571b71879ad7ed5d718e8678d097682d4
- 18 项冻结包：48,570 bytes；SHA-256：a5600dbab180167a8bd6f27474bf491637c37044014f36b0c806cc3e60ba6da7；18/18 PASS。

**R8 正式签署候选线（Yi 已确认）：**

- 分支：feat/m0-identity-gate-v2-4-audit-remediation-20261103
- R8 HEAD：9b4bff888e6eb7b4c4545b1f005a32e24855ab9e
- 相对前一 HEAD 5ecee088c8a2d926ede05d24f860f20797f4dd48：ahead 1 / behind 0；唯一提交仅修改 server/tests/m0-gate-helper-fixture.test.mjs（57 additions / 2 deletions），两个 Helper 未改。
- census SHA-256：3351443a84f7ff0b99ddde73bb8defc28a6fc3226935a1719ef216e4a5d7056c
- snapshot SHA-256：fb3ea4a3bcb91f878e39b30a2c45be1ec78003c10aa710cef3270e8d8a5010f0
- test SHA-256：12c8dd1722fe6ef129f7a6177a76d4e80a087ab1dd4f24ea302aab402f1f9e8c
- 固定栈动态结果：helper fixture PASS（exit 0，1/1）；原始 WAL runner PASS（ok=true、failures=[]）；直接 census PASS（输出无 schemaVersion，两条等式均为 true）。
- R8 raw output SHA-256：helper-test a4d910d8d69acaee1bcbd8cadea1decc9c1c286eaced6bf16e6163df4d240a16；WAL runner 938545287c4c52a15e782f2c148b15326a9936584b8f911669990b4129a70254；census ddaef37761f35af06b4f5a3dda84b5dd8b69521bdb53a403eb0b088293e27921。census 原始文件包含 Node UNDICI 代理环境警告行；该警告不属于 helper JSON 输出。
- R8 18 项冻结包：m0-identity-gate-v2-4r-bundle-20261103.tar.gz，50,190 bytes；SHA-256：6de61f665174106fc6a22fa45e011b14b084094380a8445239c1cbba10873a22；manifest 18/18 PASS，解包独立复核 18/18 PASS。

R8 18 项 manifest 内固定的是 R3 历史三份 raw output；R8 本轮三份 raw output 是独立补充证据，单独保存并使用上述 SHA-256 锚定，不得声称它们已包含在 18 项 manifest 内。R6 与 R8 两只 tarball 各自绑定各自代码线，均保持只读；R8 被选定不覆盖或删除 R6。

**v2.4 Helper/Test 合同实现：** 两个 Helper 在 SQLite 生命周期中复核主 DB 与 sidecar 类型；主 DB/WAL 的 size、mtimeNs、SHA-256 前后断言由 R8 fixture 覆盖。Y-3 以 schemaDigest 作为唯一模式身份；Y-4 对已存在 sidecar 逐个执行 regular-file / non-symlink 检查，不强制 WAL/SHM 成对存在。

**当前状态：** R8 动态验收与归档冻结已完成，第二轮独立终审已选择 R8。执行包与决策附录的 Snapshot census 后 sidecar 合同已对齐，2026-11-04 完整文档静态复核已通过；R8 runner harness/清理证据仍待补齐。第一层签署仍为空白，M0 仍 BLOCKED。

### 2.3 第三轮历史验收记录与 runner 锚点（2026-11-03）

第三轮在 BWH 固定依赖栈上完成，且仅打开 `$WORK` 内合成数据库；没有读取生产 DB、没有创建生产快照、没有执行正式 Gate、没有修改服务或配置。最终回执记录 `$WORK` 已整体删除并验证不存在。

1. **原始 WAL fixture 全场景复跑：通过。** `ok=true`、`failures=[]`、退出码 0；baseline 为 degraded（runtime/mapped/missing = 3/2/1）；路径 A（复制 DB+WAL+SHM）漏读 WAL-only 绑定；路径 B（只读源连接的 Online Backup API 快照）verified 3/3；路径 C（直读活 WAL DB）漏读。与 2026-11-01 原始结论一致。
2. **helper fixture 测试：通过。** tests 1 / pass 1 / fail 0；快照无侧车断言、探针目录清理断言、Census 总量及六通道逐项勾稽均通过。
3. **Census 两条等式：成立。** 对复跑快照另行取证：`ok=true`、`credentialsTotal=3`、`bindingRows=3`、`accessRequestsTotal=3`；`bindingRowsEqCredentialsTotal=true`、`channelCountsEqCredentialsTotal=true`。
4. **源完整性：通过。** 源 WAL 103,032 B；第三轮 SHA-256 before / after 均为 `d0a91e39c9c2ac321d547a6725bd6f34a1f5c5afab57842fef2b9794e45b466f`；`wal_unchanged=true`；快照旁 `.m0-gate-probe-*` 残留目录计数为 0。`4e9a64a4ff2b6321f743a451cb0fde9ef64b70a4a247f3551168a25089216e2f` 属于 2026-11-01 原始 fixture 日志，不属于第三轮，严禁跨轮次复用。
5. **运行环境：** Node `v22.23.1` / better-sqlite3 `12.10.0` / SQLite `3.53.1`；依赖目录是既有 `control-plane-2dea45fcbac1-bwh-20261008` release 的 `node_modules`，只读引用，未安装任何依赖。
6. **最终锚点：** 原始 fixture 规范 SHA-256 `cedfef0a33200a4d2125ebba2803c56366604733aec256e4106bef89a23b7eeb`；原始 fixture 日志 SHA-256 `6ecb3ac2c19ed8bb9f7e54055f257dd03f44ec8f57b8ecdb54ccab29377a5f69`；第三轮最终回执 SHA-256 `ef7c576b4f0bbffae8763bd6ab80e865338f1bbc91212fd2903322c6fb893cbd`。
7. **runner 已归档并核验。** `fixture-wal-rerun-runner-2026-11-03.mjs` SHA-256 为 `096ca7e2d7a143e3b454f6153b0e22d1641d65de4e5217fb17a17d83bbf4e112`；本轮从 Drive materialize 后本地复算一致。runner 的执行上下文与清理要求见 §v2.4 修订说明及 §6.3。

证据原件：

- [原始 WAL fixture 规范](https://drive.google.com/file/d/1_PbDXJ90uektASwppdTiIA3ie4oj16wj/view)
- [原始 WAL fixture 完整日志](https://drive.google.com/file/d/1EFvbXxNumlP7hYc30f2RbbbuPtVTyZpM/view)
- [第三轮最终动态验收回执](https://drive.google.com/file/d/1tsGzlwWpswy7DdiLZD9s22iRVV5AQgid/view)
- [第三轮 runner](https://drive.google.com/file/d/1RxcDho7QzC0ho8fCDGThAQPIAJIV2Ffa/view)

第三轮历史回执中记录的主机 `SHA256SUMS 12/12` 与 v2.4 最终 bundle manifest 的文件数量是两个不同口径，不得混写。v2.4 计划纳入 18 项：8 个 checker 文件、3 个 helper/test 文件、原始 fixture 规范/日志/第三轮回执 3 项、runner 1 项、第三轮原始 census/helper/WAL 三份输出 3 项。最终 helper hashes 与三份原始输出 hashes 必须在打包时从确切文件计算并固定；任何缺失即停止，不生成最终 bundle。

**历史执行证据边界：** 本节记录的是 2026-11-03 第三轮已经完成的离线合成测试，不代表 v2.4 新增 live census / schemaDigest / sidecar / SHM 测试已经通过，也不授权生产 Gate。

### 2.3.1 R5–R8 验收轮次与 BWH 访问边界（2026-11-03）

| 轮次 | 环境与结果 | 失败/访问披露 |
|---|---|---|
| R5 | BWH 固定栈；仅使用隔离的合成 $WORK；WAL runner 与直接 census PASS，helper fixture FAIL | cookie 探针直接打开 snapshot 本体后留下 WAL sidecar，属于测试自干扰；未打开生产 DB，未执行正式 Gate |
| R6 | BWH 固定栈；仅使用隔离的合成 $WORK；helper fixture、WAL runner、直接 census 全部 PASS；R6 18 项包冻结 | 回执记录 $WORK 结束后已删除并验证缺席；未打开生产 DB，未执行正式 Gate |
| R7 | 以隔离 VM 为主；helper fixture FAIL，根因为 snapshot census 后出现 absent→0-byte WAL，主 DB 指纹不变 | 根因定位时另在 BWH 专用 fixture 目录做过一次合成数据复现；回执披露该次 BWH 访问，目录已删除并验证缺席；未读取生产 DB、未执行正式 Gate |
| R8 | 仅在隔离 VM 固定栈完成；helper fixture 1/1 PASS、WAL runner ok=true / failures=[]、直接 census PASS | 首次 stage 副本混入上一轮 runner 工作目录产物，首次退出码 2 且未运行测试；清理为 pristine 后完整重跑 PASS。本轮未连接 BWH |

R5/R6 的 BWH 使用范围是专用隔离目录内的合成 fixture，不是生产数据库读取或生产快照。R7 的一次 BWH 合成复现必须作为已发生的 BWH 访问保留披露，不能概括成“所有 R5–R8 均未连接 BWH”。R8 本轮才是完全未连接 BWH 的隔离 VM 验收。

R8 动态输出的 SHA-256 与 R8 回执一致；R8 归档复核确认 tarball SHA-256 为 6de61f665174106fc6a22fa45e011b14b084094380a8445239c1cbba10873a22，外部与内部 SHA256SUMS 字节一致，18 个 payload 项全部 PASS，归档含 19 个普通文件（18 个 payload + SHA256SUMS）。

### 2.4 运行时依赖基线

沿用 v1 指定的主机既有副本，不安装、不下载：

`/opt/proxy-gateway-minimal-candidate/releases/control-plane-2dea45fcbac1-bwh-20261008/node_modules`

第三轮 BWH 实测基线：Node `v22.23.1`、better-sqlite3 `12.10.0`、内嵌 SQLite `3.53.1`。2026-11-01 原始报告中的 Node `v24.22.1` 是历史首轮环境，不是第三轮 BWH 复跑环境。正式 Gate 的 Phase 0 必须实测并记录三个版本；与第三轮 BWH 基线不一致时，先停止，取得新的离线测试授权并在实际加载的依赖栈上完成所需 fixture 复验，不能直接沿用旧回执。

## 3. 输出字段与证据语义

### 3.1 Identity Gate checker 实际读取、比对与输出

在冻结提交 `eb83197e47155943087655ff7d4aad7a6c954849` 中，checker 的实际读取不是“零读取”，而是固定输入的进程内读取与比较：

1. **Runtime 配置：** 通过 `readActiveConfigFile` 读取指定配置文件；该读取会检查普通文件、符号链接与读取期间文件身份稳定性。按 runtime-kind 提取 principal：
   - Xray/VLESS：`inbounds[].settings.clients[].email` 与 `id`；
   - Hysteria2：`auth.userpass` 的 username/password；
   - Mihomo/TUIC：`listeners` 中 TUIC `users` 的 UUID/password。
2. **Protected material：** 读取 `edge-credential-material.json`，规范化记录并在内存索引 `credentialRef`、UUID、password、`materialDigest`；不把原始记录写入输出。
3. **DB binding：** 只对显式 `--node-ref vultr-japan-a` 与 runtime-kind 对应的单一 channel 调用 `readFullMeteringBindings`，读取该 channel 的 eligible / retained binding 与 material digest 元数据；checker 的 DB 连接使用只读、immutable 模式读取 A/B standalone snapshot，不将生产 live WAL 直接作为 checker 输入。
4. **比较：** 在进程内比较 runtime principal 集合、DB resolver map、protected material 的引用/UUID/password/digest 关系，计算 runtime/mapped/missing/stale/changed/missing_material 和两条等式。
5. **checker 输出白名单：** 只输出 `surface`、`runtime_count`、`mapped_count`、`missing`、`stale`、`changed`、`missing_material`、`map_total`、`equalities`、`state`、显式传入的 `node_ref`，以及必要的安全错误码。不得输出任何原始 principal、credentialRef、UUID、password、material record 或 DB 行。

Census helper 的实际读取与输出另见 §6.3 / §7：它在一个 `BEGIN DEFERRED` read transaction 中读取 schema metadata、`platform_portal_edge_credentials` 的 channel/ref 投影、总数与 access request 计数；credential refs 只在进程内参与 `bindingProjectionDigest`。输出仅包含 `schemaDigest`、聚合计数、六通道计数、`otherChannelsTotal`、`accessRequestsTotal`、`bindingRows`、投影摘要及 equality flags，不输出 `schemaVersion` 或原始 refs。

**retention 边界不变：** checker 不输出 `retention_state`；retention 只作为独立 inventory/policy 旁证，在最终回执单独注明来源、日期与状态。既有 256 条 stale 均为 RETAIN、三面分布 90 / 77 / 89，是历史旁证，不是本轮 Gate 结果或预期硬编码值。D-3 不允许先清理或改变该状态。

### 3.2 服务停止时的证据边界

前次口径记录三个数据面 unit 为 `inactive/dead`。本轮 Phase 0 必须重读并记录：

- `xray-vless-reality.service`
- `hysteria2.service`
- `mihomo-tuic.service`

若仍为 inactive/dead，本轮检查器读取的是配置文件中的 principal 集合，报告必须称为**配置文件/文件态 Identity Gate 观察**，不能称为活跃协议进程的实时 principal 或 live runtime identity 已验证。若状态分类发生变化，停止。

### 3.3 投影证据

2026-11-03 审批二 v5 回执已记录：投影路径已配置，但 `/opt/proxy-gateway-minimal-candidate/protected/traffic-evidence/traffic-collector-status.json` 与其父目录在该次检查时均不存在；该回执没有恢复 Collector。本 Gate 仅对这一精确路径做 `stat`/存在性检查，不读取内容、不读 env、不触发 Collector。缺失记 `not_observed`，不单独判 Gate 失败。

## 4. 本机/仓库打包命令（只准备本地 bundle；不连接 BWH）

本节只描述本地准备流程，不连接 BWH、不修改仓库、不触发 CI。R8 的 18 项最终 bundle 已冻结；本节后续仅作为经另行授权后的可复现打包口径。

### 4.1 固定输入

- Checker commit：`eb83197e47155943087655ff7d4aad7a6c954849`。
- Helper/Test branch：feat/m0-identity-gate-v2-4-audit-remediation-20261103；R8 固定 HEAD 9b4bff888e6eb7b4c4545b1f005a32e24855ab9e；三个 Helper/Test SHA-256 见 §2.2。
- 原始 fixture 规范、完整日志、第三轮回执：沿用 §2.3 的三个固定 SHA-256。
- runner：`fixture-wal-rerun-runner-2026-11-03.mjs`，SHA-256 `096ca7e2d7a143e3b454f6153b0e22d1641d65de4e5217fb17a17d83bbf4e112`。
- 18 项 R8 manifest 仍纳入三份 R3 历史 raw output：fixture-census-output-r3-2026-11-03.txt、fixture-helper-test-output-r3-2026-11-03.txt、fixture-wal-rerun-output-r3-2026-11-03.txt。R8 本轮三份 raw output 不属于该 18 项 manifest，作为补充证据单独保存并使用 §2.2 的 SHA-256；不允许用摘要/截图替代原始文本。

### 4.2 18 项最终 manifest 结构

R8 最终 SHA256SUMS 为 18 项：

- 8 个冻结 checker 文件；
- R8 选定 Helper/Test 的 3 个文件（固定 HEAD 9b4bff888e6eb7b4c4545b1f005a32e24855ab9e，三个 SHA-256 见 §2.2）；
- 原始 fixture 规范、原始 fixture 完整日志、第三轮最终回执 3 项；
- 归档 runner 1 项；
- 第三轮原始 census/helper/WAL 输出 3 项。

R8 归档：m0-identity-gate-v2-4r-bundle-20261103.tar.gz，50,190 bytes，SHA-256 6de61f665174106fc6a22fa45e011b14b084094380a8445239c1cbba10873a22。R6 历史归档 m0-identity-gate-v2-4-bundle-20261103.tar.gz 保持 48,570 bytes / SHA-256 a5600dbab180167a8bd6f27474bf491637c37044014f36b0c806cc3e60ba6da7，不覆盖。

R8 本轮三份 raw output（§2.2 所列）不计入 18 项 manifest；不得将补充证据误写为 bundle payload。独立复核必须对确切 tarball 解包后执行 sha256sum -c SHA256SUMS，并核对外部与内部 SHA256SUMS 字节相同。

其中 portal-subscription-link-reset-store.mjs 必须使用经冻结源码复算的 64 位 SHA-256：74125e4ca9a3148652c360e5e0ab91a3cffa97489984ab28210b38550c71bdb2。v2.1 归档件中的 62 位错误值不得复制到 v2.4.

### 4.3 打包前置与失败关闭

R8 的 18 项 manifest/tarball 已冻结。以下打包模板仅作为未来经单独授权后的可复现构建口径，不表示本轮需要重新打包，也不得覆盖 R6/R8 任一历史归档。运行时必须使用完整仓库 checkout、冻结 checker commit、R8 helper/test commit、固定 better-sqlite3 依赖和 §2.3.1 所列证据原件；runner 必须放在完整 checkout 的 fixtures/ 目录中，不能在不含仓库依赖的空 bundle 中运行。Evidence/stage/archive 路径必须由执行者显式提供，不从历史 v2-3 路径推断。

```bash
set -euo pipefail
CHECKER_COMMIT=eb83197e47155943087655ff7d4aad7a6c954849
HELPER_COMMIT=9b4bff888e6eb7b4c4545b1f005a32e24855ab9e
EXPECTED_CENSUS_SHA=3351443a84f7ff0b99ddde73bb8defc28a6fc3226935a1719ef216e4a5d7056c
EXPECTED_SNAPSHOT_SHA=fb3ea4a3bcb91f878e39b30a2c45be1ec78003c10aa710cef3270e8d8a5010f0
EXPECTED_TEST_SHA=12c8dd1722fe6ef129f7a6177a76d4e80a087ab1dd4f24ea302aab402f1f9e8c
REPO="$(git rev-parse --show-toplevel)"
EVIDENCE_DIR="${EVIDENCE_DIR:?set exact approved R8 evidence directory}"
STAGE="${STAGE:?set unique R8 stage directory}"
ARCHIVE="${ARCHIVE:?set R8 archive output path}"
RUNNER="$EVIDENCE_DIR/fixture-wal-rerun-runner-2026-11-03.mjs"

test "$HELPER_COMMIT" = 9b4bff888e6eb7b4c4545b1f005a32e24855ab9e
test "$EXPECTED_CENSUS_SHA" = 3351443a84f7ff0b99ddde73bb8defc28a6fc3226935a1719ef216e4a5d7056c
test "$EXPECTED_SNAPSHOT_SHA" = fb3ea4a3bcb91f878e39b30a2c45be1ec78003c10aa710cef3270e8d8a5010f0
test "$EXPECTED_TEST_SHA" = 12c8dd1722fe6ef129f7a6177a76d4e80a087ab1dd4f24ea302aab402f1f9e8c
git -C "$REPO" cat-file -e "$CHECKER_COMMIT^{commit}"
git -C "$REPO" cat-file -e "$HELPER_COMMIT^{commit}"
test -f "$RUNNER" && test ! -L "$RUNNER"
printf '%s  %s\n' '096ca7e2d7a143e3b454f6153b0e22d1641d65de4e5217fb17a17d83bbf4e112' "$RUNNER" | sha256sum -c -
for f in \
  "$EVIDENCE_DIR/m0-identity-gate-wal-fixture-test-2026-11-01.md" \
  "$EVIDENCE_DIR/identity-gate-wal-fixture-log-2026-11-01.txt" \
  "$EVIDENCE_DIR/fixture-test-receipt-r3-2026-11-03.md" \
  "$EVIDENCE_DIR/fixture-census-output-r3-2026-11-03.txt" \
  "$EVIDENCE_DIR/fixture-helper-test-output-r3-2026-11-03.txt" \
  "$EVIDENCE_DIR/fixture-wal-rerun-output-r3-2026-11-03.txt"; do
  test -f "$f" && test ! -L "$f"
done

test ! -e "$STAGE" && test ! -L "$STAGE"
test ! -e "$ARCHIVE" && test ! -L "$ARCHIVE"
umask 077
mkdir -m 700 "$STAGE"
mkdir -p "$STAGE/scripts" "$STAGE/server/tests" "$STAGE/fixtures" "$STAGE/evidence"
FILES=(
  scripts/identity-gate-check.mjs
  scripts/lib/full-metering-data-pack-bindings.mjs
  scripts/lib/traffic-vless-recovery-baseline.mjs
  server/services/deployment/strict-json-scan.mjs
  server/services/edge/credential-material-store.mjs
  server/services/edge/runtime-config-readonly-proof.mjs
  server/services/platform/portal-subscription-link-reset-store.mjs
  server/services/platform/usage-billing-cycle.mjs
)
for f in "${FILES[@]}"; do
  mkdir -p "$STAGE/$(dirname "$f")"
  git -C "$REPO" show "$CHECKER_COMMIT:$f" > "$STAGE/$f"
done
cat > "$STAGE/CHECKER-SHA256SUMS" <<'CHECKER_SUMS'
ae820ab6cc6b436615d6b0b8a91342807976b1ec469d137b10766426ace9a2d2  scripts/identity-gate-check.mjs
4f79117e384e1bb7d9b3dece580efeb34237a69525f1cd0d36350bcc07aa4425  scripts/lib/full-metering-data-pack-bindings.mjs
b952af4ad16af95611f82d0d2804e07e006d4daf9acac15ddf59d5650acd36c4  scripts/lib/traffic-vless-recovery-baseline.mjs
c3ed625964b61ff43dc91ad688e04c4459220aa4094c2b6e3d76795decf9d010  server/services/deployment/strict-json-scan.mjs
f2e96b44c8de82d8974b4f07a1fd91275b74018babdaebefc565e5656809fa9d  server/services/edge/credential-material-store.mjs
2abd97e84cfd7f5bcc3b77803faebc86db9fa3086a3ee4113f3d921a4d8e5ec9  server/services/edge/runtime-config-readonly-proof.mjs
74125e4ca9a3148652c360e5e0ab91a3cffa97489984ab28210b38550c71bdb2  server/services/platform/portal-subscription-link-reset-store.mjs
8e247f1b1adf11e0e8f632707b51ee0ccc31830078bc47832ea22959357d2a6e  server/services/platform/usage-billing-cycle.mjs
CHECKER_SUMS
(cd "$STAGE" && sha256sum -c CHECKER-SHA256SUMS)
rm -f "$STAGE/CHECKER-SHA256SUMS"
git -C "$REPO" show "$HELPER_COMMIT:scripts/m0-gate-census.mjs" > "$STAGE/scripts/m0-gate-census.mjs"
git -C "$REPO" show "$HELPER_COMMIT:scripts/m0-gate-snapshot.mjs" > "$STAGE/scripts/m0-gate-snapshot.mjs"
git -C "$REPO" show "$HELPER_COMMIT:server/tests/m0-gate-helper-fixture.test.mjs" > "$STAGE/server/tests/m0-gate-helper-fixture.test.mjs"
test "$(sha256sum "$STAGE/scripts/m0-gate-census.mjs" | awk '{print $1}')" = "$EXPECTED_CENSUS_SHA"
test "$(sha256sum "$STAGE/scripts/m0-gate-snapshot.mjs" | awk '{print $1}')" = "$EXPECTED_SNAPSHOT_SHA"
test "$(sha256sum "$STAGE/server/tests/m0-gate-helper-fixture.test.mjs" | awk '{print $1}')" = "$EXPECTED_TEST_SHA"
cp "$RUNNER" "$STAGE/fixtures/fixture-wal-rerun-runner-2026-11-03.mjs"
cp "$EVIDENCE_DIR/m0-identity-gate-wal-fixture-test-2026-11-01.md" "$STAGE/fixtures/m0-identity-gate-wal-fixture-test-2026-11-01.md"
cp "$EVIDENCE_DIR/identity-gate-wal-fixture-log-2026-11-01.txt" "$STAGE/evidence/identity-gate-wal-fixture-log-2026-11-01.txt"
cp "$EVIDENCE_DIR/fixture-test-receipt-r3-2026-11-03.md" "$STAGE/evidence/fixture-test-receipt-r3-2026-11-03.md"
cp "$EVIDENCE_DIR/fixture-census-output-r3-2026-11-03.txt" "$STAGE/evidence/fixture-census-output-r3-2026-11-03.txt"
cp "$EVIDENCE_DIR/fixture-helper-test-output-r3-2026-11-03.txt" "$STAGE/evidence/fixture-helper-test-output-r3-2026-11-03.txt"
cp "$EVIDENCE_DIR/fixture-wal-rerun-output-r3-2026-11-03.txt" "$STAGE/evidence/fixture-wal-rerun-output-r3-2026-11-03.txt"
printf '%s  %s
' 'cedfef0a33200a4d2125ebba2803c56366604733aec256e4106bef89a23b7eeb' "$STAGE/fixtures/m0-identity-gate-wal-fixture-test-2026-11-01.md" | sha256sum -c -
printf '%s  %s
' '6ecb3ac2c19ed8bb9f7e54055f257dd03f44ec8f57b8ecdb54ccab29377a5f69' "$STAGE/evidence/identity-gate-wal-fixture-log-2026-11-01.txt" | sha256sum -c -
printf '%s  %s
' 'ef7c576b4f0bbffae8763bd6ab80e865338f1bbc91212fd2903322c6fb893cbd' "$STAGE/evidence/fixture-test-receipt-r3-2026-11-03.md" | sha256sum -c -

# Generate a candidate manifest from the exact staged bytes; compare the three
# helper hashes with the reviewed values before accepting the 18-item bundle.
(cd "$STAGE" && sha256sum \
  scripts/identity-gate-check.mjs \
  scripts/lib/full-metering-data-pack-bindings.mjs \
  scripts/lib/traffic-vless-recovery-baseline.mjs \
  server/services/deployment/strict-json-scan.mjs \
  server/services/edge/credential-material-store.mjs \
  server/services/edge/runtime-config-readonly-proof.mjs \
  server/services/platform/portal-subscription-link-reset-store.mjs \
  server/services/platform/usage-billing-cycle.mjs \
  scripts/m0-gate-census.mjs scripts/m0-gate-snapshot.mjs \
  server/tests/m0-gate-helper-fixture.test.mjs \
  fixtures/m0-identity-gate-wal-fixture-test-2026-11-01.md \
  evidence/identity-gate-wal-fixture-log-2026-11-01.txt \
  evidence/fixture-test-receipt-r3-2026-11-03.md \
  fixtures/fixture-wal-rerun-runner-2026-11-03.mjs \
  evidence/fixture-census-output-r3-2026-11-03.txt \
  evidence/fixture-helper-test-output-r3-2026-11-03.txt \
  evidence/fixture-wal-rerun-output-r3-2026-11-03.txt > SHA256SUMS)
(cd "$STAGE" && test "$(wc -l < SHA256SUMS)" -eq 18 && sha256sum -c SHA256SUMS)
tar -C "$STAGE" -czf "$ARCHIVE" .
sha256sum "$ARCHIVE"
tar -tzf "$ARCHIVE" | sort
```

R8 既有归档的独立复核结果见 §2.2 与 §2.3.1。以上模板仅可用于未来另行授权的重建；执行后必须再次独立核对 18/18、tarball SHA-256 和文件列表，不得把历史 BWH 12/12 结果写成当前 18/18。

## 5. BWH 传输与工作目录（仅在正式 Gate 单独授权后执行）

固定 BWH 工作目录（沿用 v2 已冻结路径，不在本轮探测或创建）：

- `WORK=/opt/proxy-gateway-minimal-candidate/protected/muse-identity-gate-20261103-v2`
- `BUNDLE=$WORK/bundle`
- `WORKDATA=$WORK/work`
- `DB=/opt/proxy-gateway-minimal-candidate/shared/state/subscription-control.sqlite`
- `MATERIAL=/opt/proxy-gateway-minimal-candidate/shared/state/edge-credential-material.json`
- `CATALOG=/etc/gccgw-bwh-catalog/proxy-servers.json`
- `DEPS=/opt/proxy-gateway-minimal-candidate/releases/control-plane-2dea45fcbac1-bwh-20261008/node_modules`

### 5.1 固定 SSH 身份

依据 Yi 提供的 TOOLS.md 记录：`ssh bwh` 是 root 登录，使用专用私钥 `~/.ssh/id_ed25519_bwh`；2026-11-01 曾两次验证，三轮 fixture 均以 root 执行。本包只记录 key 文件标识，不包含、读取、复制或上传私钥内容。该 TOOLS.md 原件未在本轮可读取的 Library/Drive 结果中取回，故此项来源标记为 Yi 本轮提供的项目事实；正式执行前仍须按下列命令复核 alias。

本机配置预检（`ssh -G` 只展开本地配置，不建立连接；不得输出完整配置）：

```bash
set -euo pipefail
ssh -G bwh | awk '
  $1 == "user" { user = $2 }
  $1 == "identityfile" && $2 ~ /(^|\/)id_ed25519_bwh$/ { identity = 1 }
  END { if (user != "root" || !identity) exit 1 }
'
```

正式执行授权生效后，首次连接必须验证远端身份：

```bash
ssh bwh 'test "$(id -u)" = 0 && test "$(id -un)" = root'
```

远端不是 UID 0 / `root`，或 alias 没有绑定 `id_ed25519_bwh`，立即停止。**禁止回退到普通用户 + sudo，不允许改用其他 SSH alias 或其他密钥。**

### 5.2 唯一允许的传输通道与目录操作

以下命令现在不得执行。只有 Yi 已另行签署 §10.2 正式 Gate 单独执行授权后，才允许通过 Tailscale 上的 `ssh bwh` / `scp bwh:` 传输 bundle 和取回脱敏输出。所有远端命令均以 root 直接执行，不使用 sudo。

```bash
set -euo pipefail
WORK=/opt/proxy-gateway-minimal-candidate/protected/muse-identity-gate-20261103-v2
DEPS=/opt/proxy-gateway-minimal-candidate/releases/control-plane-2dea45fcbac1-bwh-20261008/node_modules
test "$(basename "$ARCHIVE")" = "m0-identity-gate-v2-4r-bundle-20261103.tar.gz"
REMOTE_ARCHIVE="$WORK/bundle/$(basename "$ARCHIVE")"

ssh bwh 'test "$(id -u)" = 0 && test "$(id -un)" = root && test ! -e /opt/proxy-gateway-minimal-candidate/protected/muse-identity-gate-20261103-v2 && test ! -L /opt/proxy-gateway-minimal-candidate/protected/muse-identity-gate-20261103-v2 && install -d -m 700 -o root -g root /opt/proxy-gateway-minimal-candidate/protected/muse-identity-gate-20261103-v2 /opt/proxy-gateway-minimal-candidate/protected/muse-identity-gate-20261103-v2/bundle /opt/proxy-gateway-minimal-candidate/protected/muse-identity-gate-20261103-v2/work'
scp "$ARCHIVE" "bwh:$REMOTE_ARCHIVE"
LOCAL_SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
REMOTE_SHA="$(ssh bwh "sha256sum '$REMOTE_ARCHIVE'" | awk '{print $1}')"
test "$LOCAL_SHA" = "$REMOTE_SHA"
ssh bwh "tar -xzf '$REMOTE_ARCHIVE' -C '$WORK/bundle'"
ssh bwh "cd '$WORK/bundle' && test \$(wc -l < SHA256SUMS) -eq 18 && sha256sum -c SHA256SUMS"
ssh bwh "test -d '$DEPS' && test ! -e '$WORK/bundle/node_modules' && test ! -L '$WORK/bundle/node_modules' && ln -s '$DEPS' '$WORK/bundle/node_modules'"
```

任何 root 身份、Tailscale SSH/SCP、路径、权限、传输哈希、解包、依赖目录或 18/18 校验失败，立即停止；不得 sudo 回退、改路径、依赖副本或在 BWH 下载/安装依赖。远端命令与 helper 本身不得发起网络请求。

本节所有命令只在第二层授权后执行。第一层执行包签署不授权 BWH 连接、文件传输、目录创建、生产路径读取或快照。

## 6. Phase 0：绑定、依赖与离线 fixture 硬前置

以下仅在 §10 的正式 Gate 单独执行授权生效后执行；执行包签署本身不足以启动本阶段。任何一项不一致都停止，不自动重试、不扩大范围。

### 6.1 目标和发布树绑定

```bash
set -euo pipefail
hostname
readlink -f /opt/proxy-gateway-minimal-candidate/current
```

必须分别匹配：`elegant-box-1.localdomain` 与 `/opt/proxy-gateway-minimal-candidate/releases/control-plane-pr799-eadefd98357a-mixed`。不匹配即 `blocked(target_changed)`。

### 6.2 版本探针

```bash
set -euo pipefail
node --version
node -e 'const Database=require("/opt/proxy-gateway-minimal-candidate/releases/control-plane-2dea45fcbac1-bwh-20261008/node_modules/better-sqlite3"); const pkg=require("/opt/proxy-gateway-minimal-candidate/releases/control-plane-2dea45fcbac1-bwh-20261008/node_modules/better-sqlite3/package.json"); const db=new Database(":memory:"); const sqlite=db.prepare("select sqlite_version() as version").get().version; console.log(JSON.stringify({node:process.version,betterSqlite3:pkg.version,sqlite})); db.close();'
```

版本记录不得包含环境变量。不得运行 `env`、`printenv`、`systemctl show ... Environment` 或任何子串过滤式环境转储。

### 6.3 离线 fixture 硬前置与证据核验

以下测试只使用 `$WORK` 内的合成 DB；不得读取生产 DB、不得创建生产快照、不得执行正式 Identity Gate、不得操作服务/配置/Collector/Timer。第三轮旧回执与第四轮失败回执是历史证据，不替代 v2.4 新增 helper/test 的实际运行。

1. **v2.4 helper fixture：** Y-3/Y-4 修订后的 helper/test commit 完成后，在固定 Node/better-sqlite3/SQLite 栈上执行：

```bash
set -euo pipefail
cd /opt/proxy-gateway-minimal-candidate/protected/muse-identity-gate-20261103-v2/bundle
node --test server/tests/m0-gate-helper-fixture.test.mjs
```

测试必须覆盖：

- 合成 WAL writer 保持打开，基线行已 checkpoint，随后提交一条 WAL-only 绑定；
- `m0-gate-census.mjs` 对 live source DB 的普通只读/WAL-aware census 能读到 WAL-only 行；
- 同一源 DB 经 Online Backup API 生成 snapshot 后，snapshot census 与 live census 的全部字段逐项相等；输出中不存在 `schemaVersion`，并且 `schemaDigest` 相等；
- source DB/WAL 的 bytes、mtime、SHA-256 前后不变；
- SHM sidecar 的存在性、类型、size/mtime/hash 可作为观察项记录；不要求 inode、bytes、mtime 或 hash 前后相等；
- Backup API 返回后、首次 snapshot census 前，快照无 -wal/-shm 侧车且 integrity 为 ok；首次 census 后允许的协调 sidecar 形态仅按 §6.4.2 检查；probe 临时目录已清理；
- 六通道、`otherChannelsTotal`、`bindingRows`、`credentialsTotal`、`accessRequestsTotal` 和两条 equality flags 全部勾稽；输出不含 synthetic refs / UUID / password。

2. **sidecar 合成边界用例：** 覆盖 WAL 存在而 SHM 缺失，以及 WAL/SHM 各自的 symlink、非普通文件拒绝。任何已存在的 sidecar 若为 symlink 或非普通文件，必须在 SQLite open 前失败；不强制 WAL/SHM 成对存在，不因缺少 SHM 或 SQLite 生成 transient SHM 本身失败。

3. **原始 WAL fixture runner：** 归档 runner 的 SHA-256 固定为 `096ca7e2d7a143e3b454f6153b0e22d1641d65de4e5217fb17a17d83bbf4e112`。复跑时必须使用完整仓库 checkout：checker `eb83197e`，snapshot helper 使用经确认的 helper commit，runner 放在 checkout 的 `fixtures/` 下，`better-sqlite3` 使用既有依赖栈。runner 结束后由受控 harness 校验并清理精确的 `fixtures/wal-rerun-work`，验证路径不存在；清理失败即 `blocked(fixture_cleanup)`。不得直接运行一个没有 cleanup 的 runner 后把残留目录留在 checkout。

4. **原始输出固定：** runner、原始 fixture 规范/日志、第三轮回执，以及三份第三轮 raw output 必须纳入最终 18 项 bundle 并固定 SHA-256。缺文件或哈希不符即 `blocked(fixture_evidence)`。

5. **固定依赖版本：** Node `v22.23.1` / better-sqlite3 `12.10.0` / SQLite `3.53.1`。若任一不同，先停止；不得自动安装、下载或替换依赖。上述新增用例仍属合成离线测试，可按 Yi 已声明的同一离线 fixture 授权范围补跑；不扩展为生产读取授权。

两类测试（原始 WAL runner 与 v2.4 helper fixture）均通过、输出白名单满足、18 项 manifest 完整，才可进入正式 Gate 的 Phase 0。任一缺失/失败均 `blocked(fixture)`。

### 6.4 输入文件路径、类型与指纹（只读）

```bash
set -euo pipefail
DB=/opt/proxy-gateway-minimal-candidate/shared/state/subscription-control.sqlite
for f in \
  /etc/xray/config.json \
  /etc/hysteria/config.yaml \
  /etc/mihomo/config.yaml \
  /opt/proxy-gateway-minimal-candidate/shared/state/edge-credential-material.json \
  /etc/gccgw-bwh-catalog/proxy-servers.json \
  /opt/proxy-gateway-minimal-candidate/shared/state/subscription-control.sqlite; do
  test -f "$f" && test ! -L "$f" || exit 31
  stat -c 'file=%n bytes=%s mtime=%y mtime_epoch=%Y uid=%u gid=%g mode=%a' "$f"
  sha256sum "$f"
done

WAL="$DB-wal"
SHM="$DB-shm"
for f in "$WAL" "$SHM"; do
  if [ -e "$f" ] || [ -L "$f" ]; then
    [ ! -L "$f" ] && [ -f "$f" ] || exit 33
    stat -c 'sidecar=%n bytes=%s mtime=%y mtime_epoch=%Y uid=%u gid=%g mode=%a' "$f"
    sha256sum "$f"
  else
    printf 'sidecar_absent=%s\n' "$f"
  fi
done
```

主 DB 必须是普通文件且非 symlink。`-wal` 与 `-shm` 分别检查：每个已存在的 sidecar 必须是普通文件且非 symlink；缺失任意一方不单独触发停止。helper 自身必须在 SQLite open 前后重复执行等价 `lstat` 检查，不能只依赖本 shell 预检。`sha256sum` 会读取文件字节以计算摘要；本流程只记录哈希与元数据，不输出或持久化原始文件内容。

### 6.4.1 Production Source DB 的 SHM 副作用合同（v2.4；按 Y-4 甲裁定）

- 每个已存在的生产 Source DB -wal / -shm sidecar 必须分别是普通文件且非符号链接；不要求 WAL/SHM 成对存在或成对缺失。
- 缺失 SHM 时允许正常只读/WAL-aware census 或 Backup API 连接。SQLite 可能为 WAL 协调创建 transient SHM；该行为是本合同明确披露并接受的临时副作用。
- 对生产 Source DB，主 DB 与 WAL 的存在性、bytes、mtime、SHA-256 必须保持不变；若 WAL 原本缺失而在读取后新出现，或既有 WAL 发生任何变化，立即停止。helper 不主动写入主 DB/WAL。
- 若 SQLite 产生 transient SHM，其必须是普通文件且非符号链接；sidecar 若变为 symlink 或非普通文件，立即停止。
- 不要求 SHM 前后 inode、size、mtime 或 SHA-256 相等；这些字段可作为观察项记录，但不参与四时点稳定性等式或通过条件。
- 上述是经 Yi 正式裁定的生产 Source DB v2.4 合同；固定栈 R8 fixture 已验证合成环境中的实际行为。该验证不等于已执行生产读取。

### 6.4.2 Snapshot census 后的协调 sidecar 合同（仅限 $WORK 内 snapshot）

- 本条只适用于正式 Gate 工作目录 $WORK 内由 Backup API 生成的 snapshot-a.sqlite / snapshot-b.sqlite，不适用于生产 Source DB。
- Backup API 返回后、第一次 snapshot census 前，snapshot 主 DB 必须是普通文件、integrity 为 ok，且 -wal 与 -shm 均不存在。该时点若已有任一 sidecar，即停止。
- 第一次正常只读 snapshot census 后，允许原本 absent 的 -wal 变为普通文件且 size 必须恰为 0 bytes；允许 -shm 出现为普通文件。R8 实测观察到 0-byte WAL 与 32,768-byte SHM；SHM 的 size、mtime、inode、hash 仅作诊断记录，不作为固定值或相等性门槛。
- 已存在的 sidecar 始终必须是普通文件且非符号链接。非零 WAL、任何 symlink/非普通文件、snapshot 主 DB bytes/mtime/SHA-256 变化，均立即停止。
- 每次 snapshot census 前后均记录 sidecar 存在性、类型与可得 metadata/hash；census 后还须验证 WAL 仅为 absent 或 0-byte regular file，SHM 仅为 absent 或 regular non-symlink file。
- 该例外仅描述 $WORK 内 snapshot 的只读协调残留，不是生产 DB/WAL 写入授权，也不扩大 §9.5 的禁止事项。

### 6.5 进程世代与数据面状态

```bash
set -euo pipefail
systemctl show proxy-gateway-candidate.service -p MainPID -p ExecMainStartTimestamp -p NRestarts
systemctl show xray-vless-reality.service hysteria2.service mihomo-tuic.service -p Id -p LoadState -p ActiveState -p SubState -p MainPID -p ExecMainStartTimestamp
```

2026-11-03 CIDR 回执的历史锚点为 candidate MainPID `3203339`、启动时间 `2026-11-02 02:08:50 UTC`、`NRestarts=0`；本轮必须重新读取。与锚点不同，或 A/B 窗口内 PID/启动时间/重启数变化，均停止。三个数据面 unit 预期 `inactive/dead`；状态分类变化即停止。

### 6.6 投影路径与磁盘

```bash
set -euo pipefail
if [ -e /opt/proxy-gateway-minimal-candidate/protected/traffic-evidence/traffic-collector-status.json ] || [ -L /opt/proxy-gateway-minimal-candidate/protected/traffic-evidence/traffic-collector-status.json ]; then
  stat -c 'projection=%n bytes=%s mtime=%Y mode=%a' /opt/proxy-gateway-minimal-candidate/protected/traffic-evidence/traffic-collector-status.json
else
  printf 'projection=not_observed\n'
fi
df -Pk /opt/proxy-gateway-minimal-candidate/protected/muse-identity-gate-20261103-v2
```

工作目录所在文件系统可用空间必须至少 4 GiB（4,194,304 KiB）。只 stat 投影文件；不遍历目录、不读文件内容、不触发 Collector。

## 7. 快照 A/B、三面 Gate 与 JP-01 附则

**执行约束：** 本节 §7.1–§7.4 必须在同一个 root BWH Bash 会话中连续执行；会话开始后立即启用 `set -euo pipefail`。仅在 §10.2 第二层授权生效后执行。

固定变量：

```bash
set -euo pipefail
WORK=/opt/proxy-gateway-minimal-candidate/protected/muse-identity-gate-20261103-v2
BUNDLE="$WORK/bundle"
WORKDATA="$WORK/work"
DB=/opt/proxy-gateway-minimal-candidate/shared/state/subscription-control.sqlite
MATERIAL=/opt/proxy-gateway-minimal-candidate/shared/state/edge-credential-material.json
CATALOG=/etc/gccgw-bwh-catalog/proxy-servers.json
CURRENT=/opt/proxy-gateway-minimal-candidate/current
SNAP_A="$WORKDATA/snapshot-a.sqlite"
SNAP_B="$WORKDATA/snapshot-b.sqlite"
```

### 7.1 采样函数与 A.before / snapshot A

所有采样均使用 UTC 纳秒时间戳。capture_core 比较 current、进程世代、unit 状态、runtime/material/catalog SHA-256、生产 DB/WAL 存在性/大小/mtime；capture_sidecars 记录生产 Source DB sidecar；capture_snapshot 记录 snapshot 主 DB 的 bytes、mtime 和 SHA-256。另以独立函数记录 $WORK snapshot sidecar，避免把生产 WAL 规则与 snapshot census 协调残留混为一谈。

```bash
set -euo pipefail
assert_safe_sidecars() {
  local f
  for f in "$DB-wal" "$DB-shm"; do
    if [ -e "$f" ] || [ -L "$f" ]; then
      [ ! -L "$f" ] && [ -f "$f" ] || return 1
    fi
  done
}
capture_core() {
  assert_safe_sidecars || return 1
  readlink -f "$CURRENT" || return 1
  systemctl show proxy-gateway-candidate.service -p MainPID -p ExecMainStartTimestamp -p NRestarts || return 1
  systemctl show xray-vless-reality.service hysteria2.service mihomo-tuic.service -p Id -p LoadState -p ActiveState -p SubState -p MainPID -p ExecMainStartTimestamp || return 1
  sha256sum /etc/xray/config.json /etc/hysteria/config.yaml /etc/mihomo/config.yaml "$MATERIAL" "$CATALOG" || return 1
  for f in "$DB" "$DB-wal"; do
    if [ -e "$f" ] || [ -L "$f" ]; then
      [ ! -L "$f" ] && [ -f "$f" ] || return 1
      stat -c '%n|%s|%y|%Y' "$f" || return 1
    else
      printf '%s|absent\n' "$f"
    fi
  done
}
capture_source_integrity() {
  assert_safe_sidecars || return 1
  sha256sum "$DB" || return 1
  if [ -e "$DB-wal" ]; then sha256sum "$DB-wal" || return 1; else printf 'wal_sha256=absent\n'; fi
}
capture_sidecars() {
  assert_safe_sidecars || return 1
  local label f
  for label in wal shm; do
    f="$DB-$label"
    if [ -e "$f" ]; then
      stat -c "$label|%n|%s|%y|%Y" "$f" || return 1
      sha256sum "$f" || return 1
    else
      printf '%s|absent\n' "$label"
    fi
  done
}
capture_snapshot() {
  local f="$1"
  stat -c 'snapshot|%n|%s|%y|%Y' "$f" || return 1
  sha256sum "$f" || return 1
}
assert_snapshot_sidecars_safe() {
  local base="$1" label f
  for label in wal shm; do
    f="$base-$label"
    if [ -e "$f" ] || [ -L "$f" ]; then
      [ ! -L "$f" ] && [ -f "$f" ] || return 1
    fi
  done
}
capture_snapshot_sidecars() {
  local base="$1" label f
  assert_snapshot_sidecars_safe "$base" || return 1
  for label in wal shm; do
    f="$base-$label"
    if [ -e "$f" ]; then
      stat -c "$label|%n|%s|%y|%Y" "$f" || return 1
      sha256sum "$f" || return 1
    else
      printf '%s|absent\n' "$label"
    fi
  done
}
assert_snapshot_census_sidecars() {
  local base="$1" wal="$1-wal"
  assert_snapshot_sidecars_safe "$base" || return 1
  if [ -e "$wal" ]; then
    [ "$(stat -c %s "$wal")" = "0" ] || return 1
  fi
}

A_BEFORE_TS="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)" || exit 40
A_BEFORE="$(capture_core)" || exit 41
A_BEFORE_SOURCE="$(capture_source_integrity)" || exit 42
A_BEFORE_SIDECARS="$(capture_sidecars)" || exit 43
printf 'timestamp_utc=%s\n%s\n' "$A_BEFORE_TS" "$A_BEFORE" > "$WORKDATA/a-before.txt"
printf '%s\n' "$A_BEFORE_SOURCE" > "$WORKDATA/a-before-source-integrity.txt"
printf '%s\n' "$A_BEFORE_SIDECARS" > "$WORKDATA/a-before-sidecars.txt"

node "$BUNDLE/scripts/m0-gate-snapshot.mjs" "$DB" "$SNAP_A" > "$WORKDATA/snapshot-a-result.json"
SNAP_A_BASELINE="$(capture_snapshot "$SNAP_A")" || exit 73
printf '%s\n' "$SNAP_A_BASELINE" > "$WORKDATA/snapshot-a-meta.txt"
SNAP_A_SIDECARS_BEFORE="$(capture_snapshot_sidecars "$SNAP_A")" || exit 90
test "$SNAP_A_SIDECARS_BEFORE" = "$(printf 'wal|absent\nshm|absent')" || exit 77
printf '%s\n' "$SNAP_A_SIDECARS_BEFORE" > "$WORKDATA/snapshot-a-sidecars-before-census.txt"
node "$BUNDLE/scripts/m0-gate-census.mjs" "$SNAP_A" > "$WORKDATA/census-a-snapshot.json"
SNAP_A_SIDECARS_AFTER="$(capture_snapshot_sidecars "$SNAP_A")" || exit 91
assert_snapshot_census_sidecars "$SNAP_A" || exit 78
SNAP_A_AFTER_CENSUS="$(capture_snapshot "$SNAP_A")" || exit 92
test "$SNAP_A_AFTER_CENSUS" = "$SNAP_A_BASELINE" || exit 79
printf '%s\n' "$SNAP_A_SIDECARS_AFTER" > "$WORKDATA/snapshot-a-sidecars-after-census.txt"
node "$BUNDLE/scripts/m0-gate-census.mjs" "$DB" > "$WORKDATA/census-a-live.json"
cmp -s "$WORKDATA/census-a-snapshot.json" "$WORKDATA/census-a-live.json" || exit 72
```

snapshot helper 必须报告 ok=true、integrity=ok；Backup API 完成后、第一次 snapshot census 前必须无 -wal/-shm。snapshot census 后的 sidecar 只按 §6.4.2 验证，不再使用“全程无 sidecar”的错误口径。live census 必须在 R8 helper 已通过 §6.3 活动 WAL / schemaDigest 测试后才允许运行；snapshot/live census 必须逐字段一致，不一致即 blocked(snapshot_unproven)。

### 7.2 三面 A Gate 与 A.after

```bash
set -euo pipefail
node "$BUNDLE/scripts/identity-gate-check.mjs" --surface japan-vless --runtime-kind xray --runtime-config /etc/xray/config.json --db "$SNAP_A" --material "$MATERIAL" --node-ref vultr-japan-a > "$WORKDATA/gate-a-japan-vless.json"
node "$BUNDLE/scripts/identity-gate-check.mjs" --surface japan-hy2 --runtime-kind hy2 --runtime-config /etc/hysteria/config.yaml --db "$SNAP_A" --material "$MATERIAL" --node-ref vultr-japan-a > "$WORKDATA/gate-a-japan-hy2.json"
node "$BUNDLE/scripts/identity-gate-check.mjs" --surface japan-tuic --runtime-kind mihomo --runtime-config /etc/mihomo/config.yaml --db "$SNAP_A" --material "$MATERIAL" --node-ref vultr-japan-a > "$WORKDATA/gate-a-japan-tuic.json"
A_AFTER_TS="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)" || exit 44
A_AFTER="$(capture_core)" || exit 45
A_AFTER_SOURCE="$(capture_source_integrity)" || exit 46
A_AFTER_SIDECARS="$(capture_sidecars)" || exit 47
printf 'timestamp_utc=%s\n%s\n' "$A_AFTER_TS" "$A_AFTER" > "$WORKDATA/a-after.txt"
printf '%s\n' "$A_AFTER_SOURCE" > "$WORKDATA/a-after-source-integrity.txt"
printf '%s\n' "$A_AFTER_SIDECARS" > "$WORKDATA/a-after-sidecars.txt"
test "$A_AFTER" = "$A_BEFORE" || exit 48
test "$A_AFTER_SOURCE" = "$A_BEFORE_SOURCE" || exit 49
```

三面输出各自单独保存，不合并比较。任何非零退出、JSON 不可解析、`state=blocked` 或等式失败即停止；不引用 blocked 面的零值作为有效结论。`A.before` 与 `A.after` 的核心指纹必须完全相同。

### 7.3 A/B 之间稳定性监视（至少 30 分钟）

每分钟采样一次，共 30 次。每个样本必须保存 UTC 时间戳、capture_core、生产 capture_sidecars、snapshot A 主 DB 的 size/mtime/SHA-256，以及 snapshot A sidecar 的存在性/类型/可得 metadata。snapshot A 主 DB 指纹必须与 §7.1 在第一次 census 前取得的 baseline 完全一致；snapshot sidecar 每次均须满足 §6.4.2，SHM metadata/hash 不参与相等性判断。

```bash
set -euo pipefail
BASELINE="$A_AFTER"
for n in $(seq 1 30); do
  sleep 60
  SAMPLE_TS="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)" || exit 74
  CURRENT_SAMPLE="$(capture_core)" || exit 50
  CURRENT_SIDECARS="$(capture_sidecars)" || exit 51
  CURRENT_SNAP="$(capture_snapshot "$SNAP_A")" || exit 52
  CURRENT_SNAP_SIDECARS="$(capture_snapshot_sidecars "$SNAP_A")" || exit 80
  assert_snapshot_census_sidecars "$SNAP_A" || exit 81
  test "$CURRENT_SAMPLE" = "$BASELINE" || exit 53
  test "$CURRENT_SNAP" = "$SNAP_A_BASELINE" || exit 54
  printf 'timestamp_utc=%s\n%s\n' "$SAMPLE_TS" "$CURRENT_SAMPLE" > "$WORKDATA/monitor-$n.txt"
  printf '%s\n' "$CURRENT_SIDECARS" > "$WORKDATA/monitor-sidecars-$n.txt"
  printf '%s\n' "$CURRENT_SNAP" > "$WORKDATA/monitor-snapshot-a-$n.txt"
  printf '%s\n' "$CURRENT_SNAP_SIDECARS" > "$WORKDATA/monitor-snapshot-a-sidecars-$n.txt"
done
```

任何采样不同、命令失败或不足 30 分钟，均 blocked(unstable)。不自动重试、不继续 B。每个 monitor 样本必须有独立 UTC 时间戳；snapshot A sidecar 只作安全类型/允许形态检查，不要求 SHM inode、size、mtime 或 hash 恒定。

### 7.4 B.before、快照 B、三面 B Gate 与 B.after

```bash
set -euo pipefail
B_BEFORE_TS="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)" || exit 55
B_BEFORE="$(capture_core)" || exit 56
B_BEFORE_SOURCE="$(capture_source_integrity)" || exit 57
B_BEFORE_SIDECARS="$(capture_sidecars)" || exit 58
printf 'timestamp_utc=%s\n%s\n' "$B_BEFORE_TS" "$B_BEFORE" > "$WORKDATA/b-before.txt"
printf '%s\n' "$B_BEFORE_SOURCE" > "$WORKDATA/b-before-source-integrity.txt"
printf '%s\n' "$B_BEFORE_SIDECARS" > "$WORKDATA/b-before-sidecars.txt"
test "$B_BEFORE" = "$A_AFTER" || exit 59
test "$B_BEFORE_SOURCE" = "$A_AFTER_SOURCE" || exit 60
node "$BUNDLE/scripts/m0-gate-snapshot.mjs" "$DB" "$SNAP_B" > "$WORKDATA/snapshot-b-result.json"
SNAP_B_BASELINE="$(capture_snapshot "$SNAP_B")" || exit 82
printf '%s\n' "$SNAP_B_BASELINE" > "$WORKDATA/snapshot-b-meta.txt"
SNAP_B_SIDECARS_BEFORE="$(capture_snapshot_sidecars "$SNAP_B")" || exit 93
test "$SNAP_B_SIDECARS_BEFORE" = "$(printf 'wal|absent\nshm|absent')" || exit 83
printf '%s\n' "$SNAP_B_SIDECARS_BEFORE" > "$WORKDATA/snapshot-b-sidecars-before-census.txt"
node "$BUNDLE/scripts/m0-gate-census.mjs" "$SNAP_B" > "$WORKDATA/census-b-snapshot.json"
SNAP_B_SIDECARS_AFTER="$(capture_snapshot_sidecars "$SNAP_B")" || exit 94
assert_snapshot_census_sidecars "$SNAP_B" || exit 84
SNAP_B_AFTER_CENSUS="$(capture_snapshot "$SNAP_B")" || exit 95
test "$SNAP_B_AFTER_CENSUS" = "$SNAP_B_BASELINE" || exit 85
printf '%s\n' "$SNAP_B_SIDECARS_AFTER" > "$WORKDATA/snapshot-b-sidecars-after-census.txt"
node "$BUNDLE/scripts/m0-gate-census.mjs" "$DB" > "$WORKDATA/census-b-live.json"
cmp -s "$WORKDATA/census-b-snapshot.json" "$WORKDATA/census-b-live.json" || exit 75
cmp -s "$WORKDATA/census-a-snapshot.json" "$WORKDATA/census-b-snapshot.json" || exit 76
node "$BUNDLE/scripts/identity-gate-check.mjs" --surface japan-vless --runtime-kind xray --runtime-config /etc/xray/config.json --db "$SNAP_B" --material "$MATERIAL" --node-ref vultr-japan-a > "$WORKDATA/gate-b-japan-vless.json"
node "$BUNDLE/scripts/identity-gate-check.mjs" --surface japan-hy2 --runtime-kind hy2 --runtime-config /etc/hysteria/config.yaml --db "$SNAP_B" --material "$MATERIAL" --node-ref vultr-japan-a > "$WORKDATA/gate-b-japan-hy2.json"
node "$BUNDLE/scripts/identity-gate-check.mjs" --surface japan-tuic --runtime-kind mihomo --runtime-config /etc/mihomo/config.yaml --db "$SNAP_B" --material "$MATERIAL" --node-ref vultr-japan-a > "$WORKDATA/gate-b-japan-tuic.json"
B_AFTER_TS="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)" || exit 61
B_AFTER="$(capture_core)" || exit 62
B_AFTER_SOURCE="$(capture_source_integrity)" || exit 63
B_AFTER_SIDECARS="$(capture_sidecars)" || exit 64
printf 'timestamp_utc=%s\n%s\n' "$B_AFTER_TS" "$B_AFTER" > "$WORKDATA/b-after.txt"
printf '%s\n' "$B_AFTER_SOURCE" > "$WORKDATA/b-after-source-integrity.txt"
printf '%s\n' "$B_AFTER_SIDECARS" > "$WORKDATA/b-after-sidecars.txt"
test "$B_AFTER" = "$B_BEFORE" || exit 65
test "$B_AFTER_SOURCE" = "$B_BEFORE_SOURCE" || exit 66
CURRENT_SNAP_A="$(capture_snapshot "$SNAP_A")" || exit 68
CURRENT_SNAP_B="$(capture_snapshot "$SNAP_B")" || exit 69
test "$CURRENT_SNAP_A" = "$SNAP_A_BASELINE" || exit 70
test "$CURRENT_SNAP_B" = "$SNAP_B_BASELINE" || exit 71
CURRENT_SNAP_A_SIDECARS="$(capture_snapshot_sidecars "$SNAP_A")" || exit 86
assert_snapshot_census_sidecars "$SNAP_A" || exit 87
CURRENT_SNAP_B_SIDECARS="$(capture_snapshot_sidecars "$SNAP_B")" || exit 88
assert_snapshot_census_sidecars "$SNAP_B" || exit 89
printf '%s\n' "$CURRENT_SNAP_A_SIDECARS" > "$WORKDATA/snapshot-a-sidecars-final.txt"
printf '%s\n' "$CURRENT_SNAP_B_SIDECARS" > "$WORKDATA/snapshot-b-sidecars-final.txt"
```

A/B 三面计数及状态按正式 Gate 口径记录；A/B census 的 schemaDigest、六通道计数、otherChannelsTotal、accessRequestsTotal、bindingRows、bindingProjectionDigest 与 equalities 必须逐项一致。schemaVersion 不在 census 输出中，不参与比较。snapshot A/B 主 DB 的 bytes/mtime/SHA-256 必须分别与各自 Backup 后、首次 census 前的 baseline 相同；snapshot sidecar 只须满足 §6.4.2。生产 Source DB/WAL 四时点指纹仍须严格相等。

§7 新增退出码如下；其余既有退出码保持原义。退出码不得跨失败条件复用：

| Exit | 唯一失败含义 |
| ---: | --- |
| 72 | A 阶段 snapshot census 与 live census 不一致 |
| 73 | Snapshot A Backup 后无法采集主 DB baseline |
| 74 | 某个 monitor 样本无法取得 UTC 时间戳 |
| 75 | B 阶段 snapshot census 与 live census 不一致 |
| 76 | A/B 两份 snapshot census 不一致 |
| 77 | Snapshot A 首次 census 前 sidecar 不为空或类型不安全 |
| 78 | Snapshot A census 后 sidecar 超出 §6.4.2 允许形态 |
| 79 | Snapshot A 主 DB 指纹在 census 后发生变化 |
| 80 | Monitor 样本无法采集 Snapshot A sidecar |
| 81 | Monitor 样本的 Snapshot A sidecar 超出 §6.4.2 允许形态 |
| 82 | Snapshot B Backup 后无法采集主 DB baseline |
| 83 | Snapshot B 首次 census 前 sidecar 不为空或类型不安全 |
| 84 | Snapshot B census 后 sidecar 超出 §6.4.2 允许形态 |
| 85 | Snapshot B 主 DB 指纹在 census 后发生变化 |
| 86 | 最终核对无法采集 Snapshot A sidecar |
| 87 | 最终核对 Snapshot A sidecar 超出 §6.4.2 允许形态 |
| 88 | 最终核对无法采集 Snapshot B sidecar |
| 89 | 最终核对 Snapshot B sidecar 超出 §6.4.2 允许形态 |
| 90 | Snapshot A 首次 census 前 sidecar metadata/hash 无法采集 |
| 91 | Snapshot A census 后 sidecar metadata/hash 无法采集 |
| 92 | Snapshot A census 后主 DB 指纹无法采集 |
| 93 | Snapshot B 首次 census 前 sidecar metadata/hash 无法采集 |
| 94 | Snapshot B census 后 sidecar metadata/hash 无法采集 |
| 95 | Snapshot B census 后主 DB 指纹无法采集 |

### 7.5 JP-01 DB-only 附则

从 `census-a-snapshot.json` 与 `census-b-snapshot.json` 记录三条 JP-01 channel 的 `perChannel` 数值。两份快照对应的三项均须为 0；任一非零即停止并报告。不得执行 JP-01 runtime checker，也不得把此附则写成 JP-01 runtime 已验证。

## 8. 稳定读取边界与判定规则

### 8.1 双层指纹、四时点时间戳与 snapshot 物理证据

- 物理快照证据：Backup API 方法、snapshot A/B 主 DB bytes、mtime（同时保留 UTC 可读时间和 epoch）、SHA-256、integrity、journalMode；生产 Source DB/WAL 的存在性、size、mtime 与 SHA-256；生产 SHM 与 snapshot A/B sidecar 的存在性、regular-file / non-symlink 与可得 metadata/hash 观察。Snapshot sidecar 在首次 census 前必须 absent，之后只允许 §6.4.2 的 0-byte WAL / regular SHM 协调形态。
- 身份稳定指纹：`schemaDigest`、`credentialsTotal`、`perChannel` 六项、`otherChannelsTotal`、`accessRequestsTotal`、`bindingRows`、`bindingProjectionDigest`、`equalities`。`schemaVersion` 不输出、不比较、不进入身份指纹。
- 四个采样点必须分别记录 UTC 时间戳：
  1. `A.before`：snapshot A 之前；
  2. `A.after`：snapshot A、A census 和三面 A Gate 完成之后；
  3. `B.before`：至少 30 分钟监视结束后、snapshot B 之前；
  4. `B.after`：snapshot B、B census 和三面 B Gate 完成之后。
- 30 个 monitor 样本每个都必须独立记录 UTC 时间戳、core fingerprint、sidecar metadata、snapshot A size/mtime/SHA-256。
- 四个采样点的 core/source-integrity fingerprint 必须相等；四个 UTC 时间戳本身应分别记录并按实际执行顺序递增，不要求时间戳彼此相等。30 个 monitor 样本的 core fingerprint 与 `A.after` 一致；snapshot A 在整个监视和 B 阶段的 bytes/mtime/SHA-256 完全不变；snapshot/live census 在 A、B 各自逐字段一致；A/B 身份指纹逐项相等。
- SHM 不进入稳定性相等式；缺失时 SQLite 可能创建 transient SHM，内容/mtime/inode 不要求前后不变。只要求任一已存在或新出现的 sidecar 是普通文件且非符号链接。主 DB 与 WAL 不允许变化。
- `bindingRows = credentialsTotal` 和 `六条指定 channel 计数之和 + otherChannelsTotal = credentialsTotal` 任一不成立，工具或边界异常，整体 blocked。

### 8.2 Identity Gate 状态与 M0 后果

- `verified`：`missing`、`stale`、`changed`、`missing_material` 全为 0 且两条 Gate 等式成立。三面全 verified 仅表示本 Gate 项通过；M0 是否解除仍由第 3 步 Yi 最终裁定，本包不预断。
- `degraded`：差异计数存在但检查有效。按裁定 (c)，**M0 继续 BLOCKED**，不进入 M1–M8；stale 处置另案。
- `blocked`：输入无效、fixture/snapshot 不可信、unstable、JP-01 附则非零、命令失败或等式不成立。整体检查未完成，不输出单面 verified/degraded 结论。
- 投影路径缺失只记录 `not_observed`，不等待、不修复、不据此判 Gate 失败；本 Gate 不代表 Collector 已恢复。
- 当前独立 retention inventory 的 256 条 RETAIN 只作为外部旁证；本轮不读写 retention 工作底稿，不以“让 Gate 变绿”为目的删除或改变任何记录。

## 9. 脱敏输出白名单、停止条件与副作用边界

### 9.1 允许带出 BWH 的内容

聚合计数、两条等式结果、状态、文件/指纹/摘要 SHA-256、文件大小、mtime、时间戳、进程世代标识（PID 与启动时刻）、unit 状态分类、快照 integrity/journalMode、工作目录清理结果。

### 9.2 允许的进程内读取、比较与严格输出白名单

本 Gate 不采用“不得读取任何数据”的不可能合同。允许且仅允许固定 checker/helper 在进程内读取本包 §1 / §6 明确列出的输入，并完成下列比较：

- Runtime config：读取三份指定配置文件的相关 VLESS / HY2 userpass / TUIC principal 字段；只在内存中解析。
- Protected material：读取指定 `edge-credential-material.json` 中规范化的 credentialRef、UUID、password、materialDigest；只在内存中建立索引。
- DB resolver inventory：checker 只读取所选单一 channel 的 eligible / retained binding 及必要的 materialDigest 元数据；census 只读取 schema metadata、指定 binding 表的 channel/ref 投影、总数和 access request 总数。不得扩大到输入清单之外的表、数据库或 channel。
- 比较：在进程内对齐 runtime principal、DB binding 与 protected material；计算数量、差异类别、等式和摘要。raw values 只能存在于进程内完成比较，不得写入 stdout、stderr、回执、临时文件、shell history 或审计附件。
- 唯一允许的输出：checker §3.1 白名单字段；census §3.1 / §7 白名单聚合字段、equality flags、schema/binding SHA-256 digest、安全错误码；文件指纹、大小、mtime、UTC 时间戳、进程世代、unit 状态和清理结果。

禁止输出、导出、复制或持久化 UUID、username/email、credentialRef/materialRef 原文、password、controller payload、原始配置、数据库行、用户数据、订阅材料、token/secret 或任何 env 值。禁止 `env`、`printenv`、`systemctl show ... Environment`、`cat` 环境文件和子串过滤式 env dump。checker 内部设置 `SQLITE_USE_URI=1` 仅用于 SQLite URI 解析，不得因此转储进程环境。

### 9.3 停止条件

- 主机名/current 目标、checker 8 文件哈希、v2.4 helper/test 新 commit 或哈希、依赖版本不符。
- 原始 fixture 文件、runner、第三轮回执或三份 raw output 缺失，SHA 未固定，任何离线 fixture 未通过。
- 输入缺失、主 DB/WAL/SHM 为 symlink 或非普通文件；任何已存在的 sidecar 不符合 regular-file / non-symlink 要求。WAL/SHM 单边存在本身不构成停止条件。
- snapshot 失败、Backup API 完成后首次 census 前 snapshot 已出现 -wal/-shm 侧车、integrity 非 ok、snapshot/live census 不一致。首次 snapshot census 后的 sidecar 不按“必须始终 absent”判定，改按 §6.4.2：仅 absent→0-byte regular WAL 与 regular non-symlink SHM 可接受。
- 生产 Source DB/WAL 的存在性、bytes、mtime、SHA-256 任一变化；任何生产或 snapshot sidecar 为 symlink / 非普通文件。Snapshot census 后出现非零 WAL 不允许；仅 §6.4.2 所述 0-byte WAL 与 regular SHM 协调残留不构成单独停止条件。
- SQLite sidecar 行为超出 §6.4.1 / §9.4 的明确范围，或新出现的 sidecar 为 symlink / 非普通文件。无需证明 SHM inode 前后相同。
- JP-01 三通道任一计数非零。
- candidate PID/启动时间/NRestarts 变化；数据面 unit 状态分类变化；current 目标变化。
- runtime 配置/material/catalog 指纹漂移；snapshot A bytes/mtime/SHA-256 变化；生产 DB/WAL 存在性或大小/mtime/SHA 漂移。
- 任一 shell 子命令、命令替换、`capture_core`/`capture_sidecars` 采样函数非零退出；检查器非零退出、输出不可解析、任一等式不成立。
- SSH alias 不再解析为 root + `id_ed25519_bwh`，远端 UID 不是 0，或传输不经过 Tailscale `ssh bwh` / `scp bwh:` 通道。
- BWH 侧任何非本包 Gate/helper 的主动网络请求、下载、安装依赖或外部 API 请求。
- 未取得 §10 正式 Gate 单独执行授权却尝试执行 §5–§9 任一命令。
- 任何需要写入生产 DB/WAL、配置、unit、服务、Timer、Collector、retention，或读取输入清单之外数据的动作。

### 9.4 唯一允许的临时写入与 SQLite 协调副作用

只有在 §10.2 正式 Gate 单独执行授权生效后，才允许在精确 $WORK 内创建 bundle、node_modules symlink、合成 fixture、snapshot A/B、聚合 JSON/哈希/监视记录。测试合成数据必须位于 $WORK 内并在测试后清理。

**A. Production Source DB（生产路径）**

- 唯一额外允许的临时副作用是 SQLite 3.53.1 在正常 WAL-aware read-only census / Backup API 连接期间，对既有 SHM 执行短暂锁/读标记协调；若 SHM 原本缺失，SQLite 可能创建 transient regular-file SHM。
- 主 DB 与 WAL 的存在性、bytes、mtime、SHA-256 必须保持不变；不允许因本条创建新 WAL，也不允许修改既有 WAL。
- 不要求 SHM inode、bytes、mtime 或 SHA-256 前后恒定；但任何已存在或新出现的 sidecar 必须为普通文件且非符号链接。

**B. $WORK 内 Backup Snapshot（仅本地快照路径）**

- Backup API 返回后、首次 snapshot census 前，snapshot 主 DB 必须 integrity=ok，且 WAL/SHM 均 absent。
- 首次正常只读 snapshot census 后，允许原本 absent 的 WAL 出现为 0-byte regular file；允许 SHM 出现为 regular non-symlink file。R8 观察到的 SHM size 为 32,768 bytes，仅作实际观察，不是固定要求。
- Snapshot 主 DB bytes/mtime/SHA-256 必须不变；WAL 若出现必须恰为 0 bytes；任何非零 WAL、symlink 或非普通 sidecar 均 fail-stop。SHM metadata/hash/inode 不作恒定要求。
- 每次 snapshot census 前后均记录 sidecar 存在性、类型与可得 metadata/hash；30 分钟监视期间持续验证允许形态。结束时所有 $WORK 内容按 §9.6 清理。

Snapshot 的 0-byte WAL / transient SHM 是 $WORK 内 SQLite 只读协调残留，不是生产 DB/WAL 写入授权，不扩大生产数据、副作用或网络边界。任何临时写入若需要超出 $WORK 或超出上述精确定义的 SQLite 协调行为，立即停止。

### 9.5 明确禁止的副作用

不写生产数据库/WAL、不修改配置、不启停/重载服务、不触发 Collector/Timer、不恢复三个 staged 服务、不修复投影写入方、不触碰 retention 工作底稿（原定独立处理期限 2026-11-09）、不创建 JP-01 实例、不接入真实流量。BWH 不得主动联网；仅允许由可信工作站经 Tailscale `ssh bwh` / `scp bwh:` 上传 bundle 与取回脱敏输出。

### 9.6 收尾与销毁

完整回执先保存至已批准的审计位置（脱敏摘要 + 完整受控附件），并记录工作目录清理前的哈希清单。随后核对 `$WORK` 是普通目录且 realpath 精确等于固定路径，再删除整个 `$WORK` 并验证不存在。不得删除 `$WORK` 之外任何文件。

## 10. 回执内容、两级授权与最终裁定

正式执行后的回执必须包括：

1. 主机名、current 目标、远端 `id -u` / `id -un`、本地 SSH alias 的 user/identityfile 核验结果、冻结文件 SHA-256、依赖版本探针。
2. 18 项 manifest 的完整 SHA256SUMS；原始 fixture 规范/日志/第三轮回执、runner、三份第三轮 raw output 的 SHA-256；helper fixture 新增动态测试的完整通过/失败记录。
3. A/B snapshot 结果、snapshot bytes/mtime/SHA-256、物理指纹、身份指纹、snapshot/live census 逐字段比对。
4. `A.before`、`A.after`、`B.before`、`B.after` 四时点 UTC 时间戳与原始脱敏采样；30 个 monitor 样本各自的 UTC 时间戳；snapshot A SHA-256/mtime 全程不变证据。
5. DB/WAL 前后 bytes/mtime/SHA-256；sidecar 存在性、regular-file / non-symlink 结果与可得 metadata/hash 观察（不要求 SHM inode 或 hash 恒定）。
6. 三面 A/B 输出、两条 Gate 等式、最终状态。
7. JP-01 三通道 A/B DB-only 计数；投影路径 stat 结果。
8. retention 独立旁证来源与日期（不混入 checker 输出）。
9. 临时目录销毁记录、root 身份核验、传输哈希、18/18 SHA256SUMS 与脱敏校验回执。

回执保存到项目既定 hidden_files/files 位置，并同步 Google Drive「M0 审批与回执」与 Notion 进度页；不得写入凭据或 secret。

### v2.4 签署前核对项与未关闭事项（不得签署）

1. Snapshot census 后 sidecar 合同已按 R8 证据对齐至 §6.4.2、§7.1–§7.4、§8.1、§9.3–§9.4 及决策附录。2026-11-04 完整文档静态复核已完成；两份文档 SHA-256 统一由 Notion/审批回执外部锚定，不在任一文件中互相嵌入，以避免自引用/互引用循环。任何后续字节修改均须重算并更新外部哈希锚点。
2. R8 回执未提供本轮 WAL runner harness 版本/哈希及退出后精确 realpath、清理前后原始记录；正式 Gate 前须补齐受控 harness 绑定与清理证据，不能以 R6 或 R7 的清理记录外推 R8。
3. R8 的三份 raw output 已分别固定 SHA-256，但不属于 R8 18 项 manifest；R8 manifest 中三份 raw output 是 R3 历史原件。两组证据必须保持区分，不得覆盖或混写。
4. R8 18 项 manifest/tarball 已独立复核 18/18，R6 历史 manifest/tarball 保持不变；不得因本次文档修订重建或覆盖任一冻结包。
5. Helper/Checker 不在本轮授权修改范围内；本轮复核与修订仅限两份 Draft 文档，不改代码、不触发 CI、不连接 BWH、不读取生产 DB、不执行正式 Gate。



### 2026-11-04 文档静态复核记录（已完成）

- 对象：本执行包与同分支 Y-3/Y-4 决策附录；核对 R8 回执、冻结包锚点、sidecar 合同、Shell 命令顺序、退出码和签署边界。
- Bash 语法：当前执行包 15 个 Bash fenced blocks 全部 `bash -n` 通过（15/15）；只做语法检查，没有执行任何块内命令。
- 退出码：修订后 58 个 `exit` 使用点为 58 个唯一值；Snapshot A/B 的 sidecar/主 DB 指纹采集失败与策略不满足分别使用不同退出码（90–95 与 77–79 / 83–85 分离）。
- 发现并修正：§6.4 显式初始化 DB 路径；明确 SHA-256 计算读取字节但不输出原始内容；拆分 6 组重复退出码；移除文档内过期的相互哈希引用，改由 Notion/审批回执外部锚定。
- 合同复核：Snapshot census 后 sidecar 规则与决策附录一致；R6/R8 冻结包及 R8 三份补充 raw output 的 manifest 外关系保持区分。
- 结论：文档静态复核 PASS；但 R8 runner harness 版本/哈希、退出后精确 realpath、清理前后原始记录仍未在 R8 回执/已检索的 Notion 与 Drive 证据中找到，仍是第一层签署前置缺口。不得用 R6/R7 清理记录外推 R8。
- 边界：仅进行文档读取、静态检查和 Draft 文档修订；未修改 Helper/Checker，未触发 CI，未连接 BWH，未读取生产 DB，未执行正式 Identity Gate。

### 10.1 Yi 执行包审查/签署（第一层；当前留空）

- 执行包版本：v2.4（R8 选定签署候选）
- 签署线：R8；HEAD 9b4bff888e6eb7b4c4545b1f005a32e24855ab9e。R6 仅保留为历史冻结线。
- D-1：方案甲（已确认）
- D-2：eb83197e47155943087655ff7d4aad7a6c954849（已确认）
- D-3：先测量、后裁定（已确认）
- 固定栈离线验收：R8 helper fixture PASS（1/1）、原始 WAL runner PASS（ok=true、failures=[]）、直接 census PASS；Node v22.23.1 / better-sqlite3 12.10.0 / SQLite 3.53.1。
- Helper/Test SHA-256：census 3351443a84f7ff0b99ddde73bb8defc28a6fc3226935a1719ef216e4a5d7056c；snapshot fb3ea4a3bcb91f878e39b30a2c45be1ec78003c10aa710cef3270e8d8a5010f0；test 12c8dd1722fe6ef129f7a6177a76d4e80a087ab1dd4f24ea302aab402f1f9e8c。
- R8 18 项 manifest：18/18 PASS；tarball 50,190 bytes；SHA-256 6de61f665174106fc6a22fa45e011b14b084094380a8445239c1cbba10873a22。R6 历史包保持独立。
- R8 三份补充 raw output SHA-256：helper-test a4d910d8d69acaee1bcbd8cadea1decc9c1c286eaced6bf16e6163df4d240a16；WAL runner 938545287c4c52a15e782f2c148b15326a9936584b8f911669990b4129a70254；census ddaef37761f35af06b4f5a3dda84b5dd8b69521bdb53a403eb0b088293e27921。三份 R8 raw output 不属于 18 项 manifest。
- 第二轮独立终审：已选择 R8；Snapshot census 后 sidecar 合同文档对齐已完成；2026-11-04 完整文档静态复核 PASS。R8 runner harness/清理证据仍待补齐。
- Yi 执行包审查/签署：____________________ 日期：____________________

**第一层签署的效力仅为确认 v2.4 执行合同及其固定内容；不授权 BWH 连接、目录创建、文件传输、生产路径读取、生产快照或 Gate 执行。**

### 10.2 正式 Identity Gate 单独执行授权（第二层；当前未授权、留空）

只有在 10.1 完成且 Yi 另行明确授权后，才允许执行 §5–§9。授权记录必须逐项填写并绑定本 v2.4 文件的外部 SHA-256（该值在文件发布后记录于 Notion/审批回执，避免文件自引用）：

- 执行包版本及 SHA-256：____________________
- 目标主机：`elegant-box-1.localdomain`（实际核验值不符即停止）
- 唯一允许的 `$WORK`：`/opt/proxy-gateway-minimal-candidate/protected/muse-identity-gate-20261103-v2`
- 授权操作范围：通过 Tailscale `ssh bwh` / `scp bwh:` 传输 bundle 与取回脱敏输出；root 身份核验；工作目录创建；§6 只读环境/输入前置与合成 helper fixture；§7 snapshot A/B、live/snapshot census、三面文件态 Gate、四时点/30 分钟监视及收尾销毁；仅允许 §9.4 明确规定的既有 SHM 协调副作用
- 最大执行次数：1 次；执行或停止后授权耗尽
- 授权有效时间窗：____________________ 至 ____________________
- 执行人：Muse
- Yi 正式 Gate 单独授权原文/签署：____________________ 日期：____________________

以上任一关键字段缺失、包 SHA-256 不匹配、授权过期或授权范围不覆盖拟执行动作，均不得执行。重跑、改主机、改路径、改包内容或扩大范围，必须重新取得授权。

### 10.3 M0 最终裁定（第三层；须在 Gate 回执完成后单独作出）

- Gate 结果：待执行
- M0 最终状态：`BLOCKED`（当前状态；不得预判解除）
- Yi 最终裁定：____________________ 日期：____________________

**当前结论：M0 继续 BLOCKED。R8 离线验收与 18 项冻结包已完成并被选为唯一正式签署候选；执行包与决策附录的 Snapshot sidecar 合同已对齐，2026-11-04 完整文档静态复核 PASS；但 R8 runner harness/清理证据仍未补齐。第一层执行包签署、第二层正式 Gate 执行授权和 Gate 本身均未发生；本包不构成生产放行。**
