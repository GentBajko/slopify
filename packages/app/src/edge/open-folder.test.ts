import { describe, expect, it } from "vitest";
import { folderCommand } from "./open-folder.js";

describe("native folder commands", () => {
  it("passes paths as a single argument without a command shell", () => {
    const path = "C:\\Users\\A & B\\output";
    expect(folderCommand("win32", path)).toEqual(["explorer.exe", [path]]);
    expect(folderCommand("linux", path, true)).toEqual(["explorer.exe", [path]]);
    expect(folderCommand("darwin", "/Users/A & B/output")).toEqual([
      "open",
      ["/Users/A & B/output"],
    ]);
    expect(folderCommand("linux", "/home/A & B/output")).toEqual([
      "xdg-open",
      ["/home/A & B/output"],
    ]);
  });
});
