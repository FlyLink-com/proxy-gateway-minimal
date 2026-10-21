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

本次是 Draft 源码原型检查点，不是限速功能完成或生产可用声明。正式 state/schema 尚未接入；双向 planner 仍有同 IFB／classid 冲突。真实分类、宿主受限执行器、kernel readback、对象归属核验与回退、进程锁／持久步骤恢复、重启恢复及 Linux 共享速率验收均待完成。保存只保存目标，不代表主机已限速。未执行生产安装或启用。

## 范围

三个 BWH 代理服务 `xray-vless-reality.service`、`hysteria2.service`、`mihomo-tuic.service` 共用一个总入站预算和一个总出站预算。不按用户、连接、协议、CPU 或网卡分别限速。默认两个方向都关闭；关闭保存为 `enabled: false` 且 `bps: null`，不是 0。开启时 0 Mbps 会被拒绝，不能当作暂停别名。

规划器只把上述三个服务名放进代理类。SSH、Admin、Portal、订阅、控制面和计量在排除列表中，不能被本规划器归入代理类。操作者网卡名只接受已经通过固定形状校验的值，并且不会进入 argv。argv 只有固定配置标记和十进制 bps 数字，不使用 shell。

表只由 `applyBwhBandwidthSchema(db)` 创建。应用启动不会建这张表，也不会调用执行器。

## 函数

- `readBwhBandwidth`：读取期望状态。没有行时是默认关闭，状态为已保存，不是已生效。
- `saveDesired` / `saveFromAdmin`：校验策略后做 revision CAS。非法策略抛出 `bwh_bandwidth_invalid`，不改行，也不调用执行器。revision 不一致、或当前为 `applying` / `unknown` 时抛出 `bwh_bandwidth_conflict`。
- `plan`：返回结构化步骤。分类附着标记恒为 false。
- `applyPlan`：网卡名无法证明时记 `failed` / `interface_unproven`，且不调用 `run`。分类附着标记不是 true 时记 `failed` / `classification_unproven`，不调用 `run`，也不调用 `readback`。伪造的读回不能把该结果写成 `applied`。`unknown` 期间拒绝下一次 apply。当前分类标记恒为 false，不创建内核对象；未来仍须补真实分类与对象归属证明，不能只翻转该标记。读回缺少任一证明或速率不一致时不能成为 `applied`。
- `rollbackOwnedSteps`：目前只生成固定 IFB、HTB class、qdisc handle 和 filter handle 的删除候选；没有实际对象归属 readback，不能称为已经实现安全回退。

Admin `PUT /api/admin/third-party-subscriptions/distribution/bandwidth` 复用供流写入的会话、角色、精确 Origin 和 `sec-fetch-site` 约束。请求体只有 `bandwidthRevision`、`inboundEnabled`、`outboundEnabled`、`inboundMbps`、`outboundMbps`。未注入 `state.bwhBandwidth.save` 时返回 `bwh_bandwidth_unavailable`。该处理函数不写分发路由，也不改变供流开关。

独立线协议在 `scripts/lib/bwh-bandwidth-wire.mjs`，版本 1，动作只有 `status`、`plan`、`apply`、`rollback`。它不扩展供流线协议。`apply` / `rollback` 只有 version、action、revision。

## 回滚

真实回退仍待实现。当前固定删除候选因分类拒绝而不会进入真实执行路径，不构成“仅删除本功能拥有对象”的证明。后续必须先核对象归属与冲突，不能删除未知 root qdisc 或整网卡规则；不自动把速率改成0，不停止协议或改变供流。

生产步骤：未执行。`scripts/bwh-bandwidth-namespace-proof.mjs` 当前是始终拒绝的占位入口，只输出 `{"ok":false,"reason":"isolation_not_authorized"}` 并以退出码2结束；尚未实现获准后的真实隔离证明，不调用宿主命令。
