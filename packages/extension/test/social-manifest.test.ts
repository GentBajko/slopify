import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { siteMatches } from "../src/social/matches.js";

describe("the manifest", () => {
  const manifest = JSON.parse(
    readFileSync(join(import.meta.dirname, "../static/manifest.json"), "utf8"),
  ) as {
    version: string;
    permissions: string[];
    host_permissions: string[];
    optional_host_permissions: string[];
    optional_permissions: string[];
    content_scripts: { matches: string[] }[];
    web_accessible_resources: { resources: string[]; matches: string[] }[];
  };
  const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")) as {
    version: string;
  };

  it("asks for no new required host permission: the sites are optional", () => {
    // Exactly the 1.x hosts: a new required one would disable the updated extension until the
    // person accepted it, and YouTube Studio would stop filling.
    expect(manifest.host_permissions).toEqual([
      "http://127.0.0.1/*",
      "http://localhost/*",
      "https://www.youtube.com/oembed*",
    ]);
    expect(manifest.permissions).toEqual(["storage", "clipboardWrite", "alarms", "scripting"]);
    expect(manifest.optional_permissions).toEqual(["notifications"]);
    expect(manifest.optional_host_permissions).toEqual(Object.values(siteMatches).flat());
    // No content script runs on the sites before they are allowed.
    const static_ = manifest.content_scripts.flatMap((one) => one.matches);
    for (const match of Object.values(siteMatches).flat()) expect(static_).not.toContain(match);
  });

  it("lets the six sites load the file frame, and is version 2.0.0 in both places", () => {
    expect(manifest.web_accessible_resources[0]?.matches).toEqual([
      "https://studio.youtube.com/*",
      ...Object.values(siteMatches).flat(),
    ]);
    expect(manifest.version).toBe("2.0.0");
    expect(pkg.version).toBe("2.0.0");
  });

  it("builds the posting page script", () => {
    const build = readFileSync(join(import.meta.dirname, "../scripts/build.mjs"), "utf8");
    expect(build).toContain('"social-content"');
  });
});
