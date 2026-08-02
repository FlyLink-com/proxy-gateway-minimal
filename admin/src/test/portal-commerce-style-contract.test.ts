import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const DESKTOP_MEDIA = "(min-width: 721px)";
const COMPACT_MARKETPLACE_MEDIA = "(max-width: 960px)";
const REDUCED_MOTION_MEDIA = "(prefers-reduced-motion: reduce)";
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
  test("keeps the signed-in desktop Header focused on title and global search", () => {
    expect(desktopDeclaration(
      desktopStyles,
      ".portal-v2-shell .portal-v2-utility-actions",
      "display"
    )).toBe("none");
    expect(desktopDeclaration(
      desktopStyles,
      ".portal-v2-shell .portal-v2-global-search input",
      "min-height"
    )).toBe("44px");
    expect(desktopDeclaration(
      desktopStyles,
      ".portal-v2-shell .portal-v2-settings-preference-grid",
      "display"
    )).toBe("grid");
  });

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

  test("matches the frozen Product Card surface and three-column fact composition", () => {
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell[data-portal-theme=\"light\"] .portal-commerce-layout--marketplace",
      "--portal-commerce-muted"
    )).toBe("#334155");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__facts dd",
      "font-weight"
    )).toBe("700");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-group",
      "align-self"
    )).toBe("start");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-group",
      "align-content"
    )).toBe("start");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card article",
      "background"
    )).toBe("var(--portal-commerce-surface-raised)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__facts",
      "grid-template-columns"
    )).toBe("repeat(3, minmax(0, 1fr))");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__facts",
      "gap"
    )).toBe("16px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__facts > div",
      "grid-template-columns"
    )).toBe("minmax(0, 1fr)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__facts > div",
      "gap"
    )).toBe("4px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__facts dd",
      "text-align"
    )).toBe("left");
  });

  test("keeps Product Card notices full-width and actions intrinsic at the trailing edge", () => {
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__notices",
      "align-self"
    )).toBe("stretch");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__notices",
      "background"
    )).toBe("var(--portal-commerce-attention-bg)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__notices",
      "border-radius"
    )).toBe("10px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__notices",
      "padding"
    )).toBe("12px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__actions",
      "display"
    )).toBe("flex");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__actions",
      "justify-content"
    )).toBe("flex-end");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__actions",
      "gap"
    )).toBe("12px");
  });

  test("uses solid Primary and explicit Disabled button surfaces in Product Cards", () => {
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__actions button",
      "border-radius"
    )).toBe("9px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__actions button",
      "padding"
    )).toBe("0 18px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__actions button",
      "font-size"
    )).toBe("13px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__actions button:not(.portal-marketplace-card__purchase)",
      "background"
    )).toBe("var(--portal-commerce-surface-raised)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__actions button:not(.portal-marketplace-card__purchase):hover:not(:disabled)",
      "background"
    )).toBe("var(--portal-commerce-subtle)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__actions button.portal-marketplace-card__purchase",
      "background"
    )).toBe("var(--portal-commerce-primary)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__actions button.portal-marketplace-card__purchase",
      "border-color"
    )).toBe("var(--portal-commerce-primary-border)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__actions button.portal-marketplace-card__purchase",
      "color"
    )).toBe("var(--portal-commerce-on-primary)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__actions button:disabled",
      "background"
    )).toBe("var(--portal-commerce-disabled-surface)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__actions button:disabled",
      "color"
    )).toBe("var(--portal-commerce-disabled-text)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-card__actions button:disabled",
      "opacity"
    )).toBe("1");
  });

  test("renders Marketplace Notices as the frozen inline geometry and semantic states", () => {
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-state",
      "display"
    )).toBe("flex");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-state",
      "min-height"
    )).toBe("48px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-state",
      "align-items"
    )).toBe("center");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-state",
      "gap"
    )).toBe("12px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-state",
      "border-radius"
    )).toBe("10px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-state",
      "padding"
    )).toBe("12px 16px");

    const states = [
      ["loading", "in-progress"],
      ["empty", "closed"],
      ["unavailable", "attention"],
      ["error", "error"]
    ] as const;
    states.forEach(([state, tone]) => {
      const selector =
        `.portal-v2-shell .portal-marketplace-state[data-state="${state}"]`;
      expect(desktopDeclaration(
        commerceStyles,
        selector,
        "background"
      )).toBe(`var(--portal-notice-${tone}-bg)`);
      expect(desktopDeclaration(
        commerceStyles,
        selector,
        "border-color"
      )).toBe(`var(--portal-notice-${tone}-border)`);
      expect(desktopDeclaration(
        commerceStyles,
        selector,
        "color"
      )).toBe(`var(--portal-notice-${tone}-text)`);
    });

    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-state .portal-notice__indicator--loading",
      "width"
    )).toBe("24px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-marketplace-state .portal-notice__marker",
      "width"
    )).toBe("10px");
  });

  test("maps all eight Coins order states to the frozen semantic surfaces", () => {
    const states = [
      ["reserved", "in-progress"],
      ["settling", "in-progress"],
      ["delivering", "in-progress"],
      ["succeeded", "successful"],
      ["delivery_failed", "error"],
      ["capture_failed", "error"],
      ["cancelled", "closed"],
      ["reconciliation_required", "attention"]
    ] as const;
    states.forEach(([state, tone]) => {
      const selector =
        `.portal-coins-dialog-theme .portal-coins-payment-status--${state}`;
      expect(desktopDeclaration(
        commerceStyles,
        selector,
        "background"
      )).toBe(`var(--portal-coins-status-${tone}-bg)`);
      expect(desktopDeclaration(
        commerceStyles,
        selector,
        "border-color"
      )).toBe(`var(--portal-coins-status-${tone}-border)`);
      expect(desktopDeclaration(
        commerceStyles,
        selector,
        "color"
      )).toBe(`var(--portal-coins-status-${tone}-text)`);
    });
  });

  test("composes Coins order status as a 560px card with Compact actions", () => {
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-coins-dialog-theme .portal-coins-payment-status",
      "width"
    )).toBe("min(560px, 100%)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-coins-dialog-theme .portal-coins-payment-status",
      "padding"
    )).toBe("16px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-coins-dialog-theme .portal-coins-payment-status",
      "border-radius"
    )).toBe("10px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-coins-dialog-theme .portal-coins-payment-status__status",
      "gap"
    )).toBe("12px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-coins-dialog-theme .portal-coins-payment-status__actions",
      "justify-content"
    )).toBe("flex-end");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-coins-dialog-theme .portal-coins-payment-status__actions button",
      "min-height"
    )).toBe("40px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-coins-dialog-theme .portal-coins-payment-status__actions button",
      "border-radius"
    )).toBe("9px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-coins-dialog-theme .portal-coins-status-spinner",
      "width"
    )).toBe("24px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-coins-dialog-theme .portal-coins-status-marker",
      "width"
    )).toBe("10px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-coins-dialog-theme .portal-coins-dialog button.portal-coins-payment-status__action--quiet",
      "background"
    )).toBe("var(--portal-coins-action-subtle-bg)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-coins-dialog-theme .portal-coins-dialog button.portal-coins-payment-status__action--secondary",
      "background"
    )).toBe("var(--portal-coins-action-secondary-bg)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-coins-dialog-theme .portal-coins-dialog button.portal-coins-payment-status__action--quiet:hover:not(:disabled)",
      "background"
    )).toBe("var(--portal-coins-action-secondary-bg)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-coins-dialog-theme .portal-coins-dialog button.portal-coins-payment-status__action--secondary:hover:not(:disabled)",
      "background"
    )).toBe("var(--portal-coins-action-subtle-bg)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-coins-dialog-theme .portal-coins-dialog button.portal-coins-dialog__primary:disabled",
      "background"
    )).toBe("var(--portal-coins-action-disabled-bg)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-coins-dialog-theme .portal-coins-dialog button.portal-coins-dialog__primary:disabled",
      "color"
    )).toBe("var(--portal-coins-action-disabled-text)");
  });

  test("turns off both library-backed loading indicators for reduced motion", () => {
    [
      ".portal-v2-shell .portal-marketplace-state .portal-notice__indicator--loading",
      ".portal-v2-shell .portal-marketplace-flow-state .portal-notice__indicator--loading",
      ".portal-coins-dialog-theme .portal-coins-status-spinner"
    ].forEach((selector) => {
      expect(mediaDeclaration(
        commerceStyles,
        REDUCED_MOTION_MEDIA,
        selector,
        "animation"
      )).toBe("none");
    });
  });

  test("composes the frozen 360 by 44 Orders Search Input with a leading icon and field focus ring", () => {
    const field =
      ".portal-v2-shell .portal-orders-panel .portal-order-search-field";
    const control =
      ".portal-v2-shell .portal-orders-panel .portal-order-search-control";
    expect(desktopDeclaration(
      commerceStyles,
      control,
      "gap"
    )).toBe("8px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell[data-portal-theme=\"light\"] .portal-orders-panel",
      "--portal-orders-muted"
    )).toBe("#334155");
    expect(desktopDeclaration(
      commerceStyles,
      `${control} > span:first-child`,
      "font-size"
    )).toBe("12px");
    expect(desktopDeclaration(
      commerceStyles,
      `${control} > span:first-child`,
      "line-height"
    )).toBe("16px");
    expect(desktopDeclaration(
      commerceStyles,
      field,
      "display"
    )).toBe("flex");
    expect(desktopDeclaration(
      commerceStyles,
      field,
      "width"
    )).toBe("360px");
    expect(desktopDeclaration(
      commerceStyles,
      field,
      "height"
    )).toBe("44px");
    expect(desktopDeclaration(
      commerceStyles,
      field,
      "align-items"
    )).toBe("center");
    expect(desktopDeclaration(
      commerceStyles,
      field,
      "gap"
    )).toBe("12px");
    expect(desktopDeclaration(
      commerceStyles,
      field,
      "padding"
    )).toBe("0 16px");
    expect(desktopDeclaration(
      commerceStyles,
      field,
      "border-radius"
    )).toBe("9px");
    expect(desktopDeclaration(
      commerceStyles,
      `${field} > svg`,
      "width"
    )).toBe("16px");
    expect(desktopDeclaration(
      commerceStyles,
      `${field} .portal-order-search-input`,
      "border"
    )).toBe("0");
    expect(desktopDeclaration(
      commerceStyles,
      `${field} .portal-order-search-input`,
      "background"
    )).toBe("transparent");
    expect(desktopDeclaration(
      commerceStyles,
      `${field} .portal-order-search-input`,
      "min-height"
    )).toBe("0");
    expect(desktopDeclaration(
      commerceStyles,
      `${field} .portal-order-search-input`,
      "font-size"
    )).toBe("13px");
    expect(desktopDeclaration(
      commerceStyles,
      `${field} .portal-order-search-input`,
      "font-weight"
    )).toBe("400");
    expect(desktopDeclaration(
      commerceStyles,
      `${field} .portal-order-search-input`,
      "line-height"
    )).toBe("20px");
    expect(desktopDeclaration(
      commerceStyles,
      `${field}:focus-within`,
      "outline"
    )).toBe("3px solid var(--portal-orders-focus)");
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
