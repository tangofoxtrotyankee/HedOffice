import type { AudioChunk, TtsOptions, TtsProvider } from "../types.js";

/** Minimal fetch shape we depend on — injectable so the provider is testable. */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; body: ReadableStream<Uint8Array> | null }>;

export interface ElevenLabsTtsOptions {
  apiKey: string;
  voiceId?: string;
  modelId?: string;
  /** PCM sample rate to request (16000 / 22050 / 24000 / 44100). */
  sampleRate?: number;
  baseUrl?: string;
  /** Override the network call (tests inject a fake streaming response). */
  fetchImpl?: FetchLike;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * The hosted ElevenLabs TTS provider — a second implementation of `TtsProvider`
 * that proves the abstraction (DESIGN/ARCHITECTURE audio subsystem). It streams
 * raw PCM from the ElevenLabs streaming endpoint and yields `AudioChunk`s as they
 * arrive; `cancel()` aborts the request (barge-in). The network call is injected,
 * so the streaming + cancel behaviour is unit-tested without a key or a socket.
 *
 * Real measured latency / audio quality is verified on a developer machine with a
 * real key (see docs/TESTING.md).
 */
export class ElevenLabsTtsProvider implements TtsProvider {
  readonly name = "elevenlabs";
  private controller?: AbortController;

  constructor(private readonly opts: ElevenLabsTtsOptions) {}

  cancel(): void {
    this.controller?.abort();
  }

  async *synthesize(text: string, ttsOpts?: TtsOptions): AsyncIterable<AudioChunk> {
    const voiceId = ttsOpts?.voiceId ?? this.opts.voiceId ?? "21m00Tcm4TlvDq8ikWAM";
    const sampleRate = ttsOpts?.sampleRate ?? this.opts.sampleRate ?? 24_000;
    const base = this.opts.baseUrl ?? "https://api.elevenlabs.io";
    const url = `${base}/v1/text-to-speech/${voiceId}/stream?output_format=pcm_${sampleRate}`;

    this.controller = new AbortController();
    const doFetch = this.opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    const res = await doFetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": this.opts.apiKey,
        "content-type": "application/json",
        accept: "audio/pcm",
      },
      body: JSON.stringify({ text, model_id: this.opts.modelId ?? "eleven_turbo_v2_5" }),
      signal: this.controller.signal,
    });
    if (!res.ok) throw new Error(`ElevenLabs TTS failed: HTTP ${res.status}`);
    if (!res.body) return;

    const reader = res.body.getReader();
    let leftover = new Uint8Array(0);
    let segment = 0;
    while (true) {
      if (this.controller.signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      const buf = concat(leftover, value);
      const usable = buf.length - (buf.length % 2); // whole 16-bit samples only
      if (usable > 0) {
        const aligned = buf.slice(0, usable); // fresh, byte-aligned buffer
        yield {
          pcm: new Int16Array(aligned.buffer, 0, usable / 2),
          sampleRate,
          segment: segment++,
        };
      }
      leftover = buf.slice(usable);
    }
  }
}
