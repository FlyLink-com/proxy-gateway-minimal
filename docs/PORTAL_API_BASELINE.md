# Portal API Baseline（独立前端输入）

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: portal_independent_api_baseline
  superseded_by: null
  last_verified_at: 2026-09-19
  production_authority: false
```

这是 `docs/portal-independent-plan-20260919` 在
`3937c0ff909a21aaee901fdcffb25bf81336a122` 的源码/API 只读基线，供未来独立
Portal 前端消费。它不授权生产部署、认证模型启用、数据库迁移或 provider
操作；也不关闭 #438（Portal lifecycle）或 #527（前端资源隔离）。主 Agent 于
2026-09-19 复查两 Issue 仍为 open；正文 Current Alignment 日期为 2026-08-30，
属于有日期的记录，不能据此推定当前 production/runtime state。

## 结论与边界

- Server 是账号、会话、资源交付、usage/quota、钱包、Coins commerce、充值和
  referral 的语义所有者；`admin/src/features/user-portal` 里的 client/presenter
  是当前前端消费者，不是第二套领域实现。
- URL 暂不重命名。后续应以版本化 DTO/contract 逐步收敛，不把当前旧路径或
  frontend mock 当成新的公共能力。
- 本文只记录源码可见的现有能力与缺口；“建议/提案”仅出现在最后一节。

## 会话、登录与同源恢复

权威实现：[server/routes/user-portal.mjs](../server/routes/user-portal.mjs)（会话、
注册、资源和账户请求）与
[server/services/platform/portal-browser-session-transport.mjs](../server/services/platform/portal-browser-session-transport.mjs)。
当前前端封装为
[admin/src/features/user-portal/portal-browser-session.ts](../admin/src/features/user-portal/portal-browser-session.ts)
和 [user-portal-http.ts](../admin/src/features/user-portal/user-portal-http.ts)。

| 路径 | 现有操作/结果 | 权威与消费者 | 语义/状态 |
| --- | --- | --- | --- |
| `GET /api/portal/browser-session` | 恢复 cookie 会话；`{session:null}` 或 session | Server browser-session transport；`restoreSession` | 禁止 query；`no-store`；过期/无效 cookie 视为匿名 |
| `POST /api/portal/browser-session/logout` | `{loggedOut:true}` | Server revoke；`logout` | 仅空 body、无 query；有当前 cookie 才撤销并清 cookie；延迟匿名 logout 不清除新 cookie |
| `POST /api/portal/human-challenges` | `201 {challenge}` | human-challenge service；登录/注册页 | challenge scope 由请求给出；错误由 Portal error envelope 返回 |
| `POST /api/portal/password/session` | 200 session，或 202 `{challenge}` | auth；密码登录消费者 | `rememberMe` 在此提交；MFA 前不创建 cookie，二次验证成功才完成登录 |
| `POST /api/portal/password/second-factor` | 200 `{session}` | auth；MFA 消费者 | challengeRef + factor/code/passkeyProof；保留第一步 remember-me 选择 |
| `POST /api/portal/session` | 200 `{session}` | auth；TOTP 登录消费者 | accountId + code；完成后写短期 cookie |
| `POST /api/portal/entry/enroll` | 200 `{enrollment}` | auth；入口开通消费者 | entryToken + encryptedTotpSecret；不是 Admin API |
| `POST /api/portal/registration/email-verification` | 201 issued verification | registration email service；注册页 | `purpose=portal_registration` 由 server 固定 |
| `POST /api/portal/registration` | 201 registration，可能含 session | registration service；注册页 | emailVerification、legalAgreement 等由 server 校验；成功会完成默认短期 cookie |

浏览器 transport 的硬边界：

1. `createPortalBrowserFetch` 只接受当前 `window.location.origin`、`/api/portal/`
   路径，拒绝跨 origin、credentials-in-URL、hash，并使用 `redirect: "error"`
   与 `cache: "no-store"`。
2. cookie 模式删除 `X-Portal-Session`，改发公开的
   `X-Portal-Session-Context`、`X-Portal-Request: browser-v1`，并使用
   `credentials: "same-origin"`；context 不是 credential。Server 仍以 HttpOnly
   cookie 与 context/Host/Origin/Sec-Fetch-Site 组合校验每个请求。
3. HTTPS 使用 `__Host-PortalSession`；明确选择的 loopback HTTP 才可使用
   `PortalLocalSession`。跨站、错误 Host、重复/冲突 cookie、非同源 fetch 会被拒绝。
4. `X-Portal-Session`、body/query `sessionRef` 是旧的 header/session-ref 兼容
   通道。它们仍在部分 route 中可用，但不是独立浏览器的首选公共认证形态；不要
   把它们写入 localStorage、URL、JSON 响应或日志。

[user-portal-auth.mjs](../server/services/platform/user-portal-auth.mjs) 的
`createBrowserSession` 从原始认证成功时间起计算固定的绝对期限：
`rememberMe=true` 为 604800 秒（7 天），否则为 1800 秒（30 分钟）；
MFA challenge 本身另有期限。`sessionExpiresAtFactory` 影响的是转换前的
基础 session，不覆盖转换后的浏览器期限。这里描述当前源码合同，未核验线上 TTL。

相关边界测试（本轮未运行）：
[portal-browser-session-routes.test.mjs](../server/tests/portal-browser-session-routes.test.mjs)、
[portal-browser-session-transport.test.mjs](../server/tests/portal-browser-session-transport.test.mjs)、
[portal-browser-session.test.ts](../admin/src/test/portal-browser-session.test.ts)。

## 现有 Portal/API 分组合同

### 账号、安全、资源交付与 usage/quota

| 路径 | 操作与返回 | Server 所有域 | 当前前端消费者/测试 |
| --- | --- | --- | --- |
| `GET /api/portal/security/current` | 当前安全状态；需会话 | account/auth | `fetchSecurityState`；user-portal-routes、browser-session-routes |
| `POST /api/portal/security/totp/enrollment` / `.../confirm` | 201 enrollment；confirm 200 | account/auth | profile/security panels；user-portal-routes |
| `POST /api/portal/access-requests` | 201 `{request}`；会话绑定 accountId | access-request/account | `submitAccessRequest`；user-portal-routes |
| `GET /api/portal/access-requests/current` | `{items}`，按 submitted/updated time + id 排序 | access-request + embedded usage/quota summary | `fetchCurrentState`、Portal 页面；user-portal-routes |
| `GET /api/portal/resources/current` | `{resource}`；`no-store`；不接受 query | wallet-first current-resource projection | `fetchCurrentResource`；portal-wallet-first-current-resource-routes |
| `POST /api/portal/resources/current/setup` | 200 setup delivery | current-resource setup delivery | `createCurrentResourceSetup`；同名 routes test |
| `POST /api/portal/resources/current/setup/ack` | 204 空响应 | setup delivery acknowledgement | `acknowledgeCurrentResourceSetup`；同名 routes test |
| `POST /api/portal/access-requests/reveal` / `refresh` / `disable` | 200 `{request}` | access-request/delivery lifecycle | `reveal/refresh/disableSubscription`；user-portal-routes、self-service-subscription-routes |
| `POST /api/portal/support-requests` | 201 `{request}` | support request | `submitSupportRequest`；portal-support-request-routes |

资源 setup body 必须是恰好 `{idempotencyKey}`；ack body 必须是恰好
`{handoffRef}`，二者都拒绝 query。`setup` 的重试语义由 server delivery service
按同一幂等 key 处理；前端应复用同一 key，不要生成“重试即新请求”。
`access-requests/current` 的 account 归属以 server session 为准；当前 client
附带的 `portalUserRef` query 只是兼容输入，不是授权来源，也没有 cursor/limit
分页合同。usage/quota 目前随 request projection 返回，而不是单独的
`/api/portal/usage` endpoint。

### Coins wallet（余额投影与账本）

权威 route：[portal-coin-wallet.mjs](../server/routes/portal-coin-wallet.mjs)；消费端
[wallet-client.ts](../admin/src/features/user-portal/wallet/wallet-client.ts) 与
[portal-wallet-client.test.ts](../admin/src/test/portal-wallet-client.test.ts)。

| 路径 | 操作/状态 | 规则 |
| --- | --- | --- |
| `GET /api/portal/coins/wallet` | `{wallet}` | `status`: `not_created/active/frozen/closed`；未创建仍是合法投影 |
| `GET /api/portal/coins/wallet/ledger?limit=...` | `{entries,nextCursor}` | `limit` 为 1..100；cursor 必须成对 `afterOccurredAt+afterEntryRef`；未创建返回空 entries/null cursor |

domain route 的错误为 `{error:{code,retryable}}`：现有
`wallet_request_invalid`(400)、`wallet_session_invalid`(401)、
`wallet_unavailable`(503/retryable)。browser transport 在保护校验失败时可能
返回 `{error:string}`，不应把它当作 wallet domain envelope。账本是 cursor 分页
且按 occurredAt/entryRef 稳定排序；前端会拒绝越界、重复或不匹配 cursor。

### Coins commerce（商品、quote、订单）

权威 route：[portal-coin-commerce.mjs](../server/routes/portal-coin-commerce.mjs)；
消费端 [commerce-client.ts](../admin/src/features/user-portal/commerce/commerce-client.ts)。

| 路径组 | 操作 | 当前合同 |
| --- | --- | --- |
| `/api/portal/catalog/offers[/:offerRef]` | GET 商品列表/详情 | legacy commerce model；无 query |
| `/api/portal/commerce/checkout-preview` | POST `{offerRef}` -> `{quote}` | legacy；preview 限流 |
| `/api/portal/commerce/orders` | GET 列表；POST `{quoteRef}` 创建 | GET cursor 为 `limit` + `afterCreatedAt`/`afterOrderRef`；POST 201 |
| `/api/portal/commerce/orders/:orderRef`、`.../cancel` | GET；POST 空 body 取消 | mutation 必须 `Idempotency-Key`；取消返回 `{order}` |
| `/api/portal/commerce/model` | GET `{commerceModel}` | `legacy` 或 `wallet_first_unique_v1`；不要猜测未返回的模式 |
| `/api/portal/commerce/deferred/offers[/:offerRef]` | GET | 需 wallet-first service；可能不可用 |
| `/api/portal/commerce/deferred/checkout-preview` | POST `{offerRef}` -> `{quote}` | wallet-first/deferred；不是已启用承诺 |
| `/api/portal/commerce/deferred/transitions[/:transitionRef]`、`.../cancel` | GET 列表/详情；POST `{quoteRef}` 预留/空 body 取消 | mutation 必须 `Idempotency-Key`；可能返回 409/503 |

commerce domain route 错误为 `{error:{code,retryable}}`；包括 invalid/session/
not-found、insufficient coins、wallet inactive、idempotency required/reused、
rate-limited 和 unavailable。其 browser transport protection exception 可能是
`{error:string}`。订单分页仅 legacy orders 明确有 cursor；deferred transitions
当前 route 返回数组，没有对外 cursor 参数。

### Coins recharge（充值订单，不等同 commerce order）

权威 route：[portal-coin-recharge.mjs](../server/routes/portal-coin-recharge.mjs)；
消费端 [portal-recharge-client.ts](../admin/src/features/user-portal/recharge/portal-recharge-client.ts)。

| 路径 | 操作 | 规则 |
| --- | --- | --- |
| `GET /api/portal/coins/recharge/offers` | `{offers}` | 会话、无 query；offer version 由 server 投影 |
| `POST /api/portal/coins/recharge/orders` | body 恰好 `{offerRef,idempotencyKey}` -> 201 recharge.order | 幂等 key 在 body；订单归属 session account |
| `GET /api/portal/coins/recharge/orders` | `{recharges}` | server 固定 `limit:50,cursor:null`；当前没有 client 可传的分页合同 |
| `GET /api/portal/coins/recharge/orders/:orderRef` | `{recharge:{order}}` | 不存在 404 `payment_recharge_order_not_found` |
| `POST /api/portal/coins/recharge/orders/:orderRef/capture` | body 恰好 `{idempotencyKey}` | 返回 durable order；幂等 key 必填 |

recharge domain route 的错误 envelope 为 `{error:{code,retryable}}`；session
invalid 401、找不到 404、request/content-type invalid 400/415、provider/unavailable
503 等由 route/client 共同约束；browser transport protection exception 可能是
`{error:string}`。provider callback path 是服务端接收支付商通知的入口，
不属于独立前端能力，本文不把它列为 Portal public API。

### Referral

权威 route：[portal-referral.mjs](../server/routes/portal-referral.mjs)；消费端
[referral-client.ts](../admin/src/features/user-portal/referrals/referral-client.ts)。

| 路径 | 操作/返回 | 规则 |
| --- | --- | --- |
| `GET /api/portal/referral/profile` | `{profile}` | session account；无分页 |
| `POST /api/portal/referral/link` | `{profile}` | server 创建 distribution-only link；不是现金提现合同 |
| `GET /api/portal/referral/performance` | `{performance}` | session account；无分页 |

错误为 `{error:code}`：invalid session 401、request/ineligible 400/403、
unavailable 503、rate limited 429、unknown route 404；client 记录 retryable
只对 rate-limit/service-unavailable。`GET /r/:code` 是 referral redirect/attribution
兼容路径，不是已认证 Portal API。

## 现有缺口与未来重建不变量

- [user-portal-http.ts](../admin/src/features/user-portal/user-portal-http.ts) 仍有
  `/api/portal/payments/current`、`/api/portal/payments/checkout` 兼容消费者；在
  本次实际 route inventory 中没有对应 route。它们不得当作当前公共 capability，
  新前端不得据此发请求或推断支付已启用。
- 本次目标 route 中没有独立 usage endpoint；usage/quota 由 access-request
  projection 提供。若未来需要独立查询，应先建立版本化 DTO、account 归属、
  freshness/pagination/error 合同，再实现消费者；这是提案，不是现有能力。
- 前端必须只显示 server 返回的状态；不得把 login/session 当 durable account
  state，不得把 `paid` 当 subscription state，不得在额度耗尽时把 account 伪装为
  disabled。正常 refresh 的稳定 artifact URL/usage anchor 属于 server lifecycle
  事实，前端只保留返回值，不自行重算。
- 只有声明支持幂等 key 的购买、充值和资源 setup/capture/transition mutation 才
  应在重试时复用原 key；注册、登录、support、reveal、refresh、disable、ack 等
  路径没有统一幂等 key 合同。网络超时或响应未知时先恢复查询（例如订单/资源
  当前状态），再按该操作的现有约束决定是否继续，不作全局自动重试承诺。
- 独立前端只使用同源 cookie transport；legacy session-ref 仅为迁移兼容。不得
  暴露 raw password、cookie、provider payload、内部 callback 或 Admin API。用户
  主动调用现有 reveal/setup 交付路径时，可按该路径展示 server 返回的受控订阅
  材料；真实 subscription URL/token 不得写入日志、测试 fixture、遥测、文档或
  其他持久化输出。

## 验证记录

本轮验证仅针对任务文件 `docs/PORTAL_API_BASELINE.md`：源码/测试引用链接存在，
文档链接存在性 sanity 通过，且 `git diff --check` 无 whitespace 错误。未运行
`npm test`、Admin 测试、浏览器测试或生产检查，因此本文不声明测试 green；其他
并行文档不在本轮验证范围内。
