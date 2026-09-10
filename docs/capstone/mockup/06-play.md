---
absorbed_from:
 - features/2026-09-09-pausable-optional-runs@2026-09-10
 - features/2026-09-10-subtitles-fonts@2026-09-10
screen: play (new project)
journeys: [J2-first-run-setup, J3-make-a-video, J4-bring-your-own]
assumed:
 - research has three sources (Off / Generate / Provide) since it is optional and providable
 - thumbnail has three sources (Off / Generate / Provide) since selecting no thumbnail prompt means none
 - provider dropdowns list every provider, with unavailable keys/CLIs disabled
 - LLM, image and TTS model dropdowns load server catalogues with refresh and supported custom-ID entry
 - a thumbnail prompt runs once, no Number field
 - Video title is a required per-run field and names the project
 - the LLM row is shown only while research or article is set to Generate
 - keyword fields render in the order: shared, then per image prompt, then thumbnail
generated_date: 2026-09-10
capstone_version: 5.2.0
---

# 06 Play

Configures one run and starts it. One play = one run = one project.

## Layout

```
+--------------------------------------------------------------------+
| SLOPIFY Projects [Play] Prompts Settings |
+--------------------------------------------------------------------+
| Video title [ The Complete History of Vecna ] required |
| Format (•) 16:9 landscape ( ) 9:16 vertical |
| Intro [Cold open hook v] Outro [Subscribe sting v] |
| |
| LLM Provider [OpenRouter v] Model [anthropic/... v] |
| |
| RESEARCH ( ) Off (•) Generate ( ) Provide |
| Provide: [ paste research notes... ] |
| |
| ARTICLE (•) Generate ( ) Provide |
| Article prompt [Documentary dossier v] |
| Provide: [ paste your article... ] |
| |
| AUDIO ( ) Off (•) Generate ( ) Provide |
| TTS provider [<TTS provider A> v] Model [... v] Voice [Narrator M v]|
| Chunking (•) Whole ( ) Per paragraph ( ) Every [500] words |
| Provide: [ Upload audio file ] |
| |
| IMAGES ( ) Off (•) Generate ( ) Provide |
| Image provider [<Image provider A> v] Model [... v] |
| Image prompts |
| [x] Oil painting scenes Number [ 8 ] |
| [x] Map close-ups Number [ 4 ] |
| [ ] Portraits Number [ ] |
| Provide: [ Upload images ] |
| |
| THUMBNAIL ( ) Off (•) From prompt ( ) Prompt by LLM ( ) Provide|
| Thumbnail prompt [Bold title card v] |
| Provide: [ Upload image ] |
| |
| VIDEO ( ) Off (•) Generate |
| Subtitles [Off / Subtitle files / Burn into video + files] |
| When enabled: Font [Barlow Regular v] Size [48] [Upload font] |
| [Subtitle style preview] English · local · no paid API |
| |
| KEYWORDS (single-line, max 200 chars) |
| ---------------------- Common ---------------------------------- |
| topic [ Vecna ] |
| ---- Text ----------------- | ---- Image -------------------- |
| minWords [ 3000 ] | era [ AD&D 1e ] |
| maxWords [ 3500 ] | style [ oil on canvas ] |
| |
| [ ▶ Play ] |
+--------------------------------------------------------------------+
| Free · your keys, your machine [Patreon] [☕] |
+--------------------------------------------------------------------+
```

Element tree:
- App shell
 - Run header: video title, format, intro and outro pickers
 - LLM row: provider, model
 - Stage blocks, each with a source choice: research, article, audio, images, thumbnail, video
 - Subtitles within the final-output rail: mode, font, upload, size and preview
 - Keywords: Common on top, then Text | Image
 - Play
 - Footer: donation links

## Elements

