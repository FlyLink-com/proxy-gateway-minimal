import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AdminProductionBaselinePageId } from "../app/admin-production-baseline";
import type { MonitorClient } from "../app/use-admin-monitor";
import { AdminMonitorWorkspace } from "../pages/admin-monitor-workspace";
import { AdminProductionBaselinePreview } from "../pages/admin-production-baseline-preview";

const ACCOUNT = { id: "acct_local", status: "active", entitlementCount: 2, usableEntitlementCount: 1 };
const SUSPENDED = { id: "acct_suspended", status: "suspended", entitlementCount: 0, usableEntitlementCount: 0 };
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
  ],
  points: [],
  generatedAt: null,
  from: null,
  to: null,
};
const COLLECTORS = {
  state: "available",
  observedAt: "2026-09-12T15:00:00Z",
  collectors: [{ name: "channel-local-a", state: "healthy", observedAt: "2026-09-12T15:00:00Z", reasons: ["idle_no_user_traffic"] }],
  reasons: [],
};

function mockClient(overrides: Partial<MonitorClient> = {}): MonitorClient {
  return {
    accounts: vi.fn<MonitorClient["accounts"]>(async () => [ACCOUNT, SUSPENDED]),
    entitlements: vi.fn<MonitorClient["entitlements"]>(async () => [ENTITLEMENT]),
    usage: vi.fn<MonitorClient["usage"]>(async () => USAGE),
    collectors: vi.fn<MonitorClient["collectors"]>(async () => COLLECTORS),
    ...overrides,
  };
}

async function flushClick(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await Promise.resolve();
  });
}

function renderWs(pageId: AdminProductionBaselinePageId, client: MonitorClient) {
  return render(<AdminMonitorWorkspace pageId={pageId} createClient={() => client} />);
}

function cardLink(href: string) {
  const link = screen.getAllByRole("link").find((el) => el.getAttribute("href") === href);
  expect(link).toBeTruthy();
  return link as HTMLElement;
}

afterEach(() => {
  cleanup();
});

