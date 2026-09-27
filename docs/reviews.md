# Automatic reviews

A reviewer model can check each finished item before the run moves on: the **article**, every
**image**, the **narration**, the **thumbnail** and every **short**. It answers pass or fail with
its reasons, and the verdict is shown beside the item on the project page.

Set them up on Play's **Review** step (under the review checkpoints) or in **Edit project →
Reviews**, and templates keep them. Each stage has its own mode:

- **Off**: no review (the default, and what every older project has).
- **Flag only**: a failed item is marked, with the reasons, and the run carries on.
- **Flag and redo**: a failed item is made again and reviewed again, up to **Redos per item**
  (2 unless you set 0-5). After that the item is kept and flagged: it never loops.

What each review looks at:

| Stage | Checks |
|---|---|
| Article | the article prompt's rules (length, structure, tone), no invented lore, no repeated sections; the research notes are included |
| Images | malformed hands or bodies, stray text or letters, matches its brief, matches the establishing image when one is on |
| Narration | nothing missing or garbled compared with the text: the reviewer reads what the word timing heard and the stretches it could not hear |
| Thumbnail | readable at phone size, clear subject |
| Shorts | the short's images at phone size: clear subject, no stray text, fits the title |

Each stage uses a built-in reviewer prompt, or a **Review** prompt from the Library.

## Reviewer

Any text model can review the article and the narration. The picture reviews (images,
thumbnail, shorts) need a reviewer Slopify can show pictures to, and Play refuses the run
otherwise:

- **Claude Code**: the pictures are copied into a private folder that becomes the CLI's
  working directory, and only its Read tool is allowed (`--restricted` confines it to that
  folder). The answer is used only when the run's tool calls show every picture was opened.
- **Codex**: each picture is attached with `--image` (`codex exec --help`: "Optional image(s)
  to attach to the initial prompt"); the `view_image` tool stays off.
- The **Gemini CLI** has no image flag, and the **OpenRouter** adapter sends text only, so
  neither reviews pictures.

Each review is one text-model call, counted in Usage and in the estimate like the others. A
redo is not in the estimate: it costs what the item cost, at most the redos allowed.

## On the project page

Beside the article, the narration, the thumbnail and each short, and on each image tile:
**Review passed**, **Flagged by review**, **Being made again** or **Accepted by you**, with the
reasons. For a failed item:

- **Overrule** accepts it as it is.
- **Redo** makes it again the way Re-run section does (a new version of the project, then the
  item and what depends on it are rebuilt), and it is reviewed again.

## How it runs

A review is a step of its own (`review:<item>`), planned, cached and fingerprinted like any
other: reviewing the same output with the same reviewer and prompt again reuses the verdict.
Everything that uses a reviewed item waits for its review, the automatic twin of a review
checkpoint; while a redo is starting, that work is held the same way a checkpoint holds it.
With every review Off nothing is added and no existing step changes.
