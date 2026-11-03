import type { Disk } from "../fs/disk";
import { findEntries, type Listing } from "../fs/operations";
import { ok, type Result } from "../fs/types";

export type MatchedFile = {
  // The full path, such as `C:\DOS\MEM.EXE`.
  readonly path: string;
  readonly listing: Listing;
};

// The files a path or pattern names, by the DIR pattern rules, that file
// commands act on: never hidden or system files, and never directories.
export const matchFiles = ({ filesystem, cwd }: Disk, path: string): Result<readonly MatchedFile[]> => {
  const found = findEntries(filesystem, cwd, path);
  if (!found.ok) return found;

  const directory = found.value.path.endsWith("\\") ? found.value.path : `${found.value.path}\\`;
  return ok(
    found.value.entries
      .filter(({ kind, attributes }) => kind === "file" && !attributes.hidden && !attributes.system)
      .map((listing) => ({ path: `${directory}${listing.name}`, listing })),
  );
};
