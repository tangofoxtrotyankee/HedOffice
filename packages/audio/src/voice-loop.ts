import { type Clock, systemClock } from "./clock.js";
import { splitSentences } from "./sentence.js";
import type {
  PlaybackSink,
  SttProvider,
  TtsProvider,
  VadDetector,
} from "./types.js";

export type TurnChangeReason = "agent-done" | "user-barge-in";

/**
 * A one-shot barge-in flag. The mic/VAD wiring calls `requestBargeIn()` on
 * speech-start; the speak loop checks it between chunks and, on the **first**
 * trigger, flushes playback and cancels TTS (never waits for silence-end).
 */
export class BargeInController {
  private flag = false;
  requestBargeIn(): void {
    this.flag = true;
  }
  get requested(): boolean {
    return this.flag;
  }
  reset(): void {
    this.flag = false;
  }
}

export interface VoiceLoopDeps {
  stt: SttProvider;
  tts: TtsProvider;
  vad: VadDetector;
  clock?: Clock;
}

export interface VoiceLoopHandlers {
  onUserUtterance?: (text: string) => void;
  onTurnChange?: (reason: TurnChangeReason) => void;
}

export interface ListenResult {
  transcript: string;
  /** Whether the VAD endpointed the utterance (vs. running out of frames). */
  endpointed: boolean;
  /** Endpoint → final-transcript latency, ms (per the clock). */
  sttFinalMs: number;
}

export interface SpeakResult {
  bargedIn: boolean;
  /** Speak-start → first audio chunk latency, ms (TTS time-to-first-audio). */
  firstAudioMs: number | null;
  chunksPlayed: number;
}

/**
 * The headless voice loop: mic frames → VAD → STT → (agent) → TTS → playback,
 * with per-sentence streaming and barge-in. It is deliberately decoupled from
 * MCP — Phase 3 wires `listen()` output to `channel.user_spoke` and feeds
 * `channel.say` text into `speak()`.
 */
export class VoiceLoop {
  private readonly clock: Clock;

  constructor(
    private readonly deps: VoiceLoopDeps,
    private readonly handlers: VoiceLoopHandlers = {},
  ) {
    this.clock = deps.clock ?? systemClock;
  }

  /** Consume a user's mic frames up to the VAD endpoint, then finalize STT. */
  async listen(frames: Int16Array[]): Promise<ListenResult> {
    const session = this.deps.stt.startStream();
    const t0 = this.clock.now();
    let endpointed = false;
    for (const frame of frames) {
      session.push(frame);
      const ev = this.deps.vad.process(frame);
      if (ev?.type === "speech-end") {
        endpointed = true;
        break;
      }
    }
    const transcript = await session.end();
    session.close();
    this.handlers.onUserUtterance?.(transcript);
    return { transcript, endpointed, sttFinalMs: this.clock.now() - t0 };
  }

  /**
   * Voice an agent reply: split into sentences, synthesize each, stream chunks
   * to the sink. If `controller` is barged-in, flush + cancel and stop at the
   * next chunk boundary (sub-frame interruption).
   */
  async speak(
    text: string,
    sink: PlaybackSink,
    controller: BargeInController,
  ): Promise<SpeakResult> {
    controller.reset();
    const t0 = this.clock.now();
    let firstAudioMs: number | null = null;
    let chunksPlayed = 0;

    for (const sentence of splitSentences(text)) {
      if (controller.requested) break;
      for await (const chunk of this.deps.tts.synthesize(sentence)) {
        if (controller.requested) {
          this.deps.tts.cancel();
          sink.flush();
          this.handlers.onTurnChange?.("user-barge-in");
          return { bargedIn: true, firstAudioMs, chunksPlayed };
        }
        if (firstAudioMs === null) firstAudioMs = this.clock.now() - t0;
        sink.play(chunk);
        chunksPlayed += 1;
      }
    }

    this.handlers.onTurnChange?.("agent-done");
    return { bargedIn: false, firstAudioMs, chunksPlayed };
  }
}
