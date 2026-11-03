// The text of C:\WORM.LOG. Pure, with no imports: no files, clock or screen.
// The log, its notes and its wrong figures are fictional ODD/OS behaviour.

export const LOG_PATH = "C:\\WORM.LOG";
export const HEADER = "WORM.EXE SESSION LOG";

export type Ending = "wall" | "self" | "full" | "operator";

export type Session = {
  readonly ending: Ending;
  readonly score: number;
  readonly length: number;
  readonly food: number;
  readonly seconds: number;
};

export type Tier = "faithful" | "observant" | "contradicting";

const CRLF = "\r\n";
const LABEL_WIDTH = 11;

// From session 7 the log claims one more cell and one more meal than the game
// showed. This is deliberate: the game is right and the log is not.
export const REPORTED_EXTRA = 1;

const ENDED: Readonly<Record<Ending, string>> = {
  wall: "STRUCK WALL",
  self: "STRUCK ITSELF",
  full: "FILLED THE FIELD",
  operator: "STOPPED BY OPERATOR",
};

const OBSERVATIONS: Readonly<Record<Ending, string>> = {
  wall: "THE WALL WAS WHERE IT ALWAYS IS.",
  self: "THE WORM REMEMBERED WHERE IT HAD BEEN.",
  full: "THERE WAS NOWHERE LEFT TO GO.",
  operator: "THE WORM WAS NOT CONSULTED.",
};

const CONTRADICTION = "DISPLAYED FIGURES WERE NOT ACCURATE.";

const ENTRY_START = /^SESSION \d{3,}$/gm;

export const tierOf = (number: number): Tier =>
  number <= 3 ? "faithful" : number <= 6 ? "observant" : "contradicting";

const labelled = (label: string, text: string) => `${label.padEnd(LABEL_WIDTH)}${text}`;

const duration = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

export const countEntries = (text: string) => text.match(ENTRY_START)?.length ?? 0;

export const formatEntry = (number: number, session: Session): string => {
  const tier = tierOf(number);
  const extra = tier === "contradicting" ? REPORTED_EXTRA : 0;
  const figures = [
    `SCORE ${session.score}`,
    `LENGTH ${session.length + extra}`,
    `FOOD ${session.food + extra}`,
    `TIME ${duration(session.seconds)}`,
  ].join("   ");
  const note =
    tier === "faithful"
      ? []
      : [labelled("NOTE", tier === "observant" ? OBSERVATIONS[session.ending] : CONTRADICTION)];

  return [
    `SESSION ${String(number).padStart(3, "0")}`,
    labelled("ENDED", ENDED[session.ending]),
    figures,
    ...note,
    "",
  ]
    .map((line) => line + CRLF)
    .join("");
};

export const appendEntry = (existing: string | undefined, session: Session): string =>
  existing === undefined
    ? `${HEADER}${CRLF}${CRLF}${formatEntry(1, session)}`
    : existing + formatEntry(countEntries(existing) + 1, session);
