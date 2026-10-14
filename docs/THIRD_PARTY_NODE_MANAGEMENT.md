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
| `PATCH /sources/:id/nodes/:nodeId` | `{revision,enabled}`，单节点暂停/启用，不改变来源开关 |
| `DELETE /sources/:id/nodes/:nodeId` | `{revision}`，仅删除已经单独停用的节点 |

新接口的响应形状：

```text
{ sourceId, revision, enabled,
  items: [{ id, enabled, originalName, defaultName, customName, displayName, countryCode, protocol, customCountryCode? }] }
```

没有 host、port、password、UUID、上游链接、密文、fingerprint 或原始配置字段。
名称字段是显示文本，前端须按文本渲染，不解析 HTML。

正式前端读取本地文件后提交 `yamlContent`，服务端不接受本地路径。
既有边界为 64 KiB YAML、最多 256 个节点；支持现有受限 SS/VLESS/Hy2/TUIC 子集。
`subscriptionUrl` 仍返回 `remote_import_disabled`，远程刷新仍关闭；本切片没有
HTTPS 抓取、DNS 外连、每日轮换或可用性探测。

### Hy2 BBR 配置兼容修正（源码，待发布）

Hy2 节点可选的 `bbr-profile` 仅接受 `standard`、`conservative`、`aggressive`，
依据 [Mihomo Hy2 字段说明](https://wiki.metacubex.one/en/config/proxies/hysteria2/)。
导入后映射为内部 `bbrProfile`，随节点配置加密保存，重新读取后仍按原值渲染为
`bbr-profile`；未提供时不注入默认值。非法值拒绝整份导入，同一节点出现冲突值
不静默覆盖。本修正不增加协议、不放宽未知字段、远程 provider 或证书校验限制，
不修改数据库结构、已有来源或自营计量身份。

Admin 按固定错误码提供中文提示，不显示后台原文或 YAML 内容。导入、保存等
写操作失败后的重新读取保护保持不变；不得仅因收到 400 就假定没有写入并自动重试。
本节只记录源码合同，需后端与 Admin 静态资源分别完成发布及验收后才在线生效。

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
**revision 防护适用于节点保存、显式启用和单节点 PATCH/DELETE，不声称旧启用接口具备它。**
正式节点管理 UI 应统一调用新工作流，不混用旧直启入口。

### 单节点暂停、恢复与删除（#782 源码增量，未部署）

- 已启用来源不必整体停用：节点行的暂停图标只暂停该节点，播放图标恢复该节点；
  均显示目标名称和影响确认，成功读回后更新列表，不需另点“保存”。
- 暂停的节点仍在列表，协议列显示“已停用”；启用节点在来源关闭时显示“待分发”，
  不声称已向用户分发。恢复节点不打开来源总开关，也不修改套餐分配。
- 删除前必须先暂停该节点，再使用行内垃圾桶和滑出确认；确认后立即调用单节点
  DELETE，无需保存整份列表。其他节点仍正常分发。删除后移出管理列表，不提供恢复按钮。
- 服务端复用即时事务、节点归属、最新 revision 和 Admin/CIDR/no-store 防护。
  对仍启用的节点删除返回 `409 node_enabled`；跨来源、已删除或不存在节点拒绝，
  任一事务/保护材料失败整体回滚。源码不改变授权模型或数据库 schema。
- 可恢复暂停使用加密配置内的严格布尔 `adminDisabled`，缺省为 false；`active=0`
  仍表示逻辑删除。非法暂停元数据不下发该节点，管理端报告固定错误码。改名、选旗、
  保存及来源启停不得清除单节点暂停；不改原始指纹、上游凭证、自营计量及历史用量。
- 暂停及单节点删除保留该节点的默认命名序号槽，不重排同来源其他节点的默认名称；
  内部序号通过受控 Symbol 传递，最终渲染移除，不作为可导入协议配置。
- `activeNodes` 等既有汇总仍指未删除记录数，包含暂停节点；不能用它证明参与分发。
  对单节点分发状态应检查节点 `enabled`、来源开关及实际生成配置。
- 浏览器有未保存改名/国旗草稿、编辑行、待确认删除、请求进行中或结果不明时锁定
  相应操作；写入失败不自动重试、不乐观隐藏节点，须重新读取。读回校验来源开关、
  目标状态及其他安全投影均未意外改变。
- 单节点暂停只停止**后续订阅配置**下发；不会让客户端已缓存的第三方凭证失效，
  也不会停止上游服务。需要立即撤销既有凭证时必须由上游另行处理，不在本切片范围。
- 发布顺序必须先支持暂停过滤的后端、后接 Admin 按钮；旧后端会忽略此新增标志，
  暂停记录存在时不能直接回退到不支持它的后端。生产回退需单独绑定分发保护和
  已暂停节点清单，不能通过清除暂停标志恢复旧版本。本轮未执行生产发布或回退。

本节更新当前单节点工作流；下文较早“停用来源→草稿删除→保存”的验收记录仅为
历史证据。批量改名/国旗仍需来源暂停，旧 bulk-save 接口保留完整清单语义。

验证（2026-10-13，本地合成边界）：

- 单节点服务、HTTP 和页面缺口均先红后绿；行内暂停/播放为纯图标，保留可访问名称、
  tooltip、目标确认和失败锁定，沿用 React 检查清单中的不可变状态及卸载/超时保护。
- 最终 Admin 全量96文件、1696项通过；构建和13个构件安全检查通过，原有主 chunk
  大于500 kB的提示仍在。变更 Admin 模块 ESLint 和 frontend boundaries 通过。
- 本轮服务端全量6001项：5944通过、57跳过、0失败；之后仅修跨来源别名占槽，
  最终完整第三方相关239项通过，其余不受影响的全量证据复用。
- 独立普通只读复核发现跨来源 alias 后缀在暂停后变化，补充同名、大小写、国旗、
  截断碰撞及 pause/resume/delete 渲染回归。占用记录仅为安全显示名，不含连接材料。
  修复后原始失败输入及真实 Clash YAML/组引用复验通过，渲染15项通过；检查范围内
  未发现剩余明确缺陷。前轮独立后端109项、Admin200项证据在未变边界复用。
- 本轮浏览器连接返回空 inventory，未完成新版图标/单节点流程的真实浏览器视觉验收；
  旧整来源流程浏览器结果不替代本次验收。loopback 合成预览使用内存状态，不连接生产。
- 未部署、未改变真实来源，PR 继续 Draft；不将普通复核等同于专用 Security/Bugbot。

本轮本地日志：`.codex-tmp/single-node-admin-final.log`、
`.codex-tmp/single-node-server-full.log`、`.codex-tmp/single-node-third-party-final.log`。

## 2026-10-14 Admin 来源控制与选择操作统一（源码完成，未部署）

Risk: B；Process: 一个局部 Admin 修复内完成意图、实现、合成测试；
Expected PR count: 1（与旧订阅资格兼容分支分开）；
Validation: Admin 全量、构建、安全构件检查、服务端回归和独立普通只读复核；
Production/AWS impact: none；release_unit: admin-static；frontend_surface: admin；
identity_impact: false。没有操作真实来源或节点，也没有合并、上线或新 Deploy Note。

- 正式 Admin 移除行内启用、暂停、删除及滑出确认，改为勾选单项／多项后使用同一
  功能栏的播放、暂停、垃圾桶图标。没有适用对象时按钮禁用，行状态与改名／国旗保留。
- 启用只确认并处理选中且暂停的节点；暂停只处理选中且启用的节点。确认清单冻结，
  每项写入使用最新 revision 并严格核对返回的完整安全投影；不会自动启用整个来源。
  筛选变化和重新读取清空选择，不携带隐藏行进入后续操作。
- 来源分发总开关移到来源选择旁，显示明确来源状态，仍有独立确认步骤。
  来源暂停仅停止后续分发，不把其中每个节点的开关自动改成暂停。改名／国旗的
  整来源暂停与保存规则不变；恢复来源不会自动恢复已单独暂停的节点。
- 批量垃圾桶针对当前筛选中显式选中的节点，不是无条件删除整个来源。确认框列出
  精确节点和仍启用数量；确认后逐项暂停仍启用节点，严格核对返回的完整安全投影与
  新 revision，再删除该项；原本已暂停的直接删除。不调用整来源停用接口。
- 每一步只发布已经确认的结果；失败、超时、并发冲突、异常投影或卸载停止后续操作。
  暂停成功但删除结果不明时单独报告，不自动重试或恢复启用；重新读取后由管理员
  决定剩余操作。会话／权限失效清空列表，不重新显示局部成功信息。
- 无暂停 API 能力的调用方仍只允许删除已暂停节点。原无后台合成预览保留旧交互，
  不代表真实 Admin 操作；正式页面通过 `selectionActionsOnly` 统一单项与多项操作。
  后端 PATCH/DELETE、鉴权、事务、schema 与逻辑删除合同不改；已下载的上游凭证
  不会因本站暂停或删除而失效，不能把此 UI 当作上游撤销工具。
- 来源菜单显示保留节点数，来自后端 `nodes.active`，包含暂停节点而非实际分发量。
  缺少计数保持未知，不猜零；当前来源使用已读节点快照计数。没有有效选中记录时
  优先进入已知非空来源，仍保留管理员明确选择的空来源。空来源会提示其他含节点
  的来源数量，避免同名来源造成“导入丢失”的误解。

本轮实际验证：

- client 计数与工具栏／批量流程新增测试先红后绿。
- 最新统一交互的 Admin 全量99文件、1792项通过；此前1763项及随后29项套件为
  前一交互版本的历史验证，不用它们替代本轮全量结果。新增批量启停套件10项通过，
  原workspace 71项与选择／删除30项保留部分失败、权限失效及迟到回执保护。
- `admin:build`、`admin:verify`（13文件）、frontend boundaries、9个修改 TS/TSX 文件 ESLint
  与 `git diff --check` 通过；既有大 chunk 提示仍在，不宣称无构建警告。
- `npm test`：6005项，5948通过、57跳过、0失败。
- 独立普通只读复核未发现明确新增缺陷；不是专用 Security Review 工具结果。
  React 检查清单用于保持不可变快照、异步取消与可访问名称，不引入新依赖。
- 本轮使用最终 Admin 构件和 loopback-only 合成内存 API 进行真实浏览器验收，
  确认行内生命周期按钮已移除、来源与节点开关分离，单选／多选启停只处理目标，
  删除确认清单与取消不写入。截图由主代理实际查看，不使用生产节点验证删除。
  当前分支为 `fix/third-party-admin-controls`，生产操作未执行，更新仍需精确静态
  构件、备份和批准；合成浏览器结果不代替生产真实数据验收。

本轮全量证据保存在本工作树 `.codex-tmp/selection-controls-admin-full.log`、
`selection-controls-build.log`、`selection-controls-server-full.log`，均不是生产回执。
此前 `admin-controls-*` 日志保留作为前一交互版本的验证记录。

### #784 审查后局部修正：逐请求超时

GitHub 对 `ce6f1ebad285` 的审查指出：批量操作原先共用15秒总期限，多个正常的
串行请求累计超过该期限时会中途停止。此项为真实功能缺陷，原提交不作为生产候选。

- 只调整批量启停和删除：每个 HTTP 请求开始前重新计时15秒；删除中的暂停与
  删除分别计时。保持串行 revision 与完整投影校验，不改为并行写入。
- 共用中止信号仍控制整个批次。计时刷新前核对挂载状态、当前请求代次与未中止；
  已超时批次不能复活。迟到回执不会发布结果或启动下一节点，不自动重试。
- 其他读取、来源开关、导入和保存的既有时限不变，没有后端或鉴权变更。
- 新增5项假时钟回归先失败再通过：启用、暂停和混合删除累计18秒正常完成；
  后续请求独享15秒，超时后保留已确认进度或已暂停未确认删除状态，迟到结果被忽略。
  两组相关测试45项通过；独立普通只读复核未发现新增明确缺陷。
- Admin 构建、13文件安全检查、frontend boundaries及三个修改TSX文件的ESLint通过。
  既有大chunk提示保留。布局没有改变，前一提交的合成浏览器视觉结果只复用至
  未变交互边界；逐请求计时以本轮假时钟回归为证据，不宣称新的生产浏览器验收。
- 本轮最终Admin全量99文件、1797项通过。首次全量有一项既有登录入口动态加载
  触发5秒超时，单独4项复验通过后以正确传入的 `--maxWorkers=2` 复跑全量通过；
  没有延长测试超时、跳过断言或修改登录代码。服务端5948通过/57跳过/0失败的
  前轮证据复用于未变后端边界。文档authority与strict检查424块通过。

生产尚未执行；#784曾恢复Draft完成修正，旧审查结论不代替修正提交的独立审查。
GitHub Actions的预算阻断与源码验证分别记录，不伪造通过状态或自行修改仓库保护。

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

### 节点维护与显示国旗（早期源码增量，未部署）

- 已启用来源的节点工具栏直接显示“停用来源”；确认会影响该来源全部节点，
  成功读回停用状态后才允许编辑。删除仍为草稿操作，保存完整保留清单后生效，
  需要重新启用才恢复剩余节点的分发；取消停用不发送写请求。
- 每行“国家/地区”选择仅调整显示国旗，不推断实际出口位置，不改服务器地址、
  凭证、原始国家分组、fingerprint 或计量。“保留原名称”清除覆盖，
  “不显示国旗”移除名称开头国旗；指定国家替换开头国旗，避免重复前缀。
- 保存节点支持可选 `customCountryCode`：ISO alpha-2 白名单或 `OTHER`；省略保留，
  `null` 清除。覆盖值只写现有加密配置的 `adminCountryCode`，无 schema 迁移。
  快照仅返回存在的有效字符串覆盖值；原 `countryCode` / `defaultName` 保持不变。
- 最终带旗名称仍校验空名、保留名、同来源重名及安全长度；启用、权限、revision
  和写入结果不明时的保护不变。国家选择先进入草稿，保存前不影响实际分发。
- 前后端 ISO 清单分别位于各自源码边界内，由测试核对完全一致；正式包仅加入
  后端所需共享清单，不扩大 Admin 到服务器的运行依赖。

本节描述源码合同，不构成生产发布或真实来源修改回执。

验证（2026-10-13，本地合成边界）：Admin 最终95文件/1639项全通过，构建、
构建安全检查、frontend boundaries、变更模块 ESLint 与差异检查通过。
首轮 Admin 有两项加载超时及一项新增列后的旧位置断言失败，定位修正断言后
22项针对性复验通过，最终全量以 `--maxWorkers=2` 通过，不放宽超时标准。
服务端全量5974项：5917通过、57跳过、0失败；之后独立复核发现长名加旗截断
尾空白导致重名漏检，前后端已统一截断后规范化，并先红后绿补回归。
修正后全部第三方相关210项和前端相关150项通过，其余全量结果复用。
独立普通代理用原始失败输入及实际Clash生成复核，74项通过；没有专用
Security Review/Bugbot结论。Chrome 合成页面完成取消停用、停用、选国旗、
删除草稿、保存及重新启用验证，不操作生产来源。

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
- 行内改名/国旗生成草稿，保存发送完整保留清单，不受搜索筛选影响。
  已启用来源必须先确认停用、读回后改名/选旗；启用有独立确认并携带最新 revision。
  单节点启停及删除改用上方 #782 独立接口，不要求停用整个来源。
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
