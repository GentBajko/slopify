---
scenario: style-preview
screens: [02-play, 03-project]
depends_on: [11-video-assembly, 17-subtitles, 28-shorts, 29-video-editing]
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 1cf1516f5b35
paths_covered:
  - ":(top)packages/app/src/slices/style-preview/**"
  - ":(top)packages/app/src/assets/style-preview/**"
  - ":(top)packages/app/src/edge/http/style-preview.ts"
  - ":(top)packages/web/src/video/style-preview.tsx"
  - ":(top)packages/web/src/video/style-preview-api.ts"
  - ":(top)packages/web/src/play/preview-image.ts"
  - ":(top)packages/web/src/project/edit-preview-image.ts"
---

# Style preview

A local render of six seconds of the bundled sample project, drawn with the caption and Look settings of a Play draft or a project edit, or in the Shorts layout. No provider is called (`packages/app/src/slices/style-preview/render.ts:17-22`).

## Trigger & preconditions

- Surfaces that mount `StylePreview` (`packages/web/src/video/style-preview.tsx:56`):
  - Play, when `form.sources.video === "generate"` and `form.sources.images !== "off"` (`packages/web/src/routes/play.tsx:501-518`). Captions mode is forced to `off` when narration is off (`packages/web/src/routes/play.tsx:508`).
  - Play's Shorts rail, through `shortsPreviewOf` (`packages/web/src/play/stage-rails.tsx:384-386`, `packages/web/src/play/shorts.tsx:38-50`).
  - Edit project, only while the Subtitles section is open and the project has a video (`packages/web/src/project/revision-form.tsx:740-758`).
  - Edit project's Shorts settings (`packages/web/src/project/revision-shorts.tsx:118-121`).
- The component renders by itself 600 ms after it mounts or after any setting changes (`packages/web/src/video/style-preview.tsx:48`, `:142-148`). "Render again" sends `force: true` (`packages/web/src/video/style-preview.tsx:185-198`).
- Endpoint: `POST /api/style-preview` validated by `stylePreviewRequestSchema`; `GET /api/style-preview/:file` streams the mp4 (`packages/app/src/edge/http/style-preview.ts:18`, `:42`; mount `packages/app/src/edge/http/app.ts:216`).
- The service exists only when `main.ts` wires it with ffmpeg, the data-folder cache directory and the picture reader (`packages/app/src/main.ts:622-627`). No authority check: any caller of the local API may render.

## Steps

1. The browser serializes the request (format, subtitles mode/fontId/fontSize/position, optional `videoEdit`, non-blank `previewText`, optional `image`, optional `shorts`) to a string so an equal object never triggers a second render (`packages/web/src/video/style-preview.tsx:78-104`). It checks the request against the same schema before sending (`:105-108`).
2. Request limits (`packages/app/src/slices/style-preview/schema.ts:30-57`): `fontId` ≤160 chars `[A-Za-z0-9_-]`; `fontSize` 16–120; `previewText` ≤200 (`stylePreviewTextMax`, `:13`); `shorts.speed` 1–1.25; `shorts.title` ≤100 (`shortTitlePreviewMax`, `:17`). `image` is one of `upload` (staged file id), `output` (output id) or `picture` (cast picture sha256) (`:23-27`).
3. The server resolves `image` to bytes with `previewPictures` (`packages/app/src/slices/style-preview/images.ts:30-45`):
   - `picture`: the channel image blob by sha256 (`:52-53`).
   - `upload`: the staged file, only when its state is `staged` (`:54-58`).
   - `output`: the project output, only when its role is `reference`, `image`, `thumbnail` or `short_image` (`:28`, `:59-63`).
   - Files of 0 bytes or over 40 MiB are skipped (`:25`, `:67-71`). Only PNG, JPEG or WebP magic bytes pass (`:73-80`). The picture's sha256 is computed from its bytes (`:40`).
