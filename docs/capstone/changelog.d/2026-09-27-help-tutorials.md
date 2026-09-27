# Help → Tutorials, inside the app

- The wiki's 49 tutorial pages live in the repository (`docs/wiki`) and ship with the app like the patch notes, so **Help → Tutorials** (`/help/tutorials/<Page>`) reads offline and always describes the version that is running. The book button beside the tutorial launcher opens it.
- The page shows the wiki sidebar's groups beside the page in the reading view (contents, search in the page, Copy section), a search across every page that lists the matching sections, and the wiki's own links kept in the app with their sections.
- Ctrl+K has **Open tutorials** and **Open tutorial: <page>** for every page.
- Every info button's help ends in **Learn more**, which opens the tutorial section that explains it; a test checks each linked page and heading exists.
- `scripts/wiki-sync.mjs <wiki checkout>` copies `docs/wiki` into a clone of the GitHub wiki, for review and push there.
- The pages were brought up to date with this release: the sidebar, whole-row clicks, one Download per stage, the players, the command palette, limit waits and fix-it buttons, the first run, voices, hosts and books, previews, schedules, the Studio extension and more.

# Words that match the screens

- Messages, help and guides name controls where they are: pauses, Level the volume and ambient sound under Play's **Video and style**, Speakers and **Audio Advanced** under **Narration**, the YouTube description switch under **Edit project → Prompts**, fonts through **Upload font** in the caption font picker, and recovery's **Check again**, **Try … again** and **Edit the prompt**.
- The README and CLI help say the native `update` needs Slopify running, and that new installs keep files in Documents/Slopify.
- Template names share one 120-character limit on Play and in Library → Templates.
- Help for the first short, style packs, Narration Preparation (per-speaker cues on TTS-2) and a channel's intro and outro (each narrated, one voice request) matches what they do.

# Fixes

- A style pack used by the first short still offers **Add pack** for its Play template; Added now means its prompts, voice and template are all in the library.
- The narration row shows its length once, in the player.
- An editor's Cancel and Save bar no longer hides a heading such as the document theme's Fonts, and on phones it sits above the bottom navigation.
