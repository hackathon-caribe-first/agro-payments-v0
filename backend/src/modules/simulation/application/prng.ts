// Seeded randomness for the Monte Carlo (RNF-11: the motor runs with a fixed seed). No Math.random anywhere in the motor.
//
// - mulberry32 (Tommy Ettinger, public domain): 32-bit state, period 2³², passes BigCrush's practical subset; plenty for
//   20.000 runs × 4 draws. Integer ops only (Math.imul, >>>), so the uniform stream is identical on every JS engine.
// - Box–Muller turns two uniforms into two independent standard normals. It uses Math.log/sqrt/cos/sin, which V8 computes
//   identically run after run; a different engine could differ in the last ulp (outputs are rounded well above that).

export interface Random {
  /** Uniform in [0, 1). */
  uniform(): number;
  /** Two independent N(0, 1) draws from two uniforms. */
  normalPair(): [number, number];
}

export function createRandom(seed: number): Random {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new Error("The seed must be an unsigned 32-bit integer");
  let state = seed >>> 0;
  const uniform = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const normalPair = (): [number, number] => {
    const radius = Math.sqrt(-2 * Math.log(1 - uniform())); // 1 − u ∈ (0, 1]: never log(0)
    const angle = 2 * Math.PI * uniform();
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  };
  return { uniform, normalPair };
}
