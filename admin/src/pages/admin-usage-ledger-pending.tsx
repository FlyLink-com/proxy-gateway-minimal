import "./admin-usage-ledger-workspace.styles.css";

// This staged surface has no query client, hook or activation flag. The live
// ledger workspace is connected only after its separate query acceptance.
export function AdminUsageLedgerPending({
  userManagementHref = "#/admin/userManagement"
}: {
  userManagementHref?: string;
} = {}) {
  return (
    <div className="admin-usage-ledger">
      <section className="aul-section" aria-label="用量台账">
        <div className="aul-section-head">
          <h2>用量台账汇总</h2>
          <a className="aul-link" href={userManagementHref}>前往用户管理查看账户明细</a>
        </div>
        <p className="aul-empty" role="status">真实汇总查询验收中，暂未开放。</p>
        <p className="aul-lede">本阶段不读取汇总台账；可前往用户管理查看已有账户明细。</p>
        <ul className="aul-caveats">
          <li>台账范围为全部已记录账户，无法区分测试账户与真实客户。</li>
          <li>第三方未计量流量不在此台账。</li>
          <li>缺失时间段视为未知，不等于零用量。</li>
          <li>合计对账不是归因证明，也不表示采集器健康。</li>
        </ul>
      </section>
    </div>
  );
}
