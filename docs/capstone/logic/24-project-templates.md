---
absorbed_from: features/2026-09-10-project-templates@2026-09-13
generated_date: 2026-09-13
---

# Project templates

Templates are named, versioned snapshots of a Play setup. They preserve selected stages,
providers and models, prompt and intro/outro bodies, keyword defaults, output styling,
chunking, subtitles, format and checkpoint locations. Credentials, executable paths,
font operations, execution receipts, generated outputs and media bytes never enter a
template.

## Trigger & preconditions

The user chooses Save a setup on Templates or Save as template on a project with an acknowledged
Play draft or current revision. A template name and the selected source revision are required.

## Steps

1. Resolve the selected prompt and entry bodies and store them with the setup snapshot.
2. Persist a version-one template head, or advance an existing head while retaining prior revisions.
3. On Apply, create a new Play draft with copied defaults and fresh attachment identities.
4. Return the new draft to Play for explicit Review and Start.

## Save

The Templates screen can save an acknowledged Play draft. A project header can save its
current revision directly. Saving resolves the selected library bodies into a snapshot and
does not start work or rebuild the project. A template head is immutable; editing it creates
another revision while prior revisions remain readable.

## Branches

Project conversion captures the selected current revision's setup and source text. Draft templates
capture the acknowledged Play document. Both routes omit execution state and never dispatch work.

## Apply

Apply creates a new Play draft with a new id and records the template revision as provenance.
The draft owns a copy of the document, keeps keyword placeholders and defaults, and starts
without Review or Start state. Provided-file references receive fresh attachment identities
and are marked for reattachment. Applying never admits a project or calls a provider.

The Play review path checks the frozen prompt and entry bodies before live library rows, so a
deleted or edited library item cannot silently change an existing template. Current provider,
model compatibility and font availability are checked during Review; provider, model and voice
readiness is checked again at Start and reports the same focused field errors as an ordinary Play
draft.

## Unhappy paths

Template create, update, delete and instantiate operations use typed problem details. Create,
update and project conversion retain request identities for safe retries; stale template or
project revisions return a conflict. Deleting a template removes only its rows: existing
drafts, projects and runs retain their snapshots. A lost Apply response can be retried with
the same draft id, and a delayed Apply cannot replace a newer Play selection or navigation.

## State transitions

Template heads move from version N to N+1 on update; prior revisions remain readable. Applied drafts
start active and unreviewed, with provided attachments in reattach state. A stale version or source
revision remains unchanged and returns a conflict.

## Invariants

1. Template mutations never start a runner or rebuild a project.
2. Every applied draft owns its document and attachment identities.
3. Checkpoint choices may be copied; approvals, fingerprints and released state may not.
4. A project snapshot captures setup and source text from the selected current revision only.

## Outcomes & side effects

Successful saves add local SQLite rows and successful Apply adds one Play draft. No project, runner
attempt, provider request, output file or approval receipt is created by template operations.

## Dimensions not in play

Templates are local to this installation. Sharing, scheduled execution, credential storage and
media-byte backup are separate release work.

Sources: `packages/app/src/slices/project-templates/`,
`packages/app/src/edge/http/project-templates.ts`, `packages/web/src/templates/`,
`packages/web/src/routes/templates.tsx`, and `packages/web/src/project/save-template.tsx`.
