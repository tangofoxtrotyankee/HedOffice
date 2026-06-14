import { contextBridge, ipcRenderer } from "electron";
import { IPC, type HedofficeApi } from "../src/shell/ipc-contract";

/**
 * Preload: exposes a narrow, typed `window.hedoffice` API to the renderer over
 * the context bridge (no Node access leaks into the renderer). The renderer
 * speaks only this contract — it never imports core or touches SQLite.
 */
const api: HedofficeApi = {
  getFloor: () => ipcRenderer.invoke(IPC.getFloor),
  getDetail: (agentId: string) => ipcRenderer.invoke(IPC.getDetail, agentId),
  registerAgent: (name: string) => ipcRenderer.invoke(IPC.registerAgent, name),
};

contextBridge.exposeInMainWorld("hedoffice", api);
