# 用户面板独立演进计划

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: portal_independent_evolution_plan
  superseded_by: null
  last_verified_at: 2026-09-20
  production_authority: false
```

## 当前任务与决策

- Risk: C；本次更新既有规划 PR #735，不实施后续功能或部署。
- Process: fresh Issue/PR 与源码核对 → Luna 更新独立清单 → 主 Agent 整合、文档验证与审查。
- Expected PR count: 1，继续使用 #735；不另拆 spec/plan PR。
- Validation: 源码对照、相对链接、文档 authority 检查和差异检查。
- Production/AWS impact: none；本文件不授予实现、合并或生产权限。
- 后端及桌面源码观察基线：`41ea7b4389724812ba938f8df5480c638ab5b546`。
- 手机端源码观察基线：`gccltd/gccwebos-mobile@fb917521a45500b415bc5aeb1dbcdfcbf8783247`。
- 2026-09-20 重新读取原生 [#527](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/527)
  与 [#438](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/438)：均为 open，
  Current Alignment 仍为 2026-08-30；本 PR 仅 refs，不关闭两 Epic。

最初 P0 基线为 `3937c0ff909a21aaee901fdcffb25bf81336a122`，当时规划先在同仓形成
独立应用、暂不新增手机设计。之后用户批准手机端独立设计、拆库和部署，且已经落地。
原来的“物理拆仓只能在 P4 后评估”“暂不做手机端”不再作为当前约束。

当前目标是维护**同一账户/API 下的两个独立前端交付面**：手机端在独立仓库演进，
电脑端沿用本仓正式 Portal 源码及独立 `/web/` 构建。不再新建手机仓库，不把电脑端
混入手机布局；后端保持单体及既有领域所有权。路径见 [源码基线](PORTAL_SOURCE_BASELINE.md)，
接口见 [API 基线](PORTAL_API_BASELINE.md)，源码、构件、部署事件不能互相代替。

## 已完成部分及证据

| 范围 | 已核对事实 | 证据与边界 |
| --- | --- | --- |
| 公共层与演示隔离 | 五个 helper 移至 `admin/src/shared/public/`，旧路径兼容导出，正式/preview client 分离 | [PR #736](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/736) 已合并；不等于桌面 package/CSS 全部独立 |
| 当前资源读取 | overview 按当前资源链关联用量；补齐 legacy/wallet-first 接线 | [当前资源合同](MOBILE_CURRENT_RESOURCE_OVERVIEW.md)、[兼容修复](PORTAL_CURRENT_RESOURCE_LEGACY_FIX.md)；不把最新历史用量当当前套餐 |
| 手机独立仓库 | 首页／购买／订单／我的，独立构建与真实 API 消费者 | [gccwebos-mobile](https://github.com/gccltd/gccwebos-mobile)、[基线 README](https://github.com/gccltd/gccwebos-mobile/blob/fb917521a45500b415bc5aeb1dbcdfcbf8783247/README.md)；不复制服务端账本和规则 |
| 电脑独立静态构建 | `admin:portal:web:build` 输出 `admin/dist-portal-web`，静态基础路径 `/web/` | [PR #739](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/739)、[路由合同](../admin/DEVICE_ROUTING.md)；仍共享 Admin 包和部分样式 |
| 同源分流与静态热修 | 两端已有部署记录；自动分流开启，手动切换控件移除 | 下方 Deploy Notes；本次只读取既有记录，不执行新的生产检查 |

已完成的静态发布事件时间为 2026-09-20T22:45:18Z：

- [电脑端 Deploy Note](https://github.com/gccwebos-com/proxy-gateway-minimal/pull/740#issuecomment-5753247117)：
  source `41ea7b4389724812ba938f8df5480c638ab5b546`，Artifact `10615121016`。
- [手机端 Deploy Note](https://github.com/gccltd/gccwebos-mobile/pull/8#issuecomment-5753247325)：
  source `fb917521a45500b415bc5aeb1dbcdfcbf8783247`，Vercel deployment `6558341063`。
- 记录包含静态 hash/入口验证、备份与旧页面保留、后端及采集未变、用户随后实测通过。
  用户未声明设备及逐项用例，不扩写成新的全流程/真机测试报告。

这是有日期的部署事实，不保证未来现场状态；后续发布仍须 fresh readback。
较早 [ACTIVE_FRONTEND_MAP](ACTIVE_FRONTEND_MAP.md)、[生产表面报告](PRODUCTION_SURFACE_REPORT.md)
及实施文档的“待发布”表述属于各自截止时间，不能覆盖较新的明确记录，也不能
据此把整个 Admin/Portal 资源隔离 Epic 标为完成。

## 产品与状态所有权

| 产品域 | 两端前端职责 | 服务端权威 |
| --- | --- | --- |
| 进入与身份 | 注册、登录、会话恢复、安全状态展示 | 账号、验证、会话、撤销与权限 |
| 服务与资源 | 套餐/用量、订阅交付与导入指引 | Account、Entitlement、Delivery、Usage |
| 商业与账单 | 商品、报价、购买、钱包、流水、充值与订单 | Offer、Ledger、Commerce、Recharge |
| 推广增长 | 邀请生成、复制/分享及进度 | Attribution 与 Reward policy |
| 帮助与设置 | 展示偏好、客户端选择、支持入口 | 既有账户及支持服务 |

前端只缓存筛选、分页和展示状态。余额、权益、订单、用量、会话与归因由服务端确认；
刷新不重放购买/支付。前端有入口不等于某项政策或后端分支已启用。

## 阶段状态与后续推进

| 阶段 | 当前状态 | 剩余交付与验收 |
| --- | --- | --- |
| P0 源码与合同盘点 | 本 PR 更新三份文档及导航 | 对齐源码及已记录部署，保留缺口、不关闭 Epic |
| P1 边界收口 | shared/public 与正式/preview 隔离由 #736 完成 | 收齐两端 DTO、错误、幂等语义与合成夹具；不重复提取 helper，不放宽检查器 |
| P2 样式与领域拆分 | 桌面仍有共享 CSS/大页面；手机设计已独立实施 | 一次一组消费者或一个领域拆桌面代码，保持交互，不用桌面样式重做手机端 |
| P3 独立构建 | 手机独立仓库/构建已建立；桌面 `/web/` 构建已建立 | 桌面应用包和 Admin 工具链彻底分离可按维护收益评估，不是本次合并前置条件 |
| P4 独立发布与重建 | 两端同源入口及静态回退有部署记录 | 后续按受影响端产出准确构件，维护合同/公开配置兼容与回退，不重复首次拆库流程 |

不把 P1-P4 全部宣布完成，也不把已经交付的手机端、共享提取和分流重新列为未开始。
后续优先收敛当前业务所需合同和文档，再按具体需求局部改进；不增设 Redis、队列、
微服务、用户数据库或非必要构建编排平台。

## Luna 分工与验收

沿用用户授权：Luna 执行明确、可独立任务，主 Agent 负责路线、整合与最终验收。
不设固定人数/审批流水线，同一文件、类型、检查器和锁文件只有一个编辑者。

1. 本次 Luna 分别更新源码/API 清单，主 Agent 更新计划、导航、PR 及验证记录。
2. 后续合同任务先冻结两个消费者和后端路径，按业务域整理已有语义与夹具，
   不新增未要求的 API、不改认证或账本；以相关错误、恢复及兼容测试验收。
3. 后续桌面样式/领域任务一次一个局部拆分，核对实际消费者、复用已有证据，
   只重验受影响部分；不把完整重建作为小热修的前置条件。
4. 共享合同变化检查两端兼容；单端视觉只更新该端静态构件。生产、认证、
   schema 动作仍按实际风险进入对应门禁。本 PR 不执行这些后续任务。

## 持续兼容要求

- `/web/`、`/m/` 和根入口共用既有同源 `/api/portal/*` 与安全 Cookie，
  不新增第二套账户/会话库。Cookie、真实订阅不得写入文档、fixture 或日志。
- 自动选择只在初次进入发生；显式 URL、记住的偏好按现有优先级处理。
  隐藏控件不等于移除显式入口；缩放、键盘、登录、resize 不触发换端。
- 两端商业语义一致：购买订单不等于充值订单，支付成功不等于资源交付；
  余额不足引导现有充值，返回后重新确认报价，不自动下单或扣款。
- 获取/复制/二维码使用受控交付 API；“重新获取”不等于轮换身份。
  当前用量依赖稳定资源关联，不用虚构数字或跨套餐历史数据填空。
- 前后端兼容的小视觉更新只构建、验收、替换静态资源，不重启后端或暂停数据库；
  仍保留精确 source/artifact、旧页面、回退和 Deploy Note。后端依赖变化才另行评估。
- 后续整页重建按页面渐进替换，不迁移资金、订单、权益或会话数据。

本 PR 按 [VALIDATION_BASELINE](VALIDATION_BASELINE.md) 做 C 档文档检查：
`npm run docs:authority:check`、`npm run docs:authority:strict`、相对链接检查与
`git diff --check origin/master...HEAD`；不重跑应用、后端、浏览器全测试。
后续边界工作遵循 [COMMERCIAL_FEATURE_INTEGRATION_GATE](COMMERCIAL_FEATURE_INTEGRATION_GATE.md)，
生产更新遵循 [PORTAL_STATIC_PRODUCTION_RELEASE_RUNBOOK](PORTAL_STATIC_PRODUCTION_RELEASE_RUNBOOK.md)。
