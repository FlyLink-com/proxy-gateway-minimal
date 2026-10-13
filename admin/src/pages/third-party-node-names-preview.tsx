import { Network, PanelLeft, ShieldCheck } from "lucide-react";
import { ThirdPartyNodeNamesPage } from "../features/third-party-node-names/third-party-node-names-page";
import type { ThirdPartyNode } from "../features/third-party-node-names/node-name-model";
import "./third-party-node-names-preview.styles.css";

// Synthetic labels only: no connection address, credentials, or real sources.
const PREVIEW_NODES: readonly ThirdPartyNode[] = [
  { id: "demo-jp-01", sourceName: "演示来源 A", originalName: "Japan Entry 01", defaultName: "[3P] JP 1 | Japan Entry 01", customName: null, countryCode: "JP", protocol: "VLESS" },
  { id: "demo-jp-02", sourceName: "演示来源 A", originalName: "Japan Entry 02", defaultName: "[3P] JP 2 | Japan Entry 02", customName: "日本 · 02", countryCode: "JP", protocol: "Hy2" },
  { id: "demo-sg-01", sourceName: "演示来源 B", originalName: "Singapore Entry 01", defaultName: "[3P] SG 1 | Singapore Entry 01", customName: "新加坡 · 01", countryCode: "SG", protocol: "TUIC" },
  { id: "demo-us-01", sourceName: "演示来源 B", originalName: "United States Entry 01", defaultName: "[3P] US 1 | United States Entry 01", customName: null, countryCode: "US", protocol: "VLESS" },
  { id: "demo-de-01", sourceName: "演示来源 C", originalName: "Germany Entry 01", defaultName: "[3P] DE 1 | Germany Entry 01", customName: null, countryCode: "DE", protocol: "SS" },
  { id: "demo-gb-01", sourceName: "演示来源 C", originalName: "United Kingdom Entry 01", defaultName: "[3P] GB 1 | United Kingdom Entry 01", customName: null, countryCode: "GB", protocol: "Hy2" }
];

export function ThirdPartyNodeNamesPreview() {
  return (
    <div className="tp-preview-shell">
      <aside className="tp-preview-sidebar">
        <div className="tp-preview-brand"><Network aria-hidden="true" /><strong>GCC WebOS <small>ADMIN CONSOLE</small></strong></div>
        <p className="tp-preview-nav-label">订阅管理</p>
        <nav aria-label="本地命名预览导航">
          <a href="#/third-party-node-names-preview" aria-current="page"><PanelLeft size={18} aria-hidden="true" />第三方节点命名</a>
        </nav>
        <div className="tp-preview-boundary"><ShieldCheck size={20} aria-hidden="true" /><p>本地功能预览<small>无生产连接<br />无凭证数据</small></p></div>
      </aside>
      <main className="tp-preview-main"><ThirdPartyNodeNamesPage initialNodes={PREVIEW_NODES} /></main>
    </div>
  );
}
