"use client";

import { useCallback, useEffect, useState } from "react";

import { fileChanges } from "../os/fs/changes";
import { createFilesystem } from "../os/fs/seed";
import type { Filesystem } from "../os/fs/types";
import { readKept, saveKept } from "../os/storage/diskStore";
import { type StartingDisk, startingDisk, toRecord } from "../os/storage/record";
import type { Screen } from "../os/terminal/screen";
import BootScreen from "./BootScreen";
import ShellScreen from "./ShellScreen";
import Terminal from "./Terminal";

// Reading the kept files gives up this long after the computer mounts.
const READ_DEADLINE_MS = 3000;

const saveFiles = (filesystem: Filesystem) =>
  saveKept(toRecord(fileChanges(createFilesystem(), filesystem)));

const Computer = () => {
  const [bootScreen, setBootScreen] = useState<Screen>();
  const [start, setStart] = useState<StartingDisk>();
  const finishBoot = useCallback((screen: Screen) => setBootScreen(screen), []);

  useEffect(() => {
    let current = true;
    void readKept(READ_DEADLINE_MS).then((read) => {
      if (current) setStart(startingDisk(read));
    });
    return () => {
      current = false;
    };
  }, []);

  if (!bootScreen) return <BootScreen onComplete={finishBoot} />;

  // The boot has finished but the kept files have not been read: the final
  // boot screen stays, and nothing listens for keys.
  if (!start) return <Terminal screen={bootScreen} />;

  return (
    <ShellScreen
      screen={bootScreen}
      disk={start.disk}
      onFilesChange={start.saving ? saveFiles : undefined}
    />
  );
};

export default Computer;
