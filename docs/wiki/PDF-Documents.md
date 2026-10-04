# PDF Documents

Slopify can lay out your article as a styled PDF: a title page with the thumbnail as its cover, a table of contents, the article with drop caps, a sources page and an optional closing page. It is drawn on your computer in the theme you pick, needs no provider and costs nothing.

**Where to find it:** Play → **Outputs** row → **Document**. On a finished project: the **Document** section of the project page, and Edit project → **Inputs** → **Stages** → **Document theme**.

## Make a PDF

1. On Play, open the **Outputs** row.
2. In the **Document** rail, switch the source from **Off** to **Generate**.
3. Pick a **Theme**: the built-in **Plain**, or one of your own themes from Library → PDF themes.
4. Start the run.

The Document stage runs after the article (and the thumbnail, if there is one) is ready. A thumbnail that failed or was canceled doesn't hold it back: the PDF is then laid out without a cover. It needs an article with some text; an empty article stops the stage with a message pointing you to Edit project → Article.

## Options

| Option | What it does | Default |
|---|---|---|
| **Document** source | **Generate** lays out a PDF of the article and title on this computer, in the theme you pick. It needs no provider and costs nothing. | Off |
| **Theme** | How the PDF looks: the built-in **Plain** theme, or one of yours from **Library → PDF themes**. **Edit themes** opens the list. | Plain, or the channel's document theme |

A theme of yours is copied into the project when you pick it. Editing the theme later leaves this project alone until you pick it again, so a PDF already made or queued never changes by surprise. A channel's brand kit can set a **Document theme** for its videos whose template picks none; see [Channels](Channels).

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

Otherwise the title page has no cover and the details sit in the theme's usual place. That includes a thumbnail step that failed or was canceled: the PDF is made anyway, without a cover. If you make the thumbnail later, the PDF is marked outdated, so you can remake it with the cover. If the thumbnail file can't be read, the Document stage stops and asks you to regenerate or upload the thumbnail again, then use **Try again** on Document.

### Sources

Sources come from two places:

1. The article's own section headed **Sources Consulted** (any heading level, or a bold line). Ask for it in your Article prompt with exactly that heading.
2. Links in the research notes, when research is on, that the article's list doesn't already have.

When there are no sources, the Sources page is left out.

## The Plain theme

Plain is the one built-in theme: an unbranded A4 page on a warm off-white background, headings in dark blue, the Cinzel typeface for body and headings, a three-line drop cap after headings, a table of contents and a sources page, no closing page.

To change fonts, colours, paper size (A4 or Letter), page parts and the closing page, make your own theme. See [Document-Themes](Document-Themes).

## Open and download the PDF

On the project page, the **Document** section shows the theme's name (for example **Plain theme**) and, once the PDF is made:

- **Open PDF** opens it in a new browser tab.
- **Download PDF** saves the file to your computer.

While the stage runs it says "The PDF will be saved when rendering finishes." The file lives in the project's folder; see [Where-Your-Files-Live](Where-Your-Files-Live).

## Change the theme of a finished project

1. Open the project and press **Edit project**.
2. Open **Inputs**. Under **Stages**, set the Document source to Generate if it was Off.
3. Pick a **Document theme**.
4. Save. The rebuild review lists the PDF to be made again; it costs nothing.

## Tips

- Use Library → PDF themes' live preview to try a theme on a sample article before you pick it for a project.
- If a PDF has no cover, check that the project has a thumbnail and that it is a PNG, JPEG or WebP image.
- Want the sources page filled? Make sure your Article prompt asks for a "Sources Consulted" section, and consider turning on research.

## Related pages

- [Document-Themes](Document-Themes)
- [Play-Outputs](Play-Outputs)
- [Channels](Channels)
- [Project-Page](Project-Page)
- [Editing-a-Project](Editing-a-Project)
- [Play-Title-and-Article](Play-Title-and-Article)
