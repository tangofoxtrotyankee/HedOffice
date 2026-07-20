import type { ApprovalDecision, CubicleDetailView, CubicleView } from "@hedoffice/schema";
import type { ApprovalRequestDTO, HedofficeApi, RegisteredAgentDTO } from "./ipc-contract";

/**
 * The web implementation of `HedofficeApi` — what `window.hedoffice` is when the
 * renderer is served by the deployed HedOffice server instead of the Electron
 * shell. Requests hit the operator `/ui/api` (bearer token); live pings arrive
 * over a single shared SSE stream (`update`, `approval`).
 */

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
  }
}

export const TOKEN_STORAGE_KEY = "hedoffice.token";

/** One probe request to classify the environment. */
export async function probeWebApi(
  token: string,
  base = "",
): Promise<"ok" | "unauthorized" | "absent"> {
  try {
    const res = await fetch(`${base}/ui/api/floor`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return "ok";
    if (res.status === 401) return "unauthorized";
    return "absent";
  } catch {
    return "absent";
  }
}

export function createWebApi(token: string, base = ""): HedofficeApi {
  const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
    return (await res.json()) as T;
  };

  let stream: EventSource | undefined;
  const updateCbs = new Set<() => void>();
  const approvalCbs = new Set<(req: ApprovalRequestDTO) => void>();
  const resolvedCbs = new Set<(approvalId: string) => void>();

  const ensureStream = (): void => {
    if (stream) return;
    stream = new EventSource(
      `${base}/ui/api/events?token=${encodeURIComponent(token)}`,
    );
    stream.addEventListener("update", () => {
      for (const cb of updateCbs) cb();
    });
    stream.addEventListener("approval", (e) => {
      const req = JSON.parse((e as MessageEvent).data) as ApprovalRequestDTO;
      for (const cb of approvalCbs) cb(req);
    });
    stream.addEventListener("approval-resolved", (e) => {
      const { approvalId } = JSON.parse((e as MessageEvent).data) as { approvalId: string };
      for (const cb of resolvedCbs) cb(approvalId);
    });
    // After a (re)connect the client may have missed pings — refresh once.
    stream.onopen = () => {
      for (const cb of updateCbs) cb();
    };
  };

  return {
    getFloor: () =>
      request<{ floor: CubicleView[] }>("/ui/api/floor").then((r) => r.floor),
    getDetail: (agentId) =>
      request<CubicleDetailView>(`/ui/api/detail/${encodeURIComponent(agentId)}`),
    registerAgent: (): Promise<RegisteredAgentDTO> =>
      Promise.reject(
        new Error(
          "Registration is disabled on the web UI — provision agents via Railway Variables (HEDOFFICE_AGENT_TOKEN_*) or the CLI.",
        ),
      ),
    resolveApproval: async (approvalId, decision: ApprovalDecision) => {
      await request(`/ui/api/approvals/${encodeURIComponent(approvalId)}`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
    },
    onApprovalRequest: (cb) => {
      ensureStream();
      approvalCbs.add(cb);
      return () => approvalCbs.delete(cb);
    },
    onApprovalResolved: (cb) => {
      ensureStream();
      resolvedCbs.add(cb);
      return () => resolvedCbs.delete(cb);
    },
    onUpdate: (cb) => {
      ensureStream();
      updateCbs.add(cb);
      return () => updateCbs.delete(cb);
    },
  };
}
