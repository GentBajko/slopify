import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { describe, expect, it } from "vitest";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { fixedClock } from "../src/kernel/clock.fake.js";
import { openDb } from "../src/kernel/db/index.js";
import { migrate } from "../src/kernel/db/migrate.js";
import type { Ids } from "../src/kernel/ids.js";
import type { Log } from "../src/kernel/log.js";
import { ensureDirs, layout } from "../src/kernel/paths.js";
import type { Registry } from "../src/kernel/ports/registry.js";
import type { TtsPort } from "../src/kernel/ports/tts.js";
import { sqliteAttempts } from "../src/kernel/runner/attempt-repo.js";
import type { StageContext } from "../src/kernel/runner/index.js";
import { stageProviders } from "../src/kernel/runner/providers.js";
import type { RunDraft } from "../src/slices/admission/model.js";
import { startRun } from "../src/slices/admission/start.js";
import { runNarration } from "../src/slices/narration/run.js";
import type { StorageDeps } from "../src/slices/storage/staging.js";
import { stageUpload } from "../src/slices/storage/staging.js";
import { resolveFfmpeg } from "../src/slices/video/ffmpeg.js";

// `logic/08` step 1: the end-matter split runs "when the article becomes `done` or
// `provided`". S12 wired it into the Generate path alone, so this covers the other half
// end to end: a pasted article goes in at Play and the audio stage reads what came out.

const clock = fixedClock("2026-09-02T10:00:00.000Z");
const silent: Log = { write: (): void => {} };
const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);

const pasted = `# Rope

Rope is twisted fibre.

## Sources Consulted

- https://example.test/rope

## Pronunciation Glossary

- bowline /ˈboʊlɪn/
`;

// One real mp3, so the concatenation the stage ends with has something to decode.
function tone(): Uint8Array {
  const path = join(mkdtempSync(join(tmpdir(), "slopify-tone-")), "a.mp3");
  execFileSync(ffmpeg, [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=0.4:sample_rate=44100",
    "-ac",
    "2",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    path,
  ]);
  return new Uint8Array(readFileSync(path));
}

function ids(): Ids {
  let n = 0;
  return {
    next: (): string => {
      n += 1;
      return `id${String(n)}`;
    },
  };
}

function storage(): StorageDeps {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-provided-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  return { db, paths, ids: ids(), clock, log: silent, emit: (): void => {} };
}

function upload(deps: StorageDeps, kind: "audio" | "images", body: string): Promise<string> {
  return stageUpload(deps, {
    stageKind: kind,
    originalFilename: `${kind}.bin`,
    content: (async function* () {
      yield Buffer.from(body);
    })(),
  }).then((result) => {
    if (!result.ok) {
      throw new Error(result.reason);
    }
    return result.file.id;
  });
}

function draft(image: string, article: string): RunDraft {
  return {
    title: "Rope Tricks",
    format: "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "generate",
      images: "provide",
      thumbnail: "off",
      video: "generate",
    },
    audio: { provider: "fake-tts", model: "fake-voice-model", voice: "v-narrator" },
    imagePrompts: [],
    values: {},
    provided: { article, images: [image] },
    chunking: { mode: "whole" },
    silenceGapSeconds: 3,
  };
}

function registry(tts: TtsPort): Registry {
  return {
    llm: () => {
      throw new Error("no llm adapter");
    },
    tts: () => tts,
    image: () => {
      throw new Error("no image adapter");
    },
    list: () => Promise.resolve([]),
  };
}

describe("a pasted article through Play and the audio stage", () => {
  it("narrates neither end-matter section and stores each as its own file", async () => {
    const deps = storage();
    const image = await upload(deps, "images", "one");

    const { project, stages } = startRun(deps, draft(image, pasted), {});

    const dir = join(deps.paths.projects, project.id);
    // `logic/08` step 1 with `logic/05` §Q37: the narration source is the article's body,
    // as plain text, with both end sections cut away.
    expect(readFileSync(join(dir, "article.txt"), "utf8")).toBe("Rope\n\nRope is twisted fibre.\n");
    expect(readFileSync(join(dir, "sources.txt"), "utf8")).toBe(
      "## Sources Consulted\n\n- https://example.test/rope\n\n",
    );
    expect(readFileSync(join(dir, "glossary.txt"), "utf8")).toBe(
      // The paste is trimmed before it is split, so the last section keeps no trailing
      // blank line the user did not type.
      "## Pronunciation Glossary\n\n- bowline /ˈboʊlɪn/",
    );

    const audio = stages.find((stage) => stage.kind === "audio");
    const context: StageContext = {
      stage: { id: audio?.id ?? "", projectId: project.id, kind: "audio", state: "running" },
      signal: new AbortController().signal,
      emit: (): void => {},
    };
    const bytes = tone();
    const tts = fakeTts({ bytesFor: () => [bytes] });
    await runNarration(
      { ...deps, ffmpeg },
      context,
      stageProviders(
        {
          registry: registry(tts),
          attempts: sqliteAttempts(deps.db, deps.ids),
          clock,
          log: silent,
        },
        context,
      ),
    );

    // §Q69: the IPA is never sent to the TTS, and neither is the sources list.
    expect(tts.seen()).toEqual(["Rope\n\nRope is twisted fibre."]);
    expect(existsSync(join(dir, "audio-body.mp3"))).toBe(true);
  });
});
