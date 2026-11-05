import { describe, expect, test } from "vitest";

import { applyDirSwitch, applyDirSwitches, DEFAULT_DIR_OPTIONS, presetOptions } from "./dirSwitches";

const apply = (...switches: string[]) => applyDirSwitches(DEFAULT_DIR_OPTIONS, switches);

describe("Switches", () => {
  test("the plain switches turn on, and /-x turns off", () => {
    expect(apply("/W", "/P", "/B", "/L", "/S")).toMatchObject({
      wide: true,
      page: true,
      bare: true,
      lower: true,
      subdirectories: true,
    });
    expect(apply("/w", "/-w")).toMatchObject({ wide: false });
  });

  test("/C and /CH are accepted and change nothing", () => {
    expect(apply("/C")).toEqual(DEFAULT_DIR_OPTIONS);
    expect(apply("/CH")).toEqual(DEFAULT_DIR_OPTIONS);
  });

  test("unknown switches are refused", () => {
    ["/Q", "/T", "/X", "/-Q", "/WX", "/CX", "W"].forEach((text) => {
      expect(apply(text)).toBeUndefined();
    });
  });
});

describe("/A", () => {
  test("alone shows every entry", () => {
    expect(apply("/A")?.attributes).toEqual([]);
    expect(apply("/A:")?.attributes).toEqual([]);
  });

  test("takes codes with or without a colon, each optionally negated", () => {
    const expected = [
      { code: "H", wanted: true },
      { code: "S", wanted: true },
      { code: "D", wanted: false },
    ];

    expect(apply("/A:HS-D")?.attributes).toEqual(expected);
    expect(apply("/ahs-d")?.attributes).toEqual(expected);
  });

  test("refuses unknown or dangling codes", () => {
    expect(apply("/AX")).toBeUndefined();
    expect(apply("/A:D-")).toBeUndefined();
    expect(apply("/A--D")).toBeUndefined();
  });

  test("/-A returns to the default", () => {
    expect(apply("/AD", "/-A")?.attributes).toBeUndefined();
  });
});

describe("/O", () => {
  test("alone sorts directories first, then by name", () => {
    expect(apply("/O")?.order).toEqual([
      { code: "G", reversed: false },
      { code: "N", reversed: false },
    ]);
  });

  test("takes keys with or without a colon, each optionally reversed", () => {
    const expected = [
      { code: "G", reversed: false },
      { code: "S", reversed: true },
    ];

    expect(apply("/O:G-S")?.order).toEqual(expected);
    expect(apply("/og-s")?.order).toEqual(expected);
  });

  test("refuses unknown keys", () => {
    expect(apply("/OX")).toBeUndefined();
    expect(apply("/O-")).toBeUndefined();
  });

  test("/-O returns to storage order", () => {
    expect(apply("/ON", "/-O")?.order).toEqual([]);
  });
});

describe("DIRCMD", () => {
  test("presets switches", () => {
    expect(presetOptions("/W")).toMatchObject({ wide: true });
    expect(presetOptions("/W /O:N /B")).toMatchObject({ wide: true, bare: true });
    expect(presetOptions("/W/L")).toMatchObject({ wide: true, lower: true });
  });

  test("a later switch replaces an earlier one", () => {
    const preset = presetOptions("/O");
    const next = applyDirSwitch(preset, "/ON");

    expect(next?.order).toEqual([{ code: "N", reversed: false }]);
  });

  test("an invalid value is ignored in full", () => {
    expect(presetOptions("/W /Q")).toEqual(DEFAULT_DIR_OPTIONS);
    expect(presetOptions("/Q")).toEqual(DEFAULT_DIR_OPTIONS);
  });

  test("an unset or empty value presets nothing", () => {
    expect(presetOptions(undefined)).toEqual(DEFAULT_DIR_OPTIONS);
    expect(presetOptions("")).toEqual(DEFAULT_DIR_OPTIONS);
    expect(presetOptions("W")).toEqual(DEFAULT_DIR_OPTIONS);
  });
});
