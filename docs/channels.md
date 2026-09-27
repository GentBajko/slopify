# Channels

A channel keeps what makes a series look like itself: a **brand kit**, a **cast library**, the
**series brief**, and the **templates** and **schedules** that make its videos. Open them from
**Channels** in the left rail. Every install has one default channel, "My channel";
everything made before channels (templates, schedules, projects) belongs to it, and nothing
about those projects changed when it appeared.

## Which channel a run is in

Play has a **Channel** picker under the title. A draft opened from a template starts in that
template's channel; a new draft starts in the default one. A template saved from Play lands in
the draft's channel (or the one picked in **Save a setup**), and can be moved on the channel's
**Templates** tab. A schedule belongs to the channel of the template it runs, so moving the
template moves its schedules; a schedule that finds its own topics
uses the channel's series brief when it has no brief of its own.

## Brand kit

Every field is optional, and each only fills what the template leaves at its default:

- **Captions:** font (used when the template's caption font is Default), text and outline
  colour.
- **Chapter cards and end screen:** title font (else the caption font) and colour, and the end
  screen text, shown centred over the video's last 5 seconds.
- **Intro, outro** (Library → Intros & Outros) when the template has none, and the **document
  theme** when it has not chosen one.
- **Ambient sound:** rain, a fireplace or wind under the long video's narration, with its
  level, fade-in and tail, when the template leaves its own on *The channel's*
  ([Ambient sound](ambient-sound.md)).

Untick **Use the channel's brand kit** on Play to keep a template exactly as saved. Nothing in
the kit reaches a project that already started: the project keeps what it was started with.

## Cast

Add characters, creatures, places and objects with a name, aliases, a description and up to
four reference pictures each: upload a PNG or JPEG, or make one from a prompt with any image
provider. When the video's title or an image's brief mentions a member, that image is drawn
with the member's pictures as references (after the establishing image, when it is on):

- A name or alias matches as a **whole word, ignoring case**: "Tiamat" is found in "Tiamat's
  lair" and "(Tiamat)", but not in "Tiamatic" or "Tiamats". Add plurals and other spellings as
  aliases.
- Each image's own brief picks its members; the establishing image and the thumbnail also
  take the members the title mentions. At most four members go with one image.
- Codex, OpenAI, Google and fal.ai (FLUX.2 and Nano Banana 2 edit models) take several input
  pictures. A model that takes none (Replicate, other fal.ai models) gets the members described
  in words instead.
- A run keeps the cast as it was when it started, so editing the cast later never makes a
  finished video outdated. Only the images that mention a member change fingerprint, and only
  when a member is actually mentioned.

The pictures live in Slopify's database. A backup of projects does not carry channels yet: a
project restored on another install whose cast picture is missing says so when an image is
made again.

## Episode memory

The channel's **Episodes** tab. While **Episode memory** is on, every project of the channel
that finishes leaves a summary of at most 150 words: what the episode covered, the facts it
stated, who appeared and what happened to them. It is written by the project's own text model
(or its reviews' model when it has none) in one small call, recorded on the project's **Run
cost**. Finishing the same article again asks nothing; a failed call is only logged and never
touches the project.

A new episode whose article (or multi-voice script) is written by Slopify gets the summaries of
up to five **related** earlier episodes appended to its prompt under "Earlier episodes":

- An episode is related when it features a cast member the new title or keywords mention
  (strongest), or shares words of its title. Words most of the channel's titles share (a
  template's "D&D Lore:") and one- or two-letter words don't count; an episode with the very
  same title is a remake, not an earlier episode, and is left out.
- The summaries are copied into the project when it starts, so later edits or new memories
  never make a finished video outdated, and a project started without them is exactly what it
  was.

**Open** a summary to read or edit it; an edited summary is yours and a later finish never
replaces it. **Delete** removes it from later prompts. New channels start with the setting on;
the channels that existed before 3.0 start with it off.

## Existing videos

The channel's **Existing videos** tab lists titles the channel published before (or outside)
Slopify, so topic suggestions and their duplicate checks skip them as they skip the videos
made here. Paste titles one per line, or **Import a YouTube Studio CSV**: in Studio open
**Analytics → Content → Advanced mode** and export the table as comma-separated values. The
title column is found by its header ("Video title", else "Title", else "Content"), or failing
that the first column of words; quoted titles with commas or line breaks, a byte-order mark,
and Studio's "Total" row are handled. The CSV is not saved at once: its titles are listed with a
tick each, all ticked, so videos of other channels in the same Studio export (another game,
another series) can be left out. Type in **Keep only titles containing…** (for example "D&D" or
"Lore To Sleep To", any case) to tick the titles holding that text and untick the rest; **Tick
all** and **Untick all** reset the ticks, and each title can be ticked by hand. **Add N ticked
titles** saves only those. The filter is remembered per channel and applied to the next CSV.
A title already listed (in any case) is skipped, and the import says how many were added and
skipped. **Remove** one title, or **Remove all**.
