import { lazy, Suspense, useEffect, useState } from "react";
import { isThirdPartyNodeNamesPreviewEnabled } from "../app/third-party-node-names-preview";

const Preview = import.meta.env.DEV
  ? lazy(async () => {
      const module = await import("./third-party-node-names-preview");
      return { default: module.ThirdPartyNodeNamesPreview };
    })
  : null;

export function ThirdPartyNodeNamesLocalEntry() {
  const [enabled, setEnabled] = useState(() => isThirdPartyNodeNamesPreviewEnabled());
  useEffect(() => {
    const sync = () => setEnabled(isThirdPartyNodeNamesPreviewEnabled());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  if (!enabled || !Preview) return <main><h1>本地预览未启用</h1><p>此入口仅用于开发模式下的本机合成预览，不提供 Admin 登录或业务操作。</p></main>;
  return <Suspense fallback={<main aria-busy="true">正在加载本地预览…</main>}><Preview /></Suspense>;
}
