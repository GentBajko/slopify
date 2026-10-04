# Play Title and Article

The article is the script of your video: the narration reads it, the captions show it, the chapters come from its headings and the PDF lays it out. On Play you either have a text model write it from a prompt, or paste your own. This page covers the **Title and keywords** row, the **Article** row (article source, prompt, text generation and research) and the intro and outro that wrap the article.

**Where to find it:** Play → **Title and keywords** row and **Article** row → **Change**. The intro and outro are under Play → **Narration** → **Change** → **More audio settings**.

## Title and keywords

The title and the topic are typed at the top of Play. The **Title and keywords** row holds the rest:

| Field | What it does | Limit |
| --- | --- | --- |
| **Title pattern** | Shown when the title names a keyword in double braces, like `History: {{Topic}}`. Change the pattern here; the topic values stay at the top of Play. | 200 characters |
| Each keyword | A value a picked prompt or the title asks for with `{{name}}`. Typed once, it fills every place that names it; the line under it lists where. | 200 characters, one line |

The row's summary says how many keywords the setup has. Keywords come from the title and from every prompt you pick (article prompt, image prompts, thumbnail prompt and so on), so the list grows as you pick prompts. Every keyword must be filled before the run can start ("Fill in this field.").

For title patterns, topics and queuing more videos, see [Play Overview](Play-Overview#title-title-pattern-and-topic).

## Choose where the article comes from

The Article row starts with a **Source** switch:

| Source | What happens | Cost |
| --- | --- | --- |
| **Generate** (default) | The text model writes the article from the article prompt, in one call. | One text-model call |
| **Provide** | Slopify narrates the text you paste, word for word. No text model writes one. | No text-model cost for the article |
| **Off** | No article at all, for a project of images or a thumbnail made from prompts. Choosing it switches off what reads the article (research, narration, captions, the YouTube description, shorts, the PDF, Scenes from the article) and takes those sections out of Play; the thumbnail offers From prompt and Provide only. | Nothing |

The article is what the narration reads and what the PDF lays out.

### Generate an article from a prompt

1. Open the **Article** row and leave **Source** on **Generate**.
2. Pick an **Article prompt**. These are the article prompts saved in the Library, with their keywords filled in.
3. Optional: press **View prompt** to read the prompt's text.
4. Fill in any keywords the prompt asks for in the **Title and keywords** row.
5. Pick the text model under **Text generation** (below).

If you have no article prompts yet, the row says "No article prompts saved. Create a prompt to begin." Press **Create prompt** to open a new article prompt in the Library. Your draft is saved first. See [Prompts](Prompts).

When the narration uses several speakers with **Write a script**, the field becomes **Script prompt**: a Script prompt asks for speaker turns instead of a plain article. See [Multiple Voices](Multiple-Voices).

### Paste your own article

1. Open the **Article** row and set **Source** to **Provide**.
2. Paste the text into **Article text**.
3. Check the count under it (words and characters). About 150 words is one minute of narration.

Include everything that should be read, headings too. Headings become chapters. Research is turned off when the article is provided: the row says "Research is Off because the article is provided."

## Text generation

One text model writes everything this run needs in words: the article, the research, the thumbnail's image prompt, intro and outro entries set to LLM, Narration Preparation, table and figure descriptions, the YouTube description and picking shorts. Each is a separate call, counted in usage.

The **Text generation** section appears whenever the run needs a text model, in the row of the first thing that needs it, and its line says what it is used for. It is under **Article** when the article or research is written for you; under **Narration** when only the narration needs it, such as an audiobook whose speakers are worked out from a book you pasted; and under **Outputs** when only the YouTube description, the shorts or the thumbnail prompt need it. There is one text model per run, wherever it shows. **Settings** beside it opens Settings, where you set the default for new drafts.

| Option | What it does | Default |
| --- | --- | --- |
| **LLM** | Who runs the text model: a command-line tool you are signed in to, such as Claude Code or Codex, or a keyed service such as OpenRouter, billed per token. A greyed provider says why it cannot be used; fix it under Settings. | Your Settings default |
| **Text model** | The model the provider runs for every text step. Bigger models write better and cost more per token. | Your Settings default |
| **Thinking** | How long the model reasons before it answers, for models that offer it. Higher levels can write more carefully but take longer and use more tokens. | **Model default** |

Notes on the pickers:

- Changing **LLM** clears the model, so pick a model again.
- The refresh button beside **Text model** asks the provider for its current list.
- **Custom ID** lets you type a model the list does not show. **Use list** goes back to the list.
- **Thinking** only appears when the model offers levels. It lists **Model default** and the levels the model supports, from **Off**, **Low**, **Medium**, **High**, **Xhigh**, **Max** and **Ultra**.

If no text model is picked but the run needs one, the row shows "Choose a text (LLM) provider and model." See [Providers and Keys](Providers-and-Keys), [AI CLIs](AI-CLIs) and [Models](Models).

## Research

Research gives the text model notes to write from, beyond what it already knows. It has its own **Source** switch under the Article row:

| Source | What happens | Cost |
| --- | --- | --- |
| **Off** (default) | The article is written from the prompt alone. | Nothing extra |
| **Generate** | The text model plans chapters, researches each one on the web and combines the notes before the article is written. The row reads "Runs through the LLM, one agent per chapter". | One call to plan, one per chapter, one to combine |
| **Provide** | Uses notes you paste in **Research notes**. Nothing is looked up. | Nothing extra |

### Research on the web

1. Set the Research **Source** to **Generate**.
2. Make sure the text model can search the web. A model that cannot fails the Research stage straight away, rather than falling back to what it already knows.
3. Start the run. You can watch the notes being written on the project page's live view.

### Give your own research notes

1. Set the Research **Source** to **Provide**.
2. Paste facts, sources and quotes the article should draw on into **Research notes**.

The notes are given to the text model with the article prompt, in place of web research.

## Expected article words

**Expected article words per video** sits in the right rail under the estimate. It tells Slopify how long you expect each generated article to be, which drives the cost estimate and how many images **More images for long videos** adds. Once the article is written, its real length is used. Default 1500, range 1 to 100,000. Set it to roughly what your article prompt asks for.

## Intro and outro

An intro is read before the article and an outro after it. Both are Library entries, picked in the Narration row under **More audio settings**.

| Option | What it does | Default |
| --- | --- | --- |
| **Intro** | A Library entry read before the article. A text entry is read as written; an LLM entry is written by the text model for each video, one extra call. | Off |
| **Outro** | A Library entry read after the article, such as a sign-off. Text or LLM, as above. | Off |

1. Open the **Narration** row and press **Change**.
2. Open **More audio settings**.
3. Pick an **Intro** and an **Outro**, or leave them **Off**.
4. Optional: set **Silence between segments** in the **Video and style** row to change the quiet between the intro, the article and the outro (Settings has the default, 3 seconds).

The channel's brand kit can fill the intro and outro when you leave them at their default. With several speakers, the main **Voice** in the Narration row reads the intro and outro. Uploaded narration (**Provide**) must already include any intro and outro. Write entries in the Library; see [Intros and Outros](Intros-and-Outros).

## What the row summary says

Folded, the Article row shows the prompt, the provider and model, and the research source, for example `History article · Claude Code · sonnet · research off`, or **Your article** when you pasted one. A row that is missing something shows **Needs setup** and the reason, such as "Pick an article prompt." or "Paste the article."

## Tips

- Ask for a Pronunciation Glossary at the end of your article prompt if the topic has unusual names. See [Play Narration](Play-Narration#pronunciation-glossary).
- Use **Review the whole setup** → **Read the resolved prompt** to see the article prompt exactly as it will be sent, keywords filled in.
- A Review prompt can check the article after it is written. See [Reviews and Checkpoints](Reviews-and-Checkpoints).
- To change the article after the run, edit it on the project page. See [Editing a Project](Editing-a-Project).

## Related pages

- [Play Overview](Play-Overview)
- [Prompts](Prompts)
- [Intros and Outros](Intros-and-Outros)
- [Models](Models)
- [Providers and Keys](Providers-and-Keys)
- [AI CLIs](AI-CLIs)
- [Multiple Voices](Multiple-Voices)
- [Other Languages](Other-Languages)
