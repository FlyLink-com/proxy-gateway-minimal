import { withNodeCountryFlag } from "./node-country-model";

export type ThirdPartyNode = {
  id: string;
  sourceName: string;
  originalName: string;
  defaultName: string;
  customName: string | null;
  countryCode: string;
  customCountryCode?: string | null;
  protocol: "VLESS" | "Hy2" | "TUIC" | "SS";
};

const RESERVED = new Set(["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL", "AUTO", "STABLE", "WEAK-NETWORK", "FALLBACK"]);
// eslint-disable-next-line no-control-regex -- Deliberately reject control characters in display names.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u;
const UNPAIRED_SURROGATE = /[\ud800-\udfff]/u;

export function renderedNodeName(node: ThirdPartyNode): string {
  return withNodeCountryFlag(node.customName ?? node.defaultName, node.customCountryCode);
}

export function validateNodeName(nodes: readonly ThirdPartyNode[], nodeId: string, input: string): { value: string | null; error: string | null } {
  const node = nodes.find((item) => item.id === nodeId);
  const invalid = (error: string) => ({ value: null, error });
  if (!node) return invalid("未找到要修改的节点。");
  if (UNSAFE.test(input)) return invalid("名称不能包含控制字符或不可见的方向字符。");
  if (UNPAIRED_SURROGATE.test(input)) return invalid("名称包含无效字符，请重新输入。");
  const value = input.trim() || null;
  if (value && value.length > 128) return invalid("显示名称不能超过 128 个字符，部分符号计为两个字符。");
  const effectiveName = renderedNodeName({ ...node, customName: value });
  if (!effectiveName.trim()) return invalid("去除国旗后名称不能为空。");
  if (RESERVED.has((value ?? node.defaultName).toUpperCase()) || RESERVED.has(effectiveName.toUpperCase())) return invalid("该名称为客户端保留名称，请使用其他名称。");
  if (nodes.some((item) => item.id !== nodeId && renderedNodeName(item).toLowerCase() === effectiveName.toLowerCase())) {
    return invalid("显示名称与其他节点重复，请使用不同名称。");
  }
  return { value, error: null };
}
