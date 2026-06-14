/**
 * Sentence chunking so HedOffice can **voice the first sentence as soon as it
 * arrives** rather than waiting for the agent's full response — the key lever
 * for staying inside the glass-to-glass budget when the agent streams text
 * (docs/ARCHITECTURE.md, latency budget).
 */

/** Split a complete string into sentences (punctuation kept). */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/[^.!?]*[.!?]+|[^.!?]+$/g)) {
    const s = m[0].trim();
    if (s) out.push(s);
  }
  return out;
}

/**
 * Incremental sentence chunker for streamed agent text. Feed deltas; get back
 * any *complete* sentences so far. Call `flush()` at end-of-turn to emit the
 * trailing fragment.
 */
export class SentenceChunker {
  private buf = "";

  push(delta: string): string[] {
    this.buf += delta;
    const out: string[] = [];
    const re = /(.*?[.!?]+)(\s+|$)/;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.buf)) !== null && m[1]) {
      out.push(m[1].trim());
      this.buf = this.buf.slice(m[0].length);
    }
    return out;
  }

  flush(): string[] {
    const rest = this.buf.trim();
    this.buf = "";
    return rest ? [rest] : [];
  }
}
