# Document Themes

A document theme is the look of the PDF Slopify makes from the article: paper size, colours, fonts, spacing, the title page, contents, sources and closing pages, headers and page numbers. Slopify ships a built-in **Plain** theme. Copy it to make themes of your own, with a live preview as you edit.

**Where to find it:** **Library → Documents**. Pick a theme on Play's **Document** row, in **Edit project**, or as a channel's default in its brand kit.

## Built-in and your own themes

| List | What it holds |
|---|---|
| **Built-in themes** | Looks that ship with Slopify and can't be changed. **Plain** is an unbranded flat page and what a new project gets. Press **Copy theme** to make an editable copy. |
| **Your themes** | Themes you made or copied. Each has **Edit**, **Duplicate** and **Delete**. |

A project keeps its own copy of the theme's settings. Editing or deleting a theme never changes a PDF already made or queued.

## Make a theme

1. Open **Library → Documents**.
2. Press **New theme** (it starts from Plain), or pick a built-in theme and press **Copy theme**, or press **Duplicate** on one of your themes.
3. Type a **Name** (up to 80 characters). This is what the Document row on Play and Edit project shows.
4. Open the groups on the left and change what you like (every setting is listed below). The first two groups start open.
5. Watch the **Preview** on the right. It lays out a sample article with this theme using the same renderer that makes a project's PDF, redrawn about half a second after you stop typing. It runs on your computer and costs nothing.
6. Press **Save**. If a setting is out of range it is highlighted, and Save says "Fix the highlighted settings first."

## Use a theme

- **On Play:** open the **Document** row (the PDF output) and pick the theme. See [PDF documents](PDF-Documents).
- **On a finished project:** open **Edit project** (the **Edit settings** button), pick the theme under **Document theme**, save, and remake the document.
- **For a channel:** set **Document theme** in the channel's brand kit. Videos whose template picks no theme get it. See [Channels](Channels).

## Delete a theme

Press **Delete** on the theme and confirm. Projects that used it keep their own copy of its settings. A channel whose brand kit named it skips it.

## Every setting

Sizes are in millimetres (mm) unless marked pt (points; 1 pt is about 0.35 mm). Defaults are the Plain theme's.

### Page

| Setting | What it does | Default | Range |
|---|---|---|---|
| **Paper size** | A4 (210 × 297 mm) for most of the world, US Letter (216 × 279 mm) for the US and Canada. | A4 | |
| **Margins** | Blank space on every edge of each page. Wider margins mean shorter lines and more pages. | 22 mm | 5 to 60 |
| **Text starts at** | How far from the top the text begins on pages with the running header. Raise it when text crowds the header. | 32 mm | 5 to 80 |
| **Background** | **Parchment texture** stretches an aged-paper picture over every page. **Flat colour** fills each page with the Page colour, slightly darker at the edges. | Flat colour | |
| **Page colour** | The page colour with Flat colour. Type a hex code or use the picker. | `#fdfaf3` (warm off-white) | |

### Colours

| Setting | What it colours | Default |
|---|---|---|
| **Heading colour** | Headings, drop caps, the brand name and links | `#1f3a5f` (dark blue) |
| **Body text colour** | Paragraphs, lists, bold and italic text. Keep it dark against the page. | `#1a1a1a` (near black) |
| **Muted colour** | Dates, bullets, quotes and the dotted lines on the contents page | `#555555` (mid grey) |
| **Faint colour** | The running header and page numbers | `#888888` (light grey) |

### Fonts

Each font has three controls: the family, its weight or italic, and **Letter spacing (mm)** from −0.5 to 2. The families are **Cinzel** (bundled; four weights, no italics), **Literata** (bundled; a text face made for long reading, in regular, bold, italic and bold italic) and **Times**, **Helvetica** and **Courier** (built into every PDF reader).

| Setting | Where it is used | Default |
|---|---|---|
| **Body font** | Paragraphs and lists | Cinzel Regular, 0.01 mm |
| **Bold text font** | Bold words in paragraphs | Cinzel Bold, 0.02 mm |
| **Italic text font** | Italic words in paragraphs (Cinzel has no italics, so this borrows Times) | Times Italic, 0 mm |
| **Heading font** | The article's headings and the contents, sources and closing page titles | Cinzel Bold, 0.02 mm |
| **Chapter numbers and brand font** | The big number in a heading like "Chapter 3:" and the brand name on the title page | Cinzel Black, 0.03 mm |
| **Tagline and link font** | The tagline and linked line on the title page, and the link and closing line on the closing page | Cinzel Medium, 0.015 mm |
| **Drop cap font** | The large first letter after a heading | Cinzel Black, 0 mm |
| **Header and page number font** | The running header and page numbers | Times Regular, 0 mm |

