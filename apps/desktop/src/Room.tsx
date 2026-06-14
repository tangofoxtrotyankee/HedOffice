import type { ReactNode } from "react";
import type { RoomStyle } from "./room";

/**
 * A v2 room container (DESIGN.md §H) — additive chrome that *encloses* v1
 * cubicles unchanged. `double` = department room (heaviest), `rounded` =
 * informal room. An optional wall board is "hung" tee-joined on the top wall.
 */
export function Room({
  title,
  style = "double",
  board,
  children,
}: {
  title: string;
  style?: RoomStyle;
  board?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section className={`room room-${style}`} aria-label={`room ${title}`}>
      <div className="room-title">
        {style === "double" ? "╔═" : "╭─"} {title}
      </div>
      {board && <div className="wall-board">╠═ board: {board} ═╣</div>}
      <div className="room-body">{children}</div>
    </section>
  );
}
