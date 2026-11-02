import { afterEach, describe, expect, test, vi } from "vitest";

import { startTicker } from "./ticker";

afterEach(() => {
  vi.useRealTimers();
});

describe("Ticks", () => {
  test("a programme that asks for ticks every 100 ms has three after 350 ms", () => {
    vi.useFakeTimers();
    const onTick = vi.fn();

    startTicker(100, onTick);
    vi.advanceTimersByTime(350);

    expect(onTick).toHaveBeenCalledTimes(3);
  });

  test("stopping leaves no timer running", () => {
    vi.useFakeTimers();
    const onTick = vi.fn();

    const stop = startTicker(100, onTick);
    vi.advanceTimersByTime(250);
    stop();

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  test("tickers are independent", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();

    const stopFirst = startTicker(100, first);
    startTicker(50, second);
    stopFirst();
    vi.advanceTimersByTime(200);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(1);
  });
});
