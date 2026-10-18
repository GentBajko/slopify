import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { z } from "zod";

const workflow = (name: string): unknown =>
  parse(readFileSync(new URL(`../../../.github/workflows/${name}`, import.meta.url), "utf8"));

// A push made with GITHUB_TOKEN starts no workflow, so the daily catalogue pull request would
// show no checks. A dispatch is the one event that token may start, with no other secret.
it("runs CI on the Catalogue workflow's pull request branch", () => {
  const ci = z.object({ on: z.record(z.string(), z.unknown()) }).parse(workflow("ci.yml"));
  expect(Object.keys(ci.on)).toContain("workflow_dispatch");
  const catalogue = z
    .object({
      permissions: z.record(z.string(), z.string()),
      jobs: z.object({
        propose: z.object({ steps: z.array(z.object({ run: z.string().optional() })) }),
      }),
    })
    .parse(workflow("catalogue.yml"));
  expect(catalogue.permissions.actions).toBe("write");
  const last = catalogue.jobs.propose.steps.at(-1)?.run ?? "";
  expect(last.indexOf("gh workflow run ci.yml --ref chore/catalogue-daily")).toBeGreaterThan(
    last.indexOf("git push --force origin chore/catalogue-daily"),
  );
});
