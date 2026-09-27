# Trash

Deleting something in Slopify does not remove it at once. Deleted projects, prompts, intros and outros, templates and schedules go to the trash for 30 days, where you can put them back or remove them for good.

**Where to find it:** Settings → **Trash**.

## What goes to the trash

| Kind | Shown as | Deleted from |
| --- | --- | --- |
| Project | Project | Projects (the delete button on a project's row, then **Delete project**) |
| Library prompt | Prompt · *type* (for example Prompt · article) | Library → Prompts |
| Intro or outro | Intro or Outro | Library → Intros & Outros |
| Template | Template | Templates |
| Schedule | Schedule | Schedules |

As soon as an item is in the trash it disappears from every list, picker, lookup, the calendar and the batch queue, and its name is free for a new item right away.

Each row in the trash shows the item's name, its kind, when it was deleted and how many days are left, for example "Project · deleted *date* · 30 days left". On its last day it says "removed for good today".

## Restore an item

1. Open Settings → **Trash**.
2. Find the item under **Deleted items**.
3. Press **Restore**.

It comes back as it was. A few kinds have their own rules:

| Item | What happens on restore |
| --- | --- |
| Prompt, intro/outro or template whose name was taken meanwhile | It comes back as "Name (restored)", then "Name (restored 2)" and so on. The message says which name it got. A renamed template gets a new version. |
| Project that was waiting its turn (a queued batch item, or held at a checkpoint) | It was held while in the trash and picks up where it was. |
| Schedule | It comes back **paused**, with no next run. Press **Resume** on Schedules to run it again. |
| Schedule whose template is also in the trash | Restore the template first (it is listed in the trash too), then the schedule. |
| Schedule whose template was removed for good | It cannot be restored: it has nothing to run. **Delete now** removes it from the trash. |

## Delete an item for good

1. Open Settings → **Trash**.
2. Press **Delete now** on the item.
3. Confirm with **Delete for good**, or press **Keep it**.

What the confirmation says:

- **Project**: "The project and every file it produced are removed from disk. This cannot be undone." The project's folder is removed first, then its records.
- **Schedule**: "The schedule leaves the trash and cannot be restored. Its run history stays on Schedules."
- **Anything else**: "It is removed for good. This cannot be undone." A prompt or intro/outro goes with its History.

There is no button to empty the whole trash at once; each item is deleted on its own, or left for the daily clean-up.

## Retention: the 30-day clean-up

Anything in the trash for more than 30 days is removed for good by a daily clean-up, the same way as **Delete now**. Slopify checks hourly whether a day has passed since the last clean-up, so a computer that was asleep catches up. If one item cannot be removed (for example a project folder another program has open), it stays in the trash for the next pass and the rest still go.

A project's disk space is freed only when it leaves the trash. Settings → **Storage** counts deleted projects still in the trash. See [Where Your Files Live](Where-Your-Files-Live).

## What cannot be deleted

| Situation | What to do |
| --- | --- |
| A project that is still running | Open the project and use **More project actions → Cancel the run…** first. On Projects the delete button says "Cancel the run first, then delete it." |
| A template that a schedule (not in the trash) uses | Delete that schedule first. |

## Messages you may see

| Message | Fix |
| --- | --- |
| "This project is still running. Use Cancel run on the project page first, then try again." | Cancel the run, then delete. |
| "Some of this project's files could not be removed. Close any program using files in the project folder, then press Delete now again." | Close the file manager, player or editor that has the folder open, then press **Delete now** again. |
| "This schedule's template is in the trash too. Restore the template first (it is listed here), then restore the schedule." | Restore the template, then the schedule. |
| "This schedule's template was removed for good, so the schedule has nothing to run. It cannot be restored; Delete now removes it from the trash." | Use **Delete now**. |
| "This item is no longer in the trash: it was restored or removed for good. Reload Settings → Trash to see what is left." | Reload the page. |

## Tips

- Delete what you do not need with **Delete now** when you want the disk space back at once.
- A deleted schedule's past runs stay listed on Schedules even after it is removed for good.

## Related pages

- [Home and Projects](Home-and-Projects)
- [Where Your Files Live](Where-Your-Files-Live)
- [Prompts](Prompts)
- [Intros and Outros](Intros-and-Outros)
- [Templates](Templates)
- [Schedules](Schedules)
- [Settings Reference](Settings-Reference)
