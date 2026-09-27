import { z } from "zod";
import {
  aliasCountMax,
  aliasSpokenMax,
  aliasWrittenMax,
  type NarrationAlias,
} from "../../kernel/ports/narration-aliases.js";

// One alias as a project config and Library → Aliases store it.
export const narrationAliasSchema = z
  .object({
    written: z.string().trim().min(1).max(aliasWrittenMax),
    spoken: z.string().trim().min(1).max(aliasSpokenMax),
    wholeWord: z.boolean(),
    caseSensitive: z.boolean(),
  })
  .strict()
  .readonly();
export const narrationAliasesSchema = z.array(narrationAliasSchema).max(aliasCountMax).readonly();

// The field problems of a Library save, each naming the row a person sees (1-based), so the
// editor can say "Alias 3: …" instead of a schema path.
export interface AliasProblem {
  readonly field: string;
  readonly message: string;
}
export function aliasProblems(rows: readonly unknown[]): readonly AliasProblem[] {
  const problems: AliasProblem[] = [];
  if (rows.length > aliasCountMax)
    problems.push({
      field: "aliases",
      message: `Keep at most ${aliasCountMax} aliases; remove some, then Save.`,
    });
  const seen = new Map<string, number>();
  for (const [index, raw] of rows.entries()) {
    const row = index + 1;
    const parsed = narrationAliasSchema.safeParse(raw);
    if (!parsed.success) {
      const written = z.object({ written: z.string() }).safeParse(raw);
      const spoken = z.object({ spoken: z.string() }).safeParse(raw);
      problems.push({
        field: `aliases.${index}`,
        message:
          !written.success || written.data.written.trim() === ""
            ? `Alias ${row}: write the word or phrase as it appears in the article.`
            : !spoken.success || spoken.data.spoken.trim() === ""
              ? `Alias ${row}: write how the narrator should say it.`
              : `Alias ${row}: keep the written form under ${aliasWrittenMax} characters and the spoken form under ${aliasSpokenMax}.`,
      });
      continue;
    }
    const key = aliasKey(parsed.data);
    const earlier = seen.get(key);
    if (earlier !== undefined)
      problems.push({
        field: `aliases.${index}`,
        message: `Alias ${row}: alias ${earlier} already covers the same written form; keep one of them.`,
      });
    else seen.set(key, row);
  }
  return problems;
}
function aliasKey(alias: NarrationAlias): string {
  const written = alias.written.trim().replace(/\s+/gu, " ");
  return alias.caseSensitive ? `=${written}` : `~${written.toLocaleLowerCase("en")}`;
}
