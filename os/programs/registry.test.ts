import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { AUTOEXEC_COMMANDS } from "../autoexec";
import { createDisk } from "../fs/disk";
import { createFilesystem } from "../fs/seed";
import { resolvePath } from "../fs/path";
import type { Entry, Filesystem } from "../fs/types";
import { createClock } from "../shell/clock";
import { NO_BEHAVIOUR, PROGRAMMES, runExecutable } from "./registry";
import { getVariable } from "../environment/environment";
import { STARTING_ENVIRONMENT } from "../shell/environmentCommands";
import { searchDirectories } from "./resolve";
import type { Registry } from "./types";

const filesystem = createFilesystem();

const executablePaths = (entries: readonly Entry[], parent = "C:"): readonly string[] =>
  entries.flatMap((entry) => {
    const path = `${parent}\\${entry.name}`;

    if (entry.kind === "directory") return executablePaths(entry.entries, path);
    return /\.(COM|EXE)$/.test(entry.name) ? [path] : [];
  });

const problems = (registry: Registry, fs: Filesystem): readonly string[] => {
  const onDisk = executablePaths(fs.root.entries);

  return [
    ...Object.keys(registry)
      .filter((key) => {
        const resolved = resolvePath(fs, "C:\\", key);
        return !resolved.ok || resolved.value.entry.kind !== "file" || resolved.value.path !== key;
      })
      .map((key) => `${key} is registered but no such file is on the disk`),
    ...onDisk
      .filter((path) => !Object.hasOwn(registry, path))
      .map((path) => `${path} is on the disk but has no registered behaviour`),
  ];
};

describe("The registry and the disk agree", () => {
  test("the production registry has no problems", () => {
    expect(problems(PROGRAMMES, filesystem)).toEqual([]);
  });

  test("the seeded executables are the registered ones", () => {
    expect(executablePaths(filesystem.root.entries).toSorted()).toEqual(
      Object.keys(PROGRAMMES).toSorted(),
    );
  });

  test("a registered programme with no file is caught", () => {
    const orphan = { ...PROGRAMMES, "C:\\DOS\\GHOST.EXE": PROGRAMMES["C:\\DOS\\MEM.EXE"] };

    expect(problems(orphan, filesystem)).toEqual([
      "C:\\DOS\\GHOST.EXE is registered but no such file is on the disk",
    ]);
  });

  test("a registry key that is not the canonical path is caught", () => {
    const lower = { ...PROGRAMMES, "c:\\dos\\mem.exe": PROGRAMMES["C:\\DOS\\MEM.EXE"] };

    expect(problems(lower, filesystem)).not.toEqual([]);
  });

  test("a seeded executable with no behaviour is caught", () => {
    const rest = Object.fromEntries(
      Object.entries(PROGRAMMES).filter(([path]) => path !== "C:\\DOS\\MEM.EXE"),
    );

    expect(problems(rest, filesystem)).toEqual([
      "C:\\DOS\\MEM.EXE is on the disk but has no registered behaviour",
    ]);
  });

  test("every executable on the initial disk runs by its full path", () => {
    const context = {
      disk: createDisk(),
      clock: createClock(0),
      now: 0,
      history: [],
      commands: [],
      environment: [],
    };

    executablePaths(filesystem.root.entries).forEach((path) => {
      const output = runExecutable(path, { tail: "", params: [], switches: ["/?"] }, context, PROGRAMMES);

      expect(output).not.toEqual({ type: "print", lines: [NO_BEHAVIOUR] });
    });
  });
});

describe("The search path matches AUTOEXEC.BAT", () => {
  test("the starting PATH is the value the PATH command sets", () => {
    const pathLine = AUTOEXEC_COMMANDS.find((command) => /^PATH\s/i.test(command));

    expect(pathLine).toBeDefined();
    expect(pathLine?.replace(/^PATH\s+/i, "")).toEqual(getVariable(STARTING_ENVIRONMENT, "PATH"));
  });

  test("every directory on the search path exists", () => {
    searchDirectories(STARTING_ENVIRONMENT).forEach((directory) => {
      const resolved = resolvePath(filesystem, "C:\\", directory);

      expect(resolved.ok && resolved.value.entry.kind).toBe("directory");
    });
  });
});

const directoryPath = fileURLToPath(new URL(".", import.meta.url));

const sources = readdirSync(directoryPath)
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
  .map((file) => ({ file, code: readFileSync(join(directoryPath, file), "utf8") }));

const importedModules = (code: string) =>
  Array.from(code.matchAll(/(?:from|import)\s+["']([^"']+)["']/g), ([, module]) => module);

const ALLOWED_IMPORT =
  /^\.\/|^\.\.\/(fs\/|environment\/|autoexec$|machine$|version$|terminal\/screen$|shell\/shellKeys$|shell\/clock$)/;
const BROWSER_GLOBALS = /\b(window|document|navigator|localStorage|indexedDB|globalThis)\b/;

describe("os/programs stays independent of the shell and the UI", () => {
  test("there are source files to check", () => {
    expect(sources.map(({ file }) => file)).toEqual(
      expect.arrayContaining(["types.ts", "resolve.ts", "registry.ts", "step.ts"]),
    );
  });

  test.each(sources)("$file imports only the modules the runtime may use", ({ code }) => {
    expect(importedModules(code).filter((module) => !ALLOWED_IMPORT.test(module))).toEqual([]);
  });

  test.each(sources)("$file uses no browser globals", ({ code }) => {
    expect(code).not.toMatch(BROWSER_GLOBALS);
  });

  test("the shell may only be imported as a type", () => {
    sources.forEach(({ file, code }) => {
      Array.from(code.matchAll(/^import\s+(type\s+)?[^;]*?from\s+["']\.\.\/shell\/[^"']+["']/gm)).forEach(
        ([statement, isType]) => {
          expect(isType, `${file}: ${statement}`).toBeDefined();
        },
      );
    });
  });

  test("the checker would catch a forbidden import", () => {
    const code = 'import { x } from "../shell/shell";\nimport React from "react";';

    expect(importedModules(code).filter((module) => !ALLOWED_IMPORT.test(module))).toEqual([
      "../shell/shell",
      "react",
    ]);
  });
});
