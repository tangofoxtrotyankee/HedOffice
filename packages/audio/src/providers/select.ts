import type { TtsProvider } from "../types.js";

/**
 * Provider selection (DESIGN/ARCHITECTURE audio subsystem): local CPU engine by
 * default; swap to a hosted/GPU provider only when the user has opted in and a
 * key is present. Keeping this a pure function of config + factories makes the
 * policy testable without constructing real engines.
 */
export type TtsProviderKind = "local" | "elevenlabs";

export interface TtsSelectionConfig {
  preferred: TtsProviderKind;
  /** Present only if the user supplied an ElevenLabs key (from the keychain). */
  elevenLabsApiKey?: string;
}

export interface TtsFactories {
  local: () => TtsProvider;
  elevenLabs: (apiKey: string) => TtsProvider;
}

/** Resolve the active TTS provider. Falls back to local if a key is missing. */
export function selectTtsProvider(cfg: TtsSelectionConfig, make: TtsFactories): TtsProvider {
  if (cfg.preferred === "elevenlabs" && cfg.elevenLabsApiKey) {
    return make.elevenLabs(cfg.elevenLabsApiKey);
  }
  return make.local();
}
