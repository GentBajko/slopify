## 2026-09-27 - feat: the calendar shows what needs you, limit waits everywhere, fix-it buttons, free space per project
key: feat/every-day-after

- Calendar: each project carries what it needs from the person (failed, paused, a review checkpoint or a failed automatic review) and whether its video is ready to upload; a Needs you list above the weeks acts on them (Open to fix / continue / review, Prepare upload). The batch queue is only on the calendar now (numbered, paused shown); Projects no longer repeats it. Edit schedules still opens `/schedules`.
- CLI limits: the project listing and the calendar carry `limitWaits`; the project page, Home's Running now, the Projects row and the calendar all say "Waiting for Codex limits (resets at 14:00)".
- Fix-its: a signed-out CLI gets Copy sign-in command and Check again, which probes that CLI alone (`POST /api/providers/health?provider=`) and retries the step once it is signed in. Schedule topic-generation failures and cast picture failures get the same fix-its; Home's Needs you copies the sign-in command.
- Storage: a finished project's page offers "Free 1.2 GB: keep the outputs, drop the working files" with a confirmation (`GET /api/storage/projects/:id`); hidden for bundled samples, running or waiting projects and when nothing is left to drop.
