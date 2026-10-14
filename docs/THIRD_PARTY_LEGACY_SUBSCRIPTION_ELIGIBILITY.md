# 旧月卡／年卡的第三方节点资格接入

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: third_party_legacy_subscription_eligibility
  superseded_by: null
  last_verified_at: 2026-10-14
  production_authority: false
```

Risk: A 授权与发布边界；Process: 同一个 PR 完成最小源码接线、合成测试和独立安全复核，
生产另按现场状态、精确构件、备份、批准、逐项验收与回退推进；Expected PR count: 1。
Validation: 新增资格／HTTP 测试、全部第三方回归、`npm test` 和 diff 检查。
Production/AWS impact: 本轮无；不读取或修改生产账户、订阅、数据库或来源。

- capability: `third-party-legacy-subscription-eligibility`
- release_unit: `control-plane-app`，能力影响范围为 `subscription-rendering`
- identity_impact: `false`；不改自营 principal、材料、collector 或用量归属
- production_state: `not_deployed`

## 范围与原因

原第三方渲染只识别三个 `offerv_*` 套餐标识，旧权益记录中的 `monthly` / `yearly`
因此不会获得第三方节点。此前 Admin 更新只改变操作入口，不会补齐这项后端资格。
本切片仅连接已有完整权益证据的旧月卡／年卡，不创建或重写权益，不替换用户链接。
完全没有控制面绑定、只有运行租户的历史订阅仍不自动接入：租户没有可信套餐及额度字段，
不能从名称、备注、存续天数或“链接仍有效”推定档位；需另核实归属和套餐。

## 判定规则

先由既有 subscription core 验证 token/artifact、租户状态和到期时间，再读取控制面证据。
原始 tenant ref 与其既有哈希形式在同一个只读 SQLite transaction 中核对。
新方法保留非 active 与孤儿行，避免过滤后的空结果被误当成无历史的新租户。

| 完整有效权益中的 plan | 必须精确匹配的额度 | 分发档位 |
| --- | --- | --- |
| `monthly` | 50 GiB | `monthly_basic` |
| `monthly` | 100 GiB | `monthly_plus` |
| `yearly` | 200 GiB | `yearly` |

三个现有商城 `offerv_*` 映射继续保留。不接受 trial、pilot、独立流量包、未知套餐，
也不把缺失、字符串、非整数或自定义额度猜成任一档位。

- issued link、issuance request、entitlement、account 必须有效且归属一致；
  若有对应 Portal 记录，状态必须为 delivered/issued。
- 权益窗口为 `valid_from <= at < valid_until`。HTTP 渲染使用现有可注入服务时钟，
  无效时钟不分发第三方节点。租户和权益两个有效期都必须通过。
- 两种 ref 的最新记录均不能失效，仍有效但归属不同的记录视作冲突；
  常规旧 link rotated、新 link active 且同权益的情况可以继续。
- `bound` 才进行套餐判定；`unbound`、`denied`、查询故障和未知结果都不分发第三方材料，
  不从弱 usage lookup 再次回退。只有不提供新证据读取方法的旧适配器保留原 offer-only 行为，
  其旧 monthly/yearly 不获得新增资格。
- 来源、节点暂停和现有全局开关仍在各自原有边界过滤。这里只改变资格识别，不改来源状态。

四个现有 YAML 入口共同使用这条路径。到期仍返回无凭证提示；已撤销、已重置的旧 artifact
由原 core 拒绝，不因兼容读取重新生效。Artifact 重置与 tenant token 轮换是不同操作，
本改动不声称前者同时吊销独立 token，也不能吊销客户端已缓存的上游第三方凭证。

## 验证边界

- `third-party-subscription-binding-evidence.test.mjs`：真实内存 SQLite，原始／哈希引用、
  撤销、孤儿、错误归属、并存／轮换记录、时间边界、Portal 状态和查询失败。
- `third-party-subscription-legacy-tier.test.mjs`：三档精确匹配、未知／缺失额度、
  无绑定／错误不可回退、关闭租户、注入时钟、旧适配器不扩权。8 项先红后绿。
- `third-party-subscription-legacy-http.test.mjs`：真实三库、core 与四条 HTTP 入口，
  20 项覆盖分档、到期／续期、artifact 重置、token 轮换、暂停恢复和无上游外连。
  control 与 third-party 数据库 query_only 下通过且 total_changes 不变；
  runtime 原有 last-used/artifact-refresh 元数据行为保留，不宣称所有数据库零写入。
- 认证后的生产下载、真实客户端及真实上游连通性未执行；不能用合成结果替代。
- 专用 Security Review 工具当前不可调用，独立普通安全聚焦复核与该工具结果分开记录。
  Hosted CI 与本地源码验证亦分别记录，不生成虚假绿色检查。

## 生产准备与回退边界

### 2026-10-14 本地验收结果

- Windows / Node 24.16.0，既有开发依赖环境；source environment preflight 通过。
  不是 clean-host CI、staging 或生产验收。
- 本轮新增三个测试文件共 62 项通过；其中 tier/render 的 8 项先红后绿。
  HTTP 文件首轮出现的 profile 预期错误已修正，不计为产品缺陷的红证据。
- 本轮 `npm test`：6,067 项，6,010 通过、57 跳过、0 失败。
- 独立普通安全聚焦复核无可复现问题，另跑三组新测试 62/62 通过；
  没有专用 Security Review 工具结果，不将该差异隐去。
- 文档 authority 普通／strict 检查：425 个元数据块通过；diff 空白检查通过。
- Admin 和前端未修改，不重复其全量检查。本轮没有生产访问、上游访问、合并或部署。

### 后续生产步骤

本记录不授予生产执行权。没有 schema 迁移、套餐补发或历史数据修补动作。

1. 审查并合并精确源码，绑定后端构件及固定依赖。当前生产为混合构件时，先比较最小
   三个模块（control store、tier、render）及依赖差异，不覆盖其他未部署工作。
2. 先在合成 fixture 验证候选安装、启动、四入口分档和回退；重用仍有效的源码证据。
3. 经限范围只读生产核对确认当前版本、模块摘要、服务与容量。若需查看旧订阅覆盖率，
   另明确只读 SQLite 范围并只返回各资格类别数量，不导出账户行或订阅地址。
4. 绑定新的现役代码备份、候选路径、应用重启及检查步骤，取得准确生产批准后逐项执行。
   不重启代理协议服务，不改 Nginx、Admin、Portal、来源开关、数据库或计量调度。
5. 验收版本、服务、匿名权限和获批范围的订阅渲染；观察自然采集但不把成功退出等同账务对账。
   失败回退精确旧代码构件，不恢复历史数据库，不补扣用量。
6. 成功或停止后记录真实 Deploy Note。发布前本切片始终为 `not_deployed`。
