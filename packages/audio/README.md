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

## Real engine adapters (to implement on-device)

The same interfaces back the production providers; these need model weights, API
keys, or a GPU and a real mic, so they're built/measured on a real machine:
- `LocalSttProvider` / `LocalTtsProvider` — **sherpa-onnx** (Kokoro/Piper, CPU). Default.
- `ElevenLabsTtsProvider` — hosted drop-in (BYO key).
- `VoxCpmTtsProvider` — *potential* premium GPU provider via a Python sidecar
  (see [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) provider matrix).

## Develop

```sh
pnpm --filter @hedoffice/audio test           # 11 tests
pnpm --filter @hedoffice/harness voice-loop   # the headless echo-agent demo
```

See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) (audio subsystem).
