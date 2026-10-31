import type { Screen } from "../terminal/screen";
import { applySteps, type BootStep } from "./bootSteps";

export type BootRunnerOptions = {
  readonly screen: Screen;
  readonly steps: readonly BootStep[];
  readonly onScreen: (screen: Screen) => void;
  readonly onComplete: () => void;
};

export type BootHandle = {
  readonly skip: () => void;
  readonly stop: () => void;
};

type BootState =
  | { readonly status: "running"; readonly screen: Screen; readonly next: number }
  | { readonly status: "finished" };

export const startBoot = ({
  screen,
  steps,
  onScreen,
  onComplete,
}: BootRunnerOptions): BootHandle => {
  let state: BootState = { status: "running", screen, next: 0 };
  let timer: ReturnType<typeof setTimeout> | undefined;

  const finish = () => {
    clearTimeout(timer);
    state = { status: "finished" };
  };

  const schedule = () => {
    if (state.status !== "running") return;

    const step = steps[state.next];
    if (!step) {
      finish();
      onComplete();
      return;
    }

    timer = setTimeout(() => {
      if (state.status !== "running") return;

      const nextScreen = step.apply(state.screen);
      state = { ...state, screen: nextScreen, next: state.next + 1 };
      onScreen(nextScreen);
      schedule();
    }, step.delayMs);
  };

  schedule();

  return {
    skip: () => {
      if (state.status !== "running") return;

      const finalScreen = applySteps(state.screen, steps.slice(state.next));
      finish();
      onScreen(finalScreen);
      onComplete();
    },
    stop: () => {
      if (state.status === "running") finish();
    },
  };
};
