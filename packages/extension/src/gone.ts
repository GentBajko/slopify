// Whether each video Slopify takes to be on YouTube still exists, read from its Studio edit
// page as the signed-in channel sees it. The page carries the video's data for its first
// paint: a video deleted in Studio answers with status VIDEO_STATUS_DELETED, a video this
// channel hasn't got (never there, or long gone) with "CreatorVideoData prefetch failed", and
// any other video (public, private, scheduled) with its details.

export type VideoState = "present" | "deleted" | "missing" | "unknown";

export interface RecordedVideo {
  readonly projectId: string;
  readonly short: number | null;
  readonly videoId: string;
  // The Slopify channel the video was made for, when known.
  readonly channelId?: string | null;
}

export function videoState(html: string, videoId: string): VideoState {
  const at = html.indexOf(`resolve({"videoId":"${videoId}"`);
  if (at >= 0) {
    // The status sits beside the id at the start of the object.
    const head = html.slice(at, at + 400);
    return /"status":"VIDEO_STATUS_DELETED"/.test(head) ? "deleted" : "present";
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
      .filter((one) => one.state === "present" || one.state === "deleted")
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

// Each video's edit page, one after another, from a Studio tab (same origin, signed in).
export async function checkVideos(
  videos: readonly RecordedVideo[],
  load: (videoId: string) => Promise<string>,
): Promise<readonly RecordedVideo[]> {
  const checked: { video: RecordedVideo; state: VideoState }[] = [];
  for (const video of videos) {
    let state: VideoState = "unknown";
    try {
      state = videoState(await load(video.videoId), video.videoId);
    } catch {
      // A page that didn't load says nothing about the video.
    }
    checked.push({ video, state });
  }
  return goneOf(checked);
}
