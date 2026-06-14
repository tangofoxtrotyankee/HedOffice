import type { ReactNode } from "react";
import { FEED_KINDS, formatFeedLine, type FeedLine } from "./panel";

/**
 * The terminal / tool-call feed: a dark inset "computer screen" (even in the
 * light theme), each line colored by its verb's semantic, a typewriter reveal on
 * incoming lines, and a blinking block cursor `▌` at the live tail (DESIGN.md §F).
 */
export function TerminalFeed({ lines }: { lines: FeedLine[] }): ReactNode {
  return (
    <div className="feed" role="log" aria-label="tool-call feed">
      {lines.map((line, i) => {
        const text = formatFeedLine(line);
        const glyph = FEED_KINDS[line.kind].glyph;
        const colorVar = FEED_KINDS[line.kind].colorVar;
        const [before, after] = splitOnce(text, glyph);
        return (
          <div className="feed-line typewriter" key={i}>
            {before}
            <span style={{ color: `var(${colorVar})` }}>{glyph}</span>
            {after}
          </div>
        );
      })}
      <div className="feed-line">
        <span className="cursor">▌</span>
      </div>
    </div>
  );
}

function splitOnce(s: string, sep: string): [string, string] {
  const i = s.indexOf(sep);
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + sep.length)];
}
