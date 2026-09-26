# Held work after a save

- Undoing an edit, or restoring an earlier version, no longer queues a step again that had already finished with exactly the same settings: the save picks up the finished result, and its output reads as ready instead of outdated.
- Saving several times while a step waits for Resume keeps one waiting copy of that step instead of adding a new one on every save.
- While narration chunks land, the steps waiting on them (joining the audio, subtitle timing, the export and the YouTube description) take the new inputs in place instead of getting a fresh row per chunk. On a long narration this used to leave dozens of never-run rows behind, one every few seconds, each marked finished although it never ran.
- A stage whose remaining work is waiting for Resume now says "Waiting for Resume" on the project page instead of "Waits for the stages above".
