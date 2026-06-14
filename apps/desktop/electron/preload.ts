import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  IPC,
  type ApprovalRequestDTO,
  type HedofficeApi,
} from "../src/shell/ipc-contract";
import type { ApprovalDecision } from "@hedoffice/schema";

/**
 * Preload: exposes a narrow, typed `window.hedoffice` API to the renderer over
 * the context bridge (no Node access leaks into the renderer). The renderer
 * speaks only this contract — it never imports core or touches SQLite.
 */
const api: HedofficeApi = {
  getFloor: () => ipcRenderer.invoke(IPC.getFloor),
  getDetail: (agentId: string) => ipcRenderer.invoke(IPC.getDetail, agentId),
  registerAgent: (name: string) => ipcRenderer.invoke(IPC.registerAgent, name),
  resolveApproval: (approvalId: string, decision: ApprovalDecision) =>
    ipcRenderer.invoke(IPC.resolveApproval, approvalId, decision),
  onApprovalRequest: (cb: (req: ApprovalRequestDTO) => void) => {
    const listener = (_e: IpcRendererEvent, req: ApprovalRequestDTO) => cb(req);
    ipcRenderer.on(IPC.approvalRequest, listener);
    return () => ipcRenderer.removeListener(IPC.approvalRequest, listener);
  },
  onUpdate: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on(IPC.update, listener);
    return () => ipcRenderer.removeListener(IPC.update, listener);
  },
};

contextBridge.exposeInMainWorld("hedoffice", api);
