# PDF Documents

Slopify can lay out your article as a styled PDF: a title page with the thumbnail as its cover, a table of contents, the article with drop caps, a sources page and an optional closing page. It is drawn on your computer in the look you pick, needs no service and costs nothing.

**Where to find it:** Create → **Extras** → **PDF of the article**. On a finished project: the **PDF** section of the project page, and **Edit settings** → **Extras** → **PDF**.

## Make a PDF

1. On Create, open the **Extras** row.
2. Tick **PDF of the article**.
3. Pick a **PDF look**: one of the three ready looks, **Plain**, **Book** or **Modern** (**Preview** shows it), or one of your own PDF looks.
4. Make the video.

The Document stage runs after the article (and the thumbnail, if there is one) is ready. A thumbnail that failed or was canceled doesn't hold it back: the PDF is then laid out without a cover. It needs an article with some text; an empty article stops the stage with a message pointing you to **Edit settings** → **Article**.

## Options

| Option | What it does | Default |
|---|---|---|
| **PDF of the article** | Lays out a PDF of the article and title on this computer, in the look you pick. It needs no service and costs nothing. | Off |
| **PDF look** | How the PDF looks: a ready look (**Plain**, **Book** or **Modern**), or one of your own PDF looks. **Edit PDF looks** opens the list. | Plain, or the channel's PDF look |

A theme of yours is copied into the project when you pick it. Editing the theme later leaves this project alone until you pick it again, so a PDF already made or queued never changes by surprise. A channel's brand kit can set a **PDF look** for its videos whose template picks none; see [Channels](Channels).

## What's in the PDF

In order:

| Part | What it holds |
|---|---|
| **Title page** | The theme's brand name and tagline (if the theme sets them), the video's title, the project's thumbnail as a cover, then the date and word count. |
| **Table of Contents** | Headings from the article, down to the level the theme sets (two levels in Plain), with page numbers. |
| **Body** | The article: headings, paragraphs with a drop cap after headings, bold and italic, links, lists, quotes and rules. |
| **Sources Consulted** | The article's "Sources Consulted" section, then any other web link cited in the research notes. Links stay clickable. |
| **Closing page** | Optional: the theme's own lines, the document's details (written on, total words, total pages), a link and a closing line. Off in Plain. |

Every page after the title page has a running header ("Brand | Title", or the title alone) and a page number in the footer.

### What is left out

- The article's **Pronunciation Glossary** is for the narrator and is never printed.
- The "Sources Consulted" section becomes the Sources page instead of body text.
- A heading at the top that repeats the title is not printed twice.
- Images, raw HTML and footnotes in the article's markdown have no printed form. Tables are printed as rows of cells separated by `|`, and code blocks as plain paragraphs.

### Cover

The title page uses the project's thumbnail as its cover when:

- the project makes or uploads a thumbnail (its Thumbnail source is not Off),
- the thumbnail is a PNG, JPEG or WebP image, and
- the theme's cover setting is on (it is in Plain).

Otherwise the title page has no cover and the details sit in the theme's usual place. That includes a thumbnail step that failed or was canceled: the PDF is made anyway, without a cover. If you make the thumbnail later, the PDF is marked outdated, so you can make it again with the cover. If the thumbnail file can't be read, the PDF stage stops and asks you to make or upload the thumbnail again, then use **Try again** on the PDF.

### Sources

Sources come from two places:

1. The article's own section headed **Sources Consulted** (any heading level, or a bold line). Ask for it in your Article prompt with exactly that heading.
2. Links in the research notes, when research is on, that the article's list doesn't already have.

When there are no sources, the Sources page is left out.

## The ready looks

Three looks come with Slopify, all unbranded A4 pages with a table of contents and a sources page and no closing page:

| Look | What it looks like |
|---|---|
| **Plain** | A warm off-white page, headings in dark blue, the Cinzel typeface for body and headings, a three-line drop cap after headings. What a new project gets. |
| **Book** | The article set like a novel in Literata on a parchment texture, Cinzel headings and drop caps in warm brown. |
| **Modern** | A sans-serif on a white page, blue headings and no drop caps, like a report. |

To change fonts, colours, paper size (A4 or Letter), page parts and the closing page, make your own theme. See [Document-Themes](Document-Themes).

## Open and download the PDF

On the project page, the **PDF** part shows the PDF itself (where the browser can show PDFs) and, beside it:

- **Download PDF** saves the file to your computer.
- **Open in a new tab** opens it in a new browser tab.
- **Open folder** opens the project's folder.

A line under them gives the file's size and the look's name (for example **Plain theme**).

While the stage runs it says "The PDF will be saved when it is made." The file lives in the project's folder; see [Where-Your-Files-Live](Where-Your-Files-Live).

## Change the theme of a finished project

1. Open the project and press **Edit settings**.
2. Open **Extras**. Turn on **PDF of the article** if it was off.
3. Pick a **PDF look**.
4. Press **Save changes**, then **Make the PDF again (free)** (or the title row's next action).

## Tips

- Use the live preview on the PDF looks page (Settings → Production defaults → PDF look → Edit PDF looks) to try a look on a sample article before you pick it for a project.
- If a PDF has no cover, check that the project has a thumbnail and that it is a PNG, JPEG or WebP image.
- Want the sources page filled? Make sure your Article prompt asks for a "Sources Consulted" section, and consider turning on research.

## Related pages

- [Document-Themes](Document-Themes)
- [Create: Extras](Create-Extras)
- [Channels](Channels)
- [Project-Page](Project-Page)
- [Editing-a-Project](Editing-a-Project)
- [Create: Article](Create-Article)
