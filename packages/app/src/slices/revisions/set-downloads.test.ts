import { unzipSync } from "fflate";
import { afterEach, expect, it } from "vitest";
import { versionedName } from "../storage/downloads.js";
import { retainedOutput } from "./downloads.fake.js";
import { findRevisionDownload, revisionSetZip } from "./downloads.js";
import { mutationFixture } from "./mutation.fake.js";

const closes: (() => void)[] = [];
async function fixture() {
  const h = await mutationFixture();
  closes.push(h.close);
  return h;
}
afterEach(() => {
  for (const close of closes.splice(0)) close();
});

it("zips every short, the thumbnails alone, or exactly the picked records", async () => {
  const h = await fixture();
  const revision = h.base.revision;
  const short = (n: number) => {
    const made = retainedOutput(
      h.deps,
      revision,
      "short_video",
      `s${String(n)}.mp4`,
      `short ${String(n)}`,
      `shorts:${String(n)}:render`,
    );
    h.deps.db
      .prepare("UPDATE revision_outputs SET descriptor=? WHERE id=?")
      .run(JSON.stringify({ ...made.row.output, meta: { short: n } }), made.recordId);
    return made;
  };
  const second = short(2);
  short(1);
  retainedOutput(h.deps, revision, "thumbnail", "thumb.png", "thumb");
  retainedOutput(h.deps, revision, "video", "video.mp4", "video");

  const shorts = revisionSetZip(h.deps, h.projectId, revision.id, "shorts");
  if (!shorts.ok) throw new Error(shorts.reason);
  expect(shorts.filename).toBe("saved-shorts.zip");
  expect(Object.keys(unzipSync(shorts.bytes))).toEqual([
    "saved-short-video-1.mp4",
    "saved-short-video-2.mp4",
  ]);

  const thumbnails = revisionSetZip(h.deps, h.projectId, revision.id, "thumbnails");
  if (!thumbnails.ok) throw new Error(thumbnails.reason);
  expect(Object.keys(unzipSync(thumbnails.bytes))).toEqual(["saved-thumbnail.png"]);

  const picked = revisionSetZip(h.deps, h.projectId, revision.id, "shorts", [second.recordId]);
  if (!picked.ok) throw new Error(picked.reason);
  expect(picked.filename).toBe("saved-shorts-selected.zip");
  expect(Object.keys(unzipSync(picked.bytes))).toEqual(["saved-short-video-2.mp4"]);

  // A record of another kind never slips into a set.
  expect(revisionSetZip(h.deps, h.projectId, revision.id, "thumbnails", [second.recordId])).toEqual(
    { ok: false, reason: "no-images" },
  );
});

it("names a remade file by its version so it never takes the previous file's name", async () => {
  const h = await fixture();
  const first = retainedOutput(h.deps, h.base.revision, "video", "a.mp4", "first", "video", false);
  const second = retainedOutput(h.deps, h.base.revision, "video", "b.mp4", "second");
  const older = findRevisionDownload(h.deps, h.projectId, h.base.revision.id, first.recordId);
  const newer = findRevisionDownload(h.deps, h.projectId, h.base.revision.id, second.recordId);
  expect(older).toMatchObject({ ok: true, download: { filename: "saved-video.mp4" } });
  expect(newer).toMatchObject({ ok: true, download: { filename: "saved-video-v2.mp4" } });
  expect(versionedName("t-subtitles-srt.srt", 3)).toBe("t-subtitles-srt-v3.srt");
  expect(versionedName("t-video.mp4", 1)).toBe("t-video.mp4");
});
