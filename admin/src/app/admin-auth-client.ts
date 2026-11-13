export type AdminAuthErrorCode =
  | "session"
  | "permission"
  | "rate_limited"
  | "unavailable"
  | "invalid"
  | "network";

export class AdminAuthError extends Error {
  readonly code: AdminAuthErrorCode;

  constructor(code: AdminAuthErrorCode) {
    super(code);
    this.name = "AdminAuthError";
    this.code = code;
  }
}

export type AdminAuthStatus =
  | {
      authenticated: false;
      setupRequired: boolean;
    }
  | {
      authenticated: true;
      expiresAt: string;
    };

export type AdminAuthChallenge = {
  challengeRef: string;
  expiresAt: string;
};

export type AdminAuthClient = {
  session(signal: AbortSignal): Promise<AdminAuthStatus>;
  login(
    input: { operatorRef?: string; password: string },
    signal: AbortSignal,
  ): Promise<AdminAuthChallenge>;
  verify(
    input: { challengeRef: string; code: string },
    signal: AbortSignal,
  ): Promise<void>;
  logout(signal: AbortSignal): Promise<void>;
};

const SAFE_REF = /^[A-Za-z0-9._:-]{1,128}$/;
const TOTP_CODE = /^[0-9]{6}$/;
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function fail(code: AdminAuthErrorCode): never {
  throw new AdminAuthError(code);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeRef(value: unknown): value is string {
  return typeof value === "string" && SAFE_REF.test(value);
}

function parseExpiresAt(value: unknown, now: number): string {
  if (typeof value !== "string" || !ISO_INSTANT.test(value)) fail("invalid");
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms <= now) fail("invalid");
  return value;
}

function mapHttpStatus(status: number, expected: number): void {
  if (status === expected) return;
  if (status === 401) fail("session");
  if (status === 403) fail("permission");
  if (status === 429) fail("rate_limited");
  if (status === 404 || status >= 500) fail("unavailable");
  fail("invalid");
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    fail("invalid");
  }
}

async function requestJson(
  fetcher: typeof fetch,
  input: RequestInfo,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetcher(input, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof Error && error.name === "AbortError") throw error;
    fail("network");
  }
}

function parseUnauthenticated(body: Record<string, unknown>): AdminAuthStatus {
  const hasOperator = Object.prototype.hasOwnProperty.call(body, "operatorRef");
  const hasSetup = Object.prototype.hasOwnProperty.call(body, "setupRequired");
  const hasMode = Object.prototype.hasOwnProperty.call(body, "mode");

  if (hasMode) {
    if (body.mode !== "portalAccount") fail("invalid");
  }

  if (hasOperator && !isSafeRef(body.operatorRef) && body.operatorRef !== null) {
    fail("invalid");
  }
  if (hasSetup && typeof body.setupRequired !== "boolean") fail("invalid");

  return {
    authenticated: false,
    // Older restricted servers may send operatorRef; never expose it to the
    // login UI. Public login status intentionally omits setup details too.
    setupRequired: hasSetup ? Boolean(body.setupRequired) : false,
  };
}

function parseAuthenticated(body: Record<string, unknown>, now: number): AdminAuthStatus {
  if (!isObject(body.session)) fail("invalid");
  const session = body.session;
  if (session.status !== "active") fail("invalid");
  if (session.authMethod !== "totp") fail("invalid");
  if (!isSafeRef(session.sessionRef)) fail("invalid");
  if (!isSafeRef(session.operatorRef)) fail("invalid");
  if (typeof session.issuedAt !== "string" || !ISO_INSTANT.test(session.issuedAt)) {
    fail("invalid");
  }
  const expiresAt = parseExpiresAt(session.expiresAt, now);
  return { authenticated: true, expiresAt };
}

function parseSessionBody(body: unknown, now: number): AdminAuthStatus {
  if (!isObject(body)) fail("invalid");
  if (body.authenticated === false) return parseUnauthenticated(body);
  if (body.authenticated === true) return parseAuthenticated(body, now);
  fail("invalid");
}

function parseChallengeBody(body: unknown, now: number): AdminAuthChallenge {
  if (!isObject(body) || !isObject(body.challenge)) fail("invalid");
  const challenge = body.challenge;
  if (!isSafeRef(challenge.challengeRef)) fail("invalid");
  if (!isSafeRef(challenge.operatorRef)) fail("invalid");
  if (!Array.isArray(challenge.methods) || challenge.methods.length === 0) fail("invalid");
  if (!challenge.methods.every((method) => method === "totp")) fail("invalid");
  if (typeof challenge.issuedAt !== "string" || !ISO_INSTANT.test(challenge.issuedAt)) {
    fail("invalid");
  }
  const expiresAt = parseExpiresAt(challenge.expiresAt, now);
  return { challengeRef: challenge.challengeRef, expiresAt };
}

function parseVerifyBody(body: unknown, now: number): void {
  if (!isObject(body) || !isObject(body.session)) fail("invalid");
  parseAuthenticated(body, now);
}

function parseLogoutBody(body: unknown): void {
  if (!isObject(body) || body.loggedOut !== true) fail("invalid");
}

export function createAdminAuthClient(options?: {
  fetcher?: typeof fetch;
}): AdminAuthClient {
  const fetcher = options?.fetcher ?? fetch;

  return {
    async session(signal) {
      const response = await requestJson(fetcher, "/api/admin-auth/session", {
        method: "GET",
        signal,
      });
      mapHttpStatus(response.status, 200);
      return parseSessionBody(await readJson(response), Date.now());
    },

    async login(input, signal) {
      if (input.operatorRef !== undefined && !isSafeRef(input.operatorRef)) fail("invalid");
      if (typeof input.password !== "string" || input.password.length > 4096) fail("invalid");
      // The legacy wire field is named bootstrapToken, but default runtime wiring
      // binds Admin auth to ADMIN_AUTH_PORTAL_ACCOUNT_ID and verifies this as
      // that Portal account's local password credential (scrypt), not a static
      // token or an Auth0-hosted login. Match the server's requiredText() trim-only contract.
      const normalizedPassword = input.password.trim();
      if (!normalizedPassword) fail("invalid");
      const response = await requestJson(fetcher, "/api/admin-auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operatorRef: input.operatorRef,
          bootstrapToken: normalizedPassword,
        }),
        signal,
      });
      mapHttpStatus(response.status, 202);
      return parseChallengeBody(await readJson(response), Date.now());
    },

    async verify(input, signal) {
      if (!isSafeRef(input.challengeRef)) fail("invalid");
      if (typeof input.code !== "string" || !TOTP_CODE.test(input.code)) fail("invalid");
      const response = await requestJson(fetcher, "/api/admin-auth/totp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeRef: input.challengeRef,
          code: input.code,
        }),
        signal,
      });
      mapHttpStatus(response.status, 200);
      parseVerifyBody(await readJson(response), Date.now());
    },

    async logout(signal) {
      const response = await requestJson(fetcher, "/api/admin-auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
        signal,
      });
      mapHttpStatus(response.status, 200);
      parseLogoutBody(await readJson(response));
    },
  };
}
