import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./tokens.css";
import "./global.css";
import { StrictMode, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { liveDataSource, sampleDataSource, type DataSource } from "./datasource";
import { TokenGate } from "./TokenGate";
import { createWebApi, probeWebApi, TOKEN_STORAGE_KEY } from "./shell/web-api";
import "./shell/ipc-contract"; // window.hedoffice global

/**
 * Bootstraps one of three modes:
 * 1. Electron shell — `window.hedoffice` was set by the preload script.
 * 2. Web — served by the deployed HedOffice server; install the HTTP/SSE
 *    implementation of `window.hedoffice` after the operator token checks out
 *    (stored token, or `#token=…` in the URL for a first login).
 * 3. Demo — no live server reachable (e.g. bare `vite dev`); sample floor.
 */

/** Read a `#token=…` first-login convenience hash, then strip it from the URL. */
function takeHashToken(): string | undefined {
  const match = /[#&]token=([^&]+)/.exec(window.location.hash);
  if (!match?.[1]) return undefined;
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return decodeURIComponent(match[1]);
}

async function connectWeb(token: string): Promise<DataSource | "unauthorized" | "absent"> {
  const probe = await probeWebApi(token);
  if (probe !== "ok") return probe;
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  window.hedoffice = createWebApi(token);
  return liveDataSource(await window.hedoffice.getFloor());
}

function WebBootstrap({ initialError }: { initialError?: string }): ReactNode {
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const [error, setError] = useState<string | undefined>(initialError);
  if (dataSource) return <App dataSource={dataSource} />;
  return (
    <TokenGate
      error={error}
      onSubmit={(token) => {
        void connectWeb(token).then((result) => {
          if (result === "unauthorized") setError("invalid token");
          else if (result === "absent") setError("no office server reachable");
          else setDataSource(() => result);
        });
      }}
    />
  );
}

async function bootstrap(): Promise<ReactNode> {
  // Mode 1: Electron shell (preload already installed the API).
  if (window.hedoffice) {
    try {
      return <App dataSource={liveDataSource(await window.hedoffice.getFloor())} />;
    } catch {
      return <App dataSource={sampleDataSource} />;
    }
  }

  // Mode 2: web. Try hash token first (first login), then the stored one.
  const candidate = takeHashToken() ?? localStorage.getItem(TOKEN_STORAGE_KEY);
  if (candidate) {
    const result = await connectWeb(candidate);
    if (typeof result !== "string") return <App dataSource={result} />;
    if (result === "unauthorized") {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return <WebBootstrap initialError="invalid or expired token" />;
    }
    // "absent" → fall through to demo mode.
  } else {
    // No token at hand: a 401 from the probe proves a live office is serving
    // us and wants a login; anything else means demo mode.
    if ((await probeWebApi("")) === "unauthorized") return <WebBootstrap />;
  }

  // Mode 3: demo/sample floor (bare vite dev, headless preview).
  return <App dataSource={sampleDataSource} />;
}

const root = document.getElementById("root");
if (root) {
  void bootstrap().then((node) =>
    createRoot(root).render(<StrictMode>{node}</StrictMode>),
  );
}
