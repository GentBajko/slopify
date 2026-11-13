# Opening a finished project no longer stalls the app

- **A finished project's page opens without freezing everything else.** Working out what Keep outputs only would free read every saved version once for each of the project's files: about two and a half seconds on a two-hour video with 600 files, during which no page got an answer, and it ran again on every visit and every return to the window. It now reads them once, in about two hundredths of a second, and answers the same.
- **Settings → Storage answers in a couple of seconds,** where it took over twenty with 170 projects. It asked the same question of every project in turn.
- **A running step no longer keeps the page asking for the whole project.** Each progress report, up to two a second, made the open page fetch everything it shows again, the saved version included (megabytes on a finished project). A report now fetches the meter and the cost, once a second at most, and the rest only every few seconds.
- **Coming back to the window no longer fetches the saved version and the name checks again.** Live events and saves already keep those fresh. Everything else is still asked again on return, which is how the page learns what the extension did in YouTube Studio.
- **Reading a saved version takes about half the time,** for every page of a project and every step of a run: its files are looked up once, not one at a time.
