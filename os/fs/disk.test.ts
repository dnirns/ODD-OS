import { describe, expect, test } from "vitest";

import { changeDirectory, createDisk } from "./disk";
import { createFilesystem } from "./seed";

const to = (path: string, from = createDisk()) => {
  const result = changeDirectory(from, path);
  return result.ok ? result.value.cwd : result.error;
};

describe("The working directory is kept with the filesystem", () => {
  test("starts at the root of the seeded filesystem", () => {
    const disk = createDisk();

    expect(disk.cwd).toBe("C:\\");
    expect(disk.filesystem).toEqual(createFilesystem());
  });

  test("changes directory and back", () => {
    const result = changeDirectory(createDisk(), "dos");
    if (!result.ok) throw new Error(result.error);

    expect(result.value.cwd).toBe("C:\\DOS");
    expect(to("..", result.value)).toBe("C:\\");
  });

  test("leaves the disk passed in unchanged", () => {
    const disk = createDisk();
    changeDirectory(disk, "dos");

    expect(disk.cwd).toBe("C:\\");
  });

  test("keeps the filesystem itself", () => {
    const disk = createDisk();
    const result = changeDirectory(disk, "dos");

    expect(result.ok && result.value.filesystem).toBe(disk.filesystem);
  });

  test("accepts absolute paths, any case and forward slashes", () => {
    expect(to("\\dos")).toBe("C:\\DOS");
    expect(to("/Dos/")).toBe("C:\\DOS");
    expect(to("c:\\oddware")).toBe("C:\\ODDWARE");
    expect(to("\\")).toBe("C:\\");
  });

  test.each([
    ["nowhere", "FileNotFound"],
    ["readme.txt", "NotADirectory"],
    ["..", "PathNotFound"],
    ["d:\\", "InvalidDrive"],
    ["d*", "InvalidName"],
  ])("fails for %j with %s and keeps the directory", (path, error) => {
    const disk = createDisk();

    expect(to(path, disk)).toBe(error);
    expect(disk.cwd).toBe("C:\\");
  });
});
