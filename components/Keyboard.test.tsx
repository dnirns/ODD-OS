import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { INITIAL_KEYBOARD } from "../os/keyboard/keyboardState";
import { LAYOUT } from "../os/keyboard/layout";
import Keyboard, { KeyRows } from "./Keyboard";

const render = (shown = true) =>
  renderToStaticMarkup(<Keyboard shown={shown} onToggle={() => {}} />);

const buttons = (markup: string) => markup.match(/<button[^>]*>/g) ?? [];
const labelled = (markup: string, label: string) =>
  buttons(markup).find((tag) => tag.includes(`aria-label="${label}"`));

describe("The on-screen keyboard", () => {
  test("has a button for every key, plus its tab", () => {
    const keyCount = LAYOUT.flat().filter((key) => key.kind !== "gap").length;
    expect(buttons(render())).toHaveLength(keyCount + 1);
  });

  test("is labelled as a keyboard", () => {
    expect(render()).toContain('role="group" aria-label="Keyboard"');
  });

  test.each(["Escape", "F6", "F10", "Insert", "Delete", "Home", "End", "Page Up", "Page Down",
    "Up", "Down", "Left", "Right", "Backspace", "Tab", "Enter", "Space", "Control", "Alt",
    "Caps Lock", "Shift", "Q", "\\ |", "; :", ", &lt;", ". &gt;", "6 ^", "` ~"])(
    "has a key named %s",
    (label) => {
      expect(labelled(render(), label)).toBeDefined();
    },
  );

  test("no key can be reached with Tab", () => {
    for (const tag of buttons(render())) expect(tag).toContain('tabindex="-1"');
  });

  test("shows both legends of a two-legend key", () => {
    expect(render()).toMatch(/<span>\|<\/span><span>\\<\/span>/);
  });

  test("modifiers start unlit", () => {
    expect(labelled(render(), "Control")).toContain('aria-pressed="false"');
    expect(labelled(render(), "Caps Lock")).toContain('aria-pressed="false"');
  });

  test("other keys have no pressed state", () => {
    expect(labelled(render(), "Q")).not.toContain("aria-pressed");
  });

  test("when hidden, only the tab remains", () => {
    const markup = render(false);
    expect(buttons(markup)).toHaveLength(1);
    expect(markup).toContain('aria-label="Show keyboard"');
    expect(markup).toContain('aria-expanded="false"');
  });

  test("when shown, the tab hides it", () => {
    expect(render()).toContain('aria-label="Hide keyboard"');
  });
});

describe("Lit and pressed keys", () => {
  const markup = renderToStaticMarkup(
    <KeyRows
      modifiers={{ ...INITIAL_KEYBOARD, shift: "once", caps: true, ctrl: true }}
      pressed={["char-a"]}
    />,
  );

  test("held modifiers are announced as pressed", () => {
    expect(labelled(markup, "Control")).toContain('aria-pressed="true"');
    expect(labelled(markup, "Caps Lock")).toContain('aria-pressed="true"');
    expect(labelled(markup, "Alt")).toContain('aria-pressed="false"');
  });

  test("both Shift keys light together", () => {
    const shifts = buttons(markup).filter((tag) => tag.includes('aria-label="Shift"'));
    expect(shifts).toHaveLength(2);
    for (const tag of shifts) expect(tag).toContain('aria-pressed="true"');
  });

  test("a key held down looks pressed", () => {
    expect(labelled(markup, "A")).toContain("data-pressed");
    expect(labelled(markup, "B")).not.toContain("data-pressed");
  });
});
