// Runs INSIDE the Slopify container (`docker exec slopify node /tmp/<dir>/container-voices.mjs`)
// to speak a demo's turns with the Inworld key saved there, through the installed app's own
// Inworld adapter. The database is opened read-only and the key never leaves the process: it
// is handed to the adapter and nothing prints it. Maintainer-only; see
// docs/first-five-minutes.md for the whole procedure.
//
//   node container-voices.mjs list                 English stock voices (ids without "__")
//   node container-voices.mjs speak <turns.json>   each turn's `text` to <dir>/<file>

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const app = "/opt/slopify/packages/app/dist";
const { keyOf } = await import(`${app}/slices/settings/repo.js`);
const { inworldTts } = await import(`${app}/adapters/tts/inworld.js`);
const { systemClock } = await import(`${app}/kernel/clock.js`);

const db = new DatabaseSync(join(process.env.SLOPIFY_DATA_DIR ?? "/data", "slopify.db"), {
  readOnly: true,
});
const key = keyOf(db, "inworld");
db.close();
if (key === undefined) throw new Error("No Inworld key is saved in this Slopify.");
const auth = `Basic ${key.trim().replace(/^Basic\s+/i, "")}`;

const [mode, file] = process.argv.slice(2);
if (mode === "list") {
  const response = await fetch("https://api.inworld.ai/voices/v1/voices?pageSize=500", {
    headers: { Authorization: auth },
  });
  if (!response.ok) throw new Error(`Inworld answered ${String(response.status)}.`);
  const body = await response.json();
  for (const voice of body.voices ?? []) {
    const id = String(voice.voiceId ?? voice.name ?? "");
    if (id.includes("__")) continue;
    const languages = [voice.langCode, ...(voice.languages ?? [])].filter(Boolean).join(",");
    if (languages !== "" && !/EN/i.test(languages)) continue;
    console.log(
      [
        id,
        voice.displayName ?? "",
        languages,
        (voice.tags ?? []).join(" "),
        voice.description ?? "",
      ]
        .join(" | ")
        .slice(0, 240),
    );
  }
} else if (mode === "speak" && file !== undefined) {
  const turns = JSON.parse(readFileSync(file, "utf8"));
  const port = inworldTts({ fetch, key: () => key, clock: systemClock });
  let characters = 0;
  for (const turn of turns) {
    const audio = await port.synthesize({
      model: turn.model,
      voiceId: turn.voice,
      text: turn.text,
      signal: AbortSignal.timeout(120_000),
    });
    const bytes = new Uint8Array(await new Response(audio.audio).arrayBuffer());
    writeFileSync(join(dirname(file), turn.file), bytes);
    characters += turn.text.length;
    console.log(`${turn.file}: ${String(bytes.byteLength)} bytes`);
  }
  console.log(`${String(turns.length)} requests, ${String(characters)} characters`);
} else throw new Error("Usage: container-voices.mjs list | speak <turns.json>");
