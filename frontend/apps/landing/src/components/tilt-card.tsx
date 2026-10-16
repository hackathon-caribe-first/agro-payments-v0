import type { PointerEvent, ReactNode } from "react";

const MAX_TILT = 5; // degrees

// Subtle Apple-style depth: the card leans toward the cursor and a soft highlight follows it.
export function TiltCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - py) * 2 * MAX_TILT}deg`);
    el.style.setProperty("--ry", `${(px - 0.5) * 2 * MAX_TILT}deg`);
    el.style.setProperty("--gx", `${px * 100}%`);
    el.style.setProperty("--gy", `${py * 100}%`);
    el.style.setProperty("--px", `${(px - 0.5) * 2}`); // -1..1, drives the inner depth layers
    el.style.setProperty("--py", `${(py - 0.5) * 2}`);
  }

  function onLeave(e: PointerEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    for (const v of ["--rx", "--ry", "--px", "--py"]) el.style.removeProperty(v);
  }

  return (
    <div className={`tilt-card ${className}`} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </div>
  );
}
