import { join } from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { Office } from "@hedoffice/core";
import { HedOfficeServer } from "@hedoffice/mcp-server";
import type { ApprovalDecision } from "@hedoffice/schema";
import { IPC } from "../src/shell/ipc-contract";
import { makeHandlers } from "./handlers";
import { createApprovalBridge } from "./approval-bridge";
import { ElectronSecretStore } from "./secrets-electron";

/**
 * Electron main process (ADR-005). Runs the orchestration core + the MCP server
 * locally, exposes the read-models to the renderer over IPC, drives the human
 * approval gate through the renderer's modal, and backs secrets with the OS
 * keychain via safeStorage. Headless Phases 0–3 deliberately don't depend on any
 * of this.
 *
 * Note: not launched in CI (no display); typechecked + the handlers / approval
 * bridge / secret store are unit-tested. `pnpm electron:dev` runs it locally.
 */
const MCP_PORT = 4317;

async function bootstrap(): Promise<void> {
  let win: BrowserWindow | undefined;

  // The approval modal in the renderer is the human gate: forward requests to it
  // and resolve when the user decides.
  const approvals = createApprovalBridge((req) =>
    win?.webContents.send(IPC.approvalRequest, req),
  );

  const office = new Office({
    approval: { defaultPolicy: "prompt", approver: approvals.approver },
    onPresenceChange: () => win?.webContents.send(IPC.update),
  });
  const server = new HedOfficeServer({ office });
  await server.listen(MCP_PORT);

  const secrets = new ElectronSecretStore(join(app.getPath("userData"), "secrets.json"));
  void secrets; // used by settings/provider wiring (follow-up)

  const handlers = makeHandlers(office);
  ipcMain.handle(IPC.getFloor, () => handlers.getFloor());
  ipcMain.handle(IPC.getDetail, (_e, agentId: string) => handlers.getDetail(agentId));
  ipcMain.handle(IPC.registerAgent, (_e, name: string) => handlers.registerAgent(name));
  ipcMain.handle(IPC.resolveApproval, (_e, approvalId: string, decision: ApprovalDecision) =>
    approvals.resolve(approvalId, decision),
  );

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#1F1B17",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) await win.loadURL(devUrl);
  else await win.loadFile(join(__dirname, "../dist/index.html"));

  app.on("window-all-closed", () => {
    void server.close();
    if (process.platform !== "darwin") app.quit();
  });
}

app.whenReady().then(bootstrap).catch((err) => {
  console.error("HedOffice failed to start:", err);
  app.quit();
});
