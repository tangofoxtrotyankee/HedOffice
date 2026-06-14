import type { ManualClock } from "./clock.js";
import type {
  AudioChunk,
  PlaybackSink,
  SttProvider,
  SttSession,
  TtsProvider,
  VadDetector,
  VadEvent,
  VadEventType,
} from "./types.js";

/**
 * Deterministic, hardware-free providers for the headless Phase 2 spike — the
 * "echo agent" demo. Each models its stage's latency by advancing a ManualClock,
 * so the voice loop's glass-to-glass budget can be measured without a mic, a
 * speaker, or model weights. Real providers (sherpa-onnx, ElevenLabs, VoxCPM)
 * implement the same interfaces and replace the modeled timings with measured ones.
 */

/** STT that returns a fixed transcript, modeling endpointing + recognition time. */
export class FakeStt implements SttProvider {
  readonly name = "fake-stt";
  constructor(
    private readonly opts: {
      transcript: string;
      clock: ManualClock;
      /** endpointing latency (VAD silence detection), ms */
      endpointMs?: number;
      /** recognition latency to final, ms */
      sttMs?: number;
    },
  ) {}

  startStream(): SttSession {
    const { transcript, clock, endpointMs = 200, sttMs = 200 } = this.opts;
    const finals: Array<(t: string) => void> = [];
    return {
      push() {},
      on(event, cb) {
        if (event === "final") finals.push(cb);
      },
      async end() {
        clock.advance(endpointMs + sttMs);
        for (const cb of finals) cb(transcript);
        return transcript;
      },
      close() {},
    };
  }
}

/**
 * TTS that emits `chunksPerSentence` chunks, modeling time-to-first-audio
 * (`firstAudioMs`) then per-chunk cadence (`chunkMs`). Honors `cancel()`.
 */
export class EchoTts implements TtsProvider {
  readonly name = "echo-tts";
  private cancelled = false;

  constructor(
    private readonly opts: {
      clock: ManualClock;
      /** time-to-first-audio, ms (Piper ~<50, Kokoro ~500–2000 cold) */
      firstAudioMs?: number;
      chunkMs?: number;
      sampleRate?: number;
      chunksPerSentence?: number;
    },
  ) {}

  cancel(): void {
    this.cancelled = true;
  }

  async *synthesize(text: string): AsyncIterable<AudioChunk> {
    this.cancelled = false;
    const {
      clock,
      firstAudioMs = 50,
      chunkMs = 20,
      sampleRate = 24_000,
      chunksPerSentence = 3,
    } = this.opts;
    void text;
    for (let k = 0; k < chunksPerSentence; k++) {
      if (this.cancelled) return;
      clock.advance(k === 0 ? firstAudioMs : chunkMs);
      yield { pcm: new Int16Array(sampleRate / 100), sampleRate, segment: 0 };
    }
  }
}

/** VAD driven by a script: emit the given event on the given 0-based frame index. */
export class ScriptedVad implements VadDetector {
  private i = 0;
  constructor(private readonly script: Record<number, VadEventType>) {}
  process(): VadEvent | null {
    const type = this.script[this.i];
    this.i += 1;
    return type ? { type, at: this.i } : null;
  }
  reset(): void {
    this.i = 0;
  }
}

/** In-memory playback sink that records what was played and flushed. */
export class BufferSink implements PlaybackSink {
  /** Total chunks accepted for playback (survives flush). */
  playedCount = 0;
  /** Number of times the queue was flushed (barge-ins). */
  flushCount = 0;
  /** Currently-queued (not-yet-drained) chunks. */
  queue: AudioChunk[] = [];
  /** Optional hook fired after each play — lets a test simulate the user
   *  speaking the instant they hear audio (triggers barge-in). */
  onPlay?: (chunk: AudioChunk, sink: BufferSink) => void;

  play(chunk: AudioChunk): void {
    this.playedCount += 1;
    this.queue.push(chunk);
    this.onPlay?.(chunk, this);
  }

  flush(): void {
    this.flushCount += 1;
    this.queue = [];
  }
}

/** Build a run of silent mic frames (one VAD `process` call each). */
export function silentFrames(count: number, size = 160): Int16Array[] {
  return Array.from({ length: count }, () => new Int16Array(size));
}
