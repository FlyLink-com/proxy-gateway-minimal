import { useEffect, useRef, useState } from 'react'
import {
  createAdminMonitorReadClient,
  MonitorReadError,
  type MonitorQuery,
} from './admin-monitor-read-client'

export type MonitorClient = ReturnType<typeof createAdminMonitorReadClient>
export type SourceKey = 'accounts' | 'entitlements' | 'usage' | 'collectors'
export type SourceState<T> = {
  phase: 'idle' | 'loading' | 'ready' | 'error'
  data: T | null
  error: 'session' | 'permission' | 'unavailable' | 'invalid' | 'network' | 'timeout' | null
  fetchedAt: string | null
}
export type MonitorSources = {
  [K in SourceKey]: SourceState<Awaited<ReturnType<MonitorClient[K]>>>
}

const KEYS = ['accounts', 'entitlements', 'usage', 'collectors'] as const
const SAFE = ['session', 'permission', 'unavailable', 'invalid', 'network', 'timeout'] as const
type SafeErr = Exclude<SourceState<unknown>['error'], null>
type Slot = { gen: number; ac: AbortController | null; to: ReturnType<typeof setTimeout> | null; blocked: boolean }

const idle = <T,>(): SourceState<T> => ({ phase: 'idle', data: null, error: null, fetchedAt: null })
const init = (): MonitorSources => ({
  accounts: idle(), entitlements: idle(), usage: idle(), collectors: idle(),
})

function rolling24h(): MonitorQuery {
  const to = Date.now()
  return { from: new Date(to - 86_400_000).toISOString(), to: new Date(to).toISOString(), bucket: 'hour' } as MonitorQuery
}

function codeOf(e: unknown): SafeErr {
  if (e instanceof Error && e.name === 'AbortError') return 'network'
  if (e instanceof MonitorReadError) {
    const x = e as { code?: string; status?: number; message: string }
    if (x.code && (SAFE as readonly string[]).includes(x.code)) return x.code as SafeErr
    if (x.status === 401) return 'session'
    if (x.status === 403) return 'permission'
  }
  return 'network'
}

function pair(q: MonitorQuery): { from: string; to: string } | null {
  const from = q.from
  const to = q.to
  if (typeof from !== 'string' || typeof to !== 'string') return null
  const a = Date.parse(from)
  const b = Date.parse(to)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null
  if (b - a > 31 * 86_400_000) return null
  return { from, to }
}

