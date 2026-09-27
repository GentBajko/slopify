import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import type { LlmImage } from "../../kernel/ports/llm.js";
import { providerError } from "../../kernel/ports/model.js";

const extensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
// ceiling: a review shows one image, or a short's handful plus the establishing image.
export const imagesMax = 12;

// The pictures a CLI model is asked to look at, copied into a private folder of their own so
// the CLI's file tool can be confined to it: nothing else on the disk is in reach.
export function imageWorkspace(input: readonly LlmImage[] | undefined) {
  if (!input?.length) return undefined;
  if (
    input.length > imagesMax ||
    input.some((image) => !extensions.has(extname(image.path).toLowerCase()))
  )
    throw providerError({
      kind: "unsupported",
      message:
        "Slopify could not hand these pictures to the reviewer (too many, or not PNG, JPEG or WebP files), so nothing was sent. Use Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
    });
  const directory = mkdtempSync(join(tmpdir(), "slopify-images-"));
  const remove = () => rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  try {
    const files = input.map((image, index) => {
      const file = `image-${String(index + 1)}${extname(image.path).toLowerCase()}`;
      copyFileSync(image.path, join(directory, file));
      return { file, path: join(directory, file), name: image.name };
    });
    return {
      directory,
      files,
      remove,
      instructions: `Open and look at every one of these image files with the Read tool before you answer; they are in the current folder and are the only files you may open:\n${files.map((one) => `- ${one.file}: ${one.name}`).join("\n")}`,
      // Which files a Read call named, by file name: the CLI may report a relative or an
      // absolute path.
      unread(read: ReadonlySet<string>): readonly string[] {
        return files.filter((one) => !read.has(one.file)).map((one) => one.file);
      },
    };
  } catch (error) {
    remove();
    throw error;
  }
}
export type ImageWorkspace = NonNullable<ReturnType<typeof imageWorkspace>>;

export function readFileName(path: unknown): string | undefined {
  return typeof path === "string" && path !== "" ? basename(path) : undefined;
}

export function unseenImages(): Error {
  return providerError({
    kind: "unavailable",
    message:
      "The reviewer answered without opening every picture it was given, so its verdict was not used (the attempt may still have used your quota). Use Retry stage; if it keeps happening, choose Codex as the reviewer in Edit project → Reviews.",
  });
}

export function noImages(provider: string): Error {
  return providerError({
    kind: "unsupported",
    message: `Slopify can't show pictures to ${provider}, so a review that needs them was not sent. In Edit project → Reviews, choose Claude Code or Codex as the reviewer, or set the picture reviews to Off, then use Retry stage.`,
  });
}
