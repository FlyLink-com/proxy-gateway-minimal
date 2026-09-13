import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserMonitorReadError, type UserMonitorClient } from '../app/admin-user-monitor-client';
import { AdminUserMonitorWorkspace } from '../pages/admin-user-monitor-workspace';

afterEach(cleanup);

const TS = '2026-09-12T00:00:00.000Z';
const ID = 'acct_monitor_1';

function growthOf(from: string, to: string) {
  return { generatedAt: TS, from, to, timezone: 'UTC' as const, registeredCount: 2, otherCreatedCount: 1, points: [{ at: from, registeredCount: 2, otherCreatedCount: 1 }] };
}

function coinsOf(accountId: string, nextCursor: string | null = 'coin-next') {
  return {
    generatedAt: TS, accountId,
    wallet: { status: 'active' as const, version: 1, balances: { paidCoins: 120, bonusCoins: 10, rewardCoins: 0 }, spendableUnits: 130, heldUnits: 40, pendingUnits: 5 },
    entries: [
      { entryRef: 'e-res', occurredAt: TS, category: 'available_to_held' as const, coinType: 'paid_coins' as const, amountUnits: 40, availableDeltaUnits: -40, pendingDeltaUnits: 0, heldDeltaUnits: 40, totalDeltaUnits: 0 },
      { entryRef: 'e-cap', occurredAt: TS, category: 'held_to_consumed' as const, coinType: 'paid_coins' as const, amountUnits: 10, availableDeltaUnits: 0, pendingDeltaUnits: 0, heldDeltaUnits: -10, totalDeltaUnits: -10 },
    ],
    nextCursor,
  };
}

type TrafficState = 'not_collected' | 'measured_zero' | 'measured';
function trafficOf(accountId: string, q: { from: string; to: string; bucket?: 'day' | 'hour' }, state: TrafficState = 'measured') {
  const bucket = q.bucket ?? 'day';
  if (state === 'not_collected') {
    return { generatedAt: TS, accountId, from: q.from, to: q.to, bucket, state, sampleCount: 0, lastObservedAt: null, totalBytes: null, uploadBytes: null, downloadBytes: null, points: [] };
  }
  const z = state === 'measured_zero';
  return { generatedAt: TS, accountId, from: q.from, to: q.to, bucket, state, sampleCount: 1, lastObservedAt: q.from, totalBytes: z ? 0 : 300, uploadBytes: z ? 0 : 100, downloadBytes: z ? 0 : 200, points: [{ at: q.from, sampleCount: 1, uploadBytes: z ? 0 : 100, downloadBytes: z ? 0 : 200, totalBytes: z ? 0 : 300 }] };
}

function makeClient(overrides: Partial<Record<'growth' | 'accounts' | 'coins' | 'traffic', ReturnType<typeof vi.fn>>> = {}) {
  const growth = overrides.growth ?? vi.fn(async (r: { from: string; to: string }) => growthOf(r.from, r.to));
  const accounts = overrides.accounts ?? vi.fn(async () => ({
    generatedAt: TS,
    items: [{ id: ID, status: 'active' as const, createdAt: '2026-09-01T00:00:00.000Z', registrationSource: 'self_service_portal' as const, email: 'hidden@example.com', name: 'Secret Name', metadata: { raw: 'nope' } }],
    nextCursor: 'acct-next',
  }));
  const coins = overrides.coins ?? vi.fn(async (id: string) => coinsOf(id));
  const traffic = overrides.traffic ?? vi.fn(async (id: string, q: { from: string; to: string; bucket?: 'day' | 'hour' }) => trafficOf(id, q));
  return { growth, accounts, coins, traffic, client: { growth, accounts, coins, traffic } as unknown as UserMonitorClient };
}

function renderWs(client: UserMonitorClient) {
  render(<AdminUserMonitorWorkspace createClient={() => client} />);
}

async function start() {
  fireEvent.change(screen.getByLabelText('自动更新'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: '开始只读监控' }));
  await waitFor(() => expect(within(screen.getByRole('region', { name: '账户目录' })).getByRole('button', { name: '查看' })).toBeTruthy());
}

async function openRow() {
  fireEvent.click(screen.getByRole('button', { name: '查看' }));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: '关闭用户详情' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Coins 监控' })).getByText('130')).toBeTruthy();
  });
}

