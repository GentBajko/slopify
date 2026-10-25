# Create: Article

The article is the script of your video: the narration reads it, the captions show it, the chapters come from its headings and the PDF lays it out. On Create you either have an AI write it from a prompt, or use your own text. This page covers the **Article** row: where the text comes from, the article prompt, **Written by**, research and the language.

**Where to find it:** Create → **Article** row → **Change**. Keywords and the title pattern are in the **Keywords** row; see [Create Overview](Create-Overview#keywords). The intro and outro are in the Narration row; see [Narration](Create-Narration#intro-and-outro).

## Choose where the article comes from

The row starts with an **Article** switch:

| Choice | What happens | Cost |
| --- | --- | --- |
| **Write it for me** (default) | The AI writes the article from the article prompt, in one call. | One AI call |
| **Use my text as written** | Slopify narrates the text you paste, word for word. No AI writes one. | Nothing for the article |
| **Adapt my text** | The AI rewrites the text you paste with the article prompt, for example to shorten it or change its tone. The narration reads what the prompt makes of it. | One AI call |
| **No text** | No article at all, for a set of images or a thumbnail made from prompts. Narration, the PDF and anything else that reads the article stay off. | Nothing |

### Write the article from a prompt

1. Open the **Article** row and leave it on **Write it for me**.
2. Pick an **Article prompt**. Each card shows the prompt's name, its first line and the length it asks for (for example **About 20 min · 2800-3200 words**). With many prompts, a filter box narrows the list.
3. Optional: open **Text of the prompt** to read the picked prompt.
4. Fill in any keywords the prompt asks for (at the top, or in the **Keywords** row).
5. Check the service and model under **Written by** (below).

With no article prompts yet, the row says so with **New prompt ↗ (opens Prompts)**. See [Prompts](Prompts).

When the narration has several speakers and the script is written for them, the field becomes **Script prompt**: a script prompt asks for speaker turns instead of a plain article. See [Multiple Voices](Multiple-Voices).

### Paste your own article

1. Open the **Article** row and pick **Use my text as written**.
2. Paste the text into **Article text**.
3. Check the count under it (words and characters). About 150 words is one minute of narration.

Include everything that should be read, headings too. Headings become chapters. **Text that will be spoken** folds out the words the narrator will say: your text without its end matter (sources and the Pronunciation Glossary are never read), with your narration aliases applied when they are on. Research is off while you use your own text.

### Adapt your own text

Pick **Adapt my text**, paste the source under **Your text**, and pick the **Article prompt** that rewrites it. Your text stays the source; the article prompt decides the length and tone.

## Written by

One AI writes everything this run needs in words: the article, the research, the thumbnail prompt when the AI writes it, intros and outros written for each video, Narration Preparation, descriptions of tables and figures, the YouTube description and picking the shorts. Each is a separate call, counted in Usage.

The **Written by** group appears whenever the run needs an AI writer, in the row of the first thing that needs it, and its line says what it is used for (for example "for writing the article, writing the YouTube description and picking the shorts"). It is in **Article** when the article or research is written for you, in **Narration** when only the narration needs it (an audiobook whose speakers are worked out from a book you pasted, say), and in **Extras** when only the YouTube description, the shorts or the thumbnail prompt need it. There is one writer per run, wherever it shows.

| Option | What it does | Default |
| --- | --- | --- |
| **Service** | Who runs the writer: a tool you are signed in to, such as Claude Code or Codex, or a keyed service such as OpenRouter, billed per token. Each service in the list says when it has **No key** or is **Not found**; fix it under Settings → Keys & services. | The one Settings → Keys & services says Create picks |
| **Model** | The model the service runs for every writing step. Bigger models write better and cost more per token. | The service's default |
| **Thinking** | How long the model reasons before it answers, for models that offer it. Higher levels can write more carefully but take longer and use more tokens. | **Model default** |

Notes on the pickers:

- Changing the service clears the model, so pick a model again.
- **Type a model ID…** at the end of the model list lets you type one the list does not show.
- The line under the model says whether it was checked (for example **Works · checked 2 min ago**), with **Manage models ↗** to Settings → Models.
- **Thinking** only appears when the model offers levels.

If the run needs a writer and none is picked, the row says to pick a service and model. See [Keys and Services](Providers-and-Keys), [AI CLIs](AI-CLIs) and [Models](Models).

## Research

Research gives the writer notes to write from, beyond what it already knows. It has its own **Research** switch in the Article row:

| Choice | What happens | Cost |
| --- | --- | --- |
| **Off** (default) | The article is written from the prompt alone. | Nothing extra |
| **Let the AI research** | The AI plans chapters and looks each one up on the web before it writes. | A few more AI calls: one to plan, one per chapter, one to combine |
| **Paste my notes** | Uses notes you paste in **Research notes**. Nothing is looked up. | Nothing extra |

### Research on the web

1. Set **Research** to **Let the AI research**.
2. Make sure the model can search the web. A model that cannot fails the Research step straight away, rather than falling back to what it already knows.
3. Make the video. You can watch the notes being written in the project's **Progress**.

### Give your own research notes

1. Set **Research** to **Paste my notes**.
2. Paste the facts, sources and quotes the article should draw on into **Research notes**.

The notes are given to the writer with the article prompt, in place of web research.

## Language

**Language** at the end of the row picks the language the article, narration, YouTube description and shorts titles are written in. **Channel's language** uses the channel's. The line under it says what is written and timed in that language. See [Other Languages](Other-Languages).

## Expected length

**Expected length** in the rail tells Slopify how long you expect each article to be, which drives the cost estimate and how many images **More images for long videos** adds. Once the article is written, its real length is used. Set it to roughly what your article prompt asks for. See [Create Overview](Create-Overview#expected-length).

## What the row says

Folded, the Article row says what will happen, for example `Written by Claude Code CLI (Sonnet 5.5) from the “History · Documentary” prompt, with web research.`, or `Your own text, used as written.` What is still missing follows, such as "No article prompt picked yet."

## Tips

- Ask for a Pronunciation Glossary at the end of your article prompt if the topic has unusual names. See [Narration](Create-Narration#pronunciation-glossary).
- **See everything this run will do** → **The prompts as they will be sent** shows the article prompt exactly as it goes out, keywords filled in.
- An AI check can read the article after it is written. See [Pauses and Checks](Reviews-and-Checkpoints).
- To change the article after the run, edit it on the project page. See [Editing a Project](Editing-a-Project).

## Related pages

- [Create Overview](Create-Overview)
- [Prompts](Prompts)
- [Intros and Outros](Intros-and-Outros)
- [Models](Models)
- [Keys and Services](Providers-and-Keys)
- [AI CLIs](AI-CLIs)
- [Multiple Voices](Multiple-Voices)
- [Other Languages](Other-Languages)
