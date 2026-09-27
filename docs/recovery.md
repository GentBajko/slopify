# When something goes wrong

## Retries that don't need you

Every provider call is tried up to four times within about 40 seconds (2, 8 and 30 second
waits). When those run out on a failure time can fix, the step is not failed: it goes back
to wait and runs again by itself.

- Waited out: rate limits (429 and the providers' own rate-limit errors), timeouts, and a
  dropped call: a connection that never reached the provider or broke mid-answer, a provider
  server error (5xx), or a CLI the system killed mid-run.
- Waits: about 2, 4, 8 and 16 minutes (half an hour in all), each spread by a quarter either
  way so steps that hit the same limit together don't return together, and never shorter than
  the provider's Retry-After. A Retry-After longer than an hour (a daily quota) is reported
  instead.
- Never retried: a refusal by a content filter, a key the provider rejected or none saved, an
  unsupported request, and a lost CLI submission.
- The wait is kept in the database (migration 0030), so a restart keeps it. While it waits
  the project reads as running and the step says "Trying again at 14:05"; Pause holds it.
  Only when the waits are used up does the step fail and say why.

## Done with problems

A failed step stops only the steps that need its output. The video never reads the thumbnail,
so a failed thumbnail leaves the video rendering. A run whose main output was made (the video;
or the narration when there is no video; or the article when there is neither) while another
step failed ends **done with problems**, not failed, and each failed step shows its error and
fix-it button.

## Fix-it buttons

A failed step's fix is the project's next action (docs/design-system.md), in the right rail and
beside the step, in place of a plain Try … again. The mapping lives in one
place, `packages/app/src/slices/fixes/rules.ts`:

| Failure | Button |
| --- | --- |
| A CLI is signed out | Sign in to Codex (or Claude Code, Gemini): the command to run, and Re-check |
| A key was rejected or none is saved | Open Settings → Providers → the provider |
| The disk is full | Free space, which opens Settings → Storage |
| A content filter refused an image prompt | Soften and retry, and Edit prompt |
| A content filter refused any other prompt | Edit prompt |
| The model was retired | Switch model, which opens Edit |

Soften and retry asks the project's AI model to reword each refused image prompt without what a
filter could flag, keeping the scene and style. The new wording streams onto the step as it is
written, the image is drawn from it, and the image keeps it as its prompt.

## Updating while work runs

Pressing Update while a project is being made no longer refuses. The update waits: the button
says "Update to 2.6.0 will install when 'Cleopatra' finishes", and it installs by itself as soon as
no step is running. Pressing it again drops the wait. The Docker launcher does the same before
it replaces the container (see [Docker](docker.md)).

## Keep outputs only

Settings → Storage lists each project's size split into outputs (video, shorts, thumbnail,
article, description, document, subtitles, exported audio) and working files. A finished
project offers **Keep outputs only**, which removes the files its steps made and could make
again: images, narration parts, subtitle timing and render settings, and reports the space it
freed. Outputs from every revision and anything you uploaded are never removed, nor a file no
project record names. Changing the project afterwards (an image, a caption style, the narration,
a re-render) has to make the removed files again first, which the confirmation says before
anything is removed.

A finished project's own page offers the same beside its next action: **Free 1.2 GB: keep the
outputs, drop the working files**, with the outputs' and working files' sizes and the same
confirmation (`GET /api/storage/projects/:id` says what it would free). It is not offered on the
bundled samples, while the project runs or waits, or when nothing is left to drop.
