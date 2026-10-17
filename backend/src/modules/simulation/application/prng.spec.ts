import { createRandom } from "./prng";

describe("createRandom (mulberry32 + Box–Muller, RNF-11 fixed seed)", () => {
  it("gives the same stream for the same seed and a different one for another seed", () => {
    const draw = (seed: number) => {
      const r = createRandom(seed);
      return Array.from({ length: 8 }, () => r.uniform());
    };
    expect(draw(20261017)).toEqual(draw(20261017));
    expect(draw(20261017)).not.toEqual(draw(20261018));
  });

  it("keeps uniforms in [0, 1)", () => {
    const r = createRandom(1);
    for (let i = 0; i < 10_000; i++) {
      const u = r.uniform();
      expect(u >= 0 && u < 1).toBe(true);
    }
  });

  it("draws standard normals in pairs: mean ≈ 0, sd ≈ 1, independent", () => {
    const r = createRandom(7);
    const n = 50_000;
    let s1 = 0;
    let s2 = 0;
    let sq1 = 0;
    let cross = 0;
    for (let i = 0; i < n; i++) {
      const [a, b] = r.normalPair();
      s1 += a;
      s2 += b;
      sq1 += a * a;
      cross += a * b;
    }
    expect(Math.abs(s1 / n)).toBeLessThan(0.02);
    expect(Math.abs(s2 / n)).toBeLessThan(0.02);
    expect(Math.abs(Math.sqrt(sq1 / n) - 1)).toBeLessThan(0.02);
    expect(Math.abs(cross / n)).toBeLessThan(0.02);
  });

  it("rejects a seed that is not a 32-bit unsigned integer", () => {
    expect(() => createRandom(-1)).toThrow();
    expect(() => createRandom(1.5)).toThrow();
    expect(() => createRandom(2 ** 32)).toThrow();
  });
});