describe("admin monitor visual finish", () => {
  test("shows visible filter labels without changing accessible control names", async () => {
    const client = mockClient();
    const { rerender } = renderWs("dashboard", client);
    expect(screen.getByRole("button", { name: "开始只读监控" })).not.toBeNull();
    expect(screen.getByLabelText("自动更新")).not.toBeNull();
    expect(document.querySelector(".admin-monitor-toolbar-actions")).not.toBeNull();
    expect(document.querySelector(".admin-monitor-toolbar-refresh")).not.toBeNull();
    expect(document.querySelector(".admin-monitor-toolbar-meta")).not.toBeNull();
    await flushClick("开始只读监控");
    rerender(<AdminMonitorWorkspace pageId="userManagement" createClient={() => client} />);
    const keyword = screen.getByLabelText("筛选当前结果") as HTMLInputElement;
    const status = screen.getByLabelText("状态筛选") as HTMLSelectElement;
    expect(keyword.placeholder).toBe("输入名称或关键词");
    expect(keyword.previousElementSibling?.textContent).toBe("名称或关键词");
    expect(status.previousElementSibling?.textContent).toBe("状态");
    expect(screen.getByRole("button", { name: "更新数据" })).not.toBeNull();
  });

  test("keeps compact aria-labeled sources and real ready counts versus unknown", async () => {
    let resolveAccounts: (value: typeof ACCOUNT[]) => void = () => {};
    const client = mockClient({
      accounts: vi.fn<MonitorClient["accounts"]>(
        () =>
          new Promise((resolve) => {
            resolveAccounts = resolve;
          }),
      ),
    });
    renderWs("dashboard", client);
    expect(screen.getByLabelText("账户来源").closest(".admin-monitor-source-strip")).not.toBeNull();
    expect(within(screen.getByLabelText("账户来源")).getByText("未开始")).not.toBeNull();
    expect(within(screen.getByLabelText("采集器来源")).queryByText("健康")).toBeNull();
    expect(within(cardLink("#/admin-baseline/userManagement")).getByText("尚无可用摘要")).not.toBeNull();
    await flushClick("开始只读监控");
    const accountCard = cardLink("#/admin-baseline/userManagement");
    const entitlementCard = cardLink("#/admin-baseline/portalRequests");
    expect(within(accountCard).getByText("尚无可用摘要")).not.toBeNull();
    expect(within(accountCard).getByText("—").className).toContain("admin-monitor-card-value");
    expect(within(entitlementCard).getByText("本次返回记录")).not.toBeNull();
    expect(within(entitlementCard).getByText("1").className).toContain("admin-monitor-card-value");
    expect(within(screen.getByLabelText("权益来源")).getByText("已返回")).not.toBeNull();
    expect(screen.getByLabelText("权益来源").className).not.toContain("success");
    expect(within(screen.getByLabelText("权益来源")).queryByText(/^0$/)).toBeNull();
    expect(within(screen.getByLabelText("采集器来源")).queryByText("健康")).toBeNull();
    await act(async () => {
      resolveAccounts([ACCOUNT, SUSPENDED]);
      await Promise.resolve();
    });
    expect(within(accountCard).getByText("本次返回记录")).not.toBeNull();
    expect(within(accountCard).getByText("2").className).toContain("admin-monitor-card-value");
    expect(cardLink("#/admin-baseline/usageMonitor")).not.toBeNull();
    expect(cardLink("#/admin-baseline/nodeHealth")).not.toBeNull();
  });

  test("renders status words with semantic tone and collapsed focusable details", async () => {
    const client = mockClient({
      usage: vi.fn<MonitorClient["usage"]>(async () => ({
        items: [
          { accountId: "acct_nc", entitlementId: "", plan: "p", status: "not_collected", usedBytes: null, observedAt: null },
          { accountId: "acct_zero", entitlementId: "", plan: "p", status: "measured_zero", usedBytes: 0, observedAt: "2026-09-12T15:00:00Z" },
          { accountId: "acct_fail", entitlementId: "", plan: "p", status: "failed", usedBytes: null, observedAt: "2026-09-12T15:00:00Z" },
          { accountId: "acct_stale", entitlementId: "", plan: "p", status: "stale", usedBytes: 1, observedAt: "2026-09-12T15:00:00Z" },
          { accountId: "acct_known_unknown", entitlementId: "", plan: "p", status: "unknown", usedBytes: null, observedAt: null },
          { accountId: "acct_unk", entitlementId: "", plan: "p", status: "not_a_real_status", usedBytes: null, observedAt: null },
        ],
        points: [],
        generatedAt: null,
        from: null,
        to: null,
      })),
    });
    const { rerender } = renderWs("dashboard", client);
    await flushClick("开始只读监控");
    rerender(<AdminMonitorWorkspace pageId="usageMonitor" createClient={() => client} />);
    const table = document.querySelector(".admin-monitor-main > .admin-monitor-table-wrap .admin-monitor-table");
    expect(table).not.toBeNull();
    const badge = (accountId: string) => {
      const row = Array.from(table!.querySelectorAll("tbody tr")).find(
        (tr) => { const text = tr.querySelector("td")?.textContent; return text === accountId || text === `未匹配 ${accountId}`; },
      ) as HTMLElement | undefined;
      expect(row).toBeTruthy();
      const el = row!.querySelector(".admin-monitor-status") as HTMLElement | null;
      expect(el).not.toBeNull();
      expect(el!.className).toContain("admin-monitor-status");
      return el!;
    };
    expect(badge("acct_nc").getAttribute("data-tone")).toBe("info");
    expect(badge("acct_nc").getAttribute("data-status")).toBe("not_collected");
    expect(badge("acct_zero").getAttribute("data-tone")).toBe("info");
    expect(badge("acct_zero").getAttribute("data-status")).toBe("measured_zero");
    expect(badge("acct_fail").getAttribute("data-tone")).toBe("danger");
    expect(badge("acct_fail").getAttribute("data-status")).toBe("failed");
    expect(badge("acct_stale").getAttribute("data-tone")).toBe("warning");
    expect(badge("acct_stale").getAttribute("data-status")).toBe("stale");
    expect(badge("acct_known_unknown").getAttribute("data-tone")).toBe("neutral");
    expect(badge("acct_known_unknown").getAttribute("data-status")).toBe("unknown");
    expect(badge("acct_unk").getAttribute("data-tone")).toBe("neutral");
    expect(badge("acct_unk").getAttribute("data-status")).toBe("unknown");
    const details = document.querySelector(".admin-monitor-details") as HTMLDetailsElement | null;
    expect(details).not.toBeNull();
    expect(details!.open).toBe(false);
    const summary = details!.querySelector("summary") as HTMLElement;
    expect(summary.className).toContain("admin-monitor-details-summary");
    expect(summary.getAttribute("tabindex")).toBe("0");
    summary.focus();
    expect(document.activeElement).toBe(summary);
  });

  test("scopes visual finish hooks to the baseline preview stylesheet", () => {
    const css = readFileSync("src/pages/admin-operations-shell.styles.css", "utf8");
    expect(css).toContain(".admin-baseline-preview");
    expect(css).toContain("#f8fafc");
    expect(css).toContain("height: 36px");
    expect(css).toContain(".admin-monitor-source-strip");
    expect(css).toContain(".admin-monitor-status-info");
    expect(css).not.toContain("#4a4a4a");
    render(<AdminProductionBaselinePreview />);
    expect(screen.getByLabelText("Admin production baseline preview status").className).toContain("admin-baseline-preview-note");
    expect(screen.getByLabelText("Admin production baseline preview status").textContent).toMatch(/本地候选/);
    expect(screen.getByLabelText("Admin production baseline preview status").textContent).toMatch(/未连接实时数据/);
  });
});