| Label | Does | Leads to |
|---|---|---|
| Video title | Names the project and the intro card | None |
| Format 16:9 / 9:16 | Video aspect for this run | None |
| Intro / Outro pickers | Off or one saved entry each; the entry is narrated before or after the body in the run's voice | Add the entry's slots to Keywords |
| LLM provider, Model | Per-run LLM choice, used by research and article | None |
| Research: Off / Generate / Provide | Off skips research; Generate researches through the LLM; Provide pastes notes and skips the stage | None |
| Article: Generate / Provide | Generate renders the article prompt; Provide pastes text and skips research and writing | None |
| Article prompt | Picks one article prompt | Adds its slots to Keywords |
| Audio: Off / Generate / Provide | Off skips narration; Generate runs TTS and any selected intro/outro; Provide uses the uploaded complete narration as-is | None |
| TTS provider, TTS model, Voice, Chunking | Per-run provider/model, a voice from Settings, and narration request split: Whole / Per paragraph / Every N words | None |
| Images: Off / Generate / Provide | Off skips images and selects Video Off; Generate runs saved prompts immediately in parallel; Provide uploads images | None |
| Image provider, Model | Per-run provider and model (assumed) | None |
| Image prompts multi-select + Number | Each ticked prompt runs Number times | Adds each prompt's unique slots to Keywords |
| Thumbnail: Off / From prompt / Prompt by LLM / Provide | Off: no thumbnail; From prompt: runs the chosen thumbnail prompt once; Prompt by LLM: the LLM writes the image prompt from the chosen template and the article; Provide: uploads one image | None |
| Thumbnail prompt | Picks one thumbnail prompt | Adds its unique slots to Keywords |
| Video: Off / Generate | Off exports WAV when audio is active; Generate requires images and can produce a silent five-seconds-per-image slideshow | None |
| Subtitles | Off, separate SRT/VTT, or burned captions plus files; English narration required, default Off | Font/style controls when enabled |
| Subtitle font / Upload font / Size | Choose bundled/system/uploaded font, upload one valid TTF/OTF up to 32 MiB, preview at reduced scale, integer size 16–120 (default 48) | Local font API; no model download here |
| Keywords fields | One single-line field per distinct slot across every selected prompt and entry; shared names appear once; grouped Common, Text, Image | None |
| ▶ Play | Creates the project and starts the pipeline | 08 Project page |

Providing or disabling a stage hides its generation controls and removes their validation requirements. Article is the only required stage. A generated thumbnail still exposes an image-provider choice when Images is Off or Provide. The tutorial spotlights the actual Video switch and the separate subtitle section. Subtitles are disabled with Audio Off; Video/Images Off changes burn-in to files. Invalid hidden font/size edits are normalized when Off so they cannot block Play (`packages/web/src/subtitles/config.ts`).

## States

- Model catalogues: automatically load for the selected provider in every generated text/image/audio control. Refresh requests updated choices; Custom ID switches to manual entry when supported. No eager model default is selected. Existing IDs remain visible during loading, failures and catalogue changes. Origin notices stay separate from discovery warnings; fal and Replicate permit supported catalogue schemas only (`packages/web/src/play/pickers.tsx`, `lib/models.ts`; `logic/02-provider-credentials.md`).

- Subtitles enabled: explains first-use download of approximately 95 MB and local English timing; font styling affects burned captions, while SRT/VTT players choose their own styling. Font upload blocks submission until settled; errors stay inline (`packages/web/src/subtitles/controls.tsx`, `font-picker.tsx`, `routes/play.tsx`).
- Fresh: Subtitles Off; no title; Article, Audio, Images and Video Generate; Research and Thumbnail Off; no prompts selected; keywords empty.
- Configured: keywords rendered from the selected prompts; pickers filled.
- Provider without key, or a CLI provider not found: what the provider dropdown shows `rule: logic (S13-credentials)`.
- No voices in settings: what the Voice control shows `rule: logic (S13-credentials)`.
- Required field missing (title, a keyword, a Number, a prompt when Generate): whether Play is blocked and what is marked `rule: logic (S2-run-admission)`.
- Another project running: whether Play is allowed and what the button shows `rule: logic (S2-run-admission)`.
- Provided file rejected (format, size, count, empty paste): what is shown `rule: logic (S3-provided-outputs)`.
- Everything provided except video: allowed; the run renders only `rule: logic (S3-provided-outputs)`.
- Model that cannot research with Research = Generate: what happens `rule: logic (S4-research)`.
- Submitting: transition to 08; whether the form is kept for a next run `rule: logic (S2-run-admission)`.
