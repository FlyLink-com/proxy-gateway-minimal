# BWH 三协议共享总带宽

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: bwh_shared_bandwidth
  superseded_by: null
  last_verified_at: 2026-10-20
  production_authority: false
```

Risk: A。Process: 本文件所在变更只交付控制面源码、Admin 投影和合成测试；不包含隔离证明、宿主安装或生产执行。Expected PR count: 1。Validation: `node --test server/tests/bwh-shared-bandwidth.test.mjs`，以及订阅分发面板的 vitest。Production/AWS impact: 无。release_unit: `control-plane-app`、`admin-static`。frontend_surface: `admin`。identity_impact: false。production_state: not_deployed。

本 PR 不证明双向分类已经成立，也不证明管理流量被排除在代理类之外。`applied` 只有在未来的隔离证明同时给出 `classificationProven`、`managementExemptProven`，且入站和出站读回速率都与期望 bps 一致时才允许写入。命令退出码 0 不能记为已生效。内核分类本次没有执行。

本次是 Draft 源码原型检查点，不是限速功能完成或生产可用声明。普通启动仍不建表、不注入服务，也不因已有目标行应用主机规则或启动三条协议。显式 `BWH_SHARED_BANDWIDTH_ADMITTED` 且 `BWH_SHARED_BANDWIDTH_DB_PATH` 为绝对路径时，`openAdmittedBwhBandwidth` 才打开该文件并调用 `applyBwhBandwidthSchema`。相对路径、`:memory:`、缺路径，或绝对路径不是可打开的普通文件时，`state.bwhBandwidth` 保持 null；对应路由返回 503 `bwh_bandwidth_unavailable`，不会把失败写成成功。保存只写 `desired`，不调用 `applyPlan`、`executeOwnedBandwidth` 或供流。已保存的 `applied` 若没有分类与管理豁免证明，读出是 `failed` / `classification_unproven`。`unknown` 和 `applying` 拒绝下一次保存，服务不自动重试。供流启用仍未改成等待限速证明；本切片不放流。入站队列是 `1:10`，出站队列是 `1:11`，同一 IFB 上的 HTB 根只创建一次，每个方向只有一个共享 rate，不按三条协议复制。两个方向都关闭时不创建队列。`classificationAttached` 仍为 false。`applyPlan` 在调用任何命令前取得调用方目录里的 `bwh-bandwidth.lock`；这把目录锁才是跨进程排除，`applying` 状态字段不是锁。步骤记在同目录的 `bwh-bandwidth-attempt.json`：中断后已记录的步骤是 `intended`，还没记录的是 `pending`，未执行的步骤不是 `done`。分类未证明时不调用 run 或 readback，也不把未完成的尝试改写成已执行。真实分类、宿主受限执行器、kernel readback、对象归属核验与回退、重启恢复及 Linux 共享速率验收均待完成。保存只保存目标，不代表主机已限速。未执行生产安装或启用。

`observeBandwidthClassification` 只读合成或将来的逐条观测，不执行宿主命令。服务名数组、`classificationAttached` 布尔值、监听端口、共享 UID、整网卡整形，以及未批准的 network namespace 迁移或服务身份变更，都返回明确拒绝，不构成分类。缺整段 IPv6、既有连接、入站或回源腿时停下并给出对应缺口。把管理流量放进 `1:10` 或 `1:11` 记为未豁免。144 条协议格和 28 条豁免格都填上允许的证据种类时，矩阵只表示形状完整；`proven` 和 `classificationAttached` 仍是 false，原因是 `host_fixture_unauthorized`。调用方没有内核读回、接口索引或服务 cgroup。这个结果不能让 `applyPlan` 调用 run 或 readback。本模块不迁移协议 namespace，也不改服务身份。

`executeOwnedBandwidth` 先读结构化快照，再决定是否发出固定 argv。操作者网卡上的 root qdisc、未知对象、mark 不一致、IFB 名字不符或 owner 不是 `bwh-us-v1` 时不发命令。命令退出码 0 但速率不符时结果不是 applied，补偿前会再读一次快照；快照里出现 foreign、unknown 或无法解析时不发删除命令，并记为 unknown。确认仍属于本 profile 的对象才按创建逆序删除，删除 argv 只指向固定 IFB，不含操作者网卡、`root`、`flush` 或三个协议服务。速率即使与策略一致，也因为分类没有主机证明而保持未 applied，并收回本次创建的自有对象。`applyPlan` 不调用这个执行器。`scripts/bwh-bandwidth-worker.mjs` 复用一次性套接字边界，只解析独立 bandwidth wire；非 root 退出 77，多余 argv 或坏帧退出 64，合法帧也以退出码 2 拒绝，不调用执行器。namespace 脚本逐项列出速率、豁免和故障格，并仍然以退出码 2 拒绝。

## 范围

三个 BWH 代理服务 `xray-vless-reality.service`、`hysteria2.service`、`mihomo-tuic.service` 共用一个总入站预算和一个总出站预算。不按用户、连接、协议、CPU 或网卡分别限速。默认两个方向都关闭；关闭保存为 `enabled: false` 且 `bps: null`，不是 0。开启时 0 Mbps 会被拒绝，不能当作暂停别名。

规划器只把上述三个服务名放进代理类。SSH、Admin、Portal、订阅、控制面和计量在排除列表中，不能被本规划器归入代理类。操作者网卡名只接受已经通过固定形状校验的值，并且不会进入 argv。argv 只有固定配置标记和十进制 bps 数字，不使用 shell。

表只由 `applyBwhBandwidthSchema(db)` 创建。普通启动不会建这张表，也不会调用执行器。唯一的新调用点是显式准入的 `openAdmittedBwhBandwidth`。

## 函数

- `readBwhBandwidth`：读取期望状态。没有行时是默认关闭，状态为已保存，不是已生效。
- `saveDesired` / `saveFromAdmin`：校验策略后做 revision CAS。非法策略抛出 `bwh_bandwidth_invalid`，不改行，也不调用执行器。revision 不一致、或当前为 `applying` / `unknown` 时抛出 `bwh_bandwidth_conflict`。
- `openAdmittedBwhBandwidth`：只有 `admit === true` 且路径是绝对普通文件时打开连接并建表；尚不存在的绝对路径可以新建。`read` / `save` 委托给上面的读取和保存。`save` 不调用执行器或供流。关闭后读写返回 `bwh_bandwidth_unavailable`。
- `bandwidthClassificationTopology`：列出三协议、双向、客户端／回源腿、首包／既有连接、TCP／UDP／QUIC、IPv4／IPv6，以及管理豁免类和两条共享 classid。它不是观测结果。
- `observeBandwidthClassification`：按上面的格子验收观测。捷径和缺口都保持 `classificationAttached: false`。填满的合成矩阵也不是隔离证明。
- `plan`：返回结构化步骤。入站和出站使用不同 classid。分类附着标记恒为 false。不因观测函数而添加 filter。
- `applyPlan`：没有调用方锁目录时拒绝，且不调用 `run`。锁目录已被占用时拒绝。锁内 revision 变化时拒绝，并留下刚保存的目标。网卡名无法证明时记 `failed` / `interface_unproven`，且不调用 `run`。分类附着标记不是 true 时记 `failed` / `classification_unproven`，不调用 `run`，也不调用 `readback`。伪造的读回不能把该结果写成 `applied`。`unknown` 期间拒绝下一次 apply。当前分类标记恒为 false，不创建内核对象；未来仍须补真实分类与对象归属证明，不能只翻转该标记。读回缺少任一证明或速率不一致时不能成为 `applied`。
- `readBandwidthAttempt`：只读上述尝试文件，不执行步骤。
- `executeOwnedBandwidth`：用调用方注入的快照做执行前、执行后和补偿前读回。它不由 `applyPlan` 调用，也不会把合成快照写成 applied。
- `rollbackOwnedSteps`：目前只生成固定 IFB、两个方向的 HTB class、qdisc handle 和 filter handle 的删除候选；没有实际对象归属 readback，不能称为已经实现安全回退。补偿删除由执行器按当次快照另算。
- `observeSharedRateProof`：列出三协议分别及同时、双向、客户端／回源、首包／既有、TCP／UDP／QUIC、IPv4／IPv6 的速率格，加上管理豁免格和故障格。缺省全部未观察。合同预先固定：offered load 至少为该方向共享速率的 2 倍，warm-up 3000 ms 不计入，稳态 10000 ms，burst 排除在稳态之外，容差 10%。入站只看 `1:10`，出站只看 `1:11`。单连接 payload、丢包增多、固定成功、放宽容差，以及同时段三条协议各自打满，都记为拒绝。落在容差内的纸面计数仍不是主机测量。

Admin `PUT /api/admin/third-party-subscriptions/distribution/bandwidth` 复用供流写入的会话、角色、精确 Origin 和 `sec-fetch-site` 约束。请求体只有 `bandwidthRevision`、`inboundEnabled`、`outboundEnabled`、`inboundMbps`、`outboundMbps`。显式准入后，同一路由读取并保存，返回状态是 `desired`，不是 `applied`。未注入 `state.bwhBandwidth.save` 时返回 `bwh_bandwidth_unavailable`。该处理函数不写分发路由，也不改变供流开关。页面仍把 `desired` 显示为已保存、`applied` 显示为已生效；本切片没有改页面源码。

独立线协议在 `scripts/lib/bwh-bandwidth-wire.mjs`，版本 1，动作只有 `status`、`plan`、`apply`、`rollback`。它不扩展供流线协议。`apply` / `rollback` 只有 version、action、revision。

## 回滚

真实回退仍待实现。当前固定删除候选因分类拒绝而不会进入真实执行路径，不构成“仅删除本功能拥有对象”的证明。后续必须先核对象归属与冲突，不能删除未知 root qdisc 或整网卡规则；不自动把速率改成0，不停止协议或改变供流。

生产步骤：未执行。`scripts/bwh-bandwidth-namespace-proof.mjs` 输出上述观察清单，`ok` 为 false，`reason` 为 `isolation_not_authorized`，`measurement` 为 `not_run`，并以退出码 2 结束。环境变量或参数不能把它改成成功。它不调用宿主命令。获准隔离环境中的三协议真实负载、双向计数和故障演练尚未执行。
