# 第三方节点管理后端切片

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: source_only_third_party_node_management
  superseded_by: null
  last_verified_at: 2026-10-13
  production_authority: false
```

日期：2026-10-13。Risk: B；Process: 在现有第三方分发实现上补接口、事务及测试；
Expected PR count: 1；Validation: 合成 SQLite / 真实应用 HTTP / 渲染测试及服务端回归；
Production/AWS impact: none；identity_impact: false。

## 范围与状态

本切片提供节点列表、显示名保存、节点逻辑删除和显式启用的后端接口，复用现有
inline YAML 导入、加密存储、套餐档位分配及受保护订阅渲染。
没有新增数据库表、迁移或鉴权模型；没有访问真实上游、生产数据库或执行部署。
本次后续已接通正式 Admin 页面，但源码实现不等于已开启生产分发。

本地 `node-names-preview.html` 仍是无 API 反代的合成前端预览；它的文件/HTTPS
输入和保存/启用按钮尚未调用这些接口，不应输入真实订阅或凭证。

## HTTP 合同

统一前缀 `/api/admin/third-party-subscriptions`，继续经过现有 Admin 鉴权及 CIDR
限制。响应 `Cache-Control: no-store`；错误仅返回固定错误码，不返回请求正文、
数据库错误、上游地址或连接材料。

| 方法与路径 | 输入/用途 |
| --- | --- |
| `POST /sources/preview`（既有） | `{yamlContent,regionOverride?}`，返回有界解析摘要 |
| `POST /sources`（既有） | `{name,yamlContent,tiers,regionOverride?,enabled?}`；默认禁用 |
| `GET /sources`（既有） | 来源列表和汇总，不含 YAML 或凭证 |
| `GET /sources/:id/nodes`（新增） | 当前来源的完整 active 节点列表和 revision |
| `PUT /sources/:id/nodes`（新增） | `{revision,nodes:[{id,customName}]}`，完整保留清单 |
| `POST /sources/:id/enable`（新增） | `{revision}`，显式启用当前完整版本 |

新接口的响应形状：

```text
{ sourceId, revision, enabled,
  items: [{ id, originalName, defaultName, customName, displayName, countryCode, protocol }] }
