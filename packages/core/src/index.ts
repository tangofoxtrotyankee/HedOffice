export { Office } from "./office.js";
export type { OfficeOptions } from "./office.js";
export { AgentRegistry } from "./agents.js";
export type { RegisteredAgent, AgentRecord } from "./agents.js";
export { CubicleState } from "./cubicle.js";
export type { Task } from "./cubicle.js";
export { PresenceEngine } from "./presence.js";
export type { PresenceSnapshot } from "./presence.js";
export { ChannelService } from "./channel.js";
export { LibraryStore, isValidLibraryPath, libraryUri } from "./library.js";
export type {
  LibraryDocMeta,
  LibraryManifest,
  ManifestEntry,
  LibraryProposalRecord,
} from "./library.js";
export type { Utterance, ListenResult } from "./channel.js";
export { ApprovalGate, MUTATING_TOOLS, STAGE_POLICY } from "./approvals.js";
export type { Approver, ApprovalRequest, ApprovalGateOptions } from "./approvals.js";
export { OfficeControl, appendSecurityViolation } from "./control.js";
export type { ForceDisconnect } from "./control.js";
export { createApprovalBridge } from "./approval-bridge.js";
export type { ApprovalBridge } from "./approval-bridge.js";
export { buildFloorView, buildCubicleDetail } from "./views.js";
export { cubicleOf, sha256 } from "./ids.js";
