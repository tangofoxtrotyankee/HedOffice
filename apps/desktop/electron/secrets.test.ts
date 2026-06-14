import { describe, expect, it } from "vitest";
import { InMemorySecretStore } from "./secrets";

describe("SecretStore (InMemory)", () => {
  it("stores, reads, lists, and deletes secrets", () => {
    const s = new InMemorySecretStore();
    expect(s.get("elevenlabs")).toBeNull();
    s.set("elevenlabs", "sk-123");
    s.set("openai", "sk-456");
    expect(s.get("elevenlabs")).toBe("sk-123");
    expect(s.keys().sort()).toEqual(["elevenlabs", "openai"]);
    s.delete("elevenlabs");
    expect(s.get("elevenlabs")).toBeNull();
    expect(s.keys()).toEqual(["openai"]);
  });
});
