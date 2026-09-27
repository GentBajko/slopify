# Time left on a running step

Every running step on the project page (Run steps) and on Home (Running now) ends its line with
its time left: "12 of 40 chunks · about 4 min left". It is recomputed every second in the
browser from what the server sends (`slices/eta`), and it only says what it can back up:

- **From progress.** Once the step has counted some of its chapters, chunks or images, the rest
  is estimated from the rate so far.
- **From past runs.** Before anything is counted (a CLI image job can spend minutes on its first
  picture, a video render reports nothing until ffmpeg starts), the estimate is the median time
  the same kind of step took in finished runs, on the same provider and model once there are
  two of those, otherwise on any. A step that counts pieces is scaled by its count: ten images
  take longer than two. The server reads the stage rows' own start and finish times, most
  recent first, and sends `typicalSeconds`, `etaSeconds` and `etaBasis` on each running stage
  of `GET /api/projects/:id`.
- **Taking longer than usual** once a step has run past its usual time.
- **Time left unknown** when there is neither: the first run of a kind of step says so rather
  than guessing.
