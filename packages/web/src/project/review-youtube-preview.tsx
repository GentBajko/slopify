import type { Output } from "@app/slices/storage/model.js";
import type { ReactElement } from "react";
import { playerTime } from "@/components/kit/player";
import { thumbnailProblem } from "./review-thumbnail.js";
import { useOutputMediaList } from "./revision-media.js";

// The thumbnails the size YouTube shows them: a home-feed card (about 360 pixels wide, rounded,
// the length in the corner, the title under it) and a suggested-video row beside a watched
// video (168 pixels, the title beside it). Text and faces that read at 168 pixels read
// everywhere. The channel line is a placeholder; only the picture and the title are the video's.
export function YouTubePreview({
  thumbnails,
  title,
  durationMs,
  portrait,
}: {
  readonly thumbnails: readonly Output[];
  readonly title: string;
  readonly durationMs: number | null;
  // A 9:16 project's thumbnails are tall; YouTube still crops a long video's to 16:9.
  readonly portrait: boolean;
}): ReactElement | null {
  const files = useOutputMediaList(thumbnails);
  if (thumbnails.length === 0) return null;
  const length = durationMs === null || durationMs <= 0 ? undefined : playerTime(durationMs / 1000);
  return (
    <details className="border-t border-line pt-3">
      <summary className="cursor-pointer text-small font-semibold">
        See {thumbnails.length === 1 ? "it" : "them"} as YouTube shows{" "}
        {thumbnails.length === 1 ? "it" : "them"}
      </summary>
      {portrait ? (
        <p className="m-0 mt-2 text-small text-ink-2">
          YouTube crops a long video&apos;s thumbnail to 16:9, as shown here.
        </p>
      ) : null}
      <ul className="m-0 mt-3 flex list-none flex-col gap-5 p-0">
        {thumbnails.map((output) => {
          const src = files.get(output.id)?.url;
          const problem = thumbnailProblem(
            output.bytes,
            "Press Regenerate on it, or save a smaller copy and upload it in Edit project → Images.",
          );
          const name =
            thumbnails.length === 1 ? "Thumbnail" : `Thumbnail ${String(output.meta.index ?? 1)}`;
          return (
            <li key={output.id} className="flex flex-col gap-2">
              {thumbnails.length === 1 ? null : (
                <span className="sl-kicker text-ink-3">{name}</span>
              )}
              <div className="flex flex-wrap items-start gap-6">
                <figure className="m-0 flex w-[360px] max-w-full flex-col gap-2">
                  <Picture
                    src={src}
                    alt={`${name} in the home feed`}
                    length={length}
                    radius="12px"
                  />
                  <figcaption className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-1 size-9 shrink-0 rounded-full bg-sunken"
                    />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="line-clamp-2 text-body font-semibold text-ink">{title}</span>
                      <span aria-hidden="true" className="h-3 w-40 rounded-control bg-sunken" />
                    </span>
                  </figcaption>
                </figure>
                <figure className="m-0 flex w-[400px] max-w-full gap-2">
                  <div className="w-[168px] shrink-0">
                    <Picture
                      src={src}
                      alt={`${name} as a suggested video`}
                      length={length}
                      radius="8px"
                    />
                  </div>
                  <figcaption className="flex min-w-0 flex-col gap-1">
                    <span className="line-clamp-2 text-small font-semibold text-ink">{title}</span>
                    <span aria-hidden="true" className="h-3 w-24 rounded-control bg-sunken" />
                  </figcaption>
                </figure>
              </div>
              {problem === undefined ? null : (
                <p role="alert" className="m-0 text-small text-danger">
                  {problem}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function Picture({
  src,
  alt,
  length,
  radius,
}: {
  readonly src: string | undefined;
  readonly alt: string;
  readonly length: string | undefined;
  readonly radius: string;
}): ReactElement {
  return (
    <div
      className="relative aspect-video w-full overflow-hidden bg-screen"
      style={{ borderRadius: radius }}
    >
      {src === undefined ? null : (
        <img src={src} alt={alt} className="size-full object-cover" loading="lazy" />
      )}
      {length === undefined ? null : (
        <span className="absolute right-1 bottom-1 rounded-[4px] bg-black/80 px-1 text-label font-semibold text-white tabular-nums">
          {length}
        </span>
      )}
    </div>
  );
}