```

没有 host、port、password、UUID、上游链接、密文、fingerprint 或原始配置字段。
名称字段是显示文本，前端须按文本渲染，不解析 HTML。

正式前端读取本地文件后提交 `yamlContent`，服务端不接受本地路径。
既有边界为 64 KiB YAML、最多 256 个节点；支持现有受限 SS/VLESS/Hy2/TUIC 子集。
`subscriptionUrl` 仍返回 `remote_import_disabled`，远程刷新仍关闭；本切片没有
HTTPS 抓取、DNS 外连、每日轮换或可用性探测。

## 保存、删除与启用

1. 正式页面导入时显式发送 `enabled:false`，保持未发布；读取完整节点清单及 `revision`。
2. 在前端内完成改名及删除确认；提交所有保留的节点，不得提交搜索/筛选后的子集。
3. 服务端在即时事务中验证来源未启用、revision、节点归属、名称和完整候选状态。
   遗漏的 active 节点仅设 `active=0`，不物理删除原始材料。任一失败整体回滚。
4. 使用保存返回的新 revision 调用 `/enable`。空清单、材料无法解密、非 inline
   来源或版本已变化时拒绝。再次传最新 revision 启用已启用来源不改变节点内容。

`customName:null` 或空白字符串恢复默认；名称不超过 128 UTF-16 单元，拒绝控制字符、
双向控制字符、孤立代理项、保留名和同一来源内不区分大小写的重复显示名。
新保存接口最多 256 项；合法长中文清单使用仅限此 PUT 路径的 256 KiB JSON 上限，
其他路径继续使用原 100 KiB 上限。未知字段和非法 ID 在写入前拒绝。

revision 是来源字段、档位及所有节点（包括 inactive 节点和受保护材料）的完整
快照摘要，不只依赖更新时间。同一时间戳的并发保存也会冲突；409 后应重新读取并
由操作者处理，不自动覆盖或删除。写入后解密/投影失败也会回滚，不留下半次保存。

已启用来源不允许直接保存，返回 `source_enabled`；需先按既有来源停用操作关闭、
重新读取、保存，再启用。这避免编辑草稿直接改变正在分发的来源。
既有 `PATCH /sources/:id` 的启用操作和导入时显式 `enabled:true` 保留兼容语义；
**新 revision 防护只适用于本次三接口工作流，不声称旧启用接口具备它。**
正式节点管理 UI 应统一调用新工作流，不混用旧直启入口。

## 渲染与权益边界

人工名称加密保存于节点配置的 `adminDisplayName`，转为受控显示别名用于订阅输出。
原节点名称、协议材料、内部 ID、去重指纹、自营计量及用户权益不变。
无别名时沿用 `[3P] 国家 序号 | 原始名称`；跨来源或与自营节点重名时渲染端追加
有界后缀，避免组引用冲突。组引用使用同一最终名称，emoji 不会被后缀截断为孤立代理项。
管理接口的 default/display 名称是来源内预览，跨来源输出可能追加冲突后缀。

被删除节点不再参与后续拉取的配置；这不是撤销已缓存于客户端的第三方凭证。
启用仍受全局功能开关和套餐档位限制；订阅到期仍走现有过期提示，不下发节点材料。
不宣称上游可用，也不代替真实上游的分发授权。

## 验收索引与待办

- `server/tests/third-party-subscription-node-management.test.mjs`：白名单、加密、
  归属/名称校验、两连接冲突、逻辑删除、真实 SQL 部分失败回滚。
- `server/tests/third-party-subscription-node-admin.test.mjs`：真实应用鉴权/CIDR、
  no-store、请求边界、保存/启用及并发冲突。
- `server/tests/third-party-subscription-node-render.test.mjs`：别名、碰撞、Unicode、
  保存后重新创建 store、启用、实际 YAML 和分组引用。
- 复跑既有第三方 store/Admin/render 测试，覆盖关闭开关不改变输出以及四种订阅
  入口的到期/续期行为；运行 `npm run validation:environment:source` 和 `npm test`。

后续：专用安全审查、完整合成浏览器验收；HTTPS 导入另做
服务端外连安全实现与审查。生产需另绑定准确来源、迁移状态、密钥、备份与回退，
并经 Risk A 授权；本切片没有生产执行记录。

## 本次验证记录

- 针对性测试先红后绿：路由缺失、别名渲染、长中文请求及 emoji 碰撞均有失败再修正的证据。
- 最终第三方订阅全部相关测试：152 项通过，0 失败，包含本次新增 54 项。
- 独立只读检查发现并修正：合法中文完整清单超过默认 JSON 限额，以及碰撞后缀截断
  emoji 两项问题；复核相关 60 项通过，未发现新的具体缺陷。这不是专用 Security Review。
- `validation:environment:source` 就绪；语法检查、已跟踪差异和新文件 whitespace 检查通过。
- 首轮全量服务端：5887 项，5817 通过、13 失败、57 跳过；失败位置与变更前
  `.codex-tmp/server-full.log` 基线一致。最终代码全量：5891 项，5820 通过、14 失败、
  57 跳过；新增一项为本说明缺少 document_metadata，已补齐。受影响文档套件随后
  73 项中 69 通过、4 跳过、0 失败；其余 13 个失败位置与基线一致。
  最后仅补文档元数据并复验受影响范围，没有第三次全量运行，不声明全量全绿。
- 本轮未修改前端实现，复用前轮 Admin 88 文件/1444 项及 build/verify 结果；不把
  合成前端预览视为正式页面已接通。没有启动生产、迁移生产库、推送或部署。

本地回执：`.codex-tmp/node-management-targeted-final.log`、
`.codex-tmp/node-management-server-final.log`、`.codex-tmp/node-management-document-final.log`。

## 正式 Admin 接线（同日后续，源码状态）

正式导航“第三方节点”：`#/admin/thirdPartyNodes`，由既有 `AdminAuthBoundary`
确认会话后懒加载。原 `node-names-preview.html` 仍是 loopback-only 合成预览，
不是正式数据入口；baseline preview 保持十项只读页面，不挂载第三方管理写入口。

- 浏览器只使用同源 HttpOnly 会话；不要求填写 Console token，不读取或持久化
  管理 token，不发送 Authorization。所有请求同源、no-store、拒绝重定向。
- 后端复用 Admin CIDR 与会话网关。在现有会话模式启用时，第三方接口另外要求
  网关生成的有效 `admin` 或 `super_admin` principal；非法角色拒绝。没有新建角色
  或更改全局 auth model。旧 Console 模式行为保持兼容，不把它暴露给正式前端。
- 401 交回登录边界；403 清空页面来源/节点并锁定写入口。浏览器请求 DTO 仅保留
  显示名称、协议、国家、状态、节点/来源管理 ID 与 revision；错误不反射原始正文。
- 文件导入需明确来源名称和适用套餐档位，默认停用；限制64 KiB，HTTPS服务端
  抓取尚未开放。导入后读回来源，确认列表后再单独启用。请求中禁止关闭和重复提交，
  文件读取期间离开页面则不发出迟到写入；已发出的写入不能因客户端取消而假定回滚。
