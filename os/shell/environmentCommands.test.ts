import { describe, expect, test } from "vitest";

import { getVariable, listVariables } from "../environment/environment";
import { SET_HELP, STARTING_ENVIRONMENT } from "./environmentCommands";
import { fromRoot, lines } from "./testSession";

const variables = (...commands: readonly string[]) =>
  listVariables(fromRoot(...commands).environment);

const STARTING = ["COMSPEC=C:\\COMMAND.COM", "PATH=C:\\DOS", "PROMPT=$P$G"];

describe("The environment at startup", () => {
  test("is COMSPEC, then what AUTOEXEC.BAT sets, in order", () => {
    expect(listVariables(STARTING_ENVIRONMENT)).toEqual(STARTING);
  });

  test("a session starts from it", () => {
    expect(variables()).toEqual(STARTING);
  });
});

describe("Showing the environment", () => {
  test("SET lists every variable as NAME=value", () => {
    const shown = fromRoot("set");

    expect(shown.result?.type).toBe("print");
    expect(lines(shown)).toEqual(STARTING);
  });

  test("any letter case", () => {
    expect(lines(fromRoot("SET"))).toEqual(STARTING);
    expect(lines(fromRoot("Set"))).toEqual(STARTING);
  });

  test("an empty environment prints only the blank row", () => {
    expect(lines(fromRoot("set comspec=", "set path=", "set prompt=", "set"))).toEqual([]);
  });
});

describe("Setting a variable", () => {
  test("adds at the end, with the name in upper case and the value as typed", () => {
    expect(variables("set Greeting=Hello World")).toEqual([...STARTING, "GREETING=Hello World"]);
  });

  test("prints nothing more than the blank row", () => {
    const set = fromRoot("set a=1");

    expect(set.result).toEqual({ type: "setEnvironment", environment: set.environment });
    expect(lines(set)).toEqual([]);
  });

  test("replaces a variable of the same name in any case", () => {
    const listed = variables("set a=1", "set A=2").filter((text) => text.startsWith("A="));

    expect(listed).toEqual(["A=2"]);
  });

  test("a replaced variable moves to the end", () => {
    expect(variables("set a=1", "set b=2", "set a=3").slice(-2)).toEqual(["B=2", "A=3"]);
  });

  test("the value keeps its case", () => {
    expect(variables("set path=c:\\Dos").at(-1)).toBe("PATH=c:\\Dos");
  });

  test("delimiters before the name are skipped", () => {
    expect(variables("set   a=1").at(-1)).toBe("A=1");
  });

  test("spaces in the value are kept", () => {
    expect(variables("set a=x  y ").at(-1)).toBe("A=x  y ");
  });
});

describe("Removing a variable", () => {
  test("SET NAME= removes it", () => {
    expect(variables("set a=1", "set a=")).toEqual(STARTING);
  });

  test("any case of the name", () => {
    expect(variables("set Path=")).toEqual(["COMSPEC=C:\\COMMAND.COM", "PROMPT=$P$G"]);
  });

  test("removing a missing variable prints nothing more than the blank row", () => {
    const removed = fromRoot("set nothere=");

    expect(removed.result?.type).toBe("setEnvironment");
    expect(lines(removed)).toEqual([]);
    expect(listVariables(removed.environment)).toEqual(STARTING);
  });
});

describe("SET failures", () => {
  test.each(["set foo", "set =bar", "set a=b=c", "set a==b"])("%s is a syntax error", (line) => {
    const failed = fromRoot(line);

    expect(lines(failed)).toEqual(["Syntax error"]);
    expect(listVariables(failed.environment)).toEqual(STARTING);
  });
});

describe("The search path", () => {
  test("PATH shows the path", () => {
    expect(lines(fromRoot("path"))).toEqual(["PATH=C:\\DOS"]);
  });

  test("sets it in upper case", () => {
    const set = fromRoot("path c:\\dos;c:\\oddware", "path");

    expect(lines(set)).toEqual(["PATH=C:\\DOS;C:\\ODDWARE"]);
  });

  test("setting it prints nothing more than the blank row", () => {
    expect(lines(fromRoot("path c:\\oddware"))).toEqual([]);
  });

  test("PATH ; clears it", () => {
    const cleared = fromRoot("path ;");

    expect(getVariable(cleared.environment, "PATH")).toBeUndefined();
    expect(lines(fromRoot("path ;", "path"))).toEqual(["No Path"]);
    expect(listVariables(cleared.environment)).not.toContain("PATH=C:\\DOS");
  });

  test("PATH ; may be followed by blanks only", () => {
    expect(lines(fromRoot("path ;  "))).toEqual([]);
    expect(lines(fromRoot("path ; x"))).toEqual(["Too many parameters"]);
  });

  test("a path moves to the end of the list", () => {
    expect(variables("path c:\\oddware")).toEqual([
      "COMSPEC=C:\\COMMAND.COM",
      "PROMPT=$P$G",
      "PATH=C:\\ODDWARE",
    ]);
  });

  test("more than one parameter is refused and changes nothing", () => {
    const refused = fromRoot("path c:\\dos c:\\oddware");

    expect(lines(refused)).toEqual(["Too many parameters"]);
    expect(listVariables(refused.environment)).toEqual(STARTING);
  });

  test("PATH and SET PATH change the same variable", () => {
    expect(lines(fromRoot("set path=C:\\ODDWARE", "path"))).toEqual(["PATH=C:\\ODDWARE"]);
    expect(lines(fromRoot("path c:\\oddware", "set"))).toContain("PATH=C:\\ODDWARE");
    expect(lines(fromRoot("set path=", "path"))).toEqual(["No Path"]);
  });
});

describe("The command prompt setting", () => {
  test("PROMPT text sets the variable as typed", () => {
    expect(variables("prompt Ready: $p").at(-1)).toBe("PROMPT=Ready: $p");
  });

  test("setting it prints nothing more than the blank row", () => {
    expect(lines(fromRoot("prompt Ready:"))).toEqual([]);
  });

  test("PROMPT alone removes the variable", () => {
    expect(variables("prompt")).toEqual(["COMSPEC=C:\\COMMAND.COM", "PATH=C:\\DOS"]);
  });

  test("a prompt moves to the end of the list", () => {
    expect(variables("prompt $n$g").at(-1)).toBe("PROMPT=$n$g");
    expect(variables("set prompt=$n$g", "path c:\\dos").slice(-2)).toEqual([
      "PROMPT=$n$g",
      "PATH=C:\\DOS",
    ]);
  });

  test("PROMPT and SET PROMPT change the same variable", () => {
    expect(variables("set prompt=$p$g")).toEqual(variables("prompt $p$g"));
    expect(variables("set prompt=")).toEqual(variables("prompt"));
  });
});

describe("Help", () => {
  test.each(["set", "path", "prompt"])("%s /? shows its help", (name) => {
    const shown = lines(fromRoot(`${name} /?`));

    expect(shown.length).toBeGreaterThan(2);
    expect(shown.join("\n")).toContain(name.toUpperCase());
  });

  test("SET help describes the syntax", () => {
    expect(SET_HELP).toContain("SET [variable=[string]]");
  });

  test("PROMPT help lists every code", () => {
    const shown = lines(fromRoot("help prompt")).join("\n");

    ["$Q", "$$", "$T", "$D", "$P", "$V", "$N", "$G", "$L", "$B", "$_", "$E", "$H"].forEach((code) => {
      expect(shown).toContain(code);
    });
  });
});
