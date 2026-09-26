import { readFileSync } from "node:fs";
import { readDocumentAssets } from "./fonts.js";
import { type RenderedDocument, renderDocument } from "./render.js";
import type { DocumentTheme } from "./theme.js";

// What the Library theme editor previews: a short article with every kind of block the
// renderer styles (levels of heading, a drop-cap paragraph, emphasis, a link, a list, a
// quote, a rule and a sources list), a stand-in cover and a fixed date, so only the theme
// changes between previews.
const title = "The Lighthouse at Grey Point";

const article = `# ${title}

The lighthouse at Grey Point has warned ships off the northern reef for nearly two centuries, and its keepers kept **careful logs** of every storm, wreck and *strange light* seen from the gallery. Most of those logs survive in the [county archive](https://example.com/archive), and they read like a slow, patient novel.

## Chapter 1: The First Keepers

The first keeper arrived in the spring with a wife, two children and a crate of lamp oil that was meant to last the winter. It lasted six weeks, and the rest of that season was lit by whale oil bought from passing boats at ruinous prices.

- The tower was finished in 1834
- The lamp was replaced twice before 1900
- The last keeper left in 1961

> The sea does not care what the light costs.

### A note on the logs

Entries are short, written in pencil, and nearly always begin with the wind.

## Chapter 2: The Automatic Light

When the light was automated, the cottage stood empty for thirty years. Walkers still report seeing a lamp in its window on winter evenings, although the power was cut long ago and the door has been bricked up since the last survey.

---

The tower is open to visitors on summer weekends.

## Sources Consulted

- [County Archive: Grey Point Logs](https://example.com/logs)
- Coastal Lights of the North, second edition
`;

const cover = new URL("../../assets/document/sample-cover.jpg", import.meta.url);

export function renderSampleDocument(theme: DocumentTheme): RenderedDocument {
  return renderDocument({
    title,
    articleMarkdown: article,
    researchNotes: null,
    cover: new Uint8Array(readFileSync(cover)),
    theme,
    writtenOn: new Date("2026-01-15T12:00:00Z"),
    assets: readDocumentAssets(),
  });
}
