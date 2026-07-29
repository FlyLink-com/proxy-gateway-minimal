import { createElement, useState } from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  RechargeDenominationList,
  RechargeDialog
} from "../features/user-portal/portal-commerce-panels";

describe("Portal recharge presentation", () => {
  afterEach(cleanup);

  test("offers exactly six selectable denominations in the compact dialog", () => {
    const onSelect = vi.fn();
    render(createElement(RechargeDialog, {
      locale: "zh",
      selectedAmount: null,
      onSelect,
      onClose: vi.fn()
    }));

    const dialog = screen.getByRole("dialog", { name: "充值 Coins" });
    const choices = within(dialog).getAllByRole("button", {
      name: /选择 \d+ Coins/
    });

    expect(choices.map((choice) => choice.textContent?.trim())).toEqual([
      "10 Coins",
      "30 Coins",
      "50 Coins",
      "100 Coins",
      "200 Coins",
      "300 Coins"
    ]);

    fireEvent.click(within(dialog).getByRole("button", {
      name: "选择 100 Coins"
    }));
    expect(onSelect).toHaveBeenCalledWith(100);
    expect(within(dialog).getByRole("button", {
      name: "当前不可充值"
    })).toBeDisabled();
    expect(within(dialog).queryByText(/RMB|CNY|USD|汇率|手续费|优惠/)).toBeNull();
  });

  test("contains keyboard focus, closes with Escape, and restores the trigger", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return createElement(
        "div",
        null,
        createElement("button", {
          type: "button",
          onClick: () => setOpen(true)
        }, "打开充值"),
        open
          ? createElement(RechargeDialog, {
              locale: "zh",
              selectedAmount: null,
              onSelect: vi.fn(),
              onClose: () => setOpen(false)
            })
          : null
      );
    }

    render(createElement(Harness));
    const trigger = screen.getByRole("button", { name: "打开充值" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "充值 Coins" });
    const title = within(dialog).getByRole("heading", { name: "充值 Coins" });
    expect(title).toHaveFocus();

    const choices = within(dialog).getAllByRole("button", {
      name: /选择 \d+ Coins/
    });
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(choices.at(-1)).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(within(dialog).getByRole("button", { name: "关闭" })).toHaveFocus();

    expect(fireEvent.keyDown(dialog, { key: "Escape" })).toBe(false);
    expect(screen.queryByRole("dialog", { name: "充值 Coins" })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  test("keeps the complete wallet denomination list disabled", () => {
    render(createElement(RechargeDenominationList, {
      locale: "zh",
      mode: "wallet-disabled"
    }));

    const buttons = screen.getAllByRole("button", {
      name: /充值 \d+ Coins 暂未开放/
    });
    expect(buttons).toHaveLength(6);
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
      expect(button).not.toHaveAttribute("aria-pressed");
    });
  });
});
