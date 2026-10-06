// Whether each video Slopify takes to be on YouTube still exists, read from its Studio edit
// page as the signed-in channel sees it. The page carries the video's data for its first
// paint: a video deleted in Studio answers with status VIDEO_STATUS_DELETED, a video this
// channel hasn't got (never there, or long gone) with "CreatorVideoData prefetch failed", an
// upload left as a draft with a draftStatus other than DRAFT_STATUS_NONE, and any other video
// (public, private, scheduled) with its details.

export type VideoState = "present" | "draft" | "deleted" | "missing" | "unknown";

export interface RecordedVideo {
  readonly projectId: string;
  readonly short: number | null;
  readonly videoId: string;
  // "filled" while Slopify only saw the upload start, "done" once it is on YouTube.
  readonly uploadState?: "filled" | "done";
  // The Slopify channel the video was made for, when known.
  readonly channelId?: string | null;
}

export function videoState(html: string, videoId: string): VideoState {
  const at = html.indexOf(`resolve({"videoId":"${videoId}"`);
  if (at >= 0) {
    // The status sits beside the id at the start of the object.
    const head = html.slice(at, at + 400);
    if (/"status":"VIDEO_STATUS_DELETED"/.test(head)) return "deleted";
    // The draft status follows the title and description, so the whole object is read.
    const draft = /"draftStatus":"([A-Z_]+)"/.exec(html.slice(at, at + 200_000))?.[1];
    return draft === undefined || draft === "DRAFT_STATUS_NONE" ? "present" : "draft";
  }
  return html.includes("CreatorVideoData prefetch failed") ? "missing" : "unknown";
}

// The videos to forget. A missing one counts only when the same check found another video of
// the same channel, so Studio signed in to another channel, or signed out, forgets nothing.
export function goneOf(
  checked: readonly { readonly video: RecordedVideo; readonly state: VideoState }[],
): readonly RecordedVideo[] {
  const seen = new Set(
    checked
      .filter((one) => one.state === "present" || one.state === "draft" || one.state === "deleted")
      .flatMap((one) => (one.video.channelId == null ? [] : [one.video.channelId])),
  );
  return checked
    .filter(
      (one) =>
        one.state === "deleted" ||
        (one.state === "missing" && one.video.channelId != null && seen.has(one.video.channelId)),
    )
    .map((one) => one.video);
}

// Uploads Slopify only saw start that Studio has scheduled or published: the upload dialog's
// confirmation was missed (closed early, or the next short opened), and they are on YouTube.
export function confirmedOf(
  checked: readonly { readonly video: RecordedVideo; readonly state: VideoState }[],
): readonly RecordedVideo[] {
  return checked
    .filter((one) => one.state === "present" && one.video.uploadState === "filled")
    .map((one) => one.video);
}

// Each video's state, one after another, as Studio's page reads it (`export-hook.ts`).
export async function checkVideos(
  videos: readonly RecordedVideo[],
  stateOf: (videoId: string) => Promise<VideoState>,
): Promise<{
  readonly gone: readonly RecordedVideo[];
  readonly checked: readonly { readonly video: RecordedVideo; readonly state: VideoState }[];
}> {
  const checked: { video: RecordedVideo; state: VideoState }[] = [];
  for (const video of videos) {
    let state: VideoState = "unknown";
    try {
      state = await stateOf(video.videoId);
    } catch {
      // A page that didn't load says nothing about the video.
    }
    checked.push({ video, state });
  }
  return { gone: goneOf(checked), checked };
}
