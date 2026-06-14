import { useEffect, useState, type ReactNode } from "react";
import { Floor } from "./Floor";
import { ExpandedCubicle } from "./ExpandedCubicle";
import { ApprovalModal } from "./ApprovalModal";
import { DepartmentRail } from "./DepartmentRail";
import { RoomsPreview } from "./RoomsPreview";
import { ALL_DEPARTMENTS } from "./rail";
import { cubicleViewToData, sampleDataSource, type DataSource } from "./datasource";
import type { CubicleData } from "./cubicle";
import type { ApprovalRequestDTO } from "./shell/ipc-contract";

type Theme = "light" | "dark";

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <button className={`chip${active ? " chip-active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

/**
 * Stage 3 shell: the floor + department rail inside the app frame, a rounded
 * bottom control bar with toggle chips, slow status motion (via the cards), and
 * an opt-in scanline overlay. Everything calm; `prefers-reduced-motion` removes
 * all motion.
 */
export function App({ dataSource = sampleDataSource }: { dataSource?: DataSource }): ReactNode {
  const [theme, setTheme] = useState<Theme>("dark");
  const [grayscale, setGrayscale] = useState(false);
  const [scanlines, setScanlines] = useState(false);
  const [muted, setMuted] = useState(false);
  const [rooms, setRooms] = useState(false);
  const [dept, setDept] = useState<string>(ALL_DEPARTMENTS);
  const [walkedInto, setWalkedInto] = useState<CubicleData | null>(null);
  const [floor, setFloor] = useState<CubicleData[]>(() => dataSource.getFloor());
  const [approval, setApproval] = useState<ApprovalRequestDTO | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // In the Electron shell, drive the approval gate from the modal and refresh
  // the floor whenever the event log changes. No-op on the plain web build.
  useEffect(() => {
    const api = window.hedoffice;
    if (!api) return;
    const refresh = () =>
      void api.getFloor().then((views) => setFloor(views.map(cubicleViewToData)));
    refresh();
    const offApproval = api.onApprovalRequest(setApproval);
    const offUpdate = api.onUpdate(refresh);
    return () => {
      offApproval();
      offUpdate();
    };
  }, []);

  const cubicles = dept === ALL_DEPARTMENTS ? floor : floor.filter((c) => c.name === dept);

  return (
    <div className={`app${grayscale ? " grayscale" : ""}${scanlines ? " scanlines" : ""}`}>
      <main className="stage">
        <DepartmentRail cubicles={floor} selected={dept} onSelect={setDept} />
        {rooms ? (
          <RoomsPreview onSelect={setWalkedInto} />
        ) : (
          <Floor cubicles={cubicles} onSelect={setWalkedInto} />
        )}
      </main>

      {walkedInto && (
        <ExpandedCubicle cubicle={walkedInto} onClose={() => setWalkedInto(null)} />
      )}

      {approval && (
        <ApprovalModal
          action={approval.action}
          onResolve={(decision) => {
            void window.hedoffice?.resolveApproval(approval.approvalId, decision);
            setApproval(null);
          }}
        />
      )}

      <footer className="control-bar">
        <Chip>✉ Messages</Chip>
        <Chip>⦿ Talk / Knock</Chip>
        <Chip active={muted} onClick={() => setMuted((m) => !m)}>
          {muted ? "🔇 Muted" : "🔊 Mute"}
        </Chip>
        <Chip>⇲ Share</Chip>
        <Chip active={rooms} onClick={() => setRooms((r) => !r)}>
          ╔ Rooms (v2)
        </Chip>
        <span className="control-spacer" />
        <Chip active={scanlines} onClick={() => setScanlines((s) => !s)}>
          ▒ Scanlines
        </Chip>
        <Chip active={grayscale} onClick={() => setGrayscale((g) => !g)}>
          ◐ Grayscale
        </Chip>
        <Chip onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
          {theme === "dark" ? "☀ Daylight" : "☾ Night Shift"}
        </Chip>
      </footer>
    </div>
  );
}
