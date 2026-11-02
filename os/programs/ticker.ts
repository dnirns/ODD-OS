// Calls `onTick` every `intervalMs` until the returned function is called.
export const startTicker = (intervalMs: number, onTick: () => void): (() => void) => {
  const handle = setInterval(onTick, intervalMs);

  return () => clearInterval(handle);
};
