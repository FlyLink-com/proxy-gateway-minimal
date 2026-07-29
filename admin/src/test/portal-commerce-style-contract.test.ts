import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const DESKTOP_MEDIA = "(min-width: 721px)";
const COMPACT_MARKETPLACE_MEDIA = "(max-width: 960px)";
const desktopStyles = readFileSync(
  resolve("src/styles/portal-static-preserve/user-portal-desktop.css"),
  "utf8"
);
const commerceStyles = readFileSync(
  resolve("src/styles/portal-static-preserve/user-portal-commerce.css"),
  "utf8"
);

function normalizedSelectors(rule: CSSStyleRule) {
  return rule.selectorText
    .split(",")
    .map((selector) => selector.replace(/\s+/g, " ").trim());
}

function mediaDeclaration(
  css: string,
  condition: string,
  selector: string,
  property: string
) {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  const sheet = style.sheet;
  let value = "";

  if (sheet) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (
        rule instanceof CSSMediaRule
        && rule.conditionText === condition
      ) {
        for (const nestedRule of Array.from(rule.cssRules)) {
          if (
            nestedRule instanceof CSSStyleRule
            && normalizedSelectors(nestedRule).includes(selector)
          ) {
            value = nestedRule.style.getPropertyValue(property).trim() || value;
          }
        }
      }
    }
  }

  style.remove();
  return value;
}

function desktopDeclaration(
  css: string,
  selector: string,
  property: string
) {
  return mediaDeclaration(css, DESKTOP_MEDIA, selector, property);
}

describe("Portal commerce desktop style contract", () => {
  test("keeps compact secondary controls on the frozen 40px control token", () => {
    expect(desktopDeclaration(
      desktopStyles,
      ".portal-v2-shell .portal-secondary-button.compact",
      "min-height"
    )).toBe("40px");
  });

  test("centers Marketplace, Wallet, and Orders in the same 1200px content frame", () => {
    [
      ".portal-v2-shell .portal-commerce-layout--marketplace",
      ".portal-v2-shell .portal-commerce-layout--wallet",
      ".portal-v2-shell .portal-orders-panel"
    ].forEach((selector) => {
      expect(desktopDeclaration(commerceStyles, selector, "max-width")).toBe("1200px");
      expect(desktopDeclaration(commerceStyles, selector, "margin-inline")).toBe("auto");
    });
  });

  test("composes plan and data-pack groups as balanced desktop columns", () => {
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-commerce-layout--marketplace",
      "grid-template-columns"
    )).toBe("repeat(2, minmax(0, 1fr))");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-commerce-layout--marketplace > .portal-marketplace-state",
      "grid-column"
    )).toBe("1 / -1");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-commerce-layout--marketplace > .portal-marketplace-flow-state",
      "grid-column"
    )).toBe("1 / -1");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-group > .portal-marketplace-grid",
      "grid-template-columns"
    )).toBe("minmax(0, 1fr)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-group:only-of-type",
      "grid-column"
    )).toBe("1 / -1");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-group:only-of-type > .portal-marketplace-grid",
      "grid-template-columns"
    )).toBe("repeat(2, minmax(0, 1fr))");
  });

  test("returns Marketplace groups and cards to one column at 960px", () => {
    [
      ".portal-v2-shell .portal-commerce-layout--marketplace",
      ".portal-v2-shell .portal-marketplace-grid",
      ".portal-v2-shell .portal-marketplace-group:only-of-type > .portal-marketplace-grid"
    ].forEach((selector) => {
      expect(mediaDeclaration(
        commerceStyles,
        COMPACT_MARKETPLACE_MEDIA,
        selector,
        "grid-template-columns"
      )).toBe("minmax(0, 1fr)");
    });
  });

  test("lays out all six Wallet balances without an orphaned desktop card", () => {
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-wallet-balance-grid",
      "grid-template-columns"
    )).toBe("repeat(12, minmax(0, 1fr))");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-wallet-balance-grid__spendable",
      "grid-column"
    )).toBe("span 6");

    [
      ".portal-v2-shell .portal-wallet-balance-grid > div:nth-child(2)",
      ".portal-v2-shell .portal-wallet-balance-grid > div:nth-child(3)"
    ].forEach((selector) => {
      expect(desktopDeclaration(commerceStyles, selector, "grid-column"))
        .toBe("span 3");
    });

    [
      ".portal-v2-shell .portal-wallet-balance-grid > div:nth-child(4)",
      ".portal-v2-shell .portal-wallet-balance-grid > div:nth-child(5)",
      ".portal-v2-shell .portal-wallet-balance-grid > div:nth-child(6)"
    ].forEach((selector) => {
      expect(desktopDeclaration(commerceStyles, selector, "grid-column"))
        .toBe("span 4");
    });
  });

  test("preserves readable desktop density for Wallet and Orders data tables", () => {
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-wallet-ledger",
      "min-width"
    )).toBe("1120px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-wallet-ledger tbody tr",
      "height"
    )).toBe("48px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-orders-panel .portal-order-table",
      "min-width"
    )).toBe("1120px");
  });
});
