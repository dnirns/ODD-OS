export type Clock = {
  readonly offsetMs: number;
};

export type CalendarDate = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

export type TimeOfDay = {
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly hundredths: number;
};

const CLOCK_YEAR = 1993;

export const createClock = (now: number): Clock => {
  const local = new Date(now);

  return {
    offsetMs:
      Date.UTC(
        CLOCK_YEAR,
        local.getMonth(),
        local.getDate(),
        local.getHours(),
        local.getMinutes(),
        local.getSeconds(),
        local.getMilliseconds(),
      ) - now,
  };
};

export const readClock = ({ offsetMs }: Clock, now: number) =>
  new Date(now + offsetMs);

export const setDate = (
  clock: Clock,
  now: number,
  { year, month, day }: CalendarDate,
): Clock => {
  const current = readClock(clock, now);

  return {
    offsetMs:
      Date.UTC(
        year,
        month - 1,
        day,
        current.getUTCHours(),
        current.getUTCMinutes(),
        current.getUTCSeconds(),
        current.getUTCMilliseconds(),
      ) - now,
  };
};

export const setTime = (
  clock: Clock,
  now: number,
  { hours, minutes, seconds, hundredths }: TimeOfDay,
): Clock => {
  const current = readClock(clock, now);

  return {
    offsetMs:
      Date.UTC(
        current.getUTCFullYear(),
        current.getUTCMonth(),
        current.getUTCDate(),
        hours,
        minutes,
        seconds,
        hundredths * 10,
      ) - now,
  };
};
