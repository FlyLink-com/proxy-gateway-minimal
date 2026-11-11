/**
 * Shared synthetic vectors for the approved R1 String.trim() compatibility contract.
 * Mirror these inputs in Android parity tests when that repository is updated.
 */
export const PASSWORD_NORMALIZATION_VECTORS = [
  {
    name: "ECMAScript edge whitespace is removed while interior characters remain",
    input: "\uFEFF\u00A0\tMiXeD\uFEFF  Case\tSensitive 1! \u00A0\u3000\u2029",
    expected: "MiXeD\uFEFF  Case\tSensitive 1!"
  },
  {
    name: "case and repeated internal whitespace are preserved",
    input: " \tCase Sensitive  2026! \u3000",
    expected: "Case Sensitive  2026!"
  },
  {
    name: "composed Unicode is preserved without normalization",
    input: " \tCaf\u00E9-2026! \u00A0",
    expected: "Caf\u00E9-2026!"
  },
  {
    name: "decomposed Unicode is preserved without normalization",
    input: " \tCafe\u0301-2026! \u00A0",
    expected: "Cafe\u0301-2026!"
  },
  {
    name: "non-ECMAScript control characters are not trimmed",
    input: "\u001Cleft\u001F",
    expected: "\u001Cleft\u001F"
  }
] as const;
