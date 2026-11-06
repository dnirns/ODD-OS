import { describe, expect, test } from "vitest";

import { nextRandom } from "./random";

describe("nextRandom", () => {
  test("the same seed gives the same value and next seed", () => {
    expect(nextRandom(42)).toEqual(nextRandom(42));
  });

  test("values lie in [0, 1) and the seed advances", () => {
    let seed = 7;
    for (let index = 0; index < 1000; index += 1) {
      const random = nextRandom(seed);
      expect(random.value).toBeGreaterThanOrEqual(0);
      expect(random.value).toBeLessThan(1);
      expect(random.seed).not.toBe(seed);
      seed = random.seed;
    }
  });
});
