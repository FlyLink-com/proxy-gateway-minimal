import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../features/user-portal/user-portal-local");
});

describe("user portal production and preview facades", () => {
  test("loads the production facade without loading the local client module", async () => {
    vi.doMock("../features/user-portal/user-portal-local", () => {
      throw new Error("local preview module must not load through the production facade");
    });

    const productionFacade = await import("../features/user-portal/user-portal-client");

    expect(Object.keys(productionFacade)).toContain("createHttpUserPortalClient");
    expect(productionFacade).not.toHaveProperty("createLocalUserPortalClient");
    expect(productionFacade).not.toHaveProperty("createLocalPreviewInitialAccounts");
  });

  test("keeps preview account bounds, challenge generation, and explicit passwords in preview data", async () => {
    const {
      createLocalHumanVerificationChallenge,
      createLocalPreviewInitialAccounts,
      previewPasswordForInitialAccount
    } = await import("../features/user-portal/user-portal-preview-data");

    expect(createLocalPreviewInitialAccounts(0)).toHaveLength(1);
    expect(createLocalPreviewInitialAccounts(999)).toHaveLength(5);

    const challenge = createLocalHumanVerificationChallenge();
    expect(challenge.challengeId).toMatch(/^local-math-v1:\d{1,2}\+\d{1,2}$/);
    expect(challenge.answer).toBeDefined();
    expect(challenge.safety).toMatchObject({ noAdminApi: true, noPublicAdmin: true });

    const account = { ...createLocalPreviewInitialAccounts(1)[0], previewPassword: "explicit-preview-password" };
    expect(previewPasswordForInitialAccount(account, 0, "fallback-password")).toBe("explicit-preview-password");
    expect(previewPasswordForInitialAccount(createLocalPreviewInitialAccounts(1)[0], 0, "fallback-password")).toBe("fallback-password");
  });
});
