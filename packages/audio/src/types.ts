/**
 * The audio provider abstraction (docs/ARCHITECTURE.md, audio subsystem).
 *
 * Both the local engine (sherpa-onnx) and hosted/GPU engines (ElevenLabs,
 * VoxCPM) implement these interfaces, so the voice loop and barge-in behave
 * identically across providers. The interface deliberately **mandates `cancel()`**
 * on TTS so barge-in works the same everywhere.
 */

/** A chunk of 16-bit PCM audio, streamed from TTS to the playback sink. */
export interface AudioChunk {
  pcm: Int16Array;
  sampleRate: number;
  /** Index of the sentence/segment this chunk belongs to (for streaming). */
  segment: number;
}

export interface SttOptions {
  sampleRate?: number;
  language?: string;
}

/** A live streaming STT session: push mic frames, get incremental + final text. */
export interface SttSession {
  /** Push a frame of mic PCM. */
  push(frame: Int16Array): void;
  /** Subscribe to incremental ('partial') or settled ('final') transcripts. */
  on(event: "partial" | "final", cb: (text: string) => void): void;
  /** Signal end-of-utterance; resolves the final transcript. */
  end(): Promise<string>;
  close(): void;
}

export interface SttProvider {
  readonly name: string;
  startStream(opts?: SttOptions): SttSession;
}

export interface TtsOptions {
  voiceId?: string;
  sampleRate?: number;
}

export interface TtsProvider {
  readonly name: string;
  /** Stream synthesized audio for one piece of text (ideally one sentence). */
  synthesize(text: string, opts?: TtsOptions): AsyncIterable<AudioChunk>;
  /** REQUIRED for barge-in: stop the in-flight synthesis immediately. */
  cancel(): void;
}

export type VadEventType = "speech-start" | "speech-end";
export interface VadEvent {
  type: VadEventType;
  /** Monotonic marker (frame index or ms) of when it was detected. */
  at: number;
}

/** Voice-activity detector (e.g. Silero): endpointing + barge-in trigger. */
export interface VadDetector {
  /** Feed one frame; returns a detected event, or null. */
  process(frame: Int16Array): VadEvent | null;
  reset(): void;
}

/** Where synthesized audio goes. The renderer's audio output implements this. */
export interface PlaybackSink {
  /** Enqueue a chunk for playback. */
  play(chunk: AudioChunk): void;
  /** Drop all queued audio immediately (barge-in flush — don't drain). */
  flush(): void;
}