### Text sizes

| Setting | What it sizes | Default | Range |
|---|---|---|---|
| **Title size** | The article's title on the title page | 22 pt | 6 to 72 |
| **Brand size** | The brand name on the title page (only shown with a brand name) | 31 pt | 6 to 72 |
| **Top-level heading size** | Top-level headings and the contents, sources and closing page titles | 19 pt | 6 to 72 |
| **Second-level heading size** | Headings inside a top-level section | 17 pt | 6 to 72 |
| **Third-level heading size** | Third-level and deeper headings | 13 pt | 6 to 72 |
| **Body size** | Paragraphs, lists and closing page text. Bigger text means more pages. | 10.5 pt | 6 to 24 |
| **Date and word count size** | The date, word count and link lines under the title | 10 pt | 5 to 24 |
| **Header and page number size** | The running header and page numbers | 9 pt | 5 to 24 |

### Spacing

| Setting | What it does | Default | Range |
|---|---|---|---|
| **Body line height** | Distance from one body line to the next | 8 mm | 3 to 20 |
| **Heading line height** | Between the lines of a wrapping top- or second-level heading | 11 mm | 3 to 30 |
| **Subheading line height** | Between the lines of a wrapping third-level heading | 9 mm | 3 to 30 |
| **After a paragraph** | Extra space after each paragraph, as a share of a body line (0.5 is half a line) | 0.5 | 0 to 3 |
| **Before a heading** | Extra space above each heading, as a share of a body line | 1 | 0 to 5 |
| **After a list item** | Extra space after each bulleted or numbered item | 0.2 | 0 to 3 |
| **List indent** | How far lists are pushed in from the left margin | 6 mm | 0 to 30 |
| **Quote indent** | How far quotes are pushed in | 8 mm | 0 to 40 |
| **Divider width** | The width of the short centred line a `---` in the article becomes | 30 mm | 0 to 150 |

### Drop caps

| Setting | What it does | Default | Range |
|---|---|---|---|
| **Drop caps** | Starts the first paragraph after each heading with a large letter spanning several lines, as in printed books. | On | |
| **Drop cap lines tall** | How many body lines the letter spans | 3 lines | |
| **Drop cap letter size** | The letter's size as a multiple of the lines it spans | 3 | 1 to 5 |
| **Gap beside the drop cap** | Space between the letter and the text beside it | 4 mm | 0 to 20 |
| **Shortest paragraph** | A paragraph shorter than this many characters starts plainly | 50 | 0 to 2000 |
| **Room needed** | With less than this share of the page left, a paragraph starting with a drop cap moves to the next page (0.25 is a quarter) | 0.25 | 0 to 1 |

### Title page

| Setting | What it does | Default | Range |
|---|---|---|---|
| **Brand from top** | Where the brand name sits, from the top edge | 60 mm | 10 to 200 |
| **Tagline below brand** | Distance from the brand name down to the tagline | 10 mm | 0 to 60 |
| **Title from top** | Where the article's title sits, from the top edge | 80 mm | 10 to 250 |
| **Title line height** | Between the lines of a wrapping title | 10 mm | 3 to 40 |
| **Details below title** | Distance from the title to the date and word count, when there is no cover picture | 20 mm | 0 to 100 |
| **Details line height** | Between the date, word count and link lines | 10 mm | 3 to 30 |
| **Show the date** | Prints "Written on" and the date the PDF was made | On | |
| **Show the word count** | Prints the article's word count | On | |
| **Thumbnail as cover** | Puts the project's thumbnail between the title and the date, when there is one | On | |
| **Space around cover** | Space above and below the cover picture | 6 mm | 0 to 40 |
| **Cover height at most** | The tallest the cover may be; it keeps its shape and shrinks when needed | 110 mm | 20 to 200 |

### Branding

