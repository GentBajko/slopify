# Schedules find their own topics; a calendar of the coming weeks

- A schedule can carry a series brief and generate its next topics with an LLM (the template's or one you pick) whenever fewer than N are queued (default 10): queued directly, or held for approval under Topics waiting with Approve, Edit, Reject and Approve all.
- Generated topics never repeat: the prompt lists every title the schedule queued, held, rejected or used and every project's title, and near-duplicates are dropped (normalised text plus word overlap; see docs/schedules.md).
- One generation per schedule at a time; a failure is shown on the schedule with its reason and retried 5 minutes later. A Notification URL gets "N new topics are waiting for you".
- A schedule with generation on keeps going when its queue empties; a run with no topic is skipped with the reason.
- New Library → Calendar: the next four weeks by day with each run's topic, running and finished projects and the batch queue; move topics up, down or to another schedule. API: `GET /api/calendar`.
