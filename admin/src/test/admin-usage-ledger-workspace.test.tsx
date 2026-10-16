import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UsageLedgerReadError,
  type AdminUsageLedgerSummary,
  type UsageLedgerClient,
  type UsageLedgerSampleState
} from "../app/admin-usage-ledger-client";
import { AdminUsageLedgerWorkspace } from "../pages/admin-usage-ledger-workspace";

afterEach(cleanup);

const CUTOFF = "2026-10-16T12:00:00.000Z";
const LARGE = "9007199254740993";
const CATEGORIES = ["local_vless", "local_hy2", "local_tuic", "sgp_vless", "sgp_hy2", "other_sources"] as const;

function def<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function metrics(state: UsageLedgerSampleState, over: Record<string, unknown> = {}) {
  const zero = state === "not_collected" || state === "measured_zero";
  return {
    state,
    sampleCount: state === "not_collected" ? 0 : 1,
    positiveAccountCount: state === "measured" ? 1 : 0,
    uploadBytes: zero ? "0" : "1",
    downloadBytes: zero ? "0" : "2",
    totalBytes: zero ? "0" : "3",
    latestObservedAt: state === "not_collected" ? null : "2026-10-16T11:00:00.000Z",
    ...over
  };
}

function sourcesFor(state: UsageLedgerSampleState, over: Record<string, unknown> = {}) {
  return CATEGORIES.map((category) => (
    category === "local_vless"
      ? { category, ...metrics(state, over) }
      : { category, ...metrics("not_collected") }
  ));
}

function windows(state: UsageLedgerSampleState, over: Record<string, unknown> = {}): AdminUsageLedgerSummary["windows"] {
  const timestamp = Date.parse(CUTOFF);
  const bounds = [
    { id: "all_time" as const, from: null, to: CUTOFF },
    { id: "last_24h" as const, from: new Date(timestamp - 86_400_000).toISOString(), to: CUTOFF },
    { id: "last_7d" as const, from: new Date(timestamp - 7 * 86_400_000).toISOString(), to: CUTOFF },
    { id: "month_to_date" as const, from: "2026-10-01T00:00:00.000Z", to: CUTOFF }
  ];
  return bounds.map((bound) => ({
    ...bound,
    ...metrics(state, over),
    sources: sourcesFor(state, over)
  }));
}

function summary(over: Partial<AdminUsageLedgerSummary> = {}, state: UsageLedgerSampleState = "not_collected"): AdminUsageLedgerSummary {
  return {
    schemaVersion: "admin-usage-ledger/v1",
    cutoff: CUTOFF,
    timezone: "UTC",
    unit: "bytes",
    windows: windows(state),
    reconciliation: {
      scope: "entire_database_snapshot",
      aggregateOnly: true,
      state: "totals_match",
      samples: { sampleCount: state === "not_collected" ? 0 : 1, uploadBytes: "0", downloadBytes: "0", totalBytes: "0" },
      rollups: { rollupCount: state === "not_collected" ? 0 : 1, uploadBytes: "0", downloadBytes: "0", totalBytes: "0" },
      differenceBytes: { uploadBytes: "0", downloadBytes: "0", totalBytes: "0" },
      futureSampleCount: 0,
      atCutoffSampleCount: 0,
      orphanSampleAccountCount: 0,
      orphanRollupAccountCount: 0
    },
    coverage: {
      customerClassification: "not_available",
      population: "all_recorded_accounts",
      sourceClassification: "stored_pairs_not_current_activation",
      thirdPartyUsage: "not_metered_here",
      missingIntervals: "unknown",
      collectorHealth: "not_assessed",
      timestamps: "observation_time_not_commit_time",
      emptySamples: "not_proven_zero_consumption",
      reconciliation: "aggregate_totals_only"
    },
    ...over
  };
}

