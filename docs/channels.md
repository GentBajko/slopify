# Channels

A channel keeps what makes a series look like itself: a **brand kit**, a **cast library**, the
**series brief**, and the **templates** and **schedules** that make its videos. Open them in
**Library → Channels**. Every install has one default channel, "My channel"; everything made
before channels (templates, schedules, projects) belongs to it, and nothing about those
projects changed when it appeared.

## Which channel a run is in

Play has a **Channel** picker under the title. A draft opened from a template starts in that
template's channel; a new draft starts in the default one. A template saved from Play lands in
the draft's channel (or the one picked in **Save a setup**), and can be moved on the channel's
**Templates** tab. A schedule belongs to the channel of the template it runs, so moving the
template moves its schedules; the series brief a schedule reads is its channel's.

## Brand kit

Every field is optional, and each only fills what the template leaves at its default:

- **Captions:** font (used when the template's caption font is Default), text and outline
  colour.
- **Chapter cards and end screen:** title font (else the caption font) and colour, and the end
  screen text, shown centred over the video's last 5 seconds.
- **Intro, outro** (Library → Intros & Outros) when the template has none, and the **document
  theme** when it has not chosen one.

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
