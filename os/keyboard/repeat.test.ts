import { afterEach, describe, expect, test, vi } from "vitest";

import { REPEAT_DELAY_MS, REPEAT_INTERVAL_MS, startRepeat } from "./repeat";

afterEach(() => {
  vi.useRealTimers();
});

describe("Key repeat", () => {
  test("waits for the delay before repeating", () => {
    vi.useFakeTimers();
    const onRepeat = vi.fn();

    startRepeat(onRepeat);
    vi.advanceTimersByTime(REPEAT_DELAY_MS - 1);

    expect(onRepeat).not.toHaveBeenCalled();
  });

  test("then repeats at about 15 a second", () => {
    vi.useFakeTimers();
    const onRepeat = vi.fn();

    startRepeat(onRepeat);
    vi.advanceTimersByTime(REPEAT_DELAY_MS + 1000);

    expect(REPEAT_INTERVAL_MS).toBeGreaterThanOrEqual(60);
    expect(REPEAT_INTERVAL_MS).toBeLessThanOrEqual(70);
    expect(onRepeat).toHaveBeenCalledTimes(1 + Math.floor(1000 / REPEAT_INTERVAL_MS));
  });

  test("stopping leaves no timer running", () => {
    vi.useFakeTimers();
    const onRepeat = vi.fn();

    const stop = startRepeat(onRepeat);
    vi.advanceTimersByTime(REPEAT_DELAY_MS + REPEAT_INTERVAL_MS);
    stop();

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(onRepeat).toHaveBeenCalledTimes(2);
  });

  test("stopping before the delay repeats nothing", () => {
    vi.useFakeTimers();
    const onRepeat = vi.fn();

    startRepeat(onRepeat)();
    vi.advanceTimersByTime(5000);

    expect(onRepeat).not.toHaveBeenCalled();
  });
});
