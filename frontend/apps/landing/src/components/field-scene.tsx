const FURROWS = [-3, -2, -1, 0, 1, 2, 3];
const SPROUTS = [90, 190, 300, 410, 510];

// Minimal field: sun rising behind hills, furrows drawing toward the horizon, sprouts growing and swaying.
export function FieldScene() {
  return (
    <svg viewBox="0 0 600 380" role="img" aria-label="Campo con surcos y brotes creciendo al amanecer" className="h-auto w-full">
      <g className="animate-drift">
        <ellipse cx="0" cy="70" rx="44" ry="12" className="fill-card" />
        <ellipse cx="26" cy="60" rx="26" ry="12" className="fill-card" />
      </g>

      <circle cx="420" cy="150" r="56" className="animate-sun-rise fill-warning" />

      <path d="M0 230 Q 150 170 320 215 T 600 205 V 380 H 0 Z" className="fill-lime-deep" />
      <path d="M0 250 Q 200 215 380 240 T 600 235 V 380 H 0 Z" className="fill-secondary" />

      {FURROWS.map((i) => (
        <line
          key={i}
          x1={300 + i * 16}
          y1={248}
          x2={300 + i * 150}
          y2={380}
          pathLength={1}
          strokeDasharray={1}
          className="animate-draw stroke-lime-deep"
          strokeWidth={4}
          strokeLinecap="round"
          style={{ animationDelay: `${0.3 + Math.abs(i) * 0.12}s` }}
        />
      ))}

      {SPROUTS.map((x, i) => (
        <g key={x} transform={`translate(${x} 330)`}>
          <g className="animate-grow origin-bottom transform-fill" style={{ animationDelay: `${1.2 + i * 0.15}s` }}>
            <g className="animate-sway origin-bottom transform-fill" style={{ animationDelay: `${i * -0.8}s` }}>
              <path d="M0 0 V-34" className="stroke-primary" strokeWidth={4} strokeLinecap="round" />
              <path d="M0 -20 C -18 -24 -24 -38 -22 -44 C -8 -42 0 -32 0 -22 Z" className="fill-primary" />
              <path d="M0 -26 C 16 -30 22 -44 20 -50 C 6 -48 0 -38 0 -28 Z" className="fill-success" />
            </g>
          </g>
        </g>
      ))}
    </svg>
  );
}
