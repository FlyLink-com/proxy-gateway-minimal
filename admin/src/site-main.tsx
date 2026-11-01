import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CompanySitePage } from "./features/company-site/company-site-page";
import {
  captureCompanySiteAdsClickFromLocation,
  clearCompanySiteAdsClick
} from "./features/ads-attribution";
import "./styles.css";

// Strip click IDs before React mounts; capture only with prior consent and the explicit public feature gate.
captureCompanySiteAdsClickFromLocation();
window.addEventListener("pagehide", clearCompanySiteAdsClick);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") clearCompanySiteAdsClick();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CompanySitePage />
  </StrictMode>
);
