import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';

function requestPath(input: RequestInfo | URL) {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  vi.stubEnv('VITE_ADMIN_BASELINE_PREVIEW', 'false');
  vi.stubEnv('VITE_ADMIN_FIXTURE_PREVIEW', 'false');
  window.history.replaceState(null, '', '/#/admin/thirdPartyNodes');
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('formal third-party Admin route authentication boundary', () => {
  it('does not request third-party node APIs while the administrator is unauthenticated', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(requestPath(input)).toBe('/api/admin-auth/session');
      expect(init?.credentials).toBe('same-origin');
      return json({ authenticated: false, operatorRef: 'synthetic-admin', setupRequired: false });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(await screen.findByLabelText('管理员账户')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '第三方节点' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.every(([input]) => !requestPath(input).includes('third-party-subscriptions'))).toBe(true);
  });

  it('requests third-party sources only after authenticated session and returns to login on source 401', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = requestPath(input);
      if (path === '/api/admin-auth/session') return json({ authenticated: true, session: {
        status: 'active', authMethod: 'totp', sessionRef: 'synthetic-session', operatorRef: 'synthetic-admin',
        issuedAt: '2026-10-13T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
      } });
      expect(path).toBe('/api/admin/third-party-subscriptions/sources');
      return json({ error: 'unauthorized' }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => requestPath(input).includes('third-party-subscriptions'))).toBe(true));
    expect(await screen.findByLabelText('管理员账户')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '第三方节点' })).toBeNull();
    expect(fetchMock.mock.calls.map(([input]) => requestPath(input))).toEqual([
      '/api/admin-auth/session', '/api/admin/third-party-subscriptions/sources',
    ]);
  });
});
