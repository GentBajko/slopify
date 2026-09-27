import { readFileSync } from "node:fs";
import { z } from "zod";
import type { CastReference, GeneratedImage } from "../../kernel/ports/image.js";
import type { ImageCall } from "../../kernel/runner/providers.js";
import { imageBlob } from "../channels/repo.js";
import type { RevisionDeps } from "../revisions/model.js";
import { outputPath } from "../storage/layout.js";
import type { RecipeInput } from "./recipe-model.js";

// The provider call an image step makes: its request, the effort when one is chosen and, while
// the project's Establishing image is on, that image's bytes as the visual reference.
export function imageCall(
  deps: Pick<RevisionDeps, "db" | "paths">,
  projectId: string,
  input: RecipeInput & { readonly kind: "image" },
  previewLabel?: string,
): ImageCall {
  const reference = referenceImage(deps, projectId, input);
  const cast = castImages(deps, input);
  return {
    provider: input.provider,
    model: input.model,
    prompt: input.prompt,
    aspect: input.aspect,
    ...(input.thinking === undefined ? {} : { thinking: input.thinking }),
    ...(reference === undefined ? {} : { reference }),
    ...(cast === undefined ? {} : { cast }),
    ...(previewLabel === undefined ? {} : { previewLabel }),
  };
}

function referenceImage(
  deps: Pick<RevisionDeps, "db" | "paths">,
  projectId: string,
  input: RecipeInput & { readonly kind: "image" },
): GeneratedImage | undefined {
  if (input.reference === undefined) return undefined;
  // The step waits for the establishing image, so a missing one went away since.
  const missing =
    "The establishing image this image is drawn from is missing. Use Regenerate on the establishing image in the Images section (or upload it again in Edit project → Images), then use Retry stage.";
  if (input.reference.assetId === null) throw new Error(missing);
  const row = z
    .object({ path: z.string() })
    .optional()
    .parse(
      deps.db
        .prepare("SELECT path FROM project_assets WHERE id=? AND project_id=?")
        .get(input.reference.assetId, projectId),
    );
  if (row === undefined) throw new Error(missing);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(outputPath(deps.paths, projectId, row.path)));
  } catch {
    throw new Error(missing);
  }
  const mime = imageMime(bytes);
  if (mime === undefined)
    throw new Error(
      "The establishing image is not a PNG or JPEG file, so it can't be sent as a reference. Upload a PNG or JPEG in Edit project → Images → Establishing image, then use Retry stage.",
    );
  return { bytes, mime };
}

// The cast pictures the request names, read by hash from the database. They are never removed
// while a project may name them, so a missing one came from a backup of another install.
function castImages(
  deps: Pick<RevisionDeps, "db">,
  input: RecipeInput & { readonly kind: "image" },
): readonly CastReference[] | undefined {
  if (input.cast === undefined) return undefined;
  return input.cast.map((member) => ({
    name: member.name,
    description: member.description,
    images: member.images.map((sha256) => {
      const blob = imageBlob(deps.db, sha256);
      if (blob === undefined)
        throw new Error(
          `A picture of ${member.name} that this project was started with is not in this Slopify's database, so it can't be sent as a reference. Add the picture again in Channels → Cast, then start the video again from Play.`,
        );
      return blob;
    }),
  }));
}

function imageMime(bytes: Uint8Array): GeneratedImage["mime"] | undefined {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((value, index) => bytes[index] === value)) return "image/png";
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg" : undefined;
}
