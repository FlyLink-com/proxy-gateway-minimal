import { describe, expect, test } from "vitest";
import { pageTitles } from "../app/navigation";
import { ADMIN_LANGUAGE_PACKS, getAdminLanguagePack } from "../i18n/admin";

describe("admin language packs", () => {
  test("registers first-class language packs for the operator console", () => {
    expect(ADMIN_LANGUAGE_PACKS.map((pack) => pack.tag)).toEqual(["en-US", "zh-CN"]);
    expect(ADMIN_LANGUAGE_PACKS.map((pack) => pack.id)).toEqual(["en", "zh"]);

    const englishPack = getAdminLanguagePack("en");
    const chinesePack = getAdminLanguagePack("zh");

    expect(englishPack.nativeName).toBe("English");
    expect(chinesePack.nativeName).toBe("简体中文");
    expect(englishPack.shell.topBar.pageTitles.dashboard).toBe(pageTitles.dashboard);
    expect(chinesePack.shell.topBar.pageTitles.dashboard).toBe("运营总览");
    expect(chinesePack.shell.sidebar.routes.nodeBandwidth).toBe("节点带宽");
    expect(chinesePack.shell.sidebar.routeSuffix).toBe("路由");
    expect(chinesePack.shell.login.title).toBe("管理员登录");
    expect(chinesePack.shell.login.auth.portalAccountLoginTitle).toBe("门户账户登录");
    expect(chinesePack.shell.pageFrame.summaryMetricsSuffix).toBe("摘要指标");
    expect(chinesePack.shell.pageFrame.sections.portalRequests?.["resource-orders"].label).toBe("资源与订单");

    for (const pack of ADMIN_LANGUAGE_PACKS) {
      expect(Object.keys(pack.shell.topBar.pageTitles)).toEqual(Object.keys(pageTitles));
      expect(Object.keys(pack.shell.sidebar.routes)).toEqual(Object.keys(pageTitles));
      expect(Object.keys(pack.shell.pageFrame.pageHeaderAriaLabels)).toEqual(Object.keys(pageTitles));
      expect(pack.shell.login.auth.passwordFormLabel.length).toBeGreaterThan(0);
      expect(pack.shell.pageFrame.modeLabels.owner.length).toBeGreaterThan(0);
      expect(pack.shell.htmlLang).toBe(pack.tag);
    }
  });
});
