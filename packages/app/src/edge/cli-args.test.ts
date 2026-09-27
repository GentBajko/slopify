import { describe, expect, it } from "vitest";
import { helpText, parseCli } from "./cli-args.js";

describe("parseCli", () => {
  it("answers --help, -h and help with the help text", () => {
    expect(parseCli(["--help"])).toEqual({ kind: "help" });
    expect(parseCli(["-h"])).toEqual({ kind: "help" });
    expect(parseCli(["help"])).toEqual({ kind: "help" });
  });

  it("answers --version and -v with the version", () => {
    expect(parseCli(["--version"])).toEqual({ kind: "version" });
    expect(parseCli(["-v"])).toEqual({ kind: "version" });
  });

  it("passes the options on for a normal start", () => {
    const parsed = parseCli(["--port", "7070", "--no-open", "update"]);
    expect(parsed.kind).toBe("run");
    if (parsed.kind !== "run") return;
    expect(parsed.values.port).toBe("7070");
    expect(parsed.values["no-open"]).toBe(true);
    expect(parsed.positionals).toEqual(["update"]);
  });

  it("names an unknown option and points at --help instead of Node's parser error", () => {
    expect(() => parseCli(["--frobnicate"])).toThrow(
      "Slopify doesn't know the option --frobnicate. Run npx @gentbajko/slopify --help to see every option.",
    );
  });
});

describe("helpText", () => {
  it("lists every option in plain words with the version", () => {
    const text = helpText("3.0.1");
    expect(text).toContain("Slopify 3.0.1");
    for (const flag of [
      "--port",
      "--host",
      "--data-dir",
      "--no-open",
      "--autostart",
      "--no-autostart",
      "--docker",
      "--projects-dir",
      "--host-cli=off",
      "--accept-host-cli",
      "--help",
      "--version",
    ])
      expect(text).toContain(flag);
  });
});
