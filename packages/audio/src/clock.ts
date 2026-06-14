/**
 * A clock abstraction so latency can be measured deterministically in tests.
 * Production uses `systemClock`; tests/benchmarks use `ManualClock`, which
 * synthetic providers advance to model per-stage latency (VAD endpointing, STT,
 * TTS time-to-first-audio) without real sleeps.
 */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export class ManualClock implements Clock {
  private t = 0;
  now(): number {
    return this.t;
  }
  advance(ms: number): number {
    this.t += ms;
    return this.t;
  }
  set(ms: number): void {
    this.t = ms;
  }
}