| Setting | What it does | Default |
|---|---|---|
| **Brand name** | Your channel or brand, printed large at the top of the title page and before the title in the running header ("Brand \| Title"). Empty shows no brand. | Empty |
| **Tagline** | A short line under the brand name. Empty hides it. | Empty |
| **Website** | The address the brand name and the title-page link open when clicked in the PDF. | Empty |
| **Link text** | The words of a linked line under the word count on the title page; it opens Website. Empty hides the line. | Empty |

### Contents page

| Setting | What it does | Default | Range |
|---|---|---|---|
| **Contents page** | Adds a table of contents after the title page, each entry a link to its page | On | |
| **Contents page title** | The heading of the contents page (up to 300 characters) | Table of Contents | |
| **Lists headings down to** | Top level only, second level, or third level. Deeper lists can add a page. | Second level | |
| **Contents title position** | From the top margin to the contents title | 20 mm | 0 to 100 |
| **First entry position** | From the top margin to the first entry | 40 mm | 0 to 150 |
| **Contents line height** | From one entry to the next | 8 mm | 3 to 30 |
| **Indent per level** | How much further each deeper level is indented | 5 mm | 0 to 30 |

### Header and footer

| Setting | What it does | Default | Range |
|---|---|---|---|
| **Running header** | Prints "Brand \| Title" at the top of every page after the title page | On | |
| **Header from top** | From the top edge to the header | 15 mm | 3 to 60 |
| **Header title at most** | A longer title is cut short in the header to fit one line | 35 characters | 5 to 200 |
| **Page numbers** | Prints a page number at the bottom of every page after the title page | On | |
| **Page number text** | The words around the number; `{page}` becomes the number, so `Page {page}` prints "Page 4" | `Page {page}` | |
| **Page number from the bottom** | From the bottom edge to the page number | 10 mm | 3 to 60 |
| **Space kept above page number** | Space kept free above the number so body text stops short of it | 15 mm | 0 to 60 |

### Sources page

| Setting | What it does | Default | Range |
|---|---|---|---|
| **Sources page** | Adds a page listing the web links the article and its research used, each clickable | On | |
| **Sources page title** | Its heading (up to 300 characters) | Sources Consulted | |
| **Sources title position** | From the top margin to the title | 20 mm | 0 to 100 |
| **Sources list position** | From the top margin to the first source | 40 mm | 0 to 150 |
| **Sources line height** | Between the lines of one source | 8 mm | 3 to 30 |
| **Gap between sources** | Extra space between sources | 2 mm | 0 to 20 |

### Closing page

| Setting | What it does | Default | Range |
|---|---|---|---|
| **Closing page** | Adds a last page with your own text, such as an about section or a thank-you | Off | |
| **Closing page title** | Its heading (up to 300 characters) | About | |
| **Closing page text** | One line per row, up to 60 lines of 300 characters. A line starting with `•` becomes a muted bullet, one ending with `:` a bold label, an empty line a gap. | Empty | |
| **Add date, word and page counts** | Adds a Document Details list: date written, total words and total pages | On | |
| **Closing page link** | A clickable line after your text: **Link text** and **Link address**. Without an address the words show without a link. | Off | |
| **Closing line** | A last line, such as a sign-off, in the decorative font. Empty leaves it out. | Empty | |
| **Closing title position** | From the top margin to the title | 20 mm | 0 to 100 |
| **Closing text position** | From the top margin to the first line | 40 mm | 0 to 150 |

### PDF details

These appear in a PDF reader's document properties, not on the pages.

| Setting | What it does | Default |
|---|---|---|
| **PDF author** | The author shown in the properties. `{title}` becomes the article title. | Empty |
| **PDF subject** | The subject shown in the properties. | `{title}` |
| **PDF keywords** | Search words, usually separated by commas (up to 1,000 characters) | Empty |
| **PDF creator** | The app or person shown as the creator | Empty |

## Tips

- Change one group at a time and watch the preview; it redraws as you type.
- For a book-like PDF, turn on **Parchment texture**, keep drop caps on and raise **Body line height** a little.
- For a plain handout, set Body font to Helvetica, turn drop caps off and set **Lists headings down to** top level.
- Put your channel name in **Brand name** and your site in **Website** so every PDF links back to you.

## Related pages

- [PDF documents](PDF-Documents)
- [Channels](Channels)
- [Library overview](Library-Overview)
- [Play outputs](Play-Outputs)
