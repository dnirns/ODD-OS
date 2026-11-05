import { describe, expect, it } from "vitest";
import {
  EMPTY_ENVIRONMENT,
  getVariable,
  listVariables,
  removeVariable,
  setVariable,
} from "./environment";

describe("environment", () => {
  it("adds a variable with its name in upper case and its value as typed", () => {
    const environment = setVariable(EMPTY_ENVIRONMENT, "Greeting", "Hello World");

    expect(listVariables(environment)).toEqual(["GREETING=Hello World"]);
  });

  it("finds a variable whatever the case of the name", () => {
    const environment = setVariable(EMPTY_ENVIRONMENT, "Path", "C:\\DOS");

    expect(getVariable(environment, "path")).toBe("C:\\DOS");
    expect(getVariable(environment, "PATH")).toBe("C:\\DOS");
    expect(getVariable(environment, "other")).toBeUndefined();
  });

  it("replaces a variable and moves it to the end", () => {
    const environment = ["a=1", "b=2", "A=3"].reduce(
      (current, text) => {
        const [name, value] = text.split("=");
        return setVariable(current, name, value);
      },
      EMPTY_ENVIRONMENT,
    );

    expect(listVariables(environment)).toEqual(["B=2", "A=3"]);
  });

  it("removes a variable, and ignores one that is not there", () => {
    const environment = setVariable(setVariable(EMPTY_ENVIRONMENT, "a", "1"), "b", "2");

    expect(listVariables(removeVariable(environment, "A"))).toEqual(["B=2"]);
    expect(removeVariable(environment, "nothere")).toEqual(environment);
  });

  it("does not change the value it was given", () => {
    const before = setVariable(EMPTY_ENVIRONMENT, "a", "1");
    setVariable(before, "a", "2");
    removeVariable(before, "a");

    expect(listVariables(before)).toEqual(["A=1"]);
  });

  it("lists an empty environment as no rows", () => {
    expect(listVariables(EMPTY_ENVIRONMENT)).toEqual([]);
  });
});
