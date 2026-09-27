# Schedules

A schedule runs a saved template at a local time. Each run takes the first topic in its queue.

## Topics that find themselves

Under **Edit → Topic generation** a schedule can ask an LLM for its next topics:

- **Series brief**: what the channel covers, its style and what makes a topic worth watching.
- **New topics**: *Off* (you add them), *Generate and queue directly*, or *Generate and hold for
  approval*. Held topics appear under **Topics waiting** on the schedule, with Approve, Edit and
  Reject on each row and **Approve all**. A Notification URL (Settings) gets
  "5 new topics are waiting for you".
- **Keep at least N queued** (default 10). Held topics count toward N, so nothing more is asked
  while they wait for you.
- **LLM**: the template's own, or any provider and model.

When the queue (plus held topics) drops below N, the next tick (every 15 s) starts one
generation in the background. The prompt carries the brief and every title already known: the
schedule's queued, held, rejected and used topics, every project's title, and the titles on
its channel's **Existing videos** tab (see [Channels](channels.md)). Suggestions are
ranked most view-worthy first and checked against those titles, dropping near-duplicates:

- texts equal after normalising (accents dropped, lower case, punctuation to spaces, `&` as
  "and"), or
- word sets overlapping by at least **0.6** (Jaccard, filler words and a plural "s" ignored), or
- one's words all inside the other's and covering at least **half** of it ("Tiamat" and
  "Tiamat's Lair" are one video; "Red Dragons" and "Blue Dragons" are two), or
- every word of the topic inside a project's or existing video's title ("Vecna" and "D&D
  Lore: Vecna").

Only one generation per schedule runs at a time (a lease on the schedule row, taken over after
15 minutes if Slopify died mid-call). A failure is shown on the schedule with its reason and
retried on the first tick 5 minutes later, not in a loop; **Generate topics now** retries at
once and saving the schedule clears the wait. A schedule with generation on keeps going when its
queue empties; a run that finds no topic is skipped with the reason instead of running the
template without one.

## Calendar

**Library → Calendar** lists the next four weeks by day: every scheduled run with the topic it
will use (or whether it waits for approval or a generation), projects running or finished, and
the batch queue. Up and down move a topic within its schedule's queue; **Move to…** puts it on
another schedule's queue.

API: `GET /api/calendar?from=&to=` (at most 92 days; four weeks from now by default),
`POST /api/schedules/:id/topics/move` `{baseVersion, from, to}`,
`POST /api/schedules/:id/topics/transfer` `{baseVersion, index, targetId, position?}`,
`GET /api/schedules/:id/topics/held`, `POST …/topics/held/:topicId/approve` `{title?}`,
`POST …/topics/held/:topicId/reject`, `PUT …/topics/held/:topicId` `{title}`,
`POST …/topics/held/approve-all`, `POST …/topics/generate`.