export function useAdminMonitor(createClient: () => MonitorClient = createAdminMonitorReadClient) {
  const [connected, setConnected] = useState(false)
  const [intervalSeconds, setIv] = useState(30)
  const [sources, setSources] = useState(init)
  const [query, setQuery] = useState(rolling24h)
  const [fixedRange, setFixed] = useState(false)
  const mounted = useRef(true)
  const vis = useRef(typeof document === 'undefined' || document.visibilityState !== 'hidden')
  const connectedR = useRef(false)
  const queryR = useRef(query)
  const fixedR = useRef(false)
  const ivR = useRef(30)
  const createR = useRef(createClient)
  const clientR = useRef<MonitorClient | null>(null)
  const pollR = useRef<ReturnType<typeof setInterval> | null>(null)
  const resumeUsage = useRef(false)
  const slots = useRef<Record<SourceKey, Slot>>({
    accounts: { gen: 0, ac: null, to: null, blocked: false },
    entitlements: { gen: 0, ac: null, to: null, blocked: false },
    usage: { gen: 0, ac: null, to: null, blocked: false },
    collectors: { gen: 0, ac: null, to: null, blocked: false },
  })
  createR.current = createClient

  const patch = (key: SourceKey, p: SourceState<never>) => {
    if (!mounted.current) return
    setSources(s => ({ ...s, [key]: p }))
  }

  const cancel = (key: SourceKey) => {
    const sl = slots.current[key]
    sl.gen++
    sl.ac?.abort()
    sl.ac = null
    if (sl.to) { clearTimeout(sl.to); sl.to = null }
  }

  const clearPoll = () => { if (pollR.current) { clearInterval(pollR.current); pollR.current = null } }

  const usageQ = (slide: boolean) => {
    const q = queryR.current
    const p = pair(q)
    if (!p) return q
    if (!slide || fixedR.current) return q
    const d = Date.parse(p.to) - Date.parse(p.from)
    const to = Date.now()
    const n = { ...q, from: new Date(to - d).toISOString(), to: new Date(to).toISOString() }
    queryR.current = n
    if (mounted.current) setQuery(n)
    return n
  }

  const load = (key: SourceKey, kind: 'auto' | 'manual' | 'start' | 'apply' | 'resume') => {
    if (!connectedR.current || !vis.current) return
    const sl = slots.current[key]
    if (kind !== 'apply' && sl.ac) return
    if (kind === 'auto' && (sl.blocked || (key === 'usage' && fixedR.current))) return
    if (kind === 'resume' && sl.blocked) return
    if (kind !== 'auto' && kind !== 'apply' && kind !== 'resume') sl.blocked = false
    const gen = ++sl.gen
    sl.ac?.abort()
    const ac = new AbortController()
    sl.ac = ac
    if (sl.to) clearTimeout(sl.to)
    sl.to = setTimeout(() => {
      if (sl.gen !== gen) return
      sl.gen++
      ac.abort()
      sl.ac = null
      sl.to = null
      if (key === 'usage') resumeUsage.current = false
      patch(key, { phase: 'error', data: null, error: 'timeout', fetchedAt: null })
    }, 15_000)
    patch(key, { phase: 'loading', data: null, error: null, fetchedAt: null })
    const c = clientR.current!
    const slide = kind === 'auto' || kind === 'manual'
    const fail = (e: unknown) => {
      if (!mounted.current || sl.gen !== gen) return
      if (sl.to) { clearTimeout(sl.to); sl.to = null }
      sl.ac = null
      if (key === 'usage') resumeUsage.current = false
      if (e instanceof Error && e.name === 'AbortError') {
        patch(key, { phase: 'error', data: null, error: 'network', fetchedAt: null })
        return
      }
      const error = codeOf(e)
      sl.blocked = error === 'session' || error === 'permission'
      patch(key, { phase: 'error', data: null, error, fetchedAt: null })
    }
    let run: Promise<unknown>
    try {
      run = key === 'usage' ? c.usage(ac.signal, usageQ(slide)) : c[key](ac.signal)
    } catch (e) {
      fail(e)
      return
    }
    void run.then(
      data => {
        if (!mounted.current || sl.gen !== gen) return
        if (sl.to) { clearTimeout(sl.to); sl.to = null }
        sl.ac = null
        if (key === 'usage') resumeUsage.current = false
        sl.blocked = false
        patch(key, { phase: 'ready', data: data as never, error: null, fetchedAt: new Date().toISOString() })
      },
      fail,
    )
  }

  const loadAll = (kind: 'auto' | 'manual' | 'start') => { for (const k of KEYS) load(k, kind) }

  const schedule = () => {
    clearPoll()
    if (!connectedR.current || !vis.current || ivR.current <= 0) return
    pollR.current = setInterval(() => loadAll('auto'), ivR.current * 1000)
  }

  const start = () => {
    if (connectedR.current) return
    connectedR.current = true
    setConnected(true)
    clientR.current = createR.current()
    if (vis.current) { loadAll('start'); schedule() }
    else if (fixedR.current) resumeUsage.current = true
  }

  const stop = () => {
    connectedR.current = false
    setConnected(false)
    clientR.current = null
    clearPoll()
    resumeUsage.current = false
    for (const k of KEYS) { cancel(k); slots.current[k].blocked = false }
    if (mounted.current) setSources(init())
  }

  const applyQuery = (q: MonitorQuery, fixed: boolean) => {
    if (!pair(q)) return
    queryR.current = q
    fixedR.current = fixed
    setQuery(q)
    setFixed(fixed)
    cancel('usage')
    patch('usage', idle())
    resumeUsage.current = !vis.current
    if (connectedR.current && vis.current) load('usage', 'apply')
  }

  const setIntervalSeconds = (n: number) => {
    if (n !== 0 && n !== 10 && n !== 30 && n !== 60) return
    ivR.current = n
    setIv(n)
    schedule()
  }

  useEffect(() => {
    mounted.current = true
    const onVis = () => {
      const v = document.visibilityState !== 'hidden'
      vis.current = v
      if (!v) {
        clearPoll()
        if (fixedR.current && slots.current.usage.ac) resumeUsage.current = true
        for (const k of KEYS) cancel(k)
        if (mounted.current) {
          setSources(s => {
            const next = { ...s }
            for (const k of KEYS) if (next[k].phase === 'loading') next[k] = idle()
            return next
          })
        }
      } else if (connectedR.current && ivR.current > 0) {
        loadAll('auto')
        if (resumeUsage.current && !slots.current.usage.blocked) {
          resumeUsage.current = false
          load('usage', 'resume')
        }
        schedule()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      mounted.current = false
      connectedR.current = false
      clearPoll()
      for (const k of KEYS) cancel(k)
    }
  }, [])

  return {
    connected,
    intervalSeconds,
    setIntervalSeconds,
    sources,
    query,
    fixedRange,
    start,
    stop,
    refresh: () => loadAll('manual'),
    retry: (key: SourceKey) => load(key, 'manual'),
    applyQuery,
  }
}
