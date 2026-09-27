# Fewer clicks: inline topics, inline rename, one keyword list

- Calendar → Schedules: the picked schedule's **Queued topics** can be added, renamed, moved and removed in place; each change saves at once with **Undo** on its notice, and only the queue changes (new `PUT /api/schedules/:id/topics`; the next run and other settings stay).
- Library → Prompts, Intros & Outros and Templates: the pencil beside a name renames it in the row, with Undo. The text stays as it is; a prompt's rename is one History version, a template's a new template version.
- The schedule form's every-run keywords use the shared keyword list with its "Feeds …" line, like Play, Edit project and templates.
- A finished project whose YouTube description is written opens on the YouTube section, so Copy description is one press.
- Toasts can carry one action button (used for Undo).
- `click-budget.test.tsx` counts the clicks of five common tasks against their budgets; the table is in docs/design-system.md under "Fewer clicks".
