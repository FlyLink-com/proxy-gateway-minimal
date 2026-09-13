import { StrictMode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonitorReadError, type MonitorQuery } from '../app/admin-monitor-read-client'
import { useAdminMonitor, type MonitorClient } from '../app/use-admin-monitor'

function def<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j })
  return { promise, resolve, reject }
}

function client(p: Partial<MonitorClient> = {}): MonitorClient {
  return {
    accounts: vi.fn(async () => []),
    entitlements: vi.fn(async () => []),
    usage: vi.fn(async () => usageFix),
    collectors: vi.fn(async () => collFix),
    ...p,
  } as MonitorClient
}

const usageFix = { items: [], points: [], generatedAt: null, from: null, to: null }
const collFix = { state: 'available' as const, observedAt: null, collectors: [], reasons: [] }

const q7 = {
  from: '2026-09-01T00:00:00.000Z',
  to: '2026-09-08T00:00:00.000Z',
  bucket: 'hour',
} as MonitorQuery

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

function vis(hidden: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

const rh = (c: MonitorClient, wrapper?: typeof StrictMode) =>
  renderHook(() => useAdminMonitor(() => c), wrapper ? { wrapper } : undefined)
const calls = (fn: unknown) => (fn as ReturnType<typeof vi.fn>).mock.calls

describe('useAdminMonitor', () => {
  beforeEach(() => { vi.useFakeTimers(); vis(false) })
  afterEach(() => { cleanup(); vi.useRealTimers(); vis(false) })

  it('idle until start; four independent GETs; same-tick double start guarded', async () => {
    const c = client()
    const { result } = rh(c, StrictMode)
    expect(result.current.connected).toBe(false)
    expect(result.current.intervalSeconds).toBe(30)
    expect(result.current.sources.accounts.phase).toBe('idle')
    expect(c.accounts).not.toHaveBeenCalled()
    act(() => { result.current.start(); result.current.start() })
    expect(calls(c.accounts)).toHaveLength(1)
    expect(calls(c.entitlements)).toHaveLength(1)
    expect(calls(c.usage)).toHaveLength(1)
    expect(calls(c.collectors)).toHaveLength(1)
    await flush()
    expect(result.current.connected).toBe(true)
    expect(result.current.sources.accounts.phase).toBe('ready')
    expect(result.current.query.from).toBeTruthy()
    expect(result.current.query.to).toBeTruthy()
    expect(Date.parse(result.current.query.to!) - Date.parse(result.current.query.from!)).toBe(86_400_000)
    const pending = def<unknown[]>()
    const c2 = client({ accounts: vi.fn(() => pending.promise) as MonitorClient['accounts'] })
    const h = rh(c2)
    act(() => {
      h.result.current.start()
      h.result.current.refresh()
      h.result.current.refresh()
      h.result.current.retry('accounts')
    })
    expect(calls(c2.accounts)).toHaveLength(1)
  })

  it('partial safe 401 blocks only that source until retry; unknown -> network', async () => {
    const acc = def<never[]>()
    const c = client({ accounts: vi.fn(() => acc.promise) as MonitorClient['accounts'] })
    const { result } = rh(c)
    act(() => result.current.start())
    await flush()
    expect(result.current.sources.entitlements.phase).toBe('ready')
    await act(async () => acc.reject(new MonitorReadError('session' as never)))
    await flush()
    expect(result.current.sources.accounts).toMatchObject({ phase: 'error', error: 'session', data: null })
    const n = calls(c.accounts).length
    await act(async () => { vi.advanceTimersByTime(30_000) })
    await flush()
    expect(calls(c.accounts)).toHaveLength(n)
    expect(calls(c.entitlements).length).toBeGreaterThan(1)
    ;(c.accounts as ReturnType<typeof vi.fn>).mockImplementation(async () => [])
    await act(async () => result.current.retry('accounts'))
    await flush()
    expect(calls(c.accounts)).toHaveLength(n + 1)
    expect(result.current.sources.accounts.phase).toBe('ready')
    ;(c.collectors as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('x'))
    await act(async () => result.current.retry('collectors'))
    await flush()
    expect(result.current.sources.collectors.error).toBe('network')
  })

  it('interval poll does not overlap; 0 pauses auto; visible refresh still works', async () => {
    const d = { a: def<unknown[]>(), e: def<unknown[]>(), u: def<unknown>(), c: def<unknown>() }
    const c = client({
      accounts: vi.fn(() => d.a.promise) as MonitorClient['accounts'],
      entitlements: vi.fn(() => d.e.promise) as MonitorClient['entitlements'],
      usage: vi.fn(() => d.u.promise) as MonitorClient['usage'],
      collectors: vi.fn(() => d.c.promise) as MonitorClient['collectors'],
    })
    const { result } = rh(c)
    act(() => { result.current.start(); result.current.setIntervalSeconds(10) })
    expect(calls(c.accounts)).toHaveLength(1)
    await act(async () => { vi.advanceTimersByTime(10_000) })
    expect(calls(c.accounts)).toHaveLength(1)
    await act(async () => { d.a.resolve([]); d.e.resolve([]); d.u.resolve(usageFix); d.c.resolve(collFix) })
    await flush()
    await act(async () => { vi.advanceTimersByTime(10_000) })
    expect(calls(c.accounts)).toHaveLength(2)
    act(() => result.current.setIntervalSeconds(0))
    await act(async () => { vi.advanceTimersByTime(30_000) })
    expect(calls(c.accounts)).toHaveLength(2)
    await act(async () => result.current.refresh())
    expect(calls(c.accounts)).toHaveLength(3)
  })

  it('15s timeout ignores late result even if abort is ignored', async () => {
    const d = def<unknown[]>()
    const c = client({ accounts: vi.fn(() => d.promise) as MonitorClient['accounts'] })
    const { result } = rh(c)
    act(() => result.current.start())
    await act(async () => { vi.advanceTimersByTime(15_000) })
    expect(result.current.sources.accounts).toMatchObject({ phase: 'error', error: 'timeout', data: null })
    await act(async () => d.resolve([]))
    await flush()
    expect(result.current.sources.accounts.error).toBe('timeout')
    expect(result.current.sources.accounts.data).toBeNull()
  })

  it('hidden aborts and clears loading; hidden start/refresh skip; visible fresh if interval>0', async () => {
    const d = def<unknown[]>()
    const c = client({ accounts: vi.fn(() => d.promise) as MonitorClient['accounts'] })
    const { result } = rh(c)
    act(() => result.current.start())
    expect(result.current.sources.accounts.phase).toBe('loading')
    act(() => vis(true))
    expect(result.current.sources.accounts.phase).toBe('idle')
    await act(async () => d.resolve([]))
    await flush()
    expect(result.current.sources.accounts.phase).toBe('idle')
    act(() => vis(false))
    expect(calls(c.accounts)).toHaveLength(2)
    const c2 = client()
    const h = rh(c2)
    act(() => vis(true))
    act(() => { h.result.current.start(); h.result.current.refresh() })
    expect(c2.accounts).not.toHaveBeenCalled()
    act(() => vis(false))
    expect(c2.accounts).toHaveBeenCalled()
  })

  it('applyQuery cancels usage and ignores late; fixed blocks usage auto; disconnected start keeps query', async () => {
    const d1 = def<unknown>()
    const d2 = def<unknown>()
    const usage = vi.fn()
      .mockReturnValueOnce(d1.promise)
      .mockReturnValueOnce(d2.promise)
      .mockResolvedValue(usageFix)
    const c = client({ usage: usage as MonitorClient['usage'] })
    const { result } = rh(c)
    act(() => result.current.start())
    act(() => result.current.applyQuery(q7, true))
    expect(result.current.fixedRange).toBe(true)
    expect(result.current.query).toEqual(q7)
    const qBefore = result.current.query
    act(() => result.current.applyQuery({ bucket: 'hour' } as MonitorQuery, false))
    expect(result.current.query).toEqual(qBefore)
    expect(result.current.fixedRange).toBe(true)
    await act(async () => d1.resolve({ old: 1 }))
    await flush()
    expect(result.current.sources.usage.data).not.toEqual({ old: 1 })
    await act(async () => d2.resolve(usageFix))
    await flush()
    expect(result.current.sources.usage.phase).toBe('ready')
    const n = usage.mock.calls.length
    const a = calls(c.accounts).length
    await act(async () => { vi.advanceTimersByTime(30_000) })
    await flush()
    expect(usage.mock.calls).toHaveLength(n)
    expect(calls(c.accounts).length).toBeGreaterThan(a)
    const c3 = client()
    const h = rh(c3)
    act(() => { h.result.current.applyQuery(q7, false); h.result.current.start() })
    expect(calls(c3.usage)[0][1]).toEqual(q7)
    expect(q7.from).toBeTruthy()
    expect(Date.parse(q7.to!) - Date.parse(q7.from!)).toBe(7 * 86_400_000)
  })

  it('stop and unmount abort, clear data, and ignore late results', async () => {
    const pendingSig: AbortSignal[] = []
    const doneSig: AbortSignal[] = []
    const d = def<unknown[]>()
    const c = client({
      accounts: vi.fn(s => { pendingSig.push(s); return d.promise }) as MonitorClient['accounts'],
      entitlements: vi.fn(async s => { doneSig.push(s); return [] }) as MonitorClient['entitlements'],
    })
    const { result } = rh(c)
    act(() => result.current.start())
    await flush()
    act(() => result.current.stop())
    expect(result.current.connected).toBe(false)
    expect(result.current.sources.accounts.phase).toBe('idle')
    expect(pendingSig[0]?.aborted).toBe(true)
    expect(doneSig[0]?.aborted).toBe(false)
    await act(async () => d.resolve([]))
    await flush()
    expect(result.current.sources.accounts.phase).toBe('idle')
    const d2 = def<unknown[]>()
    const c2 = client({ accounts: vi.fn(() => d2.promise) as MonitorClient['accounts'] })
    const h = rh(c2)
    act(() => h.result.current.start())
    h.unmount()
    await act(async () => d2.resolve([]))
    await flush()
  })

  it('sync throw on one source is network and does not block the other three', async () => {
    const c = client({
      accounts: vi.fn(() => { throw new Error('boom') }) as MonitorClient['accounts'],
    })
    const { result } = rh(c)
    act(() => result.current.start())
    await flush()
    expect(result.current.sources.accounts).toMatchObject({ phase: 'error', error: 'network', data: null })
    expect(result.current.sources.entitlements.phase).toBe('ready')
    expect(result.current.sources.usage.phase).toBe('ready')
    expect(result.current.sources.collectors.phase).toBe('ready')
  })
  it('pending fixed query resumes once on visible; completed/denied do not', async () => {
    const d = def<typeof usageFix>()
    const usage = vi.fn()
      .mockReturnValueOnce(d.promise)
      .mockResolvedValue(usageFix)
    const c = client({ usage: usage as MonitorClient['usage'] })
    const { result } = rh(c)
    act(() => result.current.start())
    act(() => result.current.applyQuery(q7, true))
    const n = usage.mock.calls.length
    act(() => vis(true))
    expect(result.current.sources.usage.phase).toBe('idle')
    act(() => vis(false))
    expect(usage.mock.calls).toHaveLength(n + 1)
    expect(usage.mock.calls.at(-1)?.[1]).toEqual(q7)
    await act(async () => d.resolve(usageFix))
    await flush()
    act(() => vis(true))
    act(() => vis(false))
    expect(usage.mock.calls).toHaveLength(n + 1)
    const denied = vi.fn(async () => { throw new MonitorReadError('session' as never) })
    const c2 = client({ usage: denied as MonitorClient['usage'] })
    const h = rh(c2)
    act(() => { h.result.current.start(); h.result.current.applyQuery(q7, true) })
    await flush()
    const dn = denied.mock.calls.length
    act(() => vis(true))
    act(() => vis(false))
    expect(denied.mock.calls).toHaveLength(dn)
    const c3 = client()
    const h3 = rh(c3)
    act(() => vis(true))
    act(() => { h3.result.current.applyQuery(q7, true); h3.result.current.start() })
    expect(c3.usage).not.toHaveBeenCalled()
    act(() => vis(false))
    expect(calls(c3.usage)).toHaveLength(1)
    expect(calls(c3.usage)[0][1]).toEqual(q7)
    act(() => h3.result.current.setIntervalSeconds(0))
    const n3 = calls(c3.usage).length
    act(() => vis(true))
    act(() => vis(false))
    expect(calls(c3.usage)).toHaveLength(n3)
  })

  it('unexpected AbortError is network not loading and never raw', async () => {
    const c = client({
      accounts: vi.fn(() => Promise.reject(new DOMException('secret', 'AbortError'))) as MonitorClient['accounts'],
    })
    const { result } = rh(c)
    act(() => result.current.start())
    await flush()
    expect(result.current.sources.accounts).toMatchObject({ phase: 'error', error: 'network', data: null })
    expect(JSON.stringify(result.current.sources.accounts)).not.toContain('secret')
  })

  it('rejects query window over 31d without mutation', async () => {
    const c = client()
    const { result } = rh(c)
    act(() => result.current.start())
    await flush()
    const before = result.current.query
    const n = calls(c.usage).length
    act(() => result.current.applyQuery({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-10-03T00:00:00.000Z',
      bucket: 'hour',
    } as MonitorQuery, false))
    expect(result.current.query).toEqual(before)
    expect(calls(c.usage)).toHaveLength(n)
  })

  it('hidden start after visible disconnected fixed apply resumes usage once', async () => {
    const c = client()
    const { result } = rh(c)
    act(() => result.current.applyQuery(q7, true))
    act(() => vis(true))
    act(() => result.current.start())
    expect(result.current.connected).toBe(true)
    expect(c.usage).not.toHaveBeenCalled()
    expect(result.current.sources.usage.phase).toBe('idle')
    act(() => vis(false))
    expect(calls(c.usage)).toHaveLength(1)
    expect(calls(c.usage)[0][1]).toEqual(q7)
    await flush()
    const n = calls(c.usage).length
    act(() => vis(true))
    act(() => vis(false))
    expect(calls(c.usage)).toHaveLength(n)
  })

  it('successful apply after session error clears blocked so later auto runs', async () => {
    const usage = vi.fn()
      .mockRejectedValueOnce(new MonitorReadError('session' as never))
      .mockResolvedValue(usageFix)
    const c = client({ usage: usage as MonitorClient['usage'] })
    const { result } = rh(c)
    act(() => { result.current.start(); result.current.setIntervalSeconds(10) })
    await flush()
    expect(result.current.sources.usage).toMatchObject({ phase: 'error', error: 'session' })
    await act(async () => result.current.applyQuery(q7, false))
    await flush()
    expect(result.current.sources.usage.phase).toBe('ready')
    const n = usage.mock.calls.length
    await act(async () => { vi.advanceTimersByTime(10_000) })
    await flush()
    expect(usage.mock.calls.length).toBeGreaterThan(n)
  })

  it('rolling from/to advance by same duration on later refresh', async () => {
    const c = client()
    const { result } = rh(c)
    act(() => result.current.start())
    await flush()
    const q1 = result.current.query
    expect(q1.from).toBeTruthy()
    expect(q1.to).toBeTruthy()
    const dur = Date.parse(q1.to!) - Date.parse(q1.from!)
    expect(dur).toBe(86_400_000)
    await act(async () => { vi.advanceTimersByTime(5_000) })
    await act(async () => result.current.refresh())
    await flush()
    const q2 = result.current.query
    expect(q2.from).toBeTruthy()
    expect(q2.to).toBeTruthy()
    expect(Date.parse(q2.to!) - Date.parse(q2.from!)).toBe(dur)
    expect(Date.parse(q2.to!)).toBeGreaterThan(Date.parse(q1.to!))
    expect(calls(c.usage).at(-1)?.[1]).toMatchObject({ from: q2.from, to: q2.to })
  })
})
