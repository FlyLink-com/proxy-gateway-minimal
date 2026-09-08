# SGP Xray 重复应用修复与计量恢复顺序

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: xray_idempotent_runtime_rollout
  superseded_by: null
  last_verified_at: 2026-09-07
  production_authority: false
```

- Risk: B source core / A production envelope；本文件是同一修复 PR 的部署边界，不授予生产权限。
- Process: 最小源码修复及边界测试 -> 新 source/artifact -> SGP 精确替换和稳定观察 -> 继续已批准的控制面/计量恢复。
- Expected PR count: 1；实现、测试和本文同 PR，不另拆 spec、框架或角色审批 PR。
- Validation: changed-boundary targeted tests、既有 `npm test` / CI、diff check；生产须另有精确输入绑定、备份及实际读回。
- Production/AWS impact: SGP 已有 Xray 执行器的幂等行为；不创建节点、账号或身份，不追扣历史流量，不变更 Portal、支付、DNS 或公网规则。
- release_unit: `sgp-runtime-config`；共享源码后续由控制面加载时单独记录 `control-plane-app` 结果，不把 source carrier 当成已发布单元。
- identity_impact: true；`identity_gate.surface: sgp-vless`，源代码 PR 的 gate 保持 pending，部署时记录 aggregate before/after 与 retention state。

## 故障与修复合同

修复前的 [Xray adapter](../../server/services/edge/xray-vless-reality-runtime-adapter.mjs)
在配置测试成功后执行 backup、replace 和 restart，没有同配置健康短路。
[生产 edge-agent](../../agent/production-edge-agent.mjs) 会使用该 adapter
应用 desired state，因此重复应用可能重复启动 Xray；这不是数据库计量恢复代码
本身能修复的连续性问题。

本次只闭合以下合同，测试与 PR 填写实际结果，不把清单当作已通过：

- 同一预期配置且服务、监听健康：返回成功的未变更结果，不替换 active config、
  不产生配置备份、不 restart。重复调用保持实际身份与统计连续性。
- no-op 比较使用本次读取的完整 JSON 配置；对象键顺序和空白可不同，数组顺序与
  任一有效字段变化仍有意义。active 文件须是有界 regular file，以 fd 读取并核对
  lstat/fstat 的 dev、inode、size、mtime、ctime 前后不变，不接受 symlink 或读时漂移。
- no-op 仍对 **active 文件**执行 `xray run -test -config <active>`，不先写 candidate；
  只有真实测试成功才返回 `configTest.ok=true`。服务健康、TCP 监听和运行配置加载
  证明三者都不可省略，不能仅凭 desired generation 或磁盘字节相同跳过应用。
- 加载证明绑定 `systemctl show --timestamp=us+utc` 的 MainPID 和六位小数 UTC
  ExecMainStartTimestamp；启动时间不得早于 active 文件的 mtime/ctime。配置测试
  前后要求同 PID/启动时间的 sandwich、同一 active 配置和已加载证明，漂移即失败。
  config-test 后还须重新核验只读 service/TCP 健康，不能将测试前的监听结果当作
  最终成功证据；任一后验失败保持零写。
  部署包还须验证实际 ExecStart 的配置输入就是该 active 文件，不能把时间比较
  宣称为任意服务入口的通用配置加载证明。
- 配置真实变化：保留原配置测试、备份、替换、重启及健康核验语义；不以幂等判断
  掩盖客户端、stats 配置或其他有效配置变化。
- 配置相同但服务/监听不健康：保留原修复/失败路径，不能仅凭相等就报健康成功。
- 上次 replace 成功但 restart 失败时，旧进程启动早于新文件时间，不能误报 unchanged；
  完整观测证实尚未加载时仍走正常应用路径。不存在 active 文件也保留原首次应用路径。
- 只读探针命令失败、时间戳不可解析、文件读失败/漂移或身份不明：失败并零写入，
  不替换配置、不备份、不重启。未知结果与完整证据确认的 inactive/缺监听/未加载
  分开处理，不新增无限重试或自动签发身份。
- adapter 的脱敏 receipt 与 agent 的 applied/failed 消费保持兼容；不泄露 config、
  私钥、客户 principal 或 material。

`unchanged` 必须同时通过两条消费路径：SGP 现役 agent 的 receipt 转换，以及控制面
credential-reconciliation gateway 的合法/成功状态集合和后续 runtime validation
动作；不能只验 agent 协议而使本地 gateway 把成功 no-op 判为失败。控制面的
data-plane receipt 存储继续按已有合同将 `unchanged` 映射为 applied，并记录
unchanged count，不增加实际 add/revoke 次数。SGP 本次最小部署只更新确认在其
加载链中的 adapter；gateway 的源码兼容修正随后续控制面制品部署，不复制整份旧 agent。

`NRestarts=0` 只说明 systemd 没有累计自动重启，不能排除显式 stop/start。
稳定性同时绑定 boot、MainPID、进程 start ticks、启动时间及实际启动记录。

2026-09-07 操作员控制器的只读记录确认 SGP 为 Node `22.22.3`、systemd `255`，
实际支持 `--timestamp=us+utc` 的六位小数输出；wrapper 默认每 30 秒新启动一次
Node。现役 Xray adapter 在 CRLF 归一化后与本次修复前 `135f912a…` 源码一致，
没有该文件的语义定制；现役 production-agent 则是较旧版本，不能整文件升级。
精确 raw/normalized hash、wrapper/import 路径由部署包绑定，不在本文复制。
这些是带日期的兼容性记录，不证明当前健康或新修复已加载。

## 新修复制品与最小 SGP 部署绑定

[Release Flow](../../RELEASE_MANIFEST.md) 的 Source、Merge、Artifact、Production
Gate 分别成立。2026-09-07 本轮修复从 `135f912a8bf23cddac5217fa4eba4e179489483f`
开始；此前准备的 `control-plane-135f912a8bf2-ingress-0d763c58` 不是含本修复的
新 release。不得覆盖它、给它更名后宣称已包含修复，或复用其已消费执行授权。

合并后取包含修复的精确新 master source artifact，核对 manifest、archive SHA/size、
文件 hash 和可检索性。[source artifact workflow](../../.github/workflows/release-artifact.yml)
的 ZIP 是源码载体，并不带生产 `.env` 或受保护 `config/proxy-servers.json`；
不能把它整体覆盖 SGP 当前目录。按以下最小元组冻结执行包：

1. **来源**：修复 PR/head、实际 merged source、artifact/run/manifest SHA、精确
   changed-file/import closure、目标 Node 版本和依赖兼容证明。只更新一个 adapter
   时必须证明其他导入依赖无变化；有新依赖则扩展明确文件清单，不能偷用旧 closure。
2. **执行位置**：fresh 读取 SGP agent 的 unit/timer、ExecStart、WorkingDirectory、
   实际脚本/import 路径及 canonical path/inode/owner/mode/hash；不得假定 Japan
   `current`、旧 SGP 路径或源码仓库就是正在加载的位置。
3. **现有定制**：保护 SGP 本地 customizations、wrapper、env 文件、runtime config、
   stats 设置、受保护 material/map、服务 owner/mode 和其他协议文件。记录未变更
   文件/字段的前后摘要。源码 carrier 缺失的受保护文件必须保留，不能以默认文件填补。
   如定制与修复文件重叠，先做精确三方合成并绑定合成后 hash；禁止盲目覆写。
4. **运行身份与统计**：冻结 config principal 集合与 material/map 的 aggregate gate，
   listener/StatsService/loopback 绑定、binary 身份及非清零统计连续性证据。
   不新发身份、不重建 usage map、不清零 stats、不删除 cursor，也不复制生产材料到本地。
5. **执行和回退**：新 run、精确目标、有效授权、单次切换/启动预算；备份实际要替换的
   文件及其元数据和现役可恢复入口。只读操作与写操作显式分开，无自动重复执行。

source 验证使用合成材料与注入式 runner；不把生产 SGP 当测试环境。既有 Linux/CI
证据只在其 source、依赖及合同未变化的范围内复用；不能用旧 `135f…` 测试证明
新幂等分支，也不用为本修复重跑不相关的整套发布框架。

## 已批准执行中的顺序和停止条件

1. 主计量 timer/service 保持停用；SGP TUIC sidecar 的原状态保持不变。先复核新的
   SGP 执行包和全部前置绑定，再处理真正会重复加载该 adapter 的 agent 执行入口。
   若需要短暂停 agent poller 以排除文件替换并发，将精确 unit 和恢复原状态列入
   执行边界；不能连带停止 SGP TUIC 或其他协议。
2. 备份后只替换冻结文件清单，保留其余定制。确保下一次实际 agent 调用加载的是
   新模块；长驻 Node 进程不能只看磁盘 hash，需证明 import 生命周期或按已批准的
   单次启动预算加载新源码。不为安装源码主动重启健康且同配置的 Xray。
3. 观察至少三个已完成的自然 poll 周期，窗口应覆盖原重复应用周期：同 desired state
   下配置/身份摘要稳定、MainPID/start ticks 不变、没有新的显式 Xray 启动记录、
   服务和监听健康。非清零 stats 同来源同 key 的值只能保持或增加；没有用户流量
   时不要求增加，也不能凭空合成缺失 key。
4. 只有 SGP 源已稳定，才继续 [计量恢复 runbook](traffic-metering-recovery.md) 中的
   控制面新版本准备/推广及已授权的 Japan stats/source wiring。后者分别留证据，
   不随 SGP 修复扩大到 Nginx、DNS、其他协议或整库恢复。
5. 两地实际来源都验证通过后重新准备新鲜 T0；不得使用 SGP 重启或配置代际变化前
   已失效的 stats/plan。按已批准的 existing-writer 停写、offline snapshot、backend
   更新与 SGP 恢复合同执行；主计量仍停用，直至 scope/首次入账验证完成。
6. 计量仍只处理新起点之后的差额；旧身份/retained/opaque 的准入规则和 v3
   INSERT/CAS 事务不因本修复放宽。重启前不可可靠归属的历史差额不追扣。

已授权且不依赖 SGP 连续性的本地构建/制品准备可并行继续。SGP 同配置仍重启、
实际加载代码未知、来源/identity 漂移、读数下降、备份不可用或执行结果不明时，
停止依赖该状态的动作；不启动主计量，不重用已经开始的执行授权。原 Gate 的
单次授权终止规则不变，不为同一次正常执行中的每个步骤重复增加审批。

## 回退与收尾

回退仅针对本次备份的 SGP 执行文件和明确绑定的启动入口；不恢复整库、客户权益、
cursor 或历史 stats，也不额外执行 identity rotation。恢复旧执行器可能恢复原
重复重启故障，故不能把“旧代码已恢复”报告为计量健康或放开主采集器；应保持
计量暂停并报告 attention。涉及受影响 poller 的保留/恢复遵循本次精确边界。

成功后在同一修复 PR 追加简短 Deploy Note：deployed_at、`sgp-runtime-config`、
精确 source/artifact 和实际合成文件 hash、target、backup、替换文件数、实际加载
证明、自然周期/PID/启动记录和 stats 验证，以及 aggregate Identity Gate/retention
state。后续 `control-plane-app`、Japan runtime/source wiring 和计量恢复分别记录
结果；不能用其中一个单元成功代替其余单元。

本文件编写阶段不包含任何生产执行或测试通过声明。实际 red/green、完整 suite
限制、CI、部署和自然周期结果由本 PR 验证记录及生产 receipt 追加，不修改历史
runbook 的旧时间点证据。
