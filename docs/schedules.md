# Schedules

A schedule runs a saved template at a local time. Each run takes the first topic in its queue.

## Topics and their keywords

A topic fills the keyword chosen under **Each topic fills** (such as `{{Topic}}`). Every other
keyword of the template has an every-run value, and a topic can set its own value for any of
them, which wins for that one run. The template's keywords are those its project title names
plus those it stores a value for. The queue can be written three ways, and switching keeps
everything:

- **One per line**: each line is a topic. A line that matches a topic already in the queue keeps
  that topic's own values.
- **Table**: a row per topic, a column per keyword set per topic (**Set a keyword per topic…**
  adds one; its × goes back to the every-run value), and the project title each row makes. A
  blank cell uses the every-run value.
- **YAML / JSON**: a list, one item per topic. An item is a plain topic, or a map of keyword to
  value with the topic under the topic keyword. A JSON array of the same shape works too.

  ```yaml
  - Topic: Tiamat
    Min. Word Count: 12000
  - Vecna
  ```

  Values are read as the text written (`12000`, `yes` and `0012` stay text); a value that is a
  list or a map, a key that is not a template keyword, a map without the topic keyword, and a
  keyword with no every-run value missing from a topic are refused, naming the topic number and
  the key. A list that doesn't read keeps the form from switching mode or saving.

**Copy as YAML** and **Export as YAML** write the queue in that shape. The server checks the same
rules when a schedule is saved: a keyword the template doesn't use, or a topic's value over
2,000 characters, is refused with the topic and key named. Topics saved before this check are
left as they are until edited. The parser and the checks live in
`packages/app/src/slices/schedules/topic-list.ts`, shared by the server and the form.

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
schedule's queued, held, rejected and used topics and every project's title. Suggestions are
ranked most view-worthy first and checked against those titles, dropping near-duplicates:

- texts equal after normalising (accents dropped, lower case, punctuation to spaces, `&` as
  "and"), or
- word sets overlapping by at least **0.6** (Jaccard, filler words and a plural "s" ignored), or
- one's words all inside the other's and covering at least **half** of it ("Tiamat" and
  "Tiamat's Lair" are one video; "Red Dragons" and "Blue Dragons" are two), or
- every word of the topic inside a project's title ("Vecna" and "D&D Lore: Vecna").

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

Each run carries `renderedTitle`, the project title it will get (built as the run builds it),
or null while its topic waits for approval or generation.

API: `GET /api/calendar?from=&to=` (at most 92 days; four weeks from now by default),
`POST /api/schedules/:id/topics/move` `{baseVersion, from, to}`,
`POST /api/schedules/:id/topics/transfer` `{baseVersion, index, targetId, position?}`,
`GET /api/schedules/:id/topics/held`, `POST …/topics/held/:topicId/approve` `{title?}`,
`POST …/topics/held/:topicId/reject`, `PUT …/topics/held/:topicId` `{title}`,
`POST …/topics/held/approve-all`, `POST …/topics/generate`.
