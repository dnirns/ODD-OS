// A PC's typematic default: half a second, then about 15 a second.
export const REPEAT_DELAY_MS = 500;
export const REPEAT_INTERVAL_MS = 66;

type Timers = {
  readonly setTimeout: typeof globalThis.setTimeout;
  readonly clearTimeout: typeof globalThis.clearTimeout;
};

// Calls `onRepeat` after the delay and then at the interval until the
// returned function is called. The first keystroke is the caller's.
export const startRepeat = (onRepeat: () => void, timers: Timers = globalThis) => {
  const tick = () => {
    onRepeat();
    handle = timers.setTimeout(tick, REPEAT_INTERVAL_MS);
  };
  let handle = timers.setTimeout(tick, REPEAT_DELAY_MS);

  return () => timers.clearTimeout(handle);
};
