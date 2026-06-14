import { useEffect, useState, type ReactNode } from "react";
import { Floor } from "./Floor";
import { ExpandedCubicle } from "./ExpandedCubicle";
import { SAMPLE_FLOOR } from "./sample";
import type { CubicleData } from "./cubicle";

type Theme = "light" | "dark";

/**
 * Stage 1 shell: the floor view with a light/dark theme toggle and a grayscale
 * check (the Stage-1 benchmark is that the floor reads in grayscale and at
 * 16-color before any truecolor styling).
 */
export function App(): ReactNode {
  const [theme, setTheme] = useState<Theme>("dark");
  const [grayscale, setGrayscale] = useState(false);
  const [walkedInto, setWalkedInto] = useState<CubicleData | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div className={`app${grayscale ? " grayscale" : ""}`}>
      <Floor cubicles={SAMPLE_FLOOR} onSelect={setWalkedInto} />
      {walkedInto && (
        <ExpandedCubicle cubicle={walkedInto} onClose={() => setWalkedInto(null)} />
      )}
      <footer className="control-bar">
        <button
          className="btn"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        >
          [ {theme === "dark" ? "☀ Daylight" : "☾ Night Shift"} ]
        </button>
        <button className="btn" onClick={() => setGrayscale((g) => !g)}>
          [ {grayscale ? "✓" : " "} Grayscale check ]
        </button>
      </footer>
    </div>
  );
}
