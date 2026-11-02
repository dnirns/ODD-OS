import type { Exited, ProgrammeEvent, Running } from "./types";

// A programme that fails is ended as if it had exited, changing nothing, so
// the visitor is never left without a command line.
export const stepProgramme = (
  running: Running,
  event: ProgrammeEvent,
): Running | Exited => {
  try {
    return running.step(event);
  } catch {
    return { type: "exit" };
  }
};
