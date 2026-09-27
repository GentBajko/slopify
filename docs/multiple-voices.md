# Multiple voices

A run can be narrated by several speakers instead of one voice reading the article. Pick the
format under **Play → Audio → Speakers** (or **Edit project → Providers → Speakers**):

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

**Speakers are cast.** A channel's cast member can have a voice (Channels → the channel → Cast
→ edit a member → Voice). **Add from the cast** on the Speakers panel adds any member with a
voice; every run started later takes that member's voice, pace and pronunciations as they are
then, so a host or a character sounds the same in every episode. That holds however the run
starts: Play (one video or a batch of variations), a schedule, or a draft sent to the API.
Projects already made keep the voice they were made with.

Every turn is its own request in its speaker's voice, joined with the **gap between turns**.
Consecutive turns of speakers on ElevenLabs v3 go to ElevenLabs' Text to Dialogue in one
request unless **One request for consecutive turns** is off. Changing one speaker's voice
remakes only that speaker's turns.

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
