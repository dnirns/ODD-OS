import type { CalendarDate, TimeOfDay } from "./clock";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DATE_PATTERN = /^(\d+)[-/.](\d+)[-/.](\d+)$/;
const TIME_PATTERN = /^(\d+)(?::(\d+)(?::(\d+)(?:\.(\d+))?)?)?([ap])?$/i;

const pad = (value: number) => String(value).padStart(2, "0");

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const toFullYear = (year: number) => (year < 100 ? year + 1900 : year);

export const formatDate = (date: Date) =>
  `${WEEKDAYS[date.getUTCDay()]} ${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}-${date.getUTCFullYear()}`;

export const formatTime = (date: Date) => {
  const hours = date.getUTCHours();
  const hour = String(hours % 12 || 12).padStart(2, " ");
  const hundredths = Math.floor(date.getUTCMilliseconds() / 10);

  return `${hour}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(hundredths)}${hours < 12 ? "a" : "p"}`;
};

// The time `PROMPT $T` shows: 24 hours, with hundredths.
export const formatPromptTime = (date: Date) =>
  `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(Math.floor(date.getUTCMilliseconds() / 10))}`;

export const parseDate = (text: string): CalendarDate | undefined => {
  const match = DATE_PATTERN.exec(text);
  if (!match) return undefined;

  const [month, day, enteredYear] = match.slice(1).map(Number);
  const year = toFullYear(enteredYear);
  const isValid =
    year >= 1980 &&
    year <= 2099 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month);

  return isValid ? { year, month, day } : undefined;
};

const to24Hour = (hours: number, suffix: string | undefined) => {
  switch (suffix?.toLowerCase()) {
    case "a":
      return hours === 12 ? 0 : hours;
    case "p":
      return hours < 12 ? hours + 12 : hours;
    default:
      return hours;
  }
};

export const parseTime = (text: string): TimeOfDay | undefined => {
  const match = TIME_PATTERN.exec(text);
  if (!match) return undefined;

  const [enteredHours, minutes, seconds, hundredths] = match
    .slice(1, 5)
    .map((part) => Number(part ?? 0));
  const suffix = match[5];
  const hours = to24Hour(enteredHours, suffix);
  const isValid =
    (suffix === undefined ? enteredHours <= 23 : enteredHours <= 12) &&
    minutes <= 59 &&
    seconds <= 59 &&
    hundredths <= 99;

  return isValid ? { hours, minutes, seconds, hundredths } : undefined;
};
