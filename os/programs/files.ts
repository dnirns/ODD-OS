import type { Disk } from "../fs/disk";
import { writeFile } from "../fs/operations";
import { formatPath, locate } from "../fs/path";
import type { Clock } from "../shell/clock";
import type { ProgrammeFiles } from "./types";

const ROOT = "C:\\";

// The directory a write would land in, or the error that stops it.
const parentOf = (disk: Disk, path: string) => {
  const located = locate(disk.filesystem, disk.cwd, path);

  switch (located.kind) {
    case "error":
      return { ok: false, error: located.error } as const;
    case "missing":
      return { ok: true, value: formatPath(located.parent) } as const;
    case "found":
      return { ok: true, value: formatPath(located.names.slice(0, -1)) } as const;
  }
};

// A programme may write directly in C:\ and in the directory of its own file.
// This is an ODD/OS rule; MS-DOS had no such protection.
export const programmeFiles = (home: string, clock: Clock): ProgrammeFiles => ({
  write: (disk, path, text, now) => {
    const parent = parentOf(disk, path);

    if (!parent.ok) return parent;
    if (parent.value !== ROOT && parent.value !== home) return { ok: false, error: "AccessDenied" };

    const written = writeFile(disk.filesystem, disk.cwd, path, text, new Date(now + clock.offsetMs));

    return written.ok ? { ok: true, value: { ...disk, filesystem: written.value } } : written;
  },
});
