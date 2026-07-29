import { createElement } from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import {
  RechargeDenominationList,
  RechargeDialog
} from "../features/user-portal/portal-commerce-panels";

describe("Portal recharge presentation", () => {
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
      name: "支付通道将在下一阶段接入"
    })).toBeDisabled();
    expect(within(dialog).queryByText(/RMB|CNY|USD|汇率|手续费|优惠/)).toBeNull();
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