function measuredSummary(): AdminUsageLedgerSummary {
  const last24 = windows("measured").map((window) => {
    if (window.id !== "last_24h") {
      return {
        ...window,
        ...metrics("measured", {
          uploadBytes: LARGE,
          downloadBytes: "0",
          totalBytes: LARGE
        }),
        sources: sourcesFor("measured", {
          uploadBytes: LARGE,
          downloadBytes: "0",
          totalBytes: LARGE
        })
      };
    }
    return {
      ...window,
      ...metrics("measured", { uploadBytes: "8", downloadBytes: "8", totalBytes: "16", sampleCount: 2, positiveAccountCount: 1 }),
      sources: CATEGORIES.map((category) => {
        if (category === "local_vless") {
          return { category, ...metrics("measured", { uploadBytes: "8", downloadBytes: "0", totalBytes: "8" }) };
        }
        if (category === "sgp_hy2") {
          return { category, ...metrics("measured", { uploadBytes: "0", downloadBytes: "8", totalBytes: "8" }) };
        }
        return { category, ...metrics("not_collected") };
      })
    };
  }) as AdminUsageLedgerSummary["windows"];
  return summary({
    windows: last24,
    reconciliation: {
      scope: "entire_database_snapshot",
      aggregateOnly: true,
      state: "totals_mismatch",
      samples: { sampleCount: 4, uploadBytes: LARGE, downloadBytes: "6", totalBytes: "9007199254740999" },
      rollups: { rollupCount: 1, uploadBytes: "9", downloadBytes: "4", totalBytes: "13" },
      differenceBytes: { uploadBytes: "9007199254740984", downloadBytes: "2", totalBytes: "9007199254740986" },
      futureSampleCount: 3,
      atCutoffSampleCount: 2,
      orphanSampleAccountCount: 4,
      orphanRollupAccountCount: 1
    }
  }, "measured");
}

function client(partial: Partial<UsageLedgerClient> = {}): UsageLedgerClient {
  return {
    summary: vi.fn(async () => summary()),
    ...partial
  };
}

