# Slopify Wiki

Slopify turns a prompt and a few keywords into a narrated, captioned video. It writes the article, narrates it, makes the images and cuts the video, and can also give you shorts, a PDF of the article and a ready-to-paste YouTube description. It runs as a local web app on your own machine, with your own provider keys or the Claude Code, Codex or Gemini CLI you already use. It is free.

These pages cover Slopify 3.0.0: every screen, every setting and every workflow, step by step.

## Start here

1. [Install](Install) Slopify (Node 26 or newer) or run it in [Docker](Docker).
2. Open it at `http://127.0.0.1:6969` and follow [First launch and welcome](First-Launch-and-Welcome).
3. Make [your first 60-second short](Your-First-Short).
4. Add the keys you want in [Providers and keys](Providers-and-Keys), or sign in to an [AI CLI](AI-CLIs).
5. Make a full video from [Play](Play-Overview).

## How a video gets made

1. **Settings:** add provider keys and voices, or use a signed-in CLI.
2. **Library → Prompts:** write article, image and thumbnail prompts once, with `{{keywords}}` where the subject goes.
3. **Play:** pick a template or prompts, type the topic, choose your outputs, check the cost estimate, press **Start run** (or **Queue 3 videos** for several topics).
4. **The project page** shows each stage as it runs. Download the video, captions, PDF and description when it is done.
5. **Edit settings** on the project (the Edit project form) to change anything. Slopify remakes only what the change affects.

## Contents

### Getting started
| Page | What it covers |
|---|---|
| [Install](Install) | Installing with npx or npm, command-line options, ffmpeg, telemetry |
| [Docker](Docker) | Running Slopify in Docker with the compose file and the CLI helper |
| [First launch and welcome](First-Launch-and-Welcome) | The welcome screen, the three samples, Make my own copy, starter packs |
| [Your first short](Your-First-Short) | A 60-second short from topic to finished video |
| [Home and Projects](Home-and-Projects) | The Home dashboard, the navigation and the Projects list |
| [Where your files live](Where-Your-Files-Live) | Documents/Slopify, the data folder and moving your files |
| [Start at login](Start-at-Login) | Starting Slopify when you log in |
| [Updating and patch notes](Updating-and-Patch-Notes) | Updating, going back, and reading patch notes |
| [Uninstalling and moving](Uninstalling-and-Moving) | Removing Slopify and moving between Docker and a native install |

### Providers
| Page | What it covers |
|---|---|
| [Providers and keys](Providers-and-Keys) | Every API provider, adding and checking keys, Settings → Voices |
| [AI CLIs](AI-CLIs) | Claude Code, Codex and Gemini CLI: sign-in, use and plan limits |
| [Models](Models) | The model catalogue, retired models and switching |
| [Costs and run cost](Costs-and-Run-Cost) | Cost estimates, the Run cost tab and usage |

### Making a video
| Page | What it covers |
|---|---|
| [Play overview](Play-Overview) | Templates, topics, batches, drafts, the estimate, Start and Queue |
| [Title and article](Play-Title-and-Article) | Title patterns, article prompts, research and your own text |
| [Narration](Play-Narration) | Voices, pauses, volume, glossary, aliases, described tables |
| [Images](Play-Images) | Image prompts, the establishing image, cast, image pacing, Codex |
| [Video and style](Play-Video-and-Style) | Cuts, the Look, transitions, chapter cards, motion, captions, ambient sound |
| [Outputs](Play-Outputs) | Video, shorts, description, PDF, thumbnails and audio exports |
| [Reviews and checkpoints](Reviews-and-Checkpoints) | Automatic reviews and pausing a run for you to check |

### Formats and outputs
| Page | What it covers |
|---|---|
| [Multiple voices](Multiple-Voices) | Audiobook, podcast, radio drama and interview formats |
| [Other languages](Other-Languages) | Making videos in languages other than English |
| [Shorts](Shorts) | Vertical shorts cut from the long video |
| [YouTube description](YouTube-Description) | Description, chapters, hashtags and tags |
| [PDF documents](PDF-Documents) | The article as a PDF with contents, sources and a cover |

### The project page
| Page | What it covers |
|---|---|
| [Project page](Project-Page) | The next action, the tabs, Live, downloads, pause and resume |
| [Editing a project](Editing-a-Project) | Edit project, remaking outdated work, the rebuild review, history |
| [Video editing](Video-Editing) | Video, caption, subtitle and ambient sound controls on a project |
| [Recovery and retries](Recovery-and-Retries) | Fix-it buttons, retries and waiting out plan limits |
| [Trash](Trash) | Deleted projects and how to get them back |

### Publishing
| Page | What it covers |
|---|---|
| [Publishing to YouTube](Publishing-to-YouTube) | Prepare upload, AI use disclosure, chapters and links |
| [Studio extension](Studio-Extension) | The browser extension that fills YouTube Studio's upload dialog |

### Automation
| Page | What it covers |
|---|---|
| [Templates](Templates) | Saving and reusing a setup |
| [Schedules](Schedules) | Videos on a cadence, topic lists and self-filling topics |
| [Calendar](Calendar) | What is coming up, and moving it |
| [Notifications](Notifications) | Browser and phone (ntfy) notifications |
| [Backups](Backups) | Automatic backups, export and import |

### Channels
| Page | What it covers |
|---|---|
| [Channels](Channels) | Brand kit, episode memory, existing videos and channel links |
| [Cast library](Cast-Library) | Recurring characters with pictures and voices |

### Library
| Page | What it covers |
|---|---|
| [Library overview](Library-Overview) | What the Library holds |
| [Prompts](Prompts) | Writing prompts, keyword slots, history and restore |
| [Intros and outros](Intros-and-Outros) | Reusable openings and closings |
| [Aliases and glossary](Narration-Aliases-and-Glossary) | How the narrator says words |
| [Document themes](Document-Themes) | The look of the PDF |

### Reference
| Page | What it covers |
|---|---|
| [Settings reference](Settings-Reference) | Every Settings section and control |
| [Keyboard and Ctrl+K](Keyboard-Shortcuts-and-Command-Palette) | Shortcuts and the command palette |
| [Troubleshooting](Troubleshooting) | Common errors and how to fix them |
| [FAQ](FAQ) | Short answers to common questions |

## Getting help inside the app

Every setting in Slopify has an info button beside it that explains what it does. If something goes wrong, the project page shows a button that names the fix. See [Troubleshooting](Troubleshooting) for the rest.
