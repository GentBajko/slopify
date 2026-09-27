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

### Changing the queue in place

The picked schedule's detail on **Calendar → Schedules** lists its queued topics under **Queued
topics**: type a topic in **New topic** and press Enter to add it at the end, edit a topic in its
field and press Enter (or click away) to rename it, and use the arrows and the cross to move or
remove it. Each change is saved at once and its notice carries **Undo**. Only the queue changes
(`PUT /api/schedules/:id/topics`, `replaceTopics` in `slices/schedules/topics.ts`): the next run,
the cadence and every other setting stay as they are, and a topic's own keyword values travel
with it. A new or renamed topic is checked against the template like a saved form; one already
queued is not checked again. A schedule that changed meanwhile (a run just took a topic) refuses
the change and the list shows the latest. **Edit** keeps the full form for the table and YAML ways
and for a topic's own keyword values.

The every-run keywords in the form are the same keyword list Play, Edit project and templates
draw, each with the line saying what it feeds ("Feeds Project title · Article"), read from the
template's saved prompts.

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

**Calendar** (in the rail, at `/calendar`) shows four weeks, Monday to Sunday, from this
week's Monday: every scheduled run with the title it will make (or whether it waits for
approval or a generation), projects running or finished on their day, and the batch queue. It
shows the channel picked in the rail, or every channel.

- **Weeks** (the default) and **List** switch the view; the choice is kept per browser.
- Drag a topic to another day of its schedule to change when it runs, or onto another
  schedule's run to move it into that schedule's queue at that place. Without a mouse: focus a
  topic and press Alt+← or Alt+→, or use the list view's Earlier, Later and **Move to…**.
  A drop the calendar can't carry out (a day with no run, a run with no queued topic) says why.
- **Needs you**, above the weeks, lists the projects in the range that wait for the person
  (failed, paused, held at a review checkpoint, or an automatic review's failed item waiting for
  Overrule or Redo) with **Open to fix / continue / review**, then the finished videos ready to
  upload (not marked uploaded, not a bundled sample) with **Prepare upload**. On its day, a
  project says the same, or "Waiting for Codex limits (resets at 14:00)".
- The **Batch queue** is only here now (Projects no longer repeats it): each queued video in
  its order, running now, waiting its turn, or paused (which holds the queue).
- **Add to calendar** puts topics typed one per line at the end of a schedule's queue.
- **Suggested topics**, beside the weeks, lists what each schedule with topic generation
  suggested, with **Queue** and **Reject** on each and **Queue all**; **Suggest topics now**
  asks for more. **Edit schedules** opens `/schedules`, which sits under the same rail item.

Each run carries `renderedTitle`, the project title it will get (built as the run builds it),
or null while its topic waits for approval or generation. Each project carries, when they
apply, `needs` (`failed`, `paused`, `review`), `readyToUpload: true` and `limitWaits`.

A failed topic generation shows its fix-it beside the error (on the calendar and on Schedules):
a signed-out CLI gets Copy sign-in command and Check again, which asks for topics again once the
CLI is signed in; a rejected key links to Settings → Providers.

API: `GET /api/calendar?from=&to=` (at most 92 days; four weeks from now by default),
`POST /api/schedules/:id/topics/move` `{baseVersion, from, to}`,
`POST /api/schedules/:id/topics/transfer` `{baseVersion, index, targetId, position?}`,
`GET /api/schedules/:id/topics/held`, `POST …/topics/held/:topicId/approve` `{title?}`,
`POST …/topics/held/:topicId/reject`, `PUT …/topics/held/:topicId` `{title}`,
`POST …/topics/held/approve-all`, `POST …/topics/generate`.
