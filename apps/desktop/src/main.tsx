import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./tokens.css";
import "./global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { liveDataSource, sampleDataSource, type DataSource } from "./datasource";
import "./shell/ipc-contract"; // window.hedoffice global

/**
 * In the Electron shell, `window.hedoffice` (set by the preload script) provides
 * the live floor over IPC; otherwise (plain web/dev) we fall back to the sample.
 */
async function resolveDataSource(): Promise<DataSource> {
  if (window.hedoffice) {
    try {
      return liveDataSource(await window.hedoffice.getFloor());
    } catch {
      return sampleDataSource;
    }
  }
  return sampleDataSource;
}

const root = document.getElementById("root");
if (root) {
  void resolveDataSource().then((dataSource) =>
    createRoot(root).render(
      <StrictMode>
        <App dataSource={dataSource} />
      </StrictMode>,
    ),
  );
}
