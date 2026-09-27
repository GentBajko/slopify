## 2026-09-27 - a first short with no keys at all; the first run is a guided setup

- New **System voice** speech provider: narrates with the computer's own speech (macOS `say`,
  Windows System.Speech, or Piper, SVOX Pico, eSpeak NG or eSpeak on Linux), found at runtime,
  free, no key. Settings → Providers shows what was found or the fix; Settings → Voices lists its
  voices. The Docker image now includes espeak-ng.
- "Make a 60-second short" uses the system voice when no voice key is saved, and refuses only
  when neither exists, saying to install espeak-ng or add a key.
- The first-run screen is now three steps (what you have, pick a style, make your first short)
  that end with the short being made and a link to its live view; the samples and the
  start-at-login offer come with it as extras.
- Reading the first-run state (`GET /api/onboarding`) no longer writes to the database; a real
  project made elsewhere is recorded through `POST /api/onboarding/dismiss`.
