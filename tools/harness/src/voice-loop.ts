/**
 * Phase 2 deliverable: the headless "talk to an echo agent" demo. Drives the
 * voice loop with deterministic synthetic providers, prints the modeled
 * glass-to-glass latency budget for two TTS profiles, and demonstrates
 * barge-in. Run: `pnpm --filter @hedoffice/harness voice-loop`.
 *
 * The numbers are *modeled* per-stage latencies (the synthetic providers advance
 * a ManualClock); plugging in real sherpa-onnx/ElevenLabs/VoxCPM providers yields
 * measured numbers through the same loop.
 */
import {
  BargeInController,
  BufferSink,
  EchoTts,
  FakeStt,
  ManualClock,
  ScriptedVad,
  VoiceLoop,
  silentFrames,
} from "@hedoffice/audio";

function log(tag: string, msg: string): void {
  console.log(`  [${tag.padEnd(9)}] ${msg}`);
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

interface Profile {
  name: string;
  endpointMs: number;
  sttMs: number;
  firstAudioMs: number;
}

async function runTurn(profile: Profile): Promise<number> {
  const clock = new ManualClock();
  const loop = new VoiceLoop(
    {
      stt: new FakeStt({ transcript: "focus on refresh tokens", clock, endpointMs: profile.endpointMs, sttMs: profile.sttMs }),
      tts: new EchoTts({ clock, firstAudioMs: profile.firstAudioMs, chunksPerSentence: 4 }),
      vad: new ScriptedVad({ 3: "speech-end" }),
      clock,
    },
    {
      onUserUtterance: (t) => log("user", `"${t}"`),
      onTurnChange: (r) => log("turn", r),
    },
  );

  // User speaks; loop endpoints + transcribes.
  const listen = await loop.listen(silentFrames(20));
  // Echo agent replies instantly with the transcript (round-trip = 0).
  const sink = new BufferSink();
  const speak = await loop.speak(`Okay. ${listen.transcript}.`, sink, new BargeInController());

  const glassToGlass = listen.sttFinalMs + (speak.firstAudioMs ?? 0);
  log(
    "latency",
    `${profile.name.padEnd(7)} VAD+STT ${listen.sttFinalMs}ms + TTS-first-audio ${speak.firstAudioMs}ms = ` +
      `${glassToGlass}ms glass-to-glass  ${glassToGlass < 800 ? "✅ <800ms" : "❌ over budget"}`,
  );
  assert(glassToGlass < 800, `${profile.name} within budget`);
  return glassToGlass;
}

async function runBargeIn(): Promise<void> {
  const clock = new ManualClock();
  let cancels = 0;
  const tts = new EchoTts({ clock, firstAudioMs: 45, chunksPerSentence: 6 });
  const origCancel = tts.cancel.bind(tts);
  tts.cancel = () => {
    cancels += 1;
    origCancel();
  };
  const loop = new VoiceLoop(
    { stt: new FakeStt({ transcript: "", clock }), tts, vad: new ScriptedVad({}), clock },
    { onTurnChange: (r) => log("turn", r) },
  );
  const controller = new BargeInController();
  const sink = new BufferSink();
  // User interrupts the moment the first chunk plays.
  sink.onPlay = () => controller.requestBargeIn();

  const res = await loop.speak("This is a long answer. With several sentences. That get cut off.", sink, controller);
  log("barge-in", `played ${res.chunksPlayed} chunk(s), flushed ${sink.flushCount}×, TTS cancel() called ${cancels}×`);
  assert(res.bargedIn, "barged in");
  assert(res.chunksPlayed === 1, "stopped on first VAD trigger, not silence-end");
  assert(cancels === 1 && sink.flushCount === 1, "flush + cancel fired");
}

async function main(): Promise<void> {
  console.log("\n=== HedOffice Phase 2 harness: headless voice loop (echo agent) ===\n");

  log("setup", "mic → VAD → STT → echo agent → TTS → playback, with barge-in\n");

  // Two TTS profiles from the architecture's latency budget.
  await runTurn({ name: "Piper", endpointMs: 150, sttMs: 200, firstAudioMs: 45 });
  await runTurn({ name: "Kokoro", endpointMs: 200, sttMs: 200, firstAudioMs: 320 });

  console.log("");
  await runBargeIn();

  console.log("\n✅ Phase 2 harness passed: loop runs, latency within <800ms budget, barge-in interrupts on first VAD trigger.\n");
  console.log("   Note: latencies are modeled by synthetic providers. Real sherpa-onnx / ElevenLabs / VoxCPM");
  console.log("   providers implement the same interfaces and yield measured numbers through this loop.\n");
}

main().catch((err) => {
  console.error("\n❌ voice-loop harness failed:", err);
  process.exit(1);
});
