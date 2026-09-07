import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { UserPortalPage } from "../features/user-portal/user-portal-page";
import { createLocalUserPortalClient, type PortalSession } from "../features/user-portal/user-portal-client";
import { PORTAL_PAYMENT_RETURN_SESSION_STORAGE_KEY, PORTAL_REGISTRATION_SESSION_STORAGE_KEY } from "../features/user-portal/user-portal-types";

const session: PortalSession = { status: "authenticated_preview", transport: "cookie", sessionRef: `portalctx_${"a".repeat(64)}`, expiresAt: "2026-09-07T00:30:00.000Z", registeredAt: "2026-09-07T00:00:00.000Z", userRef: "test_account", displayName: "Test Account", authMode: "password", safety: { noAdminApi: true, noPublicAuthActivated: true, noRawPasswordReturned: true } };
function deferred<T>() { let resolve!: (value:T)=>void; let reject!: (error:unknown)=>void; const promise = new Promise<T>((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; }
function client() { return { ...createLocalUserPortalClient(), restoreSession: vi.fn(async () => session as PortalSession | null), logout: vi.fn(async (_input: {sessionRef:string})=>{}), issueHumanChallenge: vi.fn(async () => ({ challengeId: "challenge_test", prompt: "1 + 2 = ?" })) }; }
beforeEach(() => { vi.stubGlobal("BroadcastChannel", undefined); });
afterEach(() => { cleanup(); window.sessionStorage.clear(); window.localStorage.clear(); window.history.replaceState(null,"","/"); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test("StrictMode restores once, reads fresh data and preserves safe wallet location without a login challenge", async () => {
  window.history.replaceState(null,"","/#portal=wallet");
  const c = client();
  render(<StrictMode><UserPortalPage portalClient={c}/></StrictMode>);
  await screen.findByRole("navigation", { name: "用户中心导航" });
  expect(c.restoreSession).toHaveBeenCalledTimes(1);
  expect(c.issueHumanChallenge).not.toHaveBeenCalled();
  expect(screen.getAllByRole("heading", { name: "Coins 钱包", level: 1 }).length).toBeGreaterThan(0);
  expect(window.sessionStorage.length).toBe(0);
});

test("anonymous bootstrap shows login, while network failure offers retry without claiming logout", async () => {
  const c = client();
  c.restoreSession.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(null);
  render(<UserPortalPage portalClient={c}/>);
  expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法恢复登录");
  expect(c.issueHumanChallenge).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name:"重试恢复登录"}));
  await screen.findByRole("button", {name:"登录"});
  await waitFor(()=>expect(c.issueHumanChallenge).toHaveBeenCalledTimes(1));
  expect(c.restoreSession).toHaveBeenCalledTimes(2);
});

test.each([false, true])("cookie mount removes only obsolete credential handoffs with pending logout=%s", async (pendingLogout) => {
  window.sessionStorage.setItem(PORTAL_PAYMENT_RETURN_SESSION_STORAGE_KEY, JSON.stringify({sessionRef:"obsolete_synthetic_credential"}));
  window.sessionStorage.setItem(PORTAL_REGISTRATION_SESSION_STORAGE_KEY, JSON.stringify({sessionRef:"obsolete_synthetic_credential"}));
  window.sessionStorage.setItem("gccwebos-portal-recharge-return-intent", "noncredential-intent");
  window.sessionStorage.setItem("unrelated-preference", "keep");
  if (pendingLogout) window.sessionStorage.setItem("gccwebos-portal-logout-pending-v1", session.sessionRef!);
  const c = client(); c.restoreSession.mockResolvedValue(null);
  render(<UserPortalPage portalClient={c}/>);
  await waitFor(() => expect(window.sessionStorage.getItem(PORTAL_REGISTRATION_SESSION_STORAGE_KEY)).toBeNull());
  expect(window.sessionStorage.getItem(PORTAL_PAYMENT_RETURN_SESSION_STORAGE_KEY)).toBeNull();
  expect(window.sessionStorage.getItem("gccwebos-portal-recharge-return-intent")).toBe("noncredential-intent");
  expect(window.sessionStorage.getItem("unrelated-preference")).toBe("keep");
  if (pendingLogout) expect(c.restoreSession).not.toHaveBeenCalled();
});

test("logout failure keeps private UI cleared and cannot bootstrap itself back into the session", async () => {
  const c = client();
  c.logout.mockRejectedValueOnce(new Error("offline"));
  render(<UserPortalPage portalClient={c}/>);
  const nav = await screen.findByRole("navigation", {name:"用户中心导航"});
  const logoutButton = screen.getAllByRole("button", {name:/退出|Log out|Sign out/})[0];
  fireEvent.click(logoutButton);
  await waitFor(()=>expect(nav).not.toBeInTheDocument());
  expect(await screen.findByRole("alert")).toHaveTextContent("注销尚未完成");
  expect(c.restoreSession).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", {name:"重试注销"}));
  await screen.findByRole("button", {name:"登录"});
  expect(c.logout).toHaveBeenCalledTimes(2);
  expect(c.logout).toHaveBeenLastCalledWith({sessionRef:session.sessionRef});
});

test("reload while logout is unresolved retains only a public context and retries revocation, not bootstrap", async () => {
  const c = client(); c.logout.mockRejectedValueOnce(new Error("offline"));
  const first = render(<UserPortalPage portalClient={c}/>);
  await screen.findByRole("navigation",{name:"用户中心导航"});
  fireEvent.click(screen.getByRole("button",{name:"退出登录"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("注销尚未完成");
  expect(window.sessionStorage.getItem("gccwebos-portal-logout-pending-v1")).toBe(session.sessionRef);
  first.unmount();
  const next = client(); render(<UserPortalPage portalClient={next}/>);
  expect(await screen.findByRole("alert")).toHaveTextContent("注销尚未完成");
  expect(next.restoreSession).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"重试注销"}));
  await screen.findByRole("button",{name:"登录"});
  expect(next.logout).toHaveBeenCalledWith({sessionRef:session.sessionRef});
  expect(window.sessionStorage.length).toBe(0);
});

test("stale pending logout can return to explicit login without restoring another tab or claiming revocation", async () => {
  const pendingKey = "gccwebos-portal-logout-pending-v1";
  const secondSession = { ...session, sessionRef: `portalctx_${"b".repeat(64)}`, userRef: "second_account" };
  window.sessionStorage.setItem(pendingKey, session.sessionRef!);
  const c = client();
  c.restoreSession.mockResolvedValue(secondSession);
  c.logout.mockRejectedValue(new Error("invalid_session"));
  const authenticate = vi.fn(async () => secondSession);
  render(<UserPortalPage portalClient={{ ...c, authenticate }} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("注销尚未完成");
  fireEvent.click(screen.getByRole("button", { name: "重试注销" }));
  await waitFor(() => expect(c.logout).toHaveBeenCalledTimes(1));
  fireEvent.click(await screen.findByRole("button", { name: "返回账号登录" }));
  await screen.findByRole("button", { name: "登录" });
  expect(screen.getByRole("alert")).toHaveTextContent("尚未确认");
  expect(c.restoreSession).not.toHaveBeenCalled();
  expect(c.logout).toHaveBeenCalledTimes(1);
  expect(window.sessionStorage.getItem(pendingKey)).toBe(session.sessionRef);
  expect(screen.queryByRole("navigation", { name: "用户中心导航" })).toBeNull();
  fireEvent.change(screen.getByLabelText("电子邮箱"), { target: { value: "test@example.invalid" } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "synthetic-password" } });
  fireEvent.change(screen.getByLabelText("防机器人校验"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  await screen.findByRole("navigation", { name: "用户中心导航" });
  expect(authenticate).toHaveBeenCalledTimes(1);
  expect(c.restoreSession).not.toHaveBeenCalled();
  expect(window.sessionStorage.getItem(pendingKey)).toBeNull();
});

test("cross-tab invalidation clears private UI without revoking another tab's cookie", async () => {
  const channels: Array<{onmessage: ((event:MessageEvent)=>void)|null}> = [];
  class Channel { onmessage: ((event:MessageEvent)=>void)|null = null; constructor(){channels.push(this);} close(){} postMessage(){} }
  vi.stubGlobal("BroadcastChannel",Channel);
  const c = client(); render(<UserPortalPage portalClient={c}/>);
  await screen.findByRole("navigation",{name:"用户中心导航"});
  act(()=>channels[0].onmessage?.(new MessageEvent("message",{data:{type:"session-changed"}})));
  await screen.findByRole("button",{name:"登录"});
  expect(screen.queryByRole("navigation",{name:"用户中心导航"})).toBeNull();
  expect(c.logout).not.toHaveBeenCalled(); expect(c.restoreSession).toHaveBeenCalledTimes(1);
});

test("a late login response cannot revive a session invalidated by another tab", async () => {
  const channels: Array<{onmessage: ((event:MessageEvent)=>void)|null}> = [];
  class Channel { onmessage: ((event:MessageEvent)=>void)|null = null; constructor(){channels.push(this);} close(){} postMessage(){} }
  vi.stubGlobal("BroadcastChannel",Channel);
  const pending = deferred<PortalSession>(); const c = client(); c.restoreSession.mockResolvedValueOnce(null);
  const authenticate = vi.fn(()=>pending.promise);
  render(<UserPortalPage portalClient={{...c,authenticate}}/>);
  await screen.findByRole("button",{name:"登录"});
  fireEvent.change(screen.getByLabelText("电子邮箱"),{target:{value:"test@example.invalid"}});
  fireEvent.change(screen.getByLabelText("密码"),{target:{value:"synthetic-password"}});
  fireEvent.change(screen.getByLabelText("防机器人校验"),{target:{value:"3"}});
  fireEvent.click(screen.getByRole("button",{name:"登录"}));
  await waitFor(()=>expect(authenticate).toHaveBeenCalledTimes(1));
  act(()=>channels[0].onmessage?.(new MessageEvent("message",{data:{type:"session-changed"}})));
  await act(async()=>pending.resolve(session));
  expect(screen.queryByRole("navigation",{name:"用户中心导航"})).toBeNull();
});

test("a late bootstrap after unmount does not hydrate another mounted session", async () => {
  const pending = deferred<PortalSession|null>(); const c = client(); c.restoreSession.mockReturnValueOnce(pending.promise);
  const view = render(<UserPortalPage portalClient={c}/>); view.unmount();
  const next = client(); next.restoreSession.mockResolvedValueOnce(null);
  render(<UserPortalPage portalClient={next}/>);
  await screen.findByRole("button", {name:"登录"});
  await act(async()=>pending.resolve(session));
  expect(screen.queryByRole("navigation",{name:"用户中心导航"})).toBeNull();
});

test("normal login forwards remember-me, never a stored credential", async () => {
  const c = client(); c.restoreSession.mockResolvedValueOnce(null);
  const authenticate = vi.fn(async()=>session);
  render(<UserPortalPage portalClient={{...c,authenticate}}/>);
  await screen.findByRole("button",{name:"登录"});
  await waitFor(()=>expect(c.issueHumanChallenge).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("电子邮箱"),{target:{value:"test@example.invalid"}});
  fireEvent.change(screen.getByLabelText("密码"),{target:{value:"test-password"}});
  fireEvent.change(screen.getByLabelText("防机器人校验"),{target:{value:"3"}});
  fireEvent.click(screen.getByRole("checkbox",{name:"记住我"}));
  fireEvent.click(screen.getByRole("button",{name:"登录"}));
  await waitFor(()=>expect(authenticate).toHaveBeenCalledWith(expect.objectContaining({rememberMe:true})));
  expect(window.sessionStorage.length).toBe(0);
});

test("successful login survives its own real-model broadcast after a rejected human challenge", async () => {
  const channels = new Set<Channel>();
  class Channel {
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor(readonly name: string) { channels.add(this); }
    close() { channels.delete(this); }
    postMessage(data: unknown) {
      for (const recipient of channels) {
        if (recipient === this || recipient.name !== this.name) continue;
        queueMicrotask(() => { if (channels.has(recipient)) recipient.onmessage?.(new MessageEvent("message", { data })); });
      }
    }
  }
  vi.stubGlobal("BroadcastChannel", Channel);
  const c = client(); c.restoreSession.mockResolvedValueOnce(null);
  const authenticate = vi.fn()
    .mockRejectedValueOnce(new Error("human_verification_failed"))
    .mockResolvedValueOnce(session);
  render(<UserPortalPage portalClient={{ ...c, authenticate }} />);
  await screen.findByRole("button", { name: "登录" });
  fireEvent.change(screen.getByLabelText("电子邮箱"), { target: { value: "test@example.invalid" } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "synthetic-password" } });
  fireEvent.change(screen.getByLabelText("防机器人校验"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  await waitFor(() => expect(c.issueHumanChallenge).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole("button", { name: "登录" })).toBeEnabled());
  fireEvent.change(screen.getByLabelText("防机器人校验"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  await screen.findByRole("navigation", { name: "用户中心导航" });
  expect(authenticate).toHaveBeenCalledTimes(2);
  expect(c.restoreSession).toHaveBeenCalledTimes(1);
  expect(c.issueHumanChallenge).toHaveBeenCalledTimes(2);
});
