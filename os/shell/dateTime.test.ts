import { describe, expect, test } from "vitest";

import { formatDate, formatTime, parseDate, parseTime } from "./dateTime";

const utc = (hours: number, minutes: number, seconds: number, ms: number) =>
  new Date(Date.UTC(1993, 10, 1, hours, minutes, seconds, ms));

describe("formatDate", () => {
  test("shows the weekday and four-digit year", () => {
    expect(formatDate(utc(0, 0, 0, 0))).toBe("Mon 11-01-1993");
  });
});

describe("formatTime", () => {
  test.each([
    [utc(15, 45, 12, 340), " 3:45:12.34p"],
    [utc(0, 5, 0, 0), "12:05:00.00a"],
    [utc(12, 0, 0, 0), "12:00:00.00p"],
    [utc(11, 59, 59, 999), "11:59:59.99a"],
  ])("formats %s", (date, text) => {
    expect(formatTime(date)).toBe(text);
  });
});

describe("parseDate", () => {
  test.each([
    ["12-25-93", { year: 1993, month: 12, day: 25 }],
    ["12/25/1993", { year: 1993, month: 12, day: 25 }],
    ["1.2.80", { year: 1980, month: 1, day: 2 }],
    ["02-29-92", { year: 1992, month: 2, day: 29 }],
    ["12-31-2099", { year: 2099, month: 12, day: 31 }],
  ])("accepts %s", (text, date) => {
    expect(parseDate(text)).toEqual(date);
  });

  test.each([
    "foo",
    "",
    "12-25",
    "02-30-93",
    "02-29-93",
    "13-01-93",
    "00-01-93",
    "01-00-93",
    "01-01-05",
    "01-01-79",
    "01-01-1979",
    "01-01-2100",
    "12-25-93 foo",
  ])("rejects %j", (text) => {
    expect(parseDate(text)).toBeUndefined();
  });
});

describe("parseTime", () => {
  test.each([
    ["9", [9, 0, 0, 0]],
    ["9:30", [9, 30, 0, 0]],
    ["17:59:02.22", [17, 59, 2, 22]],
    ["3:45p", [15, 45, 0, 0]],
    ["3:45P", [15, 45, 0, 0]],
    ["3:45a", [3, 45, 0, 0]],
    ["12a", [0, 0, 0, 0]],
    ["12p", [12, 0, 0, 0]],
    ["23:59:59.99", [23, 59, 59, 99]],
  ])("accepts %s", (text, [hours, minutes, seconds, hundredths]) => {
    expect(parseTime(text)).toEqual({ hours, minutes, seconds, hundredths });
  });

  test.each([
    "foo",
    "",
    "25:00",
    "24",
    "9:60",
    "9:30:60",
    "9:30:00.100",
    "13:00a",
    "13p",
    "9:30 foo",
  ])("rejects %j", (text) => {
    expect(parseTime(text)).toBeUndefined();
  });
});
