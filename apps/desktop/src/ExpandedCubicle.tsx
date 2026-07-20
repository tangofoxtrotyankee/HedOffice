import { useEffect, useState, type ReactNode } from "react";
import type { CubicleDetailView } from "@hedoffice/schema";
import { PRESENCE } from "./presence";
import type { CubicleData } from "./cubicle";
import { panelsFor } from "./sample-panels";
import { detailToPanelData } from "./detail";
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
  const live = Boolean(window.hedoffice && cubicle.agentId);
  const [detail, setDetail] = useState<CubicleDetailView | null>(null);
  const data = detail ? detailToPanelData(detail) : panelsFor(cubicle.name);
  // Sample-only local approval (live approvals arrive via the App-level modal).
  const [approval, setApproval] = useState<string | null>(
    live ? null : (panelsFor(cubicle.name).pendingApproval ?? null),
  );

  useEffect(() => {
    const api = window.hedoffice;
    const agentId = cubicle.agentId;
    if (!api || !agentId) return;
    const refresh = (): void => {
      void api.getDetail(agentId).then(setDetail).catch(() => {});
    };
    refresh();
    return api.onUpdate(refresh);
  }, [cubicle.agentId]);

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
