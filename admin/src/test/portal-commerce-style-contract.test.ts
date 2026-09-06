import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const DESKTOP_MEDIA = "(min-width: 721px)";
const COMPACT_MARKETPLACE_MEDIA = "(max-width: 720px)";
const WIDE_MARKETPLACE_MEDIA = "(min-width: 1101px)";
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

function baseDeclaration(css: string, selector: string, property: string) {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  try {
    let value = "";
    for (const rule of Array.from(style.sheet?.cssRules ?? [])) {
      if (rule instanceof CSSStyleRule && normalizedSelectors(rule).includes(selector)) {
        value = rule.style.getPropertyValue(property).trim() || value;
      }
    }
    return value;
  } finally {
    style.remove();
  }
}

describe("Portal commerce desktop style contract", () => {
  test("gives every product the same price hierarchy and readable summary", () => {
    const card = ".portal-v2-shell .portal-marketplace-card";
    expect(baseDeclaration(commerceStyles, `${card} article`, "background")).toBe("var(--portal-commerce-surface-raised)");
    expect(baseDeclaration(commerceStyles, ".portal-v2-shell .portal-marketplace-card__amount", "font-size")).toBe("48px");
    expect(baseDeclaration(commerceStyles, ".portal-v2-shell .portal-marketplace-card__unit", "font-size")).toBe("15px");
    expect(baseDeclaration(commerceStyles, `${card} > article > p`, "font-weight")).toBe("400");
    expect(baseDeclaration(commerceStyles, `${card} > article > p`, "line-height")).toBe("1.7");
    expect(commerceStyles).not.toContain("portal-marketplace-card--subscription");
    expect(commerceStyles).not.toContain("portal-marketplace-card__facts");
    expect(commerceStyles).not.toContain("portal-marketplace-card__notices");
  });

  test("keeps the single purchase CTA full width and accessible for every product", () => {
    const actions = ".portal-v2-shell .portal-marketplace-card__actions";
    expect(baseDeclaration(commerceStyles, actions, "display")).toBe("grid");
    expect(baseDeclaration(commerceStyles, actions, "grid-template-columns")).toBe("minmax(0, 1fr)");
    expect(baseDeclaration(commerceStyles, actions, "margin-top")).toBe("auto");
    expect(baseDeclaration(commerceStyles, `${actions} button`, "width")).toBe("100%");
    expect(baseDeclaration(commerceStyles, `${actions} button`, "min-height")).toBe("48px");
    expect(baseDeclaration(commerceStyles, `${actions} button`, "white-space")).toBe("normal");
    expect(baseDeclaration(commerceStyles, `${actions} button.portal-marketplace-card__purchase`, "background")).toBe("var(--portal-commerce-primary)");
    expect(baseDeclaration(commerceStyles, `${actions} button:disabled`, "background")).toBe("var(--portal-commerce-disabled-surface)");
    expect(baseDeclaration(commerceStyles, `${actions} button:focus-visible`, "outline")).toBe("3px solid var(--portal-commerce-accent)");
  });

  test("keeps recharge amounts above full-width actions even on narrow screens", () => {
    const card = ".portal-v2-shell .portal-recharge-offers li";
    expect(baseDeclaration(commerceStyles, card, "display")).toBe("grid");
    expect(baseDeclaration(commerceStyles, card, "grid-template-columns")).toBe("minmax(0, 1fr)");
    expect(baseDeclaration(commerceStyles, card, "justify-content")).toBe("stretch");
    const action = ".portal-v2-shell .portal-recharge-offers button";
    expect(baseDeclaration(commerceStyles, action, "width")).toBe("100%");
    expect(baseDeclaration(commerceStyles, action, "white-space")).toBe("normal");
  });

  test("makes recharge alerts and recovery text consume the readable day/night wallet token at every width", () => {
    expect(baseDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-recharge-dialog > .portal-recharge-state",
      "color"
    )).toBe("var(--portal-wallet-text)");
    for (const [theme, expected] of [["dark", "#f0f6fc"], ["light", "#1f2937"]] as const) {
      const shell = theme === "light" ? '.portal-v2-shell[data-portal-theme="light"]' : ".portal-v2-shell";
      expect(baseDeclaration(
        commerceStyles,
        `${shell} .portal-commerce-layout--wallet`,
        "--portal-wallet-text"
      )).toBe(expected);
      expect(desktopDeclaration(
        commerceStyles,
        `${shell} .modal-backdrop .portal-recharge-dialog`,
        "--portal-wallet-text"
      )).toBe(expected);
    }
  });

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

  test("gives each category a full row with two tablet and three desktop product columns", () => {
    expect(desktopDeclaration(commerceStyles, ".portal-v2-shell .portal-commerce-layout--marketplace", "grid-template-columns")).toBe("minmax(0, 1fr)");
    for (const state of ["portal-marketplace-state", "portal-marketplace-flow-state"]) {
      expect(desktopDeclaration(commerceStyles, `.portal-v2-shell .portal-commerce-layout--marketplace > .${state}`, "grid-column")).toBe("1 / -1");
    }
    expect(baseDeclaration(commerceStyles, ".portal-v2-shell .portal-marketplace-grid", "grid-template-columns")).toBe("repeat(2, minmax(0, 1fr))");
    expect(mediaDeclaration(commerceStyles, WIDE_MARKETPLACE_MEDIA, ".portal-v2-shell .portal-marketplace-grid", "grid-template-columns")).toBe("repeat(3, minmax(0, 1fr))");
    expect(commerceStyles).not.toContain(".portal-marketplace-group:only-of-type");
  });

  test("returns Marketplace groups and cards to one column on mobile", () => {
    expect(mediaDeclaration(commerceStyles, COMPACT_MARKETPLACE_MEDIA, ".portal-v2-shell .portal-marketplace-grid", "grid-template-columns")).toBe("minmax(0, 1fr)");
  });

  test("keeps cards equal-height with no fixed content height or clipped summary", () => {
    const card = ".portal-v2-shell .portal-marketplace-card";
    expect(baseDeclaration(commerceStyles, `${card} article`, "height")).toBe("100%");
    expect(baseDeclaration(commerceStyles, `${card} article`, "display")).toBe("flex");
    expect(baseDeclaration(commerceStyles, `${card} article`, "flex-direction")).toBe("column");
    expect(baseDeclaration(commerceStyles, `${card} article`, "padding")).toBe("20px");
    expect(baseDeclaration(commerceStyles, `${card} > article > p`, "overflow")).toBe("");
    expect(baseDeclaration(commerceStyles, ".portal-v2-shell .portal-marketplace-card__price dd", "font-variant-numeric")).toBe("tabular-nums");
    expect(desktopDeclaration(commerceStyles, '.portal-v2-shell[data-portal-theme="light"] .portal-commerce-layout--marketplace', "--portal-commerce-muted")).toBe("#334155");
  });

  test("reduces card whitespace without shrinking the price or purchase target", () => {
    const card = ".portal-v2-shell .portal-marketplace-card";
    const price = ".portal-v2-shell .portal-marketplace-card__price";
    const actions = ".portal-v2-shell .portal-marketplace-card__actions";
    expect(baseDeclaration(commerceStyles, `${card} article`, "gap")).toBe("14px");
    expect(baseDeclaration(commerceStyles, price, "gap")).toBe("6px");
    expect(baseDeclaration(commerceStyles, price, "padding")).toBe("0");
    expect(baseDeclaration(commerceStyles, actions, "padding-top")).toBe("4px");
    expect(baseDeclaration(commerceStyles, ".portal-v2-shell .portal-marketplace-card__amount", "font-size")).toBe("48px");
    expect(baseDeclaration(commerceStyles, `${actions} button`, "min-height")).toBe("48px");
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
      ".portal-coins-dialog-theme .portal-coins-status-spinner",
      ".portal-v2-shell .modal-backdrop .portal-recharge-status-card__spinner"
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

  test("composes the Wallet overview as four primary cards with secondary status and a rules aside", () => {
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-wallet-overview-content",
      "grid-template-columns"
    )).toBe("minmax(0, 1fr) minmax(268px, 0.38fr)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-wallet-balance-grid",
      "grid-template-columns"
    )).toBe("repeat(4, minmax(0, 1fr))");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-wallet-status-grid",
      "grid-template-columns"
    )).toBe("repeat(2, minmax(0, 1fr))");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-wallet-header",
      "align-items"
    )).toBe("center");
  });

  test("keeps recent activity compact and scopes recharge colors to the actual Portal modal descendant", () => {
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-wallet-ledger--all",
      "min-width"
    )).toBe("1120px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-wallet-ledger--overview",
      "min-width"
    )).toBe("0");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-wallet-ledger--all tbody tr",
      "height"
    )).toBe("48px");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .modal-backdrop .portal-recharge-dialog",
      "--portal-wallet-text"
    )).toBe("#f0f6fc");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell[data-portal-theme=\"light\"] .modal-backdrop .portal-recharge-dialog",
      "--portal-wallet-text"
    )).toBe("#1f2937");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .modal-backdrop .portal-recharge-offers strong",
      "color"
    )).toBe("var(--portal-wallet-text)");
    expect(desktopDeclaration(
      commerceStyles,
      ".portal-v2-shell .portal-orders-panel .portal-order-table",
      "min-width"
    )).toBe("100%");
  });
});
