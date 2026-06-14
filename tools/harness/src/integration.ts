/**
 * Phase 3 deliverable: the integration spine. Ties the Phase 2 voice loop to the
 * Phase 1 MCP server through the channel + approval gate:
 *   user speaks → STT → channel.user_spoke → agent reads (channel.listen) →
 *   agent replies (channel.say) → TTS voices it; a mutating tool routes through
 *   the human approval gate. Run: `pnpm --filter @hedoffice/harness integration`.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Office } from "@hedoffice/core";
import { HedOfficeServer } from "@hedoffice/mcp-server";
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(result: any): any {
  const block = result?.content?.[0];
  return block?.type === "text" ? JSON.parse(block.text) : undefined;
}

async function main(): Promise<void> {
  console.log("\n=== HedOffice Phase 3 harness: integration spine (voice ↔ MCP ↔ approval) ===\n");

  // The human approves mutating actions (the UI does this in Phase 4).
  const office = new Office({
    onPresenceChange: (s, r) => log("presence", `${s.agentId.slice(0, 8)} -> ${s.status.padEnd(8)} (${r})`),
    approval: {
      defaultPolicy: "prompt",
      approver: (req) => {
        log("approval", `human prompted for "${req.tool}" → APPROVE`);
        return "allow";
      },
    },
  });
  const server = new HedOfficeServer({ office });
  const port = await server.listen(0);
  const agent = office.registerAgent("research");
  log("server", `listening on http://127.0.0.1:${port}/mcp; agent "research" registered`);

  // The BYO agent connects as an MCP client.
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${agent.token}` } },
  });
  const client = new Client({ name: "research-agent", version: "0.0.0" });
  await client.connect(transport);
  log("connect", "agent connected");

  // 1) Human speaks. The voice loop (Phase 2) transcribes; we deliver it on the channel.
  console.log("");
  const clock = new ManualClock();
  const loop = new VoiceLoop({
    stt: new FakeStt({ transcript: "focus on refresh tokens", clock, endpointMs: 150, sttMs: 200 }),
    tts: new EchoTts({ clock, firstAudioMs: 45, chunksPerSentence: 3 }),
    vad: new ScriptedVad({ 3: "speech-end" }),
    clock,
  });
  const listen = await loop.listen(silentFrames(10));
  office.channel.userSpoke(agent.agentId, listen.transcript, { sttMs: listen.sttFinalMs });
  log("user", `🎙  "${listen.transcript}"  (STT ${listen.sttFinalMs}ms)`);

  // 2) Agent reads the channel and decides to reply.
  const heard = parse(await client.callTool({ name: "channel.listen", arguments: {} }));
  log("agent", `channel.listen → "${heard.utterances[0].transcript}"`);
  const replyText = "Okay. I will focus on the refresh tokens.";
  await client.callTool({ name: "channel.say", arguments: { text: replyText } });
  log("agent", `channel.say → "${replyText}"`);

  // 3) HedOffice voices the reply (Phase 2 TTS), measuring glass-to-glass.
  const sink = new BufferSink();
  const speak = await loop.speak(replyText, sink, new BargeInController());
  const glassToGlass = listen.sttFinalMs + (speak.firstAudioMs ?? 0);
  log("voice", `TTS first-audio ${speak.firstAudioMs}ms; glass-to-glass ${glassToGlass}ms ${glassToGlass < 800 ? "✅" : "❌"}`);
  assert(glassToGlass < 800, "within latency budget");

  // 4) Agent performs a mutating action → routed through the human approval gate.
  console.log("");
  const task = parse(await client.callTool({ name: "task.create", arguments: { title: "audit refresh-token TTL" } }));
  log("tool", `task.create approved → "${task.title}"`);
  assert(office.cubicles.taskList(agent.agentId).length === 1, "task created after approval");

  // Event log = the full audit trail.
  console.log("");
  const counts: Record<string, number> = {};
  for (const e of office.store.read({})) counts[e.type] = (counts[e.type] ?? 0) + 1;
  log("eventlog", `${office.store.count()} events: ` + Object.entries(counts).map(([t, n]) => `${t}=${n}`).join(", "));
  assert((counts["channel.user_spoke"] ?? 0) === 1 && (counts["channel.agent_said"] ?? 0) === 1, "channel turn recorded");
  // task.create is gated (record mutation); channel.say is not (conversation).
  assert((counts["approval.requested"] ?? 0) === 1 && (counts["approval.resolved"] ?? 0) === 1, "the record mutation was gated + audited");

  await transport.terminateSession().catch(() => {});
  await server.close();
  console.log("\n✅ Phase 3 spine: spoke into a cubicle, the agent heard it and replied in voice, and a mutating tool passed through the human approval gate — all captured in the event log.\n");
}

main().catch((err) => {
  console.error("\n❌ integration harness failed:", err);
  process.exit(1);
});
