const MAX_BYTES = 512;

export type History = {
  readonly entries: readonly string[];
  readonly position: number | null;
};

const size = (entries: readonly string[]) =>
  entries.reduce((total, entry) => total + entry.length + 1, 0);

const trim = (entries: readonly string[]): readonly string[] =>
  size(entries) > MAX_BYTES ? trim(entries.slice(1)) : entries;

const moveTo = (history: History, position: number): History =>
  history.entries.length === 0 ? history : { ...history, position };

export const createHistory = (): History => ({ entries: [], position: null });

export const addEntry = ({ entries }: History, line: string): History => ({
  entries: trim([...entries, line]),
  position: null,
});

export const recallPrevious = (history: History): History =>
  moveTo(
    history,
    history.position === null
      ? history.entries.length - 1
      : Math.max(history.position - 1, 0),
  );

export const recallNext = (history: History): History =>
  history.position === null
    ? history
    : moveTo(
        history,
        Math.min(history.position + 1, history.entries.length - 1),
      );

export const recallOldest = (history: History): History => moveTo(history, 0);

export const recallNewest = (history: History): History =>
  moveTo(history, history.entries.length - 1);