async function load(label = "读取用量台账") {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("AdminUsageLedgerWorkspace", () => {
  it("stays idle with unknown empty copy, one refresh action, and no polling", async () => {
    const c = client();
    render(<AdminUsageLedgerWorkspace createClient={() => c} />);
    expect(c.summary).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "读取用量台账" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "前往用户管理查看账户明细" }).getAttribute("href")).toBe("#/admin/userManagement");
    expect(screen.getByText(/无法区分测试账户与真实客户/)).toBeTruthy();
    expect(screen.getByText(/第三方未计量流量不在此台账/)).toBeTruthy();
    expect(screen.getByText(/缺失时间段视为未知/)).toBeTruthy();
    expect(screen.getByText(/不是归因证明/)).toBeTruthy();
    expect(screen.getByText(/不证明当前节点在线/)).toBeTruthy();
    expect(screen.getByText(/不是已证实的零用量/)).toBeTruthy();
    expect(screen.queryByText(/0 字节/)).toBeNull();
    expect(screen.queryByRole("button", { name: "累计已记录" })).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(c.summary).not.toHaveBeenCalled();
  });

  it("shows loading then empty unknown, not measured zero", async () => {
    const pending = def<AdminUsageLedgerSummary>();
    const c = client({ summary: vi.fn(() => pending.promise) as UsageLedgerClient["summary"] });
    render(<AdminUsageLedgerWorkspace createClient={() => c} />);
    await load();
    expect(screen.getByText("正在读取用量台账")).toBeTruthy();
    pending.resolve(summary());
    await waitFor(() => expect(screen.getByText(/当前截止时刻前没有样本/)).toBeTruthy());
    expect(screen.getAllByText("尚无样本").length).toBeGreaterThan(0);
    expect(screen.queryByText("该窗口已采样，记录用量为 0。")).toBeNull();
    expect(screen.getByText(/样本合计与汇总合计一致/)).toBeTruthy();
    expect(document.querySelector(".aul-recon-match")).toBeTruthy();
    expect(document.querySelector(".ops-metric-success")).toBeNull();
    expect(document.querySelector("[data-state-tone='success']")).toBeNull();
  });

  it("distinguishes measured_zero from empty and displays exact large bytes plus mismatch orphans", async () => {
    const zero = summary({
      windows: windows("measured_zero"),
      reconciliation: {
        scope: "entire_database_snapshot",
        aggregateOnly: true,
        state: "totals_match",
        samples: { sampleCount: 1, uploadBytes: "0", downloadBytes: "0", totalBytes: "0" },
        rollups: { rollupCount: 1, uploadBytes: "0", downloadBytes: "0", totalBytes: "0" },
        differenceBytes: { uploadBytes: "0", downloadBytes: "0", totalBytes: "0" },
        futureSampleCount: 0,
        atCutoffSampleCount: 0,
        orphanSampleAccountCount: 0,
        orphanRollupAccountCount: 0
      }
    }, "measured_zero");
    const c = client({ summary: vi.fn(async () => zero) });
    render(<AdminUsageLedgerWorkspace createClient={() => c} />);
    await load();
    await waitFor(() => expect(screen.getAllByText(/已采样，记录用量为 0/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/当前截止时刻前没有样本/)).toBeNull();
    cleanup();

    const measured = measuredSummary();
    const c2 = client({ summary: vi.fn(async () => measured) });
    render(<AdminUsageLedgerWorkspace createClient={() => c2} userManagementHref="#/admin/userManagement" />);
    await load();
    await waitFor(() => expect(screen.getAllByText(`${LARGE} 字节`).length).toBeGreaterThan(0));
    expect(screen.getByRole("button", { name: /累计已记录/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /近 24 小时/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /近 7 天/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /本 UTC 月/ })).toBeTruthy();
    expect(screen.getByText(/样本合计与汇总合计不一致/)).toBeTruthy();
    expect(screen.getByText("样本中的孤儿账户数").parentElement?.textContent).toContain("4");
    expect(screen.getByText("汇总中的孤儿账户数").parentElement?.textContent).toContain("1");
    expect(screen.getByText("截止时刻之后的样本").parentElement?.textContent).toContain("3");
    expect(screen.getByText("恰好位于截止时刻的样本").parentElement?.textContent).toContain("2");
    fireEvent.click(screen.getByRole("button", { name: /近 24 小时/ }));
    const table = screen.getByRole("table", { name: /选定窗口的已存储来源分类/ });
    expect(within(table).getByText("本地 VLESS（已存储分类）")).toBeTruthy();
    expect(within(table).getByText("新加坡 Hysteria2（已存储分类）")).toBeTruthy();
    expect(within(table).getAllByText("8 字节").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/观测时刻，不是提交时间/).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/账户 ID/)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does not render missing window or source samples as zero bytes", async () => {
    const c = client();
    render(<AdminUsageLedgerWorkspace createClient={() => c} />);
    await load();
    const region = await screen.findByRole("region", { name: "选定窗口来源" });
    expect(within(region).queryByText("0 B")).toBeNull();
    expect(within(region).queryByText("0 字节")).toBeNull();
    expect(within(region).getAllByLabelText("用量未知")).toHaveLength(21);
  });

  it("clears stale totals while refreshing and after errors, without leaking raw bodies", async () => {
    const pending = def<AdminUsageLedgerSummary>();
    let n = 0;
    const c = client({
      summary: vi.fn(() => {
        n += 1;
        if (n === 1) return Promise.resolve(measuredSummary());
        if (n === 2) return pending.promise;
        const error = new UsageLedgerReadError("unavailable");
        error.message = "ECONNRESET token=must-not-leak SELECT account_id";
        return Promise.reject(error);
      }) as UsageLedgerClient["summary"]
    });
    render(<AdminUsageLedgerWorkspace createClient={() => c} />);
    await load();
    await waitFor(() => expect(screen.getAllByText(`${LARGE} 字节`).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
    await waitFor(() => expect(screen.queryByText(`${LARGE} 字节`)).toBeNull());
    expect(screen.getByText("正在读取用量台账")).toBeTruthy();
    const boom = Object.assign(new UsageLedgerReadError("invalid"), { message: "HTML <pre>secret token=must-not-leak</pre>" });
    pending.reject(boom);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/未通过校验/));
    expect(screen.queryByText(/must-not-leak|ECONNRESET|account_id|<pre>/)).toBeNull();
    expect(screen.queryByText(`${LARGE} 字节`)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/暂时无法读取用量台账/));
    expect(screen.queryByText(/must-not-leak|SELECT/)).toBeNull();
  });

  it("maps session and permission failures to safe Chinese copy", async () => {
    const c = client({
      summary: vi.fn(async () => {
        throw Object.assign(new UsageLedgerReadError("session"), { message: "ops@example.com token=secret" });
      })
    });
    render(<AdminUsageLedgerWorkspace createClient={() => c} />);
    await load();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/登录已失效/));
    expect(screen.queryByText(/ops@example|token=/)).toBeNull();
    cleanup();
    const denied = client({
      summary: vi.fn(async () => {
        throw Object.assign(new UsageLedgerReadError("permission"), { message: "users.read SQL" });
      })
    });
    render(<AdminUsageLedgerWorkspace createClient={() => denied} />);
    await load();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/没有权限/));
    expect(screen.queryByText(/users\.read|SQL/)).toBeNull();
  });
});
