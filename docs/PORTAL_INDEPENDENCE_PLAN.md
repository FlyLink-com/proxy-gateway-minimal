# 用户面板独立演进计划

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: portal_independent_evolution_plan
  superseded_by: null
  last_verified_at: 2026-09-19
  production_authority: false
```

## 当前任务与决策

- Risk: C；本阶段为用户要求的方案、源码盘点和任务规划。
- Process: 核对源码及原生 Issue → Luna 并行整理独立清单 → 主 Agent 验收。
- Expected PR count: P0 一个文档 PR；后续每个独立变更按实际影响确定。
- Validation: 源码对照、链接存在性、文档权限检查和差异检查。
- Production/AWS impact: none；本文件不授予实现、合并或生产操作权限。
- 源码观察基线：`3937c0ff909a21aaee901fdcffb25bf81336a122`。
- 原生 Issue 于 2026-09-19 复查：[#527](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/527)
  与 [#438](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/438) 均为 open；
  其 Current Alignment 日期为 2026-08-30，属于有日期的记录。本计划只引用，不宣称关闭这些 Epic。

目标是让 Portal 可以单独升级、发布和逐页重建。优先保留同一 Git 仓库、
现有 Node 服务和服务端业务所有权，逐步形成独立的 Portal 应用包。
未来物理拆仓属于条件满足后的选择，不是本阶段的成功标准。

当前页面、入口、允许依赖和测试位置见
[源码基线](PORTAL_SOURCE_BASELINE.md)；接口、会话和业务所有权见
[API 基线](PORTAL_API_BASELINE.md)。两份清单只陈述该提交的源码事实。
现役生产身份仍须沿用 [ACTIVE_FRONTEND_MAP](ACTIVE_FRONTEND_MAP.md)、
[生产表面报告](PRODUCTION_SURFACE_REPORT.md) 与对应新现场证据判定。

## 产品与状态所有权

| 产品域 | Portal 职责 | 服务端权威 |
| --- | --- | --- |
| 进入与身份 | 注册、登录、会话恢复、安全设置 | 账号、验证、会话、撤销及权限 |
| 服务与资源 | 当前权益、用量、连接配置获取与使用引导 | Account、Entitlement、Delivery、Usage |
| 商业与账单 | 商城、钱包、订单、充值的展示及受控操作 | Offer、Ledger、Commerce、Recharge |
| 推广增长 | 分享入口、邀请与奖励进度展示 | Attribution 与 Reward policy |
| 帮助与设置 | 资料、支持请求、客户端使用引导 | 既有账户及支持服务 |

这是未来模块划分，不代表每项能力已经上线。页面是否可用以源码能力、
服务端返回及独立验证结果为准。前端可以缓存筛选、分页和展示状态；
余额、权益、订单、用量、会话及归因由服务端确认，刷新页面不得重放购买或支付写操作。

用户发起的连接配置交付继续通过现有受控接口完成；任何测试、日志、
构建物或文档不得保存真实交付材料。业务规则不复制到独立前端仓库。

## 分阶段执行清单

| 阶段 | 交付与完成标准 | 依赖与风险 |
| --- | --- | --- |
| P0 源码与合同盘点 | 三份可追溯文档：方案、页面/依赖基线、API/业务所有权基线；路径与源码核验通过 | 当前阶段，C；不改变产品行为 |
| P1 边界收口 | 把五个共享文件按实际使用整理到公共层；生产入口与演示实现隔离；既有接口建立请求/响应/错误合同及合成夹具；检查器同时允许新边界并拒绝越界 | B；先对每个任务写最小意图及文件清单；只做现有能力合同与边界，不新增商业功能 |
| P2 样式与领域拆分 | 逐份确认样式消费者，分离 Portal 专属样式；按产品域拆分页面状态与渲染；基准页面与关键流程保持一致 | B；样式与功能代码分别成聚焦变更，保留共享样式实际消费者 |
| P3 独立构建 | 确立独立应用目录及构建/测试入口；同步更新已有导入、嵌套包和构建规则；Portal 不依赖 Admin 页面，制品仍遵循 `portal-static` 合同 | B；目录名先作为实施选择，禁止仅移动目录却放宽检查器 |
| P4 独立发布与重建 | 复用既有静态发布流程，增加前端/合同/公开配置兼容元数据；验证新旧前端兼容与静态回退；可以按页面逐步替换 UI | 源码准备 B；现场盘点及发布 A；生产身份需完整对齐 |

物理拆仓仅在 P4 之后评估：Portal 构建与测试不依赖 Admin 工程、公共层足够小、
接口合同稳定且有新旧版本兼容证据。可继续采用 npm/Vite；无需预先增加
新的构建编排平台、独立用户数据库、队列或微服务。

## Luna 任务拆分与验收分工

按用户 2026-09-19 的选择，后续执行者改为 `gpt-5.6-luna`。
主 Agent 继续负责路线、任务边界、整合、最终验收和合并/发布门禁。
下面是工作分配，不增加审批层级；已完成且边界相同的有效证据继续复用。

| 任务 | Luna 拥有的工作 | 依赖 | 主 Agent 验收重点 |
| --- | --- | --- | --- |
| P0-FE | `PORTAL_SOURCE_BASELINE.md`；页面、构建、共享与样式依赖 | 当前源码 | 路径真实、入口归属准确、现状与建议分开 |
| P0-API | `PORTAL_API_BASELINE.md`；浏览器会话、接口、业务权威和测试 | 当前源码 | 同源/会话语义正确，未支持行为有标识 |
| P1-SHARED | 公共层最小提取及导入检查；实施前冻结具体文件范围 | P0 验收 | 产品无关性、无循环依赖、现有消费者保持可用 |
| P1-CONTRACT | 现有 DTO/错误/写操作语义的合同与合成夹具 | P0 验收 | 后端权威、隐私、兼容性、幂等和未知结果恢复 |
| P1-PREVIEW | 将演示依赖与正式入口分离，保留开发预览和既有测试 | P1-SHARED 整合 | 演示数据不进入生产依赖图；预览仍可复现 |
| P2-STYLE | 一组 Portal 样式消费者及视觉保持 | P1 完成 | 桌面关键页截图对照、交互状态、无跨表面样式回归 |
| P2-DOMAIN | 一次一个领域的页面/状态拆分 | 对应合同与样式稳定 | 行为不变、请求取消/并发及刷新正确 |

P1-SHARED 和 P1-CONTRACT 仅在明确文件不重叠时并行；其余任务按依赖推进。
同一入口、公共类型、检查器或锁文件同时只由一个执行者编辑。
构建配置、公共文档索引及 Git 集成由主 Agent 整合；Luna 运行对应的局部验证并报告证据。
P3/P4 到达时再细化文件任务，避免现在冻结尚未核验的目录结构或发布方案。

## 验收与兼容要求

1. 页面验收固定在现有正式入口，覆盖注册、登录/退出、记住登录后刷新、
   资源与用量、钱包与流水、商城与订单、充值状态与跳转、推广入口。
   先验证当前可用能力；未支持功能不由合成预览推定为已实现。
2. API 使用现有 `/api/portal/*` URL，先为合同标注版本。
   是否增加 URL 版本以后按兼容需要决定；不一次性迁移所有路径。
3. 保持浏览器与 Portal API 同源、安全 Cookie 和服务端会话恢复。
   页面源站、Cookie 或认证策略变化单独按 A 档处理。
4. 新旧静态版本在声明的合同兼容窗口内都可用。支付跳转继续遵守现有
   构件内允许来源及摘要校验；运行时公开配置不得引入任意跳转来源。
5. 未来全量前端重建以稳定合同和用户旅程测试为接入标准，按页面渐进切换。
   每步可以回退静态版本，且不要求迁移用户资金、订单、权益或会话数据。
6. 本阶段聚焦桌面与结构边界；沿用用户暂不新增手机端设计的决定，
   现有响应式行为仍应作为回归范围。

文档阶段执行 [VALIDATION_BASELINE](VALIDATION_BASELINE.md) 的 C 档命令：
`npm run docs:authority:check`、`npm run docs:authority:strict` 和
`git diff --check origin/master...HEAD`，并检查新文档的相对链接。
P1 之后按实际影响运行该基线及 [#527](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/527)
的前端测试、构建和制品检查；不得将本机缺失依赖当作源码通过或失败证据。

## 阶段状态与后续边界

本阶段交付是方案与现状清单。P1-P4 均为后续计划，不能以文档完成推定代码已实现。
本 PR 采用 `Refs #527`、`Refs #438`，不关闭任一 Epic。

允许后续独立源码边界工作的范围继续服从
[COMMERCIAL_FEATURE_INTEGRATION_GATE](COMMERCIAL_FEATURE_INTEGRATION_GATE.md)。
`ACTIVE_SOURCE_UNBOUND` 可接收分类、导入/构建隔离及其测试；
新商业能力和发布集成需先满足该 gate 的目标身份条件。
实际生产发布按 [PORTAL_STATIC_PRODUCTION_RELEASE_RUNBOOK](PORTAL_STATIC_PRODUCTION_RELEASE_RUNBOOK.md)
准备具体制品及现场证据。本轮没有生产状态读回或发布执行。
