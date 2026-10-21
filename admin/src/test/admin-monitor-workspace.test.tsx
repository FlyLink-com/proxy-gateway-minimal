import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MonitorReadError } from "../app/admin-monitor-read-client";
import type { MonitorClient } from "../app/use-admin-monitor";
import type { AdminProductionBaselinePageId } from "../app/admin-production-baseline";
import { AdminMonitorWorkspace } from "../pages/admin-monitor-workspace";

const ACCOUNT = { id: "acct_local", status: "active", entitlementCount: 2, usableEntitlementCount: 1 };
const SUSPENDED = { id: "acct_suspended", status: "suspended", entitlementCount: 0, usableEntitlementCount: 0 };
const ACCT_A = { id: "acct_a", status: "active", entitlementCount: 1, usableEntitlementCount: 1 };
const ENTITLEMENT = {
  id: "ent_local",
  accountId: "acct_local",
  plan: "100 GB 月卡",
  status: "active",
  usable: true,
  validUntil: "2026-10-12T00:00:00Z",
};
const USAGE = {
  items: [
    { accountId: "acct_local", entitlementId: "", plan: "100 GB 月卡", status: "measured", usedBytes: 1073741824, observedAt: "2026-09-12T15:00:00Z" },
    { accountId: "acct_suspended", entitlementId: "", plan: "100 GB 月卡", status: "measured", usedBytes: 0, observedAt: "2026-09-12T15:00:00Z" },
    { accountId: "acct_tiny", entitlementId: "", plan: "100 GB 月卡", status: "measured", usedBytes: 1, observedAt: "2026-09-12T15:00:00Z" },
    { accountId: "acct_missing", entitlementId: "", plan: "100 GB 月卡", status: "measured", usedBytes: null, observedAt: "2026-09-12T15:00:00Z" },
  ],
  points: [
    { at: "2026-09-12T14:00:00Z", uploadBytes: null, downloadBytes: 0, totalBytes: 1073741824 },
    { at: "2026-09-12T14:05:00Z", uploadBytes: 1, downloadBytes: null, totalBytes: null },
  ],
  generatedAt: "2026-09-12T15:10:00Z",
  from: null,
  to: null,
};
const COLLECTORS = {
  state: "available",
  observedAt: "2026-09-12T15:00:00Z",
  collectors: [{
    name: "channel-local-a",
    state: "healthy",
    observedAt: "2026-09-12T15:00:00Z",
    reasons: ["idle_no_user_traffic"],
  }],
  reasons: [],
};

function permissionError() {
  const error = new MonitorReadError("permission");
  error.message = "RAW_EACCES_STACK_TRACE_DUMP";
  return error;
}

function signalOf(args: unknown[]) {
  for (const arg of args) {
    if (arg instanceof AbortSignal) return arg;
    if (arg && typeof arg === "object" && "signal" in arg && (arg as { signal: unknown }).signal instanceof AbortSignal) {
      return (arg as { signal: AbortSignal }).signal;
    }
  }
}

function mockClient(overrides: Partial<MonitorClient> = {}): MonitorClient {
  return {
    accounts: vi.fn<MonitorClient["accounts"]>(async () => [ACCOUNT, SUSPENDED]),
    entitlements: vi.fn<MonitorClient["entitlements"]>(async () => [ENTITLEMENT]),
    usage: vi.fn<MonitorClient["usage"]>(async () => USAGE),
    collectors: vi.fn<MonitorClient["collectors"]>(async () => COLLECTORS),
    ...overrides,
  };
}

function mocked(client: MonitorClient) {
  return {
    accounts: vi.mocked(client.accounts),
    entitlements: vi.mocked(client.entitlements),
    usage: vi.mocked(client.usage),
    collectors: vi.mocked(client.collectors),
  };
}

async function flushClick(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await Promise.resolve();
  });
}

