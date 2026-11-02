import { resolvePath } from "./path";
import { createFilesystem } from "./seed";
import { fail, type Filesystem, ok, type Result } from "./types";

// The filesystem and the current directory, which MS-DOS keeps system-wide.
export type Disk = {
  readonly filesystem: Filesystem;
  readonly cwd: string;
};

export const createDisk = (): Disk => ({
  filesystem: createFilesystem(),
  cwd: "C:\\",
});

export const changeDirectory = (disk: Disk, path: string): Result<Disk> => {
  const resolved = resolvePath(disk.filesystem, disk.cwd, path);

  if (!resolved.ok) return fail(resolved.error);
  if (resolved.value.entry.kind !== "directory") return fail("NotADirectory");

  return ok({ ...disk, cwd: resolved.value.path });
};