4. `normalizeStylePreview` reduces the request to only what changes pixels (`packages/app/src/slices/style-preview/settings.ts:48-120`):
   - Caption text: whitespace collapsed; empty text or `defaultPreviewText` ("Every story begins with a word.", `schema.ts:16`) becomes the sample narration's own words (`settings.ts:55-56`).
   - Video layout: `captions` only when mode is `burn-in`, font size rounded (`:85-93`); the Look (`vignette`, `grain`, `grade`, `atmosphere`) from `videoEditOf` (`:94-99`); `transition` null for `cut`, else seconds clamped to `transitionSecondsMin`–`transitionSecondsMax` (non-finite → 0.6) and rounded to tenths (`:100-116`); `chapterCard` with the caption font only when chapter cards are on (`:117`).
   - Shorts layout: format forced to `9:16`, `captions`/`transition`/`chapterCard` null, the Look taken from `legacyVideoEdit` (none) (`:58-72`); `short.title` is the trimmed title, `sampleShortTitle` when blank, or null when `titleOnScreen` is false (`:76`); speed clamped 1–1.25 and rounded to hundredths (`:77`).
   - `image` holds the resolved picture's sha256 only when one was found (`:79`, `:118`).
   - `version: 2` is part of the settings (`:19-21`).
5. `stylePreviewHash` = sha256 of `stableJson(settings)`, which sorts object keys and drops `undefined` (`settings.ts:123-136`).
6. `createStylePreviews.render` (`packages/app/src/slices/style-preview/service.ts:92-111`):
   - If a render for the same hash is in flight, the caller gets that promise (`:96-97`).
   - Else, without `force`, an existing non-empty `<hash>.mp4` is answered with `cached: true` (`:98-105`).
   - Else it renders: the picture (if any) is written beside the work file with mode 0600, the renderer writes `<hash>.<uuid>.part.mp4` under a 120 s `AbortSignal.timeout`, which is then renamed to `<hash>.mp4`; the part and picture copy are always removed (`:63-83`).
7. Renderer `ffmpegStylePreview` (`packages/app/src/slices/style-preview/render.ts:63-82`):
   - Images: the picture three times if given, else the bundled `tall-1..3.jpg` for 9:16 or `wide-1..3.jpg` for 16:9 (`:69-74`; assets `packages/app/src/slices/style-preview/narration.ts:40-49`, files in `packages/app/src/assets/style-preview/`).
   - Video layout: `planRender` with `imageSeconds` 2 (`stylePreviewSeconds / 3`), zero gap/edge, default zoom and motion; a "Chapter one" card at 2 s when chapter cards are on; frame 480×270 (16:9) or 270×480 (9:16); the sample narration as body audio (`render.ts:46-51`, `:99-126`). Burned captions are the ASS script from `previewCues` in the resolved font at the full-size `subtitleFrame`, which libass scales (`:127-142`). Encoding is `renderSlideshow` (`:143-153`).
   - Shorts layout: `renderShort` over the 6 s sample narration with `previewWords(text)`, the bold variant of the caption font, the headline, the speed and the preview frame (`:161-191`).
8. Caption timing (`previewWords`, `settings.ts:153-194`): the sample text keeps its aligned word times (`narration.ts:13-26`). Any other text is spread over the narration's phrases (a gap of 0.7 s or more starts a phrase, `settings.ts:147`); each phrase takes words in proportion to its spoken length, words evenly spaced within it, times rounded to milliseconds; with no phrases a single 0.4–5.6 s phrase is used (`:166`).
9. After a fresh render, the cache is pruned to the 200 newest `<hash>.mp4` files by mtime (`service.ts:43-44`, `:115-128`).
10. Reply: `{hash, url: /api/style-preview/<hash>.mp4?v=<mtime ms>, cached, seconds}` with `Cache-Control: no-store` (`packages/app/src/edge/http/style-preview.ts:22-29`). `seconds` is 6, or `6 / speed` rounded to ms for a short (`settings.ts:139-143`).
11. `GET /:file` accepts only `^[a-f0-9]{64}\.mp4$`, and serves the file with byte ranges, `content-type: video/mp4`, `cache-control: no-cache` (`style-preview.ts:14`, `:42-56`).
12. The browser shows only the latest request's answer in a `Player` 270 px wide (portrait) or 480 px (landscape), posted with the picture it is drawn on (`packages/web/src/video/style-preview.tsx:113-140`, `:200-208`). A summary line names the caption font/size/position, or "a separate file" for `files` mode, "off" otherwise, and "Drawn on …" when a picture is used (`:151-169`, `:224-227`).

## Branches

- Picture choice in Play (`packages/web/src/play/preview-image.ts:10-33`): the uploaded establishing image when images are generated and the reference is `provide`d; else the first cast member with a ready picture whose name the title or template values mention (`castMentions`); else the first cast member with a ready picture; else sample stills.
- Picture choice in Edit project (`packages/web/src/project/edit-preview-image.ts:10-32`): the selected, available `reference` output when the config has a reference; then the same cast rules.
- Shorts layout versus video layout: presence of `shorts` in the request (`settings.ts:58`, `render.ts:75-77`). The Shorts preview request always uses `burn-in`, size 48, `bottom` and the caption font (`packages/web/src/play/shorts.tsx:41-42`); a speed outside 1–1.25 in the form is left out (`:45-47`).
- Cached versus rendered versus joined in flight: step 6.
- Caption mode `files` or `off`: no captions are drawn (`settings.ts:85-93`).

