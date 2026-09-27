# Buttons mean one thing, links go somewhere, rows are one target

- Every screen uses the kit's five buttons; the 2.x button is gone. The first-run notice and the "Slopify was updated" prompt end in a plain primary button instead of the Play key.
- A link looks like a button only when it is the item's main action or sits in a row of buttons (New prompt, Open to continue, a Library row's Edit and Duplicate, Download PDF); any other link reads as a link (Open, Calendar, Edit schedules, See all patch notes).
- Nothing that acts looks like plain text: a queued video's chip opens its keywords through a quiet button with a pencil, the reason under the Play key sits beside Go to the field, a saved draft is a list row with a Discard button, and the tutorial launcher is an icon button.
- Section headings on the project page, Play, Settings → Providers, the video queue, the document theme editor and the prompt editor use the one section head, with their actions top right.
- Library → Templates has the same row actions as the other Library tabs: Edit (rename, beside its keywords), Duplicate, Use in Play, History (every saved version, compared with the current one, with Restore) and Delete.
- Library → Aliases shows each alias as a list row with its fields under it and a Remove button.
- A press anywhere on a row or tile opens or picks it, not only on its name: Library lists (prompts, intros and outros, templates, document themes), channels, schedules, projects, Home items, calendar entries, samples, saved drafts and media tiles. The row's own buttons keep working on their own.
- A source scan (`kit-rules.test.ts`) fails when a screen writes a button by hand, dresses a link as a button outside the kit, or puts a click handler on a row.
