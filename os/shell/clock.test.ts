import { afterEach, describe, expect, test, vi } from "vitest";

import { createClock, readClock, setDate, setTime } from "./clock";

const local = (...parts: [number, number, number, number?, number?]) =>
  new Date(...parts).getTime();

const fields = (date: Date) => [
  date.getUTCFullYear(),
  date.getUTCMonth() + 1,
  date.getUTCDate(),
  date.getUTCHours(),
  date.getUTCMinutes(),
];

const DAY_MS = 24 * 60 * 60 * 1000;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(["UTC", "Pacific/Auckland", "America/Los_Angeles"])(
  "in %s",
  (zone) => {
    test("starts at the local month, day and time in 1993", () => {
      vi.stubEnv("TZ", zone);
      const now = local(2026, 10, 1, 15, 45);

      expect(fields(readClock(createClock(now), now))).toEqual([1993, 11, 1, 15, 45]);
    });

    test("turns 29 February into 1 March", () => {
      vi.stubEnv("TZ", zone);
      const now = local(2028, 1, 29, 12, 0);

      expect(fields(readClock(createClock(now), now))).toEqual([1993, 3, 1, 12, 0]);
    });
  },
);

describe("running", () => {
  test("rolls past midnight", () => {
    const now = local(2026, 10, 1, 23, 59);
    const clock = createClock(now);

    expect(fields(readClock(clock, now + 2 * 60 * 1000)).slice(0, 4)).toEqual([1993, 11, 2, 0]);
  });

  test("keeps running into 1994", () => {
    const now = local(2026, 11, 31, 12, 0);
    const clock = createClock(now);

    expect(fields(readClock(clock, now + DAY_MS)).slice(0, 3)).toEqual([1994, 1, 1]);
  });
});

describe("setting", () => {
  const now = local(2026, 10, 1, 15, 45);
  const clock = createClock(now);

  test("a date keeps the time of day and keeps running", () => {
    const changed = setDate(clock, now, { year: 1999, month: 12, day: 25 });

    expect(fields(readClock(changed, now))).toEqual([1999, 12, 25, 15, 45]);
    expect(readClock(changed, now + 1000).getTime() - readClock(changed, now).getTime()).toBe(1000);
  });

  test("a time keeps the date", () => {
    const changed = setTime(clock, now, { hours: 9, minutes: 30, seconds: 5, hundredths: 25 });
    const date = readClock(changed, now);

    expect(fields(date)).toEqual([1993, 11, 1, 9, 30]);
    expect(date.getUTCSeconds()).toBe(5);
    expect(date.getUTCMilliseconds()).toBe(250);
  });
});
