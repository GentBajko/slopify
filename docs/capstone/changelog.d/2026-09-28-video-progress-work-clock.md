# Plain video progress, a work clock, and the extension's icon

- A running Video stage names its step and that step's own progress ("Rendering the video (82%)", "Drawing the shorts' pictures (12 of 38)") instead of a step count that grew once the shorts were picked ("10.159999999999998 of 50").
- The project page shows how long Slopify worked on the run: "Working for 9 min 30 s" while it runs, holding still while it waits, and "22 min 15 s of work" in the cost line once it ends. Only working time counts, never waits; steps side by side count once. The Cost section's times use the same measure; the old "end to end" figure added up overlapping stages.
- Home shows whole numbers in a running project's progress.
- The browser extension shows Slopify's icon.
- CI: everyday pushes run lint, typecheck, build and tests (about 4 minutes); Windows and Docker run on the release push.