describe('AdminUserMonitorWorkspace', () => {
  it('does not query until start and stop leaves no selected detail', async () => {
    const m = makeClient();
    renderWs(m.client);
    expect(m.growth).not.toHaveBeenCalled();
    expect(m.accounts).not.toHaveBeenCalled();
    const idle = screen.getByRole('region', { name: '注册增长' });
    expect(within(idle).getAllByText('—').length).toBeGreaterThan(0);
    expect(within(idle).queryByText('0')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Coins 监控' })).toBeNull();
    expect(screen.queryByRole('region', { name: '流量计量' })).toBeNull();
    await start();
    expect(m.growth).toHaveBeenCalled();
    expect(m.accounts).toHaveBeenCalled();
    expect(m.coins).not.toHaveBeenCalled();
    expect(m.traffic).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Coins 监控' })).toBeNull();
    expect(screen.queryByRole('region', { name: '流量计量' })).toBeNull();
    expect(screen.queryByRole('button', { name: '关闭用户详情' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '停止监控' }));
    expect(screen.queryByRole('button', { name: '关闭用户详情' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Coins 监控' })).toBeNull();
    expect(m.coins).not.toHaveBeenCalled();
  });

  it('loads coins and traffic for the row id and hides private fields', async () => {
    const m = makeClient();
    renderWs(m.client);
    await start();
    await openRow();
    expect(m.coins.mock.calls[0][0]).toBe(ID);
    expect(m.traffic.mock.calls[0][0]).toBe(ID);
    const coinsBox = screen.getByRole('region', { name: 'Coins 监控' });
    expect(within(coinsBox).getByText('120')).toBeTruthy();
    expect(within(coinsBox).getByText('130')).toBeTruthy();
    expect(screen.getAllByText(ID).length).toBeGreaterThan(1);
    expect(screen.queryByText('hidden@example.com')).toBeNull();
    expect(screen.queryByText('Secret Name')).toBeNull();
    expect(screen.queryByText('nope')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '关闭用户详情' }));
    expect(screen.queryByRole('button', { name: '关闭用户详情' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Coins 监控' })).toBeNull();
    expect(screen.queryByRole('region', { name: '流量计量' })).toBeNull();
  });

  it('submits id/status filters and directory cursors', async () => {
    const m = makeClient();
    renderWs(m.client);
    await start();
    fireEvent.change(screen.getByLabelText('账户 ID'), { target: { value: ID } });
    fireEvent.change(screen.getByLabelText('账户状态'), { target: { value: 'suspended' } });
    fireEvent.click(screen.getByRole('button', { name: '筛选账户' }));
    await waitFor(() => expect(m.accounts.mock.calls.some((c) => c[0]?.accountId === ID && c[0]?.status === 'suspended')).toBe(true));
    await waitFor(() => expect((screen.getByRole('button', { name: '下一页账户' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '下一页账户' }));
    await waitFor(() => expect((screen.getByRole('button', { name: '上一页账户' }) as HTMLButtonElement).disabled).toBe(false));
    expect(m.accounts.mock.calls.some((c) => c[0]?.cursor === 'acct-next' && c[0]?.accountId === ID)).toBe(true);
    await waitFor(() => expect((screen.getByRole('button', { name: '上一页账户' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '上一页账户' }));
    await waitFor(() => {
      const q = m.accounts.mock.calls.at(-1)![0] as { cursor?: string; accountId?: string };
      expect(q?.cursor == null || q.cursor === '').toBe(true);
      expect(q?.accountId).toBe(ID);
 });
});

  it('applies 7-day and fixed UTC ranges without refetching coins', async () => {
    const m = makeClient();
    renderWs(m.client);
    await start();
    await openRow();
    const coinsN = m.coins.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '近7天' }));
    await waitFor(() => {
      const r = m.growth.mock.calls.at(-1)![0] as { from: string; to: string };
      expect(Date.parse(r.to) - Date.parse(r.from)).toBe(7 * 86400000);
      expect(r.from.endsWith('Z') && r.to.endsWith('Z')).toBe(true);
      const t = m.traffic.mock.calls.at(-1)![1] as { from: string; to: string };
      expect(t.from).toBe(r.from);
      expect(t.to).toBe(r.to);
    });
    expect(m.coins.mock.calls.length).toBe(coinsN);
    fireEvent.change(screen.getByLabelText('开始时间（UTC）'), { target: { value: '2026-09-01T00:00' } });
    fireEvent.change(screen.getByLabelText('结束时间（UTC）'), { target: { value: '2026-09-03T00:00' } });
    fireEvent.click(screen.getByRole('button', { name: '应用时间范围' }));
    await waitFor(() => {
      const r = m.growth.mock.calls.at(-1)![0] as { from: string; to: string };
      expect(r.from.startsWith('2026-09-01T00:00:00') && r.from.endsWith('Z')).toBe(true);
      expect(r.to.startsWith('2026-09-03T00:00:00') && r.to.endsWith('Z')).toBe(true);
    });
    expect(m.coins.mock.calls.length).toBe(coinsN);
    const growthN = m.growth.mock.calls.length;
    const trafficN = m.traffic.mock.calls.length;
    fireEvent.change(screen.getByLabelText('开始时间（UTC）'), { target: { value: '2026-08-01T00:00' } });
    fireEvent.change(screen.getByLabelText('结束时间（UTC）'), { target: { value: '2026-09-10T00:00' } });
    fireEvent.click(screen.getByRole('button', { name: '应用时间范围' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/31/));
    expect(screen.queryByText(/invalid_range|RangeError|stack/i)).toBeNull();
    expect(m.growth.mock.calls.length).toBe(growthN);
    expect(m.traffic.mock.calls.length).toBe(trafficN);
  });

  it('isolates coins and traffic errors and retries a single source', async () => {
    const m = makeClient({
      coins: vi.fn(async () => {
        const error = new UserMonitorReadError('unavailable');
        error.message = 'ECONNRESET dump';
        throw error;
      }),
      traffic: vi.fn(async () => {
        const error = new UserMonitorReadError('permission');
        error.message = 'AccessDenied token=abc';
        throw error;
      }),
    });
    renderWs(m.client);
    await start();
    fireEvent.click(screen.getByRole('button', { name: '查看' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '重试 Coins' })).toBeTruthy());
    expect(within(screen.getByRole('region', { name: 'Coins 监控' })).getByText(/无法读取|暂时无法/)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: '流量计量' })).getByText(/没有权限/)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Coins 监控' })).queryByText(/没有权限/)).toBeNull();
    expect(screen.queryByText(/ECONNRESET|AccessDenied|token=abc/)).toBeNull();
    const coinsN = m.coins.mock.calls.length;
    const trafficN = m.traffic.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '重试 Coins' }));
    await waitFor(() => expect(m.coins.mock.calls.length).toBe(coinsN + 1));
    expect(m.traffic.mock.calls.length).toBe(trafficN);
    fireEvent.click(screen.getByRole('button', { name: '重试流量计量' }));
    await waitFor(() => expect(m.traffic.mock.calls.length).toBe(trafficN + 1));
    expect(m.coins.mock.calls.length).toBe(coinsN + 1);
  });

  it('keeps missing samples distinct from measured zero', async () => {
    const missing = makeClient({
      traffic: vi.fn(async (id: string, q: { from: string; to: string; bucket?: 'day' | 'hour' }) => trafficOf(id, q, 'not_collected')),
    });
    renderWs(missing.client);
    await start();
    await openRow();
    expect(screen.getByText('尚无计量样本')).toBeTruthy();
    expect(screen.queryByText('已采样，区间用量为 0')).toBeNull();
    cleanup();
    const zero = makeClient({
      traffic: vi.fn(async (id: string, q: { from: string; to: string; bucket?: 'day' | 'hour' }) => trafficOf(id, q, 'measured_zero')),
    });
    renderWs(zero.client);
    await start();
    await openRow();
    expect(screen.getByText('已采样，区间用量为 0')).toBeTruthy();
    expect(screen.queryByText('尚无计量样本')).toBeNull();
  });

  it('shows reserve and capture labels and forwards ledger cursors', async () => {
    const m = makeClient();
    renderWs(m.client);
    await start();
    await openRow();
    expect(screen.getAllByText('订单预留').length).toBeGreaterThan(0);
    expect(screen.getByText('消费完成')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Coins 监控' })).getByText('130')).toBeTruthy();
    await waitFor(() => expect((screen.getByRole('button', { name: '下一页账变' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '下一页账变' }));
    await waitFor(() => expect((screen.getByRole('button', { name: '上一页账变' }) as HTMLButtonElement).disabled).toBe(false));
    expect(m.coins.mock.calls.some((c) => c[1]?.cursor === 'coin-next')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '上一页账变' }));
    await waitFor(() => {
      const q = m.coins.mock.calls.at(-1)![1] as { cursor?: string } | undefined;
      expect(q?.cursor == null || q.cursor === '').toBe(true);
    });
  });

  it('passes hour traffic bucket and exposes accessible chart tables', async () => {
    const m = makeClient();
    renderWs(m.client);
    await start();
    const daily = screen.getByText('查看每日数据').closest('details') as HTMLElement;
    expect(daily?.querySelector('summary')).toBeTruthy();
    expect(within(daily).getByRole('table', { hidden: true })).toBeTruthy();
    await openRow();
    fireEvent.change(screen.getByLabelText('流量粒度'), { target: { value: 'hour' } });
    await waitFor(() => expect(m.traffic.mock.calls.some((c) => c[1]?.bucket === 'hour')).toBe(true));
    const flow = screen.getByText('查看流量数据').closest('details') as HTMLElement;
    expect(flow?.querySelector('summary')).toBeTruthy();
    expect(within(flow).getByRole('table', { hidden: true })).toBeTruthy();
  });

  it('retries account directory after next-page failure without discarding pending cursor', async () => {
    const firstPage = {
      generatedAt: TS,
      items: [{ id: ID, status: 'active' as const, createdAt: '2026-09-01T00:00:00.000Z', registrationSource: 'self_service_portal' as const, email: 'hidden@example.com', name: 'Secret Name', metadata: { raw: 'nope' } }],
      nextCursor: 'c2',
    };
    const secondPage = {
      generatedAt: TS,
      items: [{ id: 'acct_monitor_2', status: 'active' as const, createdAt: '2026-09-02T00:00:00.000Z', registrationSource: 'self_service_portal' as const, email: 'hidden2@example.com', name: 'Secret Two', metadata: { raw: 'nope' } }],
      nextCursor: null as string | null,
    };
    let accountsCalls = 0;
    const accounts = vi.fn(async (_q: { cursor?: string; limit?: number }) => {
      accountsCalls += 1;
      if (accountsCalls === 1) return firstPage;
      if (accountsCalls === 2) throw new UserMonitorReadError('unavailable');
      if (accountsCalls === 3) return secondPage;
      return firstPage;
    });
    const m = makeClient({ accounts });
    renderWs(m.client);
    await start();
    fireEvent.click(screen.getByRole('button', { name: '下一页账户' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '重试账户目录' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '重试账户目录' }));
    await waitFor(() => {
      const prev = screen.getByRole('button', { name: '上一页账户' }) as HTMLButtonElement;
      expect(prev.disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: '上一页账户' }));
    await waitFor(() => expect(accounts.mock.calls.length).toBeGreaterThanOrEqual(4));
    const lastQuery = accounts.mock.calls[accounts.mock.calls.length - 1][0] as { cursor?: string; limit?: number };
    expect(lastQuery.cursor).toBeUndefined();
    expect(lastQuery.limit).toBe(20);
    expect(accounts.mock.calls.filter((c) => (c[0] as { cursor?: string }).cursor === 'c2')).toHaveLength(2);
  });

  it('renders a visible positive-height traffic bar for a small 300 B sample including a partial first bucket', async () => {
    const traffic = vi.fn(async (id: string, q: { from: string; to: string; bucket?: 'day' | 'hour' }) => {
      const fromMs = Date.parse(q.from);
      const bucketMs = (q.bucket ?? 'day') === 'hour' ? 3600000 : 86400000;
      const bucketFloor = new Date(Math.floor(fromMs / bucketMs) * bucketMs).toISOString();
      return {
        generatedAt: TS,
        accountId: id,
        from: q.from,
        to: q.to,
        bucket: q.bucket ?? 'day',
        state: 'measured' as const,
        sampleCount: 1,
        lastObservedAt: q.from,
        totalBytes: 300,
        uploadBytes: 100,
        downloadBytes: 200,
        points: [{ at: bucketFloor, sampleCount: 1, uploadBytes: 100, downloadBytes: 200, totalBytes: 300 }],
      };
    });
    const m = makeClient({ traffic });
    renderWs(m.client);
    await start();
    await openRow();
    const chart = await waitFor(() => within(screen.getByRole('region', { name: '流量计量' })).getByRole('img', { name: '流量计量' }));
    const rects = chart.querySelectorAll('rect');
    expect(rects.length).toBeGreaterThan(0);
    expect([...rects].some((r) => Number(r.getAttribute('height') ?? '0') >= 1)).toBe(true);
    expect(Number(rects[0].getAttribute('x') ?? '-1')).toBeGreaterThanOrEqual(0);
    expect(within(screen.getByRole('region', { name: '流量计量' })).getAllByText('300 B').length).toBeGreaterThan(0);
  });
});
