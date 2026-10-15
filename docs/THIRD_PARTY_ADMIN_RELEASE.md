# 第三方 YAML 与 Admin 一期发布准备

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: third_party_admin_phase_one_release_preparation
  superseded_by: null
  last_verified_at: 2026-10-13
  production_authority: false
```

Risk: A；Process: 精确源码核对、合成验证、独立复核、只读目标盘点、构件绑定、
备份与逐项切换、验收与回退；Expected PR count: 沿用 #762 / #771；
Validation: 见 `THIRD_PARTY_NODE_MANAGEMENT.md` 与下方门禁；
Production/AWS impact: 本记录阶段无生产操作。

## 当前状态

用户于 2026-10-13 要求开始上线。当天 #762 已合并为
`defbbb22f40ee4c3a3811ad3c504874630b5e3a9`；#771 已改为面向 master，仍为 Draft。
本轮只修正九份测试的跨平台前提，完成验证后再关闭其 Source/Merge Gate。
本记录是发布准备，不是 Deploy Note，也不授予生产变更权限。
源码提交、合并、精确构件、生产盘点及切换分别记录，不能把本地 build 当作已上线。

已完成本地 Admin 权限与文件导入、改名、逻辑删除、保存和显式启用接线；
真实合成业务测试已覆盖购买/升降档、订阅重置及到期四种下载入口。
独立源码复核发现的 OTHER 与上游特殊名称 DTO 合同缺陷已修正。
专用 Security Review 工具当前不可调用；普通独立复核的证据不能冒充该工具结果。

## 精确发布范围

- `release_unit: control-plane-app`，其中能力为 `subscription-rendering`。
- `release_unit: admin-static`，`frontend_surface: admin`。
- `identity_impact: false`；不改自营运行身份、协议配置、collector、计量边界或账务。
- 只允许本地 YAML 文件内容导入；HTTPS 抓取、手动/定时刷新保持硬关闭。
- 不安装或启用第三方刷新 service/timer，不更换 Portal / 官网。
- 新来源默认停用；本次部署不导入或启用真实来源。需确认上游再分发权限后由
  管理员另行操作。功能开关可用不等于来源启用。
- 到期只停止本站后续分发，不声称可吊销客户端已保存的第三方凭证。

## 只读目标盘点（2026-10-13 已完成）

目标为现役 BWH。按步骤读取，不重放历史执行包，也不扩大到 JP、SGP 或全项目。

1. 当前应用/依赖入口及摘要、Node/SQLite ABI、Admin 静态目录与摘要。
2. 应用、Admin 代理及既有 collector 的指定服务状态，仅元数据；不读取日志。
3. 第三方功能开关状态、独立 DB 路径与文件元数据、独立密钥是否存在，不输出值。
4. Admin 会话模式与 CIDR/代理信任的存在性及路由分类，不输出凭证或配置正文。
5. 磁盘/inode 与目标目录权限。若与记录不符，先报告具体差异。

已完成上述范围的逐项读取：现役 BWH 是 #772 与 reset764/guard767 组成的混合
应用，第三方模块、yaml 依赖及本功能环境尚未安装；Admin 静态仍为独立旧构件。
11 项 EnvironmentFile 的完整读取已确认既有 Admin 认证设置与持久来源一致，
不需要新建认证或替换密钥。最初遗漏重复属性的读取结论已更正，不能据此修生产。
容量与服务元数据通过当时的准备检查；没有读取账务、检查点或验证自然入账。

本次未打开生产数据库、上传文件、启停服务或写远端。
密钥、完整环境、数据库行、订阅地址及原始日志不进入本地或公开记录。
不能依据仓库 master 假定 BWH 的混合覆盖版本已包含相同依赖。

## 盘点后才冻结的写入步骤

1. 先关闭 Source/Merge Gate：绑定 #762 / #771 最终提交与有效验证，再从
   已审查 master 构建后端、依赖与 Admin 独立构件，记录 SHA-256。
   10月 CI 额度例外按 `CI_MANUAL_VALIDATION.md` 记录，不伪称 hosted CI 通过。
   master 是源码身份，不是全量覆盖 BWH 混合构件的授权；必须比较完整发布差异，
   出现本期外变更则停止扩大范围，或采用精确已审查的构件组成。
2. 在合成独立库演练迁移、重复 apply、关闭开关、旧应用/静态文件回退。
   `yaml@2.9.1` 必须随精确依赖构件提供；Node/SQLite native ABI 必须匹配。
3. 冻结实际路径、新备份和回退引用，然后取得覆盖数据库、密钥、环境及应用
   重启/静态替换的准确生产授权。不能让本记录中的候选路径成为写入依据。
4. 先备份现役应用入口、Admin 静态目录和受保护环境；如第三方库已存在，先做
   在线备份及内部完整性检查。备份保留在服务器私有目录，不能下载业务数据。
5. 仅对独立第三方库安装迁移 `20261010_001_third_party_subscription`，DDL SHA-256
   `e9ae3a680c7ba5a58ce33d65552e8b3100f75921d25726bf9b274c9bc2247b8c`。
   工具为 `scripts/platform-third-party-subscription-schema.mjs`，有 validate、
   dry-run、apply 与两项精确确认；不得对 control / commerce DB 执行该迁移。
6. 独立32字节密钥只在服务器生成并保存受保护环境文件；若已有密钥则保持，
   不覆盖或轮换。安装后端及依赖，保持原 Admin 会话/代理边界，逐项检查启动。
7. 后端接口可用且来源全部停用后替换 Admin 静态构件，检查身份保护、无缓存、
   空来源状态及资源加载。功能全局开关是否开启以批准范围为准，不隐式决定。

任何一步失败先停在该步；不重复迁移、不重播已消费授权，不顺手部署其他 PR。

## 回退与验收

- 迁移 CLI 没有 down migration。回退是关闭第三方全局开关并恢复应用/依赖、
  Admin 静态和对应环境备份；保留独立第三方数据库与密钥。
- 不清库，不恢复历史 control DB，不删除 WAL/checkpoint/pending，不补扣用量。
- 生产验收必须记录准确 source/artifact、备份、服务状态、Admin 会话保护、
  no-store、资源加载、来源未启用，以及既有计量调度未被修改。
- 没有授权使用真实用户/真实上游做验收时明确记为未执行；不能把合成结果
  写成真实连通性或客户端旧凭证失效证明。
- 切换后在相关 PR 追加标准 Deploy Note。本文件当前没有生产执行回执。
