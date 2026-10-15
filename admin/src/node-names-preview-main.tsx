import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThirdPartyNodeNamesLocalEntry } from "./pages/third-party-node-names-local-entry";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><ThirdPartyNodeNamesLocalEntry /></StrictMode>
);
