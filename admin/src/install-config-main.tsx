import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { InstallConfigPage } from "./features/install-config/install-config-page";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main className="install-config-standalone">
      <InstallConfigPage />
    </main>
  </StrictMode>
);
