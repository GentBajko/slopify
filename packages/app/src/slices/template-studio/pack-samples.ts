import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Paths } from "../../kernel/paths.js";
import { type PackSampleRole, packSampleRoles, packSampleType } from "./pack.js";

// The samples an imported pack came with, kept beside the data dir's studio files so the studio
// shows them until the template makes its own: `template-studio/packs/<template id>/`, with a
// samples.json naming each file and what it is.

export function packSamplesDir(paths: Pick<Paths, "dataDir">, templateId: string): string {
  return join(paths.dataDir, "template-studio", "packs", templateId);
}

const fileName = /^[a-z0-9-]{1,40}\.(png|jpg|jpeg|webp|mp3|m4a|wav)$/;
const listSchema = z.array(
  z
    .object({
      file: z.string().regex(fileName),
      role: z.enum(packSampleRoles),
      name: z.string().max(200),
    })
    .strict(),
);

export interface PackSample {
  readonly file: string;
  readonly role: PackSampleRole;
  readonly name: string;
}

// Written to a folder of its own first and moved into place, so a half-written set is never
// shown.
export function writePackSamples(
  paths: Pick<Paths, "dataDir">,
  templateId: string,
  samples: readonly (PackSample & { readonly body: Uint8Array })[],
): void {
  if (samples.length === 0) return;
  const target = packSamplesDir(paths, templateId);
  const staging = `${target}.part`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true, mode: 0o700 });
  for (const sample of samples) {
    if (!fileName.test(sample.file)) continue;
    writeFileSync(join(staging, sample.file), sample.body, { mode: 0o600 });
  }
  writeFileSync(
    join(staging, "samples.json"),
    JSON.stringify(samples.map(({ file, role, name }) => ({ file, role, name }))),
    { mode: 0o600 },
  );
  rmSync(target, { recursive: true, force: true });
  renameSync(staging, target);
}

export function packSamples(
  paths: Pick<Paths, "dataDir">,
  templateId: string,
): readonly PackSample[] {
  const list = join(packSamplesDir(paths, templateId), "samples.json");
  if (!existsSync(list)) return [];
  try {
    const parsed = listSchema.safeParse(JSON.parse(readFileSync(list, "utf8")));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

// One kept sample's file, or undefined when the template has no such sample.
export function packSampleFileOf(
  paths: Pick<Paths, "dataDir">,
  templateId: string,
  file: string,
): { readonly path: string; readonly bytes: number; readonly type: string } | undefined {
  if (!packSamples(paths, templateId).some((sample) => sample.file === file)) return undefined;
  const path = join(packSamplesDir(paths, templateId), file);
  const type = packSampleType(`samples/${file}`);
  const stat = statSync(path, { throwIfNoEntry: false });
  return stat === undefined || type === undefined ? undefined : { path, bytes: stat.size, type };
}

export function removePackSamples(paths: Pick<Paths, "dataDir">, templateId: string): void {
  rmSync(packSamplesDir(paths, templateId), { recursive: true, force: true });
}
