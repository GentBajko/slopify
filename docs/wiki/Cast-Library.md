# Cast Library

A channel's cast is its recurring characters, creatures, places and objects. Each member has a name, a description and up to four reference pictures. Whenever a video's title or an image's brief names a member, its pictures go with that image request, so the member looks the same in every image and every episode. A cast member can also have a voice for multi-voice videos.

**Where to find it:** **Channels** → a channel → **Cast** tab. **Add to cast** opens the editor beside the list.

## Add a cast member

1. Open **Channels**, pick the channel, and open the **Cast** tab.
2. Press **Add to cast**.
3. Fill in the fields (see the table below). At least give it a **Name**: "Name it first, then give it reference pictures."
4. Press **Add to cast**. The member is saved and the picture section opens.
5. Add one to four reference pictures: upload them or generate them (below).

To change a member later, press **Edit** on it, change what you need and press **Save**. To remove one, press its delete button and confirm with **Delete from cast**.

## Fields

| Field | What it does | Limit |
|---|---|---|
| **Kind** | Character, creature, place or object. A generated reference picture of a character or creature is portrait (9:16), of a place or object landscape (16:9), and its starting prompt asks for the whole figure, place or object in view. It doesn't change how the member is matched. | |
| **Name** | The name matched against video titles and image briefs, as whole words, ignoring case. | Up to 200 characters |
| **Aliases** | Other names that count as this member, such as plurals and titles ("the Dragon Queen"). Type one and press `Enter` to add it. | Up to 20 |
| **Description for the image model** | What the member looks like, in a sentence. It goes to the image model with the member's pictures for every image that names it, and starts the prompt of a generated picture. | Up to 2,000 characters |
| **Reference pictures** | Pictures sent with every image whose brief, or the video's title, names this member. | Up to 4, PNG or JPEG up to 10 MB each |
| **Cast voice** | How this member speaks in multi-voice runs (see below). | |

## How names are matched

A name or alias matches as a **whole word, ignoring case**:

- "Hypatia" is found in "Hypatia's school" and "(Hypatia)".
- "Hypatia" is **not** found in "Hypatian" or "Hypatias".

So add plurals and other spellings as aliases.

Which images get which members:

- Each image's own brief picks its members.
- The establishing image and the thumbnail also take the members the video's title mentions.
- At most four members go with one image.
- When the establishing image is on, the member pictures go after it.

## Add reference pictures

### Upload a picture

1. Open the member in the editor.
2. Under **Reference pictures**, press **Upload a picture** and choose a PNG or JPEG up to 10 MB.

### Generate a picture

1. Under **Make a picture**, pick an **Image provider** and **Image model**.
2. Check **Picture to make**. It starts from the name, the description and a request for a plain background. Edit it as you like (up to 4,000 characters).
3. Press **Generate a picture**. Wait until "Making the picture…" finishes.

Each press is one image call on that provider, billed at its price for one image. A plain background with the whole figure in view makes the best reference.

To remove a picture, press its delete button. A member with no picture is not sent with any image.

## Which image providers use the pictures

| Provider | What happens |
|---|---|
| Codex, OpenAI, Google, and fal.ai edit models (FLUX.2 and Nano Banana 2 edit) | The member's pictures are sent as input pictures. |
| Models that take no input pictures (Replicate, other fal.ai models) | The member is described in words instead, from its description. |

See [Images](Play-Images) and [Providers and keys](Providers-and-Keys).

## Give a cast member a voice

In multi-voice formats (audiobook, podcast, radio drama, interview) a cast member can speak with the same voice in every episode.

1. In the member's editor, under **Cast voice**, pick a **Voice provider**, **Voice model** and **Voice**. The list shows voices that speak the channel's language. If it says "No voices. Add one in Settings.", add a voice in **Settings → Voices** first.
2. Pick a **Pace**: 0.8, 0.9, 1 (normal), 1.1 or 1.2.
3. Press **Save**.
4. On Play, pick the member under **Speakers**. They read with this voice, model and pace.

Leave the provider empty for no voice. A run keeps the voice it started with. See [Multiple voices](Multiple-Voices).

## What happens to finished videos

A run keeps the cast as it was when it started. Editing the cast later never makes a finished video outdated. Only images that actually mention a member change their fingerprint, so only they would be remade if you remake the project's images.

## Backups

Cast members and their pictures travel in a backup made with **Export everything**. When you import one, members come into the channel that is here. If a restored project's cast picture is missing, Slopify says so when that image is made again. See [Backups](Backups).

## Tips

- Upload or generate a picture with the whole figure on a plain background. Busy backgrounds leak into every image.
- Keep the description short and visual: colours, shape, clothing, one distinctive feature.
- Add the plural and possessive-free forms as aliases ("dragons", "the Queen"). Matching is whole-word only.

## Related pages

- [Channels](Channels)
- [Images](Play-Images)
- [Multiple voices](Multiple-Voices)
- [Providers and keys](Providers-and-Keys)