## Unhappy paths

| Case | Behavior | Cite |
|---|---|---|
| Service not wired | 503 "…started without its video renderer. Restart Slopify, then press Render again." | `packages/app/src/edge/http/style-preview.ts:20`, `:59-66` |
| Request fails schema | 400 problem from `onInvalid` | `packages/app/src/edge/http/problem.ts:78-90` |
| Invalid request in the browser (e.g. font size outside 16–120) | No request is sent; "Render again" is disabled; the page says the preview renders again once the size is 16–120 | `packages/web/src/video/style-preview.tsx:143`, `:186-191`, `:219-223` |
| Caption font gone | `font-missing` → 409 with "Choose another font under Subtitles" | `render.ts:196-200`, `style-preview.ts:32-33` |
| ffmpeg not startable / ENOENT | `ffmpeg-missing` → 503 with "Install ffmpeg, or use the Docker image" | `render.ts:201-205`, `style-preview.ts:32-33` |
| Any other render error | Logged `style-preview.render`; `render-failed` → 500 naming Download diagnostics | `render.ts:206-210` |
| Render exceeds 120 s | Aborted by the timeout signal; surfaces as one of the failures above | `service.ts:41-42`, `:78` |
| Render finishes without a file | Plain `Error` ("…finished without writing its video"), rethrown past the handler | `service.ts:85-87`, `style-preview.ts:31` |
| Named picture missing, not a picture, too large or unreadable | Sample stills are used; the hash omits `image` | `images.ts:34-44`, `settings.ts:79` |
| Saved preview pruned or never made | GET 404 "…keeps only the most recent ones. Press Render again" | `style-preview.ts:43-50` |
| Browser failure message empty | "The style preview couldn't render. Press Render again." | `packages/web/src/video/style-preview.tsx:130-136` |
| Setting changes mid-render | The previous fetch is aborted; a late reply from a superseded request is ignored | `packages/web/src/video/style-preview.tsx:115-129`, `:149` |
| Same hash requested concurrently | Joins the in-flight promise; one ffmpeg run | `service.ts:50`, `:96-97`, `:106-110` |
| Prune fails | Logged `style-preview.prune` at warn; reply is unaffected | `service.ts:123-127` |

A server-side render is not cancelled when the browser aborts its fetch: the server's signal is only the 120 s timeout (`service.ts:78`).

## State transitions

No database row is written. The only state is files under `<dataDir>/cache/style-preview/` (`service.ts:15-17`): absent → `<hash>.<uuid>.part.mp4` (rendering) → `<hash>.mp4` (saved) → removed by prune. The browser component moves `idle → pending → ready | failed` (`packages/web/src/video/style-preview.tsx:50-54`).

## Invariants

- Equal pixel-affecting settings always map to one hash and one file (`settings.ts:15-17`, `:123-136`).
- A reply URL's `v` query is the file mtime, so a re-rendered file is never played from a stale browser copy (`service.ts:23-24`, `style-preview.ts:26`).
- Only finished previews persist; part files and copied pictures are removed on success and failure (`service.ts:71-83`).
- No provider call, no project mutation (`render.ts:17-22`).

## Outcomes & side effects

- Success: an mp4 of about 100 kB saved in the cache folder (`service.ts:43`), and the player shows it.
- Visibility: the cache directory is created with mode 0700 (`service.ts:68`); any caller of the local API that knows a hash can GET its mp4 (`style-preview.ts:42-56`).
- The cache folder is referenced only by `stylePreviewDir` (`service.ts:16`); storage usage, cleanup and backups do not name it (no other source reference to `cache/style-preview`).

## Dimensions not in play

- D1 Authority: no per-user check; the local API is open to its caller.
- D5 Money: nothing is charged; no provider is called.
- D7 Time: no expiry; retention is the 200-file count cap, not age.
- D9 Lifecycle: no domain entity changes state.
- D13 Notification: no event or notification is emitted.
- D14 Effects on others: previews are shared across projects by hash (`service.ts:10-11`); no other entity is touched.
- D15 Record and audit: only error/warn log lines (`render.ts:206`, `service.ts:124`).
