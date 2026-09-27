# Narration that reads like speech

The narration is spoken from the article, but an article is written to be read. A table, a
figure, an equation or a program read aloud cell by cell or symbol by symbol is noise, so
the narration treats them differently.

## Describe tables and figures in the narration

Play → Narration → Audio Advanced, and Edit project → Providers. On by default for new runs and
templates; a project saved before the setting is unchanged until you turn it on.

With it on, the article is walked block by block (`packages/app/src/slices/narration/blocks.ts`)
instead of flattened to plain text:

| Block | What the narration says |
|---|---|
| Paragraphs, headings | their words; link text without its address, no footnote markers ([1], [^1]) or bare URLs |
| Lists | ordered lists as "First, … Then, … Finally, …"; short bullet points as "a, b and c"; longer ones as sentences (English only; other languages hear each item as a sentence) |
| Blockquotes | the quoted words, in quotation marks |
| Tables | a 1–4 sentence description: the pattern and the notable values, never row by row |
| Figures (Markdown or HTML images) | what the figure shows, from its alt text, caption and legend; the picture itself too when the project has an uploaded image by that file name and the text model can look at pictures (Claude Code, Codex) |
| Mermaid and ASCII drawings | what the diagram connects or compares |
| Equations (`$$…$$`, `\[…\]`, `$…$`) | what the equation means ("evaporation grows with temperature and falls with humidity"); a single short symbol such as `$T$` is read as written |
| Code | a one- or two-sentence summary of what it does; **Leave code out** drops code instead |

Footnote definitions, the Sources Consulted section and the Pronunciation Glossary are never
narrated, exactly as before (`article/split.ts` cuts the end matter off first).

Each described block is its own text-model step, `narration:describe:<n>` in reading order,
in the Narration stage. Its request is the block, a built-in instruction for its kind, the
heading it sits under, the project language, and the run's Narration Preparation prompt as
style guidance. Answers are cached by that request: an unchanged block is never described
again. While the article is still being written one `narration:describe:future` step stands
in for them and the estimate says the count is not known yet; for a provided article the
estimate counts one call per block.

The answers replace their blocks in the narration text, and everything after runs on that
spoken text: chunking, Narration Preparation, pronunciation, aliases, the TTS requests, the
captions and the word timing. The article, the PDF and the reading view keep the real table.

On a multi-voice run a block inside a speaker's turn is described within that turn, so the
same voice says the description; turns without a block keep their requests.

Turning it on in Edit project costs one text-model call per block and speaks again the
narration chunks that contain a block (all of it when Chunking is the whole article). Off, or
absent, plans exactly what the project planned before the setting existed; the fingerprints
are pinned in `rebuild/recipe-describe.test.ts`. It needs a text model: without one the
narration flattens the article as before.

## Show tables and figures on screen

Play → Video and style, and Edit project → Video → Cuts and look; offered while the narration describes
tables and figures. On by default for new runs and templates, stored only when on, so a
project saved before it renders the video it always did.

Each described block also becomes a card (`figure:card:<n>`, Images stage), drawn on this
computer by the bundled ffmpeg with libass (`packages/app/src/slices/video/figure-card.ts`),
at no cost:

- a figure: the article's own picture when the project has an uploaded image with the file
  name the article uses, fitted over its caption; otherwise its caption, large;
- a table: a clean grid, header in the accent colour over a rule, numbers right-aligned; a
  table too tall to read at 1080p is cut with "…and N more rows";
- code and diagrams: a monospace face (DejaVu Sans Mono where installed) with simple syntax
  colouring;
- an equation: set as readable text (Greek letters, powers and indices, fractions as a/b);
  there is no offline TeX renderer in the app.

Cards use the channel brand kit's title font and colour (the caption font otherwise) on the
3.0 graphite ground with lime accents, in the video's format, and also upright (9:16) when a
16:9 project makes Shorts.

The export finds each description's words in the word timing (`video/figure-spans.ts`) and
shows the card from 0.3 s before the description starts to 0.3 s after it ends
(`video/plan.ts`, `figureFrames`); gaps under a second go to the card. The images take turns
around the cards, keeping their order and motion. A Short whose clip includes a description
shows the upright card for that stretch. The cards are listed under Images → From the article,
where Regenerate makes one again.
