# Multiple voices

A run can be narrated by several speakers instead of one voice reading the article. Pick the
format under **Play → Narration → Speakers** (or **Edit project → Providers → Speakers**):

| Format | Speakers | Video |
|---|---|---|
| Narration | one voice (the default, unchanged) | image flow |
| Audiobook | a narrator plus character voices | image flow, dialogue captions tagged with the speaker |
| Podcast | two hosts, optionally a guest | image flow with a speaker panel: a tile per speaker, the one talking lit, their name as a lower third |
| Radio drama | a narrator plus a cast | image flow, captions tagged with the speaker |
| Interview | a host and guests | speaker panel, like a podcast |

## The script

The text model writes speaker turns from a **Script** prompt (a new prompt kind in the
Library), in this format:

```
# Section title          sections become the chapters of the audio files

Alex: What one speaker says, as one paragraph.

Sam: The next turn.
```

A turn starts with a speaker's name and a colon; a line straight under a turn continues it;
bracketed stage directions such as `[laughs]` are never read aloud. A script that names
someone who is not a speaker, or has a paragraph that is not a turn, fails the Article stage
with the line to fix. An **audiobook** can instead keep its ordinary article (written or
pasted) and have the text model split it into speakers; the split must keep the text's words,
or the attempt is asked again.

## Speakers and voices

Each speaker has a name, a role, a voice (provider, model and saved voice), a pace (0.8× to
1.2×, applied after synthesis, so changing it costs nothing) and optional pronunciations in
the glossary's `Term: /IPA/` format (Inworld TTS-2 voices). The voice under Audio still reads
the intro and outro. **Audition** reads the speaker's first line of the script (or a sample
line) in their voice; the button shows the price first and nothing is spoken until you click.

A pronunciation row the narration can't use (no slashes, ARPAbet, sounds the project's language
doesn't use) is skipped and that word is read as ordinary text; the rest still apply. The
Speakers panel says which entries of which speaker are skipped and why as you type, and the
rebuild review lists them again for speakers on Inworld TTS-2 voices.

**Speakers are cast.** A channel's cast member can have a voice (Channels → the channel → Cast
→ edit a member → Voice). Turn on **One of the channel's hosts** for the channel's recurring
voices: a new Podcast or Interview on Play starts with every host who has a voice as its hosts
(an interview keeps its guest; a podcast with one host keeps one placeholder host), and the
cast grid marks them Host. **Add from the cast** on the Speakers panel adds any member with a
voice; every run started later takes that member's voice, pace and pronunciations as they are
then, so a host or a character sounds the same in every episode. That holds however the run
starts: Play (one video or a batch of variations), a schedule, or a draft sent to the API.
Projects already made keep the voice they were made with.

Each speaker's voice list on Play, and a cast member's in the channel, shows the voices that
speak the project's language (on Play the draft's or the channel's; for the cast, the channel's),
with **Show all voices** for the rest and the same warning as the Audio voice when a picked voice
is listed for other languages.

Every turn is its own request in its speaker's voice, joined with the **gap between turns**.
Consecutive turns of speakers on ElevenLabs v3 go to ElevenLabs' Text to Dialogue in one
request unless **One request for consecutive turns** is off. Speakers on **Google Gemini** TTS
(the 2.5 Flash, 2.5 Pro and 3.1 Flash TTS models) do the same with Gemini's two-speaker mode: a
request holds at most two voices, so a run of turns among three or more Gemini voices starts a
new request wherever a third voice would join. Narration aliases apply to every
line of that request, each turn on its own, and the request's size limit counts the aliased
text. Changing one speaker's voice remakes only that speaker's turns.

## Delivery cues

With a **Narration Preparation** prompt (Narration → More audio settings), every turn of a speaker on Inworld's
Realtime TTS-2 is prepared on its own before it is spoken: the text model gets the turn's
sentences and who says them (`"Rat (character)"`), and answers cues in the same format as a
single voice's preparation. They become Inworld's bracketed tags in that turn's request: a
natural-language direction at the start of a sentence (`[say shyly and a little uncertainly]`),
held until the next one or `[reset]`, and the non-verbal sounds `[laugh]`, `[breathe]`,
`[sigh]`, `[cough]`, `[clear throat]` and `[yawn]` where they happen. Each turn is its own
request, so a direction never leaks into the next speaker. Turns of speakers on other voices
(or TTS-2 Flash, which ignores directions) are spoken as written. Nothing is spoken until every
prepared turn has its cues, as with one voice; the audio voice under Audio must still be TTS-2,
and at least one speaker must be.

The tags are only in what the voice is sent: each turn keeps its clean words as its transcript,
so the captions, the word timing, the MP3/M4B chapters and the script download never show a
tag, and the aligner times the words against the audio the same way as for one prepared voice.
A run without a Narration Preparation prompt, and every project made before this, keeps its
recipes exactly.

## Captions and files

Word timing learns who said each word: captions never mix two speakers, carry the speaker's
colour and, with **Speaker names on captions**, their name (`<v Name>` in the VTT file). The
podcast and interview speaker panel is drawn with burned-in captions, so it needs Captions set
to Burn in. A speaker picked from the cast whose member has a picture shows that picture in
their tile (the member's first picture, scaled and cropped square, taken when the run starts);
everyone else shows their initials. Adding a picture later changes no project already made.
Shorts start and end on a speaker's turn.

Captions edited by hand (Edit project → Captions) keep their speakers: a cue keeps the speaker
it had however its text or times change, and a cue you add takes the speaker of the narration
under it.

With **Also make MP3 and M4B files** on, the Video stage also writes `narration.mp3` (ID3
chapters) and `audiobook.m4b` (AAC with chapter markers) of the whole narration timeline, one
chapter per script section. Both are under the Video section's downloads; nothing is published.

## Volume

Different voices, and different requests of the same voice, come back from the providers at
different loudness. With **Level the volume** on (the default for new runs; see
[loudness.md](loudness.md)) every speaker's turn is measured and brought to one common
loudness before the turns are joined, so a quiet host and a loud guest sit at the same level,
and the MP3 and M4B are mastered to the audio files volume (−18 LUFS by default). The turn gap
and each speaker's pace are applied exactly as before, and the word timing still reads the plain
join, so the captions and chapter marks do not move.

**Pause between sentences** ([pauses.md](pauses.md)) lengthens the quiet between sentences
inside a speaker's turn; the gap between turns stays the Turn gap.

## Books

An audiobook can be one chapter of a book: turn on **A chapter of a book** under Speakers (Play →
Narration, Audiobook format) and give the book's title and the chapter number. The MP3 and M4B are
then tagged with the book as their album and the chapter as their track, and the project page
and its row in Projects say "Book · Chapter N". Only the listening files are remade when the
book or chapter changes; a project that is no chapter keeps its recipes exactly.

When a chapter is finished, **Make the next chapter** on its project page opens a new Play draft
with the same format, speakers and voices, channel (and so its cast), prompts and settings, the
chapter number one higher and the chapter's own text left empty to write or paste. Files the
last chapter was given are listed to attach again. An audiobook made on its own becomes a book
named after it, and its next chapter is chapter 2. A template saved from a chapter leaves the
book out.
