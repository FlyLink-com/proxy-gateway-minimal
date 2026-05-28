import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CompanySitePage } from "./features/company-site/company-site-page";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CompanySitePage />
  </StrictMode>
);
