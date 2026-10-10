import { videoState } from "./gone.js";

// Runs in Studio's own page (`world: "MAIN"`, before Studio's scripts), with Studio's fetch
// kept as it was before Studio's own scripts could wrap it.
const fetched = window.fetch.bind(window);

// A tab the extension opened to check the videos on YouTube ("#slopify-gone"): the content
// script asks for each video's state, and the edit page is read here, as Studio's own page
// with its sign-in. Read from the content script's own world, Studio answered as if signed
// out, and no deleted video was ever noticed.
const checking = (() => {
  try {
    return (
      location.hash.includes("slopify-gone") ||
      (sessionStorage.getItem("slopify.task") ?? "").includes("slopify-gone")
    );
  } catch {
    return location.hash.includes("slopify-gone");
  }
})();
if (checking)
  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as { source?: unknown; id?: unknown; videoId?: unknown } | null;
    if (event.source !== window || data?.source !== "slopify-gone-ask") return;
    const { id, videoId } = data;
    if (typeof id !== "string" || typeof videoId !== "string" || !/^[\w-]{11}$/.test(videoId))
      return;
    const answer = (state: string): void =>
      window.postMessage({ source: "slopify-gone-answer", id, state }, location.origin);
    fetched(`/video/${videoId}/edit`, { credentials: "include" })
      .then(async (response) =>
        answer(response.ok ? videoState(await response.text(), videoId) : "unknown"),
      )
      .catch(() => answer("unknown"));
  });
