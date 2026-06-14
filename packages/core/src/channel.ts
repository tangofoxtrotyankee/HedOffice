import type { EventStore } from "@hedoffice/event-store";
import { cubicleOf } from "./ids.js";
import type { PresenceEngine } from "./presence.js";

export interface Utterance {
  /** Event id — use as the cursor for the next `listen`. */
  eventId: number;
  transcript: string;
  ts: number;
}

export interface ListenResult {
  utterances: Utterance[];
  /** Pass back as `sinceEventId` next time to get only newer utterances. */
  cursor: number;
}

/**
 * The voice/text channel between the human and a BYO agent — the bridge the
 * Phase 2 voice loop plugs into (Phase 3 integration spine).
 *
 * - `userSpoke` records a transcribed utterance (`channel.user_spoke`) and marks
 *   the cubicle `thinking` (a reply is owed).
 * - `listen` is what the agent's `channel.listen` tool reads: recent utterances
 *   since a cursor.
 * - `agentSaid` records the agent's spoken reply (`channel.agent_said`), clears
 *   `thinking`, and is what the app voices via TTS.
 */
export class ChannelService {
  constructor(
    private readonly store: EventStore,
    private readonly presence: PresenceEngine,
  ) {}

  userSpoke(
    agentId: string,
    transcript: string,
    opts: { audioRef?: string | null; sttMs?: number } = {},
  ): number {
    const ev = this.store.append({
      agentId,
      streamId: cubicleOf(agentId),
      actor: "user",
      type: "channel.user_spoke",
      payload: {
        agentId,
        transcript,
        audioRef: opts.audioRef ?? null,
        sttMs: opts.sttMs ?? 0,
      },
    });
    this.presence.userSpoke(agentId);
    return ev.eventId;
  }

  listen(agentId: string, sinceEventId?: number): ListenResult {
    const events = this.store.read({
      agentId,
      type: "channel.user_spoke",
      ...(sinceEventId !== undefined && { afterEventId: sinceEventId }),
    });
    const utterances: Utterance[] = events.map((e) => ({
      eventId: e.eventId,
      transcript: e.type === "channel.user_spoke" ? e.payload.transcript : "",
      ts: e.ts,
    }));
    const last = utterances.at(-1);
    return { utterances, cursor: last ? last.eventId : (sinceEventId ?? 0) };
  }

  agentSaid(
    agentId: string,
    text: string,
    opts: { voiceId?: string | null; provider?: string; ttsMs?: number } = {},
  ): number {
    const ev = this.store.append({
      agentId,
      streamId: cubicleOf(agentId),
      actor: "agent",
      type: "channel.agent_said",
      payload: {
        agentId,
        text,
        ttsMs: opts.ttsMs ?? 0,
        voiceId: opts.voiceId ?? null,
        provider: opts.provider ?? "local",
      },
    });
    this.presence.agentReplied(agentId);
    return ev.eventId;
  }
}
