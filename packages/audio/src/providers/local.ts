import type { AudioChunk, SttProvider, SttSession, TtsOptions, TtsProvider } from "../types.js";

/**
 * Local engine skeletons (sherpa-onnx, the CPU default). The interfaces are
 * implemented here, but the native engine + model weights are wired and measured
 * on a real machine (`sherpa-onnx-node` is a native addon and the Kokoro/Piper
 * and Zipformer models are multi-MB downloads). Until then these throw a clear
 * setup error. See docs/TESTING.md → Audio.
 */
const SETUP =
  "requires sherpa-onnx-node + model weights (Kokoro/Piper for TTS, Zipformer for STT). " +
  "See docs/TESTING.md → Audio. Not wired in this build.";

export interface LocalEngineOptions {
  /** Directory containing the downloaded ONNX model(s). */
  modelDir: string;
  sampleRate?: number;
}

export class LocalTtsProvider implements TtsProvider {
  readonly name = "local-sherpa";
  constructor(private readonly opts: LocalEngineOptions) {}
  cancel(): void {
    /* native handle is flushed on a real machine */
  }
  // eslint-disable-next-line require-yield
  async *synthesize(_text: string, _opts?: TtsOptions): AsyncIterable<AudioChunk> {
    void this.opts;
    throw new Error(`LocalTtsProvider ${SETUP}`);
  }
}

export class LocalSttProvider implements SttProvider {
  readonly name = "local-sherpa";
  constructor(private readonly opts: LocalEngineOptions) {}
  startStream(): SttSession {
    void this.opts;
    throw new Error(`LocalSttProvider ${SETUP}`);
  }
}
