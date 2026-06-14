import { describe, expect, it, vi } from "vitest";
import { ManualClock } from "./clock.js";
import {
  BufferSink,
  EchoTts,
  FakeStt,
  ScriptedVad,
  silentFrames,
} from "./synthetic.js";
import { BargeInController, VoiceLoop } from "./voice-loop.js";

function makeLoop(clock: ManualClock, opts?: {
  transcript?: string;
  endpointMs?: number;
  sttMs?: number;
  firstAudioMs?: number;
  chunksPerSentence?: number;
  vadEndAt?: number;
  onUserUtterance?: (t: string) => void;
  onTurnChange?: (r: string) => void;
}) {
  const stt = new FakeStt({
    transcript: opts?.transcript ?? "hello there",
    clock,
    endpointMs: opts?.endpointMs ?? 200,
    sttMs: opts?.sttMs ?? 200,
  });
  const tts = new EchoTts({
    clock,
    firstAudioMs: opts?.firstAudioMs ?? 50,
    chunksPerSentence: opts?.chunksPerSentence ?? 3,
  });
  const vad = new ScriptedVad({ [opts?.vadEndAt ?? 2]: "speech-end" });
  const loop = new VoiceLoop(
    { stt, tts, vad, clock },
    { onUserUtterance: opts?.onUserUtterance, onTurnChange: opts?.onTurnChange as never },
  );
  return { loop, tts };
}

describe("VoiceLoop.listen", () => {
  it("endpoints on VAD speech-end and finalizes the transcript", async () => {
    const clock = new ManualClock();
    const seen: string[] = [];
    const { loop } = makeLoop(clock, { vadEndAt: 2, onUserUtterance: (t) => seen.push(t) });
    const res = await loop.listen(silentFrames(10));
    expect(res.endpointed).toBe(true);
    expect(res.transcript).toBe("hello there");
    expect(seen).toEqual(["hello there"]);
    // endpoint(200) + stt(200) modeled latency
    expect(res.sttFinalMs).toBe(400);
  });

  it("reports not-endpointed if frames run out before speech-end", async () => {
    const clock = new ManualClock();
    const { loop } = makeLoop(clock, { vadEndAt: 999 });
    const res = await loop.listen(silentFrames(3));
    expect(res.endpointed).toBe(false);
  });
});

describe("VoiceLoop.speak", () => {
  it("streams sentence-by-sentence and reports time-to-first-audio", async () => {
    const clock = new ManualClock();
    const { loop } = makeLoop(clock, { firstAudioMs: 40, chunksPerSentence: 2 });
    const sink = new BufferSink();
    const res = await loop.speak("One. Two. Three.", sink, new BargeInController());
    expect(res.bargedIn).toBe(false);
    expect(res.firstAudioMs).toBe(40);
    // 3 sentences × 2 chunks
    expect(res.chunksPlayed).toBe(6);
    expect(sink.playedCount).toBe(6);
  });

  it("barges in on the first VAD trigger: flushes, cancels, stops early", async () => {
    const clock = new ManualClock();
    const turns: string[] = [];
    const { loop, tts } = makeLoop(clock, {
      chunksPerSentence: 5,
      onTurnChange: (r) => turns.push(r),
    });
    const cancelSpy = vi.spyOn(tts, "cancel");
    const controller = new BargeInController();
    const sink = new BufferSink();
    // Simulate the user speaking the instant they hear the first chunk.
    sink.onPlay = () => controller.requestBargeIn();

    const res = await loop.speak("Long sentence one. Sentence two. Three.", sink, controller);

    expect(res.bargedIn).toBe(true);
    expect(res.chunksPlayed).toBe(1); // only the chunk that was already playing
    expect(sink.flushCount).toBe(1); // queue dropped, not drained
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(turns).toEqual(["user-barge-in"]);
  });

  it("does not barge in when no speech is detected", async () => {
    const clock = new ManualClock();
    const { loop } = makeLoop(clock, { chunksPerSentence: 2 });
    const sink = new BufferSink();
    const res = await loop.speak("Only one.", sink, new BargeInController());
    expect(res.bargedIn).toBe(false);
    expect(sink.flushCount).toBe(0);
  });
});

describe("glass-to-glass latency budget (modeled)", () => {
  it("sums VAD+STT and TTS first-audio for an echo turn", async () => {
    const clock = new ManualClock();
    // Piper-like: fast TTS first audio
    const { loop } = makeLoop(clock, { endpointMs: 150, sttMs: 200, firstAudioMs: 45 });
    const listen = await loop.listen(silentFrames(10));
    const sink = new BufferSink();
    const speak = await loop.speak("Echo.", sink, new BargeInController());
    // echo agent round-trip = 0; glass-to-glass = STT(endpoint→final) + TTS TTFA
    const glassToGlass = listen.sttFinalMs + (speak.firstAudioMs ?? 0);
    expect(glassToGlass).toBe(395);
    expect(glassToGlass).toBeLessThan(800); // the budget
  });
});
