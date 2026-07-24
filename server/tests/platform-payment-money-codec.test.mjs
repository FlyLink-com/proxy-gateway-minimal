import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPaymentAmountMinor,
  normalizeCurrencyExponent,
  parsePaymentAmountMinor
} from "../services/platform/payment-money-codec.mjs";

const INVALID_PAYMENT_MONEY = "invalid_payment_money";

function assertInvalid(operation) {
  assert.throws(operation, new TypeError(INVALID_PAYMENT_MONEY));
}

test("currency exponent accepts only safe integers from zero through nine", () => {
  for (const value of [0, 1, 2, 3, 9]) {
    assert.equal(normalizeCurrencyExponent(value), value);
  }
  for (const value of [-1, 10, 1.5, Number.MAX_SAFE_INTEGER + 1, -0]) {
    assertInvalid(() => normalizeCurrencyExponent(value));
  }
});

test("minor-unit formatting is canonical for exponents zero two three and nine", () => {
  for (const [amountMinor, currencyExponent, expected] of [
    [1, 0, "1"],
    [1, 2, "0.01"],
    [100, 2, "1.00"],
    [12345, 3, "12.345"],
    [1, 9, "0.000000001"],
    [Number.MAX_SAFE_INTEGER, 2, "90071992547409.91"]
  ]) {
    assert.equal(formatPaymentAmountMinor(amountMinor, currencyExponent), expected);
  }
});

test("minor-unit parsing round-trips the canonical formatter", () => {
  for (const [amountMinor, currencyExponent] of [
    [1, 0],
    [1, 2],
    [100, 2],
    [12345, 3],
    [1, 9],
    [Number.MAX_SAFE_INTEGER, 2]
  ]) {
    const text = formatPaymentAmountMinor(amountMinor, currencyExponent);
    assert.equal(parsePaymentAmountMinor(text, currencyExponent), amountMinor);
  }
});

test("money parsing rejects signs whitespace grouping exponent notation and wrong precision", () => {
  for (const value of ["+1.00", " 1.00", "1,000.00", "1e2", ".50", "00.50", "1.0", "1.000"]) {
    assertInvalid(() => parsePaymentAmountMinor(value, 2));
  }
});

test("money conversion rejects zero negative fractional and unsafe amounts", () => {
  for (const value of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assertInvalid(() => formatPaymentAmountMinor(value, 2));
  }
  assertInvalid(() => parsePaymentAmountMinor("0", 0));
  assertInvalid(() => parsePaymentAmountMinor("0.00", 2));
  assertInvalid(() => parsePaymentAmountMinor("-0.01", 2));
  assertInvalid(() => parsePaymentAmountMinor("90071992547409.92", 2));
});

test("money conversion never uses floating-point division or toFixed", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(
    new URL("../services/platform/payment-money-codec.mjs", import.meta.url),
    "utf8"
  ));
  assert.doesNotMatch(source, /\/(?:\s|\*|\d)/u);
  assert.doesNotMatch(source, /\.toFixed\(/u);
});
