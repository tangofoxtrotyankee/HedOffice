import { useEffect, useState, type ReactNode } from "react";
import { Floor } from "./Floor";
import { ExpandedCubicle } from "./ExpandedCubicle";
import { DepartmentRail } from "./DepartmentRail";
import { ALL_DEPARTMENTS } from "./rail";
import { SAMPLE_FLOOR } from "./sample";
import type { CubicleData } from "./cubicle";

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
export function App(): ReactNode {
  const [theme, setTheme] = useState<Theme>("dark");
  const [grayscale, setGrayscale] = useState(false);
  const [scanlines, setScanlines] = useState(false);
  const [muted, setMuted] = useState(false);
  const [dept, setDept] = useState<string>(ALL_DEPARTMENTS);
  const [walkedInto, setWalkedInto] = useState<CubicleData | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const cubicles =
    dept === ALL_DEPARTMENTS ? SAMPLE_FLOOR : SAMPLE_FLOOR.filter((c) => c.name === dept);

  return (
    <div className={`app${grayscale ? " grayscale" : ""}${scanlines ? " scanlines" : ""}`}>
      <main className="stage">
        <DepartmentRail cubicles={SAMPLE_FLOOR} selected={dept} onSelect={setDept} />
        <Floor cubicles={cubicles} onSelect={setWalkedInto} />
      </main>

      {walkedInto && (
        <ExpandedCubicle cubicle={walkedInto} onClose={() => setWalkedInto(null)} />
      )}

      <footer className="control-bar">
        <Chip>✉ Messages</Chip>
        <Chip>⦿ Talk / Knock</Chip>
        <Chip active={muted} onClick={() => setMuted((m) => !m)}>
          {muted ? "🔇 Muted" : "🔊 Mute"}
        </Chip>
        <Chip>⇲ Share</Chip>
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
