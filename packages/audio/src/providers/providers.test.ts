import { describe, expect, it, vi } from "vitest";
import { ElevenLabsTtsProvider, type FetchLike } from "./elevenlabs.js";
import { LocalTtsProvider } from "./local.js";
import { selectTtsProvider } from "./select.js";
import type { TtsProvider } from "../types.js";

/** A fake streaming response that emits the given byte chunks. */
function fakeFetch(chunks: Uint8Array[], ok = true, status = 200): FetchLike {
  return async () => ({
    ok,
    status,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(c);
        controller.close();
      },
    }),
  });
}

function pcmBytes(samples: number[]): Uint8Array {
  const i16 = Int16Array.from(samples);
  return new Uint8Array(i16.buffer);
}

describe("ElevenLabsTtsProvider", () => {
  it("streams PCM chunks decoded as Int16 samples", async () => {
    const provider = new ElevenLabsTtsProvider({
      apiKey: "k",
      fetchImpl: fakeFetch([pcmBytes([1, 2, 3]), pcmBytes([4, 5])]),
    });
    const out: number[] = [];
    for await (const chunk of provider.synthesize("hello")) {
      out.push(...chunk.pcm);
    }
    expect(out).toEqual([1, 2, 3, 4, 5]);
  });

  it("carries an odd trailing byte over to the next chunk", async () => {
    // 3 bytes then 1 byte = 4 bytes = two 16-bit samples total
    const provider = new ElevenLabsTtsProvider({
      apiKey: "k",
      fetchImpl: fakeFetch([new Uint8Array([1, 0, 2]), new Uint8Array([0])]),
    });
    const out: number[] = [];
    for await (const chunk of provider.synthesize("x")) out.push(...chunk.pcm);
    expect(out).toEqual([1, 2]);
  });

  it("stops streaming after cancel() (barge-in)", async () => {
    const provider = new ElevenLabsTtsProvider({
      apiKey: "k",
      fetchImpl: fakeFetch([pcmBytes([1]), pcmBytes([2]), pcmBytes([3])]),
    });
    const gen = provider.synthesize("hi")[Symbol.asyncIterator]();
    const first = await gen.next();
    expect(first.value?.pcm[0]).toBe(1);
    provider.cancel();
    expect((await gen.next()).done).toBe(true);
  });

  it("throws on a non-OK response", async () => {
    const provider = new ElevenLabsTtsProvider({ apiKey: "k", fetchImpl: fakeFetch([], false, 401) });
    await expect(async () => {
      for await (const _ of provider.synthesize("x")) void _;
    }).rejects.toThrow(/HTTP 401/);
  });
});

describe("selectTtsProvider", () => {
  const local = { name: "local" } as TtsProvider;
  const hosted = { name: "elevenlabs" } as TtsProvider;
  const make = { local: () => local, elevenLabs: vi.fn(() => hosted) };

  it("uses ElevenLabs when preferred and a key is present", () => {
    expect(selectTtsProvider({ preferred: "elevenlabs", elevenLabsApiKey: "k" }, make)).toBe(hosted);
    expect(make.elevenLabs).toHaveBeenCalledWith("k");
  });
  it("falls back to local when the key is missing", () => {
    expect(selectTtsProvider({ preferred: "elevenlabs" }, make)).toBe(local);
  });
  it("uses local when that is preferred", () => {
    expect(selectTtsProvider({ preferred: "local" }, make)).toBe(local);
  });
});

describe("LocalTtsProvider skeleton", () => {
  it("throws a clear setup error until sherpa-onnx + models are wired", async () => {
    const provider = new LocalTtsProvider({ modelDir: "/models" });
    await expect(async () => {
      for await (const _ of provider.synthesize("x")) void _;
    }).rejects.toThrow(/sherpa-onnx/);
  });
});
