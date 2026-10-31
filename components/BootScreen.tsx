"use client";

import { useEffect, useState } from "react";

import { isSkipKey } from "../os/boot/bootKeys";
import { startBoot } from "../os/boot/bootRunner";
import { createBootScreen, createBootSteps } from "../os/boot/bootSteps";
import Terminal from "./Terminal";

const BootScreen = () => {
  const [screen, setScreen] = useState(createBootScreen);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isSkipKey(event.key)) boot.skip();
    };
    const removeListener = () =>
      window.removeEventListener("keydown", onKeyDown);

    const boot = startBoot({
      screen: createBootScreen(),
      steps: createBootSteps({ reducedMotion }),
      onScreen: setScreen,
      onComplete: removeListener,
    });
    window.addEventListener("keydown", onKeyDown);

    return () => {
      boot.stop();
      removeListener();
    };
  }, []);

  return <Terminal screen={screen} />;
};

export default BootScreen;
