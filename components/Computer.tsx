"use client";

import { useCallback, useState } from "react";

import type { Screen } from "../os/terminal/screen";
import BootScreen from "./BootScreen";
import ShellScreen from "./ShellScreen";

type ComputerState =
  | { readonly phase: "boot" }
  | { readonly phase: "shell"; readonly screen: Screen };

const Computer = () => {
  const [state, setState] = useState<ComputerState>({ phase: "boot" });
  const startShell = useCallback(
    (screen: Screen) => setState({ phase: "shell", screen }),
    [],
  );

  return state.phase === "boot" ? (
    <BootScreen onComplete={startShell} />
  ) : (
    <ShellScreen screen={state.screen} />
  );
};

export default Computer;