function renderWs(pageId: AdminProductionBaselinePageId, client: MonitorClient, children?: React.ReactNode) {
  return render(
    <AdminMonitorWorkspace pageId={pageId} createClient={() => client}>
      {children}
    </AdminMonitorWorkspace>,
  );
}

afterEach(() => {
  cleanup();
});

describe("admin monitor workspace", () => {
  test("does not GET until start, dashboard stays summary-only, and stop aborts a pending read", async () => {
    let resolveAccounts: (value: typeof ACCOUNT[]) => void = () => {};
    let pendingSignal: AbortSignal | undefined;
    const client = mockClient({
      accounts: vi.fn<MonitorClient["accounts"]>((...args) => {
        pendingSignal = signalOf(args);
        return new Promise((resolve) => {
          resolveAccounts = resolve;
        });
      }),
    });
    const spies = mocked(client);
    renderWs("dashboard", client);
    expect(spies.accounts).not.toHaveBeenCalled();
    expect(spies.entitlements).not.toHaveBeenCalled();
    expect(spies.usage).not.toHaveBeenCalled();
    expect(spies.collectors).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "开始只读监控" })).not.toBeNull();
    expect((screen.getByLabelText("自动更新") as HTMLSelectElement).value).toBe("30");
    expect(screen.queryByRole("button", { name: "更新数据" })).toBeNull();
    expect(screen.queryByLabelText("筛选当前结果")).toBeNull();

    await flushClick("开始只读监控");
    expect(spies.accounts).toHaveBeenCalledTimes(1);
    expect(spies.entitlements).toHaveBeenCalledTimes(1);
    expect(spies.usage).toHaveBeenCalledTimes(1);
    expect(spies.collectors).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("link").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByRole("columnheader", { name: "账户" })).toBeNull();
    expect(screen.queryByText("acct_local")).toBeNull();
    expect(screen.getByLabelText("账户来源")).not.toBeNull();
    expect(screen.getByLabelText("权益来源")).not.toBeNull();
    expect(screen.getByLabelText("用量来源")).not.toBeNull();
    expect(screen.getByLabelText("采集器来源")).not.toBeNull();

    await flushClick("停止监控");
    expect(pendingSignal?.aborted).toBe(true);
    await act(async () => {
      resolveAccounts([ACCOUNT, SUSPENDED]);
      await Promise.resolve();
    });
    expect(screen.queryByText("acct_local")).toBeNull();
  });

  test("retries a permission-denied account source without requerying the others", async () => {
    const client = mockClient({
      accounts: vi.fn<MonitorClient["accounts"]>(async () => {
        throw permissionError();
      }),
    });
    const spies = mocked(client);
    const { rerender } = renderWs("dashboard", client);
    await flushClick("开始只读监控");
    expect(document.body.textContent ?? "").not.toContain("RAW_EACCES_STACK_TRACE_DUMP");
    expect(within(screen.getByLabelText("账户来源")).getByRole("button", { name: "重试账户" })).not.toBeNull();
    expect(within(screen.getByLabelText("权益来源")).queryByRole("button", { name: "重试权益" })).toBeNull();
    const other = {
      entitlements: spies.entitlements.mock.calls.length,
      usage: spies.usage.mock.calls.length,
      collectors: spies.collectors.mock.calls.length,
    };
    spies.accounts.mockImplementationOnce(async () => [ACCOUNT, SUSPENDED]);
    await flushClick("重试账户");
    expect(spies.accounts.mock.calls.length).toBeGreaterThan(1);
    expect(spies.entitlements.mock.calls.length).toBe(other.entitlements);
    expect(spies.usage.mock.calls.length).toBe(other.usage);
    expect(spies.collectors.mock.calls.length).toBe(other.collectors);
    rerender(<AdminMonitorWorkspace pageId="userManagement" createClient={() => client} />);
    expect(screen.getAllByText("acct_local").length).toBeGreaterThan(0);
    expect(document.body.textContent ?? "").not.toContain("RAW_EACCES_STACK_TRACE_DUMP");
  });

  test("filters locally across navigation without a fresh GET", async () => {
    const client = mockClient();
    const spies = mocked(client);
    const { rerender } = renderWs("dashboard", client);
    await flushClick("开始只读监控");
    rerender(<AdminMonitorWorkspace pageId="userManagement" createClient={() => client} />);
    const table = screen.getByRole("table");
    for (const name of ["账户", "状态", "权益数", "可用权益", "详情"]) {
      expect(within(table).getByRole("columnheader", { name })).not.toBeNull();
    }
    const status = screen.getByLabelText("状态筛选") as HTMLSelectElement;
    expect(status.querySelector('option[value="active"]')).not.toBeNull();
    expect(status.querySelector('option[value="suspended"]')).not.toBeNull();
    expect(status.querySelector('option[value="inactive"]')).toBeNull();
    fireEvent.change(screen.getByLabelText("筛选当前结果"), { target: { value: "acct_local" } });
    expect(screen.getAllByText("acct_local").length).toBeGreaterThan(0);
    expect(screen.queryByText("acct_suspended")).toBeNull();
    fireEvent.change(status, { target: { value: "suspended" } });
    expect(screen.queryByText("acct_local")).toBeNull();
    fireEvent.change(status, { target: { value: "active" } });
    expect(screen.getAllByText("acct_local").length).toBeGreaterThan(0);
    expect(spies.accounts).toHaveBeenCalledTimes(1);
    rerender(<AdminMonitorWorkspace pageId="portalRequests" createClient={() => client} />);
    rerender(<AdminMonitorWorkspace pageId="userManagement" createClient={() => client} />);
    expect((screen.getByLabelText("筛选当前结果") as HTMLInputElement).value).toBe("acct_local");
    expect((screen.getByLabelText("状态筛选") as HTMLSelectElement).value).toBe("active");
    expect(spies.accounts).toHaveBeenCalledTimes(1);
    expect(spies.entitlements).toHaveBeenCalledTimes(1);
  });

  test("paginates twenty-one accounts locally", async () => {
    const accounts = Array.from({ length: 21 }, (_, index) => ({ ...ACCOUNT, id: `acct_${index + 1}` }));
    const client = mockClient({ accounts: vi.fn<MonitorClient["accounts"]>(async () => accounts) });
    const { rerender } = renderWs("dashboard", client);
    await flushClick("开始只读监控");
    rerender(<AdminMonitorWorkspace pageId="userManagement" createClient={() => client} />);
    expect(screen.getAllByText("acct_1").length).toBeGreaterThan(0);
    expect(screen.queryByText("acct_21")).toBeNull();
    await flushClick("下一页");
    expect(screen.getAllByText("acct_21").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "上一页" })).not.toBeNull();
    expect(vi.mocked(client.accounts)).toHaveBeenCalledTimes(1);
    await flushClick("上一页");
    expect(screen.getAllByText("acct_1").length).toBeGreaterThan(0);
  });

  test("renders GiB column cells as 1, 0, em dash, and tiny positives without Mbps", async () => {
    const client = mockClient();
    const { rerender } = renderWs("dashboard", client);
    await flushClick("开始只读监控");
    rerender(<AdminMonitorWorkspace pageId="usageMonitor" createClient={() => client} />);
    const current = screen.getAllByRole("table")[0];
    expect(within(current).getByRole("columnheader", { name: /GiB/ })).not.toBeNull();
    expect(within(current).getByRole("cell", { name: "1" })).not.toBeNull();
    expect(within(current).getByRole("cell", { name: "0" })).not.toBeNull();
    expect(within(current).getAllByRole("cell", { name: "—" }).length).toBeGreaterThan(0);
    expect(within(current).getByRole("cell", { name: "<0.000001" })).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/Mbps/i);
    expect(document.body.textContent ?? "").toMatch(/2026\/9\/12|2026\/09\/12/);
    expect(document.body.textContent ?? "").not.toMatch(/2026-09-12/);
    rerender(<AdminMonitorWorkspace pageId="nodeBandwidth" createClient={() => client} />);
    const history = screen.getAllByRole("table")[0];
    for (const name of ["上行 GiB", "下行 GiB", "合计 GiB"]) {
      expect(within(history).getByRole("columnheader", { name })).not.toBeNull();
    }
    expect(within(history).getByRole("cell", { name: "1" })).not.toBeNull();
    expect(within(history).getByRole("cell", { name: "0" })).not.toBeNull();
    const generatedStamp = new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(new Date(USAGE.generatedAt));
    expect(document.body.textContent ?? "").toContain(generatedStamp);
  });

  test("shows raw bytes and charged bytes without turning a missing charge into zero", async () => {
    const client = mockClient({
      usage: vi.fn<MonitorClient["usage"]>(async () => ({
        ...USAGE,
        ratingBoundary: { version: 2, effectiveNotBefore: "2026-10-01T00:00:00.000Z" },
        items: [
          { accountId: "acct_rated", entitlementId: "ent_rated", plan: "30 天", status: "measured", usedBytes: 2, observedAt: "2026-10-01T00:01:00.000Z", rawUsedBytes: 1, chargedUsedBytes: 2, ratingState: "rated" },
          { accountId: "acct_missing", entitlementId: "ent_missing", plan: "30 天", status: "not_collected", usedBytes: null, observedAt: null, rawUsedBytes: 1, chargedUsedBytes: null, ratingState: "charge_missing" },
          { accountId: "acct_unknown", entitlementId: "ent_unknown", plan: "30 天", status: "not_collected", usedBytes: null, observedAt: null, rawUsedBytes: 0, chargedUsedBytes: null, ratingState: "unobserved" }
        ]
      }))
    });
    const { rerender } = renderWs("dashboard", client);
    await flushClick("开始只读监控");
    rerender(<AdminMonitorWorkspace pageId="usageMonitor" createClient={() => client} />);
    expect(screen.getByText(/当前策略边界：2026-10-01T00:00:00.000Z，已生效版本 2/)).toBeTruthy();
    const table = screen.getAllByRole("table")[0];
    expect(within(table).getByRole("columnheader", { name: "原始字节" })).not.toBeNull();
    expect(within(table).getByRole("columnheader", { name: "额度扣减" })).not.toBeNull();
    expect(within(table).getAllByRole("cell", { name: "1 字节" })).toHaveLength(2);
    expect(within(table).getByRole("cell", { name: "2 字节" })).not.toBeNull();
    expect(within(table).getByRole("cell", { name: "异常" })).not.toBeNull();
    expect(within(table).getAllByRole("cell", { name: "未知" })).toHaveLength(2);
    expect(within(table).queryByRole("cell", { name: "0" })).toBeNull();
    expect(within(table).queryByRole("cell", { name: "0 字节" })).toBeNull();
  });

  test("applies valid custom history bounds and a single nodeRef, rejecting invalid input without extra usage calls", async () => {
    let resolveUsage: (value: typeof USAGE) => void = () => {};
    const client = mockClient();
    const spies = mocked(client);
    const { rerender } = renderWs("dashboard", client);
    await flushClick("开始只读监控");
    rerender(<AdminMonitorWorkspace pageId="usageMonitor" createClient={() => client} />);
    const range = screen.getByLabelText("时间范围") as HTMLSelectElement;
    expect(["24h", "7d", "custom"].every((value) => range.querySelector(`option[value="${value}"]`))).toBe(true);
    expect(screen.queryByLabelText("开始时间")).toBeNull();
    fireEvent.change(range, { target: { value: "custom" } });
    expect(screen.getByLabelText("开始时间")).not.toBeNull();
    expect(screen.getByLabelText("结束时间")).not.toBeNull();
    const granularity = screen.getByLabelText("粒度") as HTMLSelectElement;
    expect(granularity.querySelector('option[value="hour"]')).not.toBeNull();
    expect(granularity.querySelector('option[value="day"]')).not.toBeNull();
    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "2026-09-11T00:00" } });
    fireEvent.change(screen.getByLabelText("结束时间"), { target: { value: "2026-09-12T15:00" } });
    fireEvent.change(screen.getByLabelText("匹配节点的资源范围"), { target: { value: "channel-local-a" } });
    spies.usage.mockImplementationOnce(() => new Promise((resolve) => {
      resolveUsage = resolve;
    }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "应用时间范围" }));
    });
    expect(within(screen.getAllByRole("table")[0]).queryByRole("cell", { name: "1" })).toBeNull();
    await act(async () => {
      resolveUsage(USAGE);
      await Promise.resolve();
    });
    expect(spies.usage.mock.calls.length).toBe(2);
    expect(JSON.stringify(spies.usage.mock.calls.at(-1))).toContain("channel-local-a");
    const afterValid = spies.usage.mock.calls.length;
    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "2026-09-12T15:00" } });
    fireEvent.change(screen.getByLabelText("结束时间"), { target: { value: "2026-09-11T00:00" } });
    await flushClick("应用时间范围");
    fireEvent.change(screen.getByLabelText("匹配节点的资源范围"), { target: { value: "channel-local-a,channel-b" } });
    await flushClick("应用时间范围");
    fireEvent.change(screen.getByLabelText("匹配节点的资源范围"), { target: { value: "https://example.invalid/node" } });
    await flushClick("应用时间范围");
    expect(spies.usage.mock.calls.length).toBe(afterValid);
  });

  test("does not fabricate inventory zeros on entitlement failure and joins acct_a exactly", async () => {
    const joinUsage = {
      ...USAGE,
      items: [
        { accountId: "acct_a", entitlementId: "", plan: "100 GB 月卡", status: "measured", usedBytes: 1073741824, observedAt: "2026-09-12T15:00:00Z" },
        { accountId: "acct_ab", entitlementId: "", plan: "100 GB 月卡", status: "measured", usedBytes: 0, observedAt: "2026-09-12T15:00:00Z" },
        { accountId: "acct_other", entitlementId: "", plan: "100 GB 月卡", status: "measured", usedBytes: 1, observedAt: "2026-09-12T15:00:00Z" },
      ],
    };
    const client = mockClient({
      accounts: vi.fn<MonitorClient["accounts"]>(async () => [ACCT_A]),
      entitlements: vi.fn<MonitorClient["entitlements"]>(async () => {
        throw permissionError();
      }),
      usage: vi.fn<MonitorClient["usage"]>(async () => joinUsage),
    });
    const { rerender } = renderWs("dashboard", client);
    await flushClick("开始只读监控");
    expect(document.body.textContent ?? "").not.toContain("RAW_EACCES_STACK_TRACE_DUMP");
    expect(within(screen.getByLabelText("权益来源")).getByRole("button", { name: "重试权益" })).not.toBeNull();
    expect(within(screen.getByLabelText("权益来源")).queryByText(/^0$/)).toBeNull();
    rerender(<AdminMonitorWorkspace pageId="portalRequests" createClient={() => client} />);
    expect(screen.queryByText("ent_local")).toBeNull();
    rerender(<AdminMonitorWorkspace pageId="usageMonitor" createClient={() => client} />);
    const rowA = screen.getAllByRole("row").find((row) => within(row).queryByRole("cell", { name: "acct_a" }));
    const rowAb = screen.getAllByRole("row").find((row) => within(row).queryByRole("cell", { name: "未匹配 acct_ab" }));
    const rowOther = screen.getAllByRole("row").find((row) => within(row).queryByRole("cell", { name: "未匹配 acct_other" }));
    expect(rowA).toBeTruthy();
    expect(rowAb).toBeTruthy();
    expect(rowOther).toBeTruthy();
    expect(within(rowA!).queryByText(/未匹配/)).toBeNull();
    expect(within(rowAb!).getByRole("cell", { name: "未匹配 acct_ab" })).not.toBeNull();
    expect(within(rowOther!).getByRole("cell", { name: "未匹配 acct_other" })).not.toBeNull();
    expect(vi.mocked(client.accounts)).toHaveBeenCalledTimes(1);
  });

  test("collector name filter shows 无匹配记录 instead of a not-started empty inventory", async () => {
    const client = mockClient();
    const { rerender } = renderWs("dashboard", client);
    await flushClick("开始只读监控");
    rerender(<AdminMonitorWorkspace pageId="nodeHealth" createClient={() => client} />);
    expect(screen.getByText("空闲无用户流量")).not.toBeNull();
    expect(screen.getAllByText("channel-local-a").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("筛选当前结果"), { target: { value: "空闲无用户流量" } });
    expect(screen.getByText("空闲无用户流量")).not.toBeNull();
    expect(screen.getAllByText("channel-local-a").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("筛选当前结果"), { target: { value: "no-such-collector" } });
    expect(screen.getByText("无匹配记录")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "开始只读监控" })).toBeNull();
    expect(screen.getByRole("button", { name: "更新数据" })).not.toBeNull();
    expect(screen.queryByText("channel-local-a")).toBeNull();
    rerender(<AdminMonitorWorkspace pageId="nodeLogs" createClient={() => client} />);
    expect(vi.mocked(client.collectors)).toHaveBeenCalledTimes(1);
  });

  test("keeps a selected status after refresh returns no row for that status", async () => {
    const client = mockClient();
    const spies = mocked(client);
    const { rerender } = renderWs("dashboard", client);
    await flushClick("开始只读监控");
    rerender(<AdminMonitorWorkspace pageId="userManagement" createClient={() => client} />);
    fireEvent.change(screen.getByLabelText("状态筛选"), { target: { value: "suspended" } });
    expect(screen.getAllByText("acct_suspended").length).toBeGreaterThan(0);
    spies.accounts.mockImplementationOnce(async () => [ACCOUNT]);
    await flushClick("更新数据");
    expect((screen.getByLabelText("状态筛选") as HTMLSelectElement).value).toBe("suspended");
    expect(screen.getByText(/无匹配记录|无返回记录/)).not.toBeNull();
    expect(screen.queryByText("acct_local")).toBeNull();
    expect(screen.queryByText("acct_suspended")).toBeNull();
  });

  test("keeps the toolbar on unsupported pages so stop remains available without extra reads", async () => {
    const client = mockClient();
    const spies = mocked(client);
    const { rerender } = renderWs("dashboard", client);
    await flushClick("开始只读监控");
    const calls = {
      accounts: spies.accounts.mock.calls.length,
      entitlements: spies.entitlements.mock.calls.length,
      usage: spies.usage.mock.calls.length,
      collectors: spies.collectors.mock.calls.length,
    };
    for (const pageId of ["orderRecords", "userAccessLogs", "userOperationLogs"] as const) {
      rerender(
        <AdminMonitorWorkspace pageId={pageId} createClient={() => client}>
          <p>{`${pageId}-fallback`}</p>
        </AdminMonitorWorkspace>,
      );
      expect(screen.getByText(`${pageId}-fallback`)).not.toBeNull();
      expect(screen.getByRole("button", { name: "停止监控" })).not.toBeNull();
      expect(screen.getByRole("button", { name: "更新数据" })).not.toBeNull();
    }
    expect(spies.accounts.mock.calls.length).toBe(calls.accounts);
    expect(spies.entitlements.mock.calls.length).toBe(calls.entitlements);
    expect(spies.usage.mock.calls.length).toBe(calls.usage);
    expect(spies.collectors.mock.calls.length).toBe(calls.collectors);
  });
});
