import { useEffect, useState, type ReactNode } from "react";
import { PRESENCE } from "./presence";
import type { CubicleData } from "./cubicle";
import { panelsFor } from "./sample-panels";
import { taskGlyph, talkMeter } from "./panel";
import { TerminalFeed } from "./TerminalFeed";
import { ApprovalModal } from "./ApprovalModal";

function Panel({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={`panel ${className ?? ""}`}>
      <div className="panel-title">{title}</div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

/**
 * "Walking into" a cubicle: a heavy-bordered workspace in a rounded modal frame,
 * with the four panels (Notebook / Tasks / Terminal / Talk). Blocked cubicles
 * surface the approval-gate modal (DESIGN.md §D.3, §D.5).
 */
export function ExpandedCubicle({
  cubicle,
  onClose,
}: {
  cubicle: CubicleData;
  onClose: () => void;
}): ReactNode {
  const meta = PRESENCE[cubicle.status];
  const data = panelsFor(cubicle.name);
  const [approval, setApproval] = useState<string | null>(data.pendingApproval ?? null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="expanded" onClick={(e) => e.stopPropagation()}>
        <div className="expanded-title">
          <span>
            ┏━ {cubicle.name} ━ <span style={{ color: `var(${meta.colorVar})` }}>{meta.glyph}</span>{" "}
            {meta.label}
          </span>
          <button className="btn" onClick={onClose}>[esc] step out</button>
        </div>

        <div className="panel-grid">
          <Panel title="NOTEBOOK (memory)">
            {data.notebook.map((b, i) => (
              <div key={i} className={b.startsWith("TODO") ? "note-todo" : "note"}>{b}</div>
            ))}
          </Panel>

          <Panel title="TASKS">
            {data.tasks.map((t, i) => (
              <div key={i} className="task-row">
                <span style={{ color: t.state === "current" ? "var(--accent-hero)" : undefined }}>
                  {taskGlyph(t.state)}
                </span>{" "}
                {t.title}
                {t.state === "current" && <span className="task-current"> ◂ current</span>}
              </div>
            ))}
          </Panel>

          <Panel title="TERMINAL · tool-call feed" className="panel-feed">
            <TerminalFeed lines={data.feed} />
          </Panel>

          <Panel title="TALK">
            <div className="talk">
              <button className="btn">⦿ hold to talk</button>
              <span className="talk-meter">{talkMeter(0.45)}</span>
              <span className="talk-status">listening…</span>
            </div>
          </Panel>
        </div>

        {approval && (
          <ApprovalModal
            action={approval}
            onResolve={() => setApproval(null)}
          />
        )}
      </div>
    </div>
  );
}
