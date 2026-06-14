# @hedoffice/audio

The audio subsystem: the STT/TTS/VAD **provider abstraction** and the **voice
loop** (mic → VAD → STT → agent → TTS → playback) with per-sentence streaming and
barge-in. Decoupled from MCP — Phase 3 wires it to `channel.*`. Status: **Phase 2
— loop + abstraction + synthetic providers done; real engine adapters pending
on-device work.**

## Contents

- `types.ts` — `SttProvider` / `TtsProvider` (mandates `cancel()` for barge-in) /
  `VadDetector` / `PlaybackSink` / `AudioChunk`.
- `sentence.ts` — `splitSentences` + streaming `SentenceChunker` (voice the first
  sentence as soon as it arrives).
- `voice-loop.ts` — `VoiceLoop` (`listen()` → transcript, `speak()` → streamed
  TTS) + `BargeInController` (cancel on first VAD trigger, not silence-end).
- `clock.ts` — `Clock` / `ManualClock` for deterministic latency measurement.
- `synthetic.ts` — hardware-free `FakeStt` / `EchoTts` / `ScriptedVad` /
  `BufferSink` that model per-stage latency so the loop is testable without a mic.

```ts
import { VoiceLoop, BargeInController } from "@hedoffice/audio";
const loop = new VoiceLoop({ stt, tts, vad });
const { transcript } = await loop.listen(micFrames);
await loop.speak(agentText, sink, new BargeInController());
```

## Providers (`src/providers/`)

- **`ElevenLabsTtsProvider`** — implemented: streams raw PCM from the ElevenLabs
  endpoint, yields `AudioChunk`s, and `cancel()` aborts mid-stream (barge-in). The
  network call is injectable, so streaming + cancel are **unit-tested** without a
  key or socket; real audio/latency is verified on a dev machine.
- **`selectTtsProvider`** — pure provider-selection policy (local by default; swap
  to hosted only when opted in + a key is present).
- **`LocalSttProvider` / `LocalTtsProvider`** — sherpa-onnx skeletons (CPU
  default). The interfaces are implemented; the native engine + Kokoro/Piper/
  Zipformer models are wired and measured on a real machine — until then they
  throw a clear setup error. See [docs/TESTING.md](../../docs/TESTING.md) → Audio.
- **VoxCPM** — *potential* premium GPU provider via a Python sidecar (see
  [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) provider matrix).

## Develop

```sh
pnpm --filter @hedoffice/audio test           # 11 tests
pnpm --filter @hedoffice/harness voice-loop   # the headless echo-agent demo
```

See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) (audio subsystem).
