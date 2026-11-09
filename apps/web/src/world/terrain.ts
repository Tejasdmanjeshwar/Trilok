/** Pure seeded geography. The central combat clearing is deliberately flat. */
export class SeededRandom {
  private state: number;
  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x9e3779b9;
  }
  next(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 4294967296;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

function hash(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function valueNoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi, seed);
  const b = hash(xi + 1, zi, seed);
  const c = hash(xi, zi + 1, seed);
  const d = hash(xi + 1, zi + 1, seed);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

export function terrainHeight(x: number, z: number, seed: number): number {
  const radius = Math.hypot(x, z);
  if (radius <= 12) return 0;
  const transition = Math.min(1, (radius - 12) / 12);
  const blend = transition * transition * (3 - 2 * transition);
  const rolling = (valueNoise(x * 0.028, z * 0.028, seed) - 0.43) * 8;
  const detail = (valueNoise(x * 0.11, z * 0.11, seed + 31) - 0.5) * 1.9;
  const distant = Math.max(0, (radius - 37) / 42) * 5.5;
  return (rolling + detail + distant) * blend;
}
