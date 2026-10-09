import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App.tsx";
import { isNative } from "./lib/platform.ts";
import "@fontsource-variable/inter";
import "./styles.css";

// Il service worker serve solo alla versione web (installabile come PWA).
if (!isNative) registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
