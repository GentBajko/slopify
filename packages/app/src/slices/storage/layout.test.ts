import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { layout } from "../../kernel/paths.js";
import { extensionOf, outputFileName, outputPath, projectDir, stagingPath } from "./layout.js";

const paths = layout("/data");

describe("projectDir", () => {
  it("puts a project's assets in its own folder under projects/", () => {
    expect(projectDir(paths, "01JABC")).toBe(join("/data", "projects", "01JABC"));
  });

  it("refuses an id that would leave the projects folder", () => {
    expect(() => projectDir(paths, "..")).toThrow(/outside/);
    expect(() => projectDir(paths, "../../etc")).toThrow(/outside/);
    expect(() => projectDir(paths, "/etc")).toThrow(/outside/);
  });
});

describe("outputPath", () => {
  it("resolves a stored relative path inside the project folder", () => {
    expect(outputPath(paths, "p1", "images/001.png")).toBe(
      join("/data", "projects", "p1", "images", "001.png"),
    );
  });

  it("refuses a stored path that climbs out of the project folder", () => {
    expect(() => outputPath(paths, "p1", "../p2/video.mp4")).toThrow(/outside/);
    expect(() => outputPath(paths, "p1", "/etc/passwd")).toThrow(/outside/);
  });
});

describe("stagingPath", () => {
  it("names a staged file by its id alone", () => {
    expect(stagingPath(paths, "01JSTAGED")).toBe(join("/data", "staging", "01JSTAGED"));
  });

  it("refuses an id that is not a single path segment", () => {
    expect(() => stagingPath(paths, "../projects/p1/video.mp4")).toThrow(/outside/);
  });
});

describe("outputFileName", () => {
  it("names the fixed assets regardless of the uploaded name", () => {
    expect(outputFileName("notes", 0, ".doc", "research")).toBe("research.txt");
    expect(outputFileName("article_md", 0, "", "article")).toBe("article.md");
    expect(outputFileName("article_txt", 0, "", "article")).toBe("article.txt");
    expect(outputFileName("sources", 0, "", "article")).toBe("sources.txt");
    expect(outputFileName("glossary", 0, "", "article")).toBe("glossary.txt");
    expect(outputFileName("render_params", 0, "", "video")).toBe("render.json");
    expect(outputFileName("video", 0, ".mkv", "video")).toBe("video.mp4");
  });

  // Two stages store what they sent, so the role alone would name one file twice.
  it("names the sent instructions after the stage that sent them", () => {
    expect(outputFileName("instructions", 0, "", "research")).toBe("instructions-research.txt");
    expect(outputFileName("instructions", 0, "", "article")).toBe("instructions-article.txt");
  });

  it("keeps the extension of the assets whose format the provider or the user picks", () => {
    expect(outputFileName("audio_body", 0, ".mp3", "audio")).toBe("audio-body.mp3");
    expect(outputFileName("audio_intro", 0, ".wav", "audio")).toBe("audio-intro.wav");
    expect(outputFileName("audio_outro", 0, ".m4a", "audio")).toBe("audio-outro.m4a");
    expect(outputFileName("thumbnail", 0, ".jpg", "thumbnail")).toBe("thumbnail.jpg");
  });

  it("numbers images so slideshow order survives a directory listing", () => {
    expect(outputFileName("image", 1, ".png", "images")).toBe("images/001.png");
    expect(outputFileName("image", 60, ".webp", "images")).toBe("images/060.webp");
  });
});

describe("extensionOf", () => {
  it("lowercases a plain extension", () => {
    expect(extensionOf("Take One.MP3")).toBe(".mp3");
    expect(extensionOf("shot.png")).toBe(".png");
  });

  it("has none for a name without one, and refuses anything unlike an extension", () => {
    expect(extensionOf("README")).toBe("");
    expect(extensionOf("archive.tar.gz")).toBe(".gz");
    expect(extensionOf("odd.this-is-not-an-extension")).toBe("");
    expect(extensionOf("trailing.")).toBe("");
  });
});
