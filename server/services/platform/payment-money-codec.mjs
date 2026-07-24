const INVALID_PAYMENT_MONEY = "invalid_payment_money";
const MAX_CURRENCY_EXPONENT = 9;

function fail() {
  throw new TypeError(INVALID_PAYMENT_MONEY);
}

function positiveSafeInteger(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0)) {
    fail();
  }
  return value;
}

export function normalizeCurrencyExponent(value) {
  if (
    !Number.isSafeInteger(value)
    || value < 0
    || value > MAX_CURRENCY_EXPONENT
    || Object.is(value, -0)
  ) {
    fail();
  }
  return value;
}

export function formatPaymentAmountMinor(amountMinor, currencyExponent) {
  const digits = String(positiveSafeInteger(amountMinor));
  const exponent = normalizeCurrencyExponent(currencyExponent);
  if (exponent === 0) return digits;
  const padded = digits.padStart(exponent + 1, "0");
  return `${padded.slice(0, -exponent)}.${padded.slice(-exponent)}`;
}

export function parsePaymentAmountMinor(value, currencyExponent) {
  const exponent = normalizeCurrencyExponent(currencyExponent);
  if (typeof value !== "string") fail();
  const pattern = exponent === 0
    ? /^(?:0|[1-9][0-9]*)$/u
    : new RegExp(`^(?:0|[1-9][0-9]*)\\.[0-9]{${exponent}}$`, "u");
  if (!pattern.test(value)) fail();
  const digits = exponent === 0 ? value : value.replace(".", "");
  const amountMinor = Number(digits);
  positiveSafeInteger(amountMinor);
  if (formatPaymentAmountMinor(amountMinor, exponent) !== value) fail();
  return amountMinor;
}