- 行内编辑与滑出删除生成草稿，保存发送完整保留清单，不受搜索筛选影响。
  已启用来源必须先确认停用、读回后编辑；启用有独立确认并携带最新 revision。
- 冲突、超时或写入结果不明时锁定写入，不自动重试；必须重新读取。
  重新读取丢弃未保存草稿须确认，即使 revision 未变也重置编辑器。
  单个来源读取异常不隐藏来源选择；remote/unknown 来源标示暂不支持编辑。

验收索引：`third-party-subscription-admin-session.test.mjs` 使用实际应用、合成
SQLite 与签名会话验证权限；Admin 的 `third-party-admin-client/entry/import/workspace`
及 `third-party-node-names-connected` 测试覆盖请求边界与正式页面交互。
本节只描述源码；没有真实管理员浏览器操作、真实来源导入、生产发布或部署回执。

### 本轮接线验证

- Admin 全量首次：93文件、1547项，1546通过；唯一失败是正式导航原先固定10项的
  旧断言。改为11项后，最终8文件154项针对性复验全部通过，其余结果复用。
- 第三方后端及文档套件235项：231通过、4跳过、0失败；会话/CIDR/角色测试含
  真实应用和合成SQLite，非法角色用例先红后绿。
- 本轮服务端全量5901项：5829通过、15失败、57跳过。对比原基线13个失败，
  新增2个均为新页面引入同名CSS/TSX造成的源码边界歧义；改为 `.styles.css`
  后，完整边界套件及会话测试112项全通过。其余13个失败与基线一致；不声称全量全绿。
- 最终 `admin:build`、`admin:verify`、`frontend:boundaries:check`、变更模块
  ESLint及 `git diff --check` 通过。构建仍有既有大块体积提示，不是构建错误。
- 独立只读复核发现并修正：坏来源阻塞列表、离开页面后文件读取迟到提交；
  修后四文件59项通过，检查范围内无剩余明确阻断。这不代替专用Security Review或生产验收。
- React检查清单用于懒加载、异步卸载保护、取消/超时与不可变草稿，不扩大权限模型。
  本轮未提交、推送、合并或部署；#771仍为Draft。

本轮本地证据：`.codex-tmp/admin-permission-full.log`、
`admin-permission-targeted-final.log`、`admin-permission-server.log`、
`admin-permission-server-targeted.log`、`admin-permission-boundaries.log`、
`admin-permission-build-final.log`（均在 `.codex-tmp/`，不是生产回执）。

### 2026-10-13 上线准备复核

- Admin 对未知地区 `OTHER` 的合同已补齐；真实 parser → 内存 SQLite → DTO →
  Admin client 的11项测试先出现7项失败，再修复为11项全通过。
- 上游来源/节点名称改为统一安全显示投影，移除不安全控制字符与孤立代理项，
  保留正常 emoji，空名称有固定回退。读取与渲染不改数据库原名、fingerprint 或
  密文材料；后端4项新回归先红后绿。自定义别名仍按原严格规则验证。
- 真实业务组合覆盖三份合成内存数据库、HTTP报价/订单、capture/fulfillment/
  scheduled downgrade与四种订阅输出，验证升级履约前后、降档生效前后、到期
  无材料、用量历史不变和远程请求0次。两项组合测试通过。
- 本轮 Admin 全量94文件1573项全通过；第三方后端16文件168项全通过；
  `admin:build`通过，仅保留既有主chunk体积提示。
- 最终服务端全量5907项：5837通过、13失败、57跳过，退出码1；13个失败名称
  与初始 `.codex-tmp/server-full.log` 完全一致，新增失败0。不声明全量全绿。
  前轮接线全量新增的两项源码边界失败在本轮已消失。
- 最终文档 authority/strict 共423个元数据块通过，Admin构建安全检查13个文件、
  frontend boundaries及差异空白检查通过。失败消息布尔化后受影响两组13项复验通过；
  其余同一源码边界的结果复用，没有再次全量或触发 hosted Actions。
- 独立只读复核另跑后端47项与前端76项通过，确认前述三项缺口已关闭；
  这不是专用 Security Review 工具或生产验收。
- 新测试的失败消息仅断言布尔结果，避免到期错误输出整份合成连接材料。
- 当前没有生产访问、迁移、来源导入或部署。准确发布边界见
  [一期发布准备](THIRD_PARTY_ADMIN_RELEASE.md)。

本次本地日志：`.codex-tmp/admin-contract-projection-final.log`、
`admin-full-projection-final.log`、`admin-build-projection-final.log`、
`third-party-release-narrow-final.log`、`third-party-release-server-full-final.log`；
均不提交原始日志或作为生产回执。
