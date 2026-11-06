// One step of mulberry32. The state travels with whatever uses it, so every
// random choice is determined by the seed.
export const nextRandom = (seed: number): { readonly value: number; readonly seed: number } => {
  const state = (seed + 0x6d2b79f5) >>> 0;
  let value = Math.imul(state ^ (state >>> 15), state | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

  return { value: ((value ^ (value >>> 14)) >>> 0) / 4294967296, seed: state };
};

// A generator of values in [0, 1) from a seed, for code that draws many in a row.
export const randomStream = (seed: number): (() => number) => {
  let state = seed;

  return () => {
    const random = nextRandom(state);
    state = random.seed;
    return random.value;
  };
};
