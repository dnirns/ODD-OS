export const COLORS = [
  "black",
  "blue",
  "green",
  "cyan",
  "red",
  "magenta",
  "brown",
  "light-grey",
  "dark-grey",
  "light-blue",
  "light-green",
  "light-cyan",
  "light-red",
  "light-magenta",
  "yellow",
  "white",
] as const;

export type Color = (typeof COLORS)[number];

export const DEFAULT_FOREGROUND: Color = "light-grey";
export const DEFAULT_BACKGROUND: Color = "black";
