import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const directory = fileURLToPath(new URL(".", import.meta.url));

const sources = readdirSync(directory)
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
  .map((file) => ({ file, code: readFileSync(join(directory, file), "utf8") }));

const importedModules = (code: string) =>
  Array.from(code.matchAll(/(?:from|import)\s+["']([^"']+)["']/g), ([, module]) => module);

const FORBIDDEN_IMPORT = /^(react|react-dom|next)(\/|$)|terminal|shell|boot|components|app\//;
const BROWSER_GLOBALS = /\b(window|document|navigator|localStorage|indexedDB|globalThis)\b/;

describe("os/fs stays independent of the UI", () => {
  test("there are source files to check", () => {
    expect(sources.map(({ file }) => file)).toEqual(
      expect.arrayContaining(["types.ts", "names.ts", "path.ts", "operations.ts", "seed.ts"]),
    );
  });

  test.each(sources)("$file imports nothing from React, Next, the DOM, Screen or the shell", ({ code }) => {
    expect(importedModules(code).filter((module) => FORBIDDEN_IMPORT.test(module))).toEqual([]);
  });

  test.each(sources)("$file only imports relative modules", ({ code }) => {
    importedModules(code).forEach((module) => {
      expect(module.startsWith("./") || module === "../autoexec").toBe(true);
    });
  });

  test.each(sources)("$file uses no browser globals", ({ code }) => {
    expect(code).not.toMatch(BROWSER_GLOBALS);
  });

  test("the checker would catch a forbidden import", () => {
    const code = 'import { Screen } from "../terminal/screen";\nimport React from "react";';

    expect(importedModules(code).filter((module) => FORBIDDEN_IMPORT.test(module))).toEqual([
      "../terminal/screen",
      "react",
    ]);
  });
});
