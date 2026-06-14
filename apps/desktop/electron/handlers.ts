import { type Office, buildCubicleDetail, buildFloorView } from "@hedoffice/core";
import type { CubicleDetailView, CubicleView } from "@hedoffice/schema";
import type { RegisteredAgentDTO } from "../src/shell/ipc-contract";

/**
 * The IPC request handlers, as plain async functions over an `Office` — no
 * electron dependency, so they're unit-tested headlessly. The Electron main
 * process registers these on `ipcMain.handle(...)`.
 */
export function makeHandlers(office: Office) {
  return {
    getFloor: async (): Promise<CubicleView[]> => buildFloorView(office.store),
    getDetail: async (agentId: string): Promise<CubicleDetailView> =>
      buildCubicleDetail(office.store, agentId),
    registerAgent: async (name: string): Promise<RegisteredAgentDTO> =>
      office.registerAgent(name),
  };
}

export type Handlers = ReturnType<typeof makeHandlers>;
