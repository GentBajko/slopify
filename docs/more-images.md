# More images for long videos

A long video with a fixed handful of images repeats them for an hour. **Play → Images → More images
for long videos** scales the number of images with the narration's
length instead.

## Setting it

Switch it on under the ticked image prompts, then give the rate either way:

- **Every N minutes**: one image every N minutes of narration (0.25 to 60), or
- **N per hour**: N images per hour of narration (1 to 240).

Both are the same setting; switching between them keeps the rate (every 5 minutes is 12 per
hour). The line under it says what it makes for the expected length, for example *For about
60 minutes (9,000 words expected, set on Review): 30 images, 26 more than the prompts' 4.*

Switching it on also switches **Video and style → Motion** from Zoom in and out to **Mix of both**, so
the images pan and zoom by turns. A Pan across or Still you picked stays; you can pick Zoom
again.

## How the count is worked out

- The length is the provided article's own words, or else the **expected words** on
  **Review**, at 150 spoken words a minute (the same figure the cost estimate uses). Set the
  expected words to what the article prompt writes, since the count follows it.
- The run makes one image per started stretch: `ceil(minutes × images per hour ÷ 60)`.
- Each ticked prompt keeps its own Number as a floor. The extra images are handed to the
  ticked prompts one at a time, in the order they were ticked, so with three prompts the first
  gets the 1st, 4th, 7th … extra image.
- When the prompts' own Numbers already cover the length, nothing is added.
- A scaled run makes at most 240 images (four hours at one a minute). A hand-set run is still
  limited to 60. Past 240 the count stops and the line says so; the slideshow repeats its
  images after that, as it always does when the narration outlasts them.

## When it is planned

The count is planned once, when the run starts, and kept in the project's first revision.
Images start at once, beside the narration, and every image is its own step you can see,
regenerate or delete, so the count is not recounted from the finished narration. A narration
that turns out longer than expected is still covered by the slideshow cycling its images. A
retry or a rebuild makes the same images; changing the setting in a template or draft affects
only runs started afterwards.

The cost estimate on Review (and a schedule's spend limit) prices the scaled count. Edit
project allows up to 240 images for a project that scales its images, 60 otherwise.

A template made from a project that scales its images keeps the ticked prompts, the setting
and the expected words, rather than one prompt per planned image.

Projects and templates saved without the setting make exactly the images they always did, and
nothing about them becomes outdated.
