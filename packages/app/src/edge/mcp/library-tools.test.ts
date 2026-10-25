import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import { recentAgentActions } from "../../slices/agents/repo.js";
import { listNarrationAliases } from "../../slices/narration/aliases-library.js";
import { importLibrary } from "./library-tools.js";
import { connectAgent, mcpFixture, routeCallDeps } from "./mcp.fake.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

const textOf = (content: unknown): string =>
  z.array(z.object({ type: z.literal("text"), text: z.string() }).loose()).parse(content)[0]
    ?.text ?? "";
const fileOf = (name: string, body: string) => ({
  name,
  contentType: "application/json",
  base64: Buffer.from(body).toString("base64"),
});

it("exports a Library section as the page's file and imports it again, renaming what is taken", async () => {
  const h = mcpFixture();
  open.push(h);
  const agent = await connectAgent(h.app);
  await agent.callTool({
    name: "create_prompt",
    arguments: { body: { kind: "article", name: "Harbor story", body: "Write about {{topic}}." } },
  });
  const exported = z
    .object({ name: z.string(), file: z.object({ format: z.string() }).loose() })
    .parse(
      JSON.parse(
        textOf(
          (await agent.callTool({ name: "export_library", arguments: { section: "prompts" } }))
            .content,
        ),
      ),
    );
  expect(exported.name).toBe("slopify-prompts-2026-09-10.json");
  expect(exported.file.format).toBe("slopify-library");
  const imported = await agent.callTool({
    name: "import_library",
    arguments: {
      section: "prompts",
      file: fileOf(exported.name, JSON.stringify(exported.file)),
    },
  });
  expect(imported.isError).toBeUndefined();
  expect(textOf(imported.content)).toContain('"renamed":1');
  expect(textOf((await agent.callTool({ name: "list_prompts", arguments: {} })).content)).toContain(
    "Harbor story (imported)",
  );
  expect(recentAgentActions(h.deps.db).map((one) => one.tool)).toContain("import_library");
});

it("refuses a file that isn't a Slopify library file, saying which file to send", async () => {
  const h = mcpFixture();
  open.push(h);
  const agent = await connectAgent(h.app);
  const refused = await agent.callTool({
    name: "import_library",
    arguments: { section: "prompts", file: fileOf("notes.json", '{"hello":1}') },
  });
  expect(refused.isError).toBe(true);
  expect(textOf(refused.content)).toContain("isn't a Slopify library file");
});

it("imports an alias table and saves it like Save aliases", async () => {
  const h = mcpFixture();
  open.push(h);
  const agent = await connectAgent(h.app);
  const imported = await agent.callTool({
    name: "import_library",
    arguments: { section: "aliases", file: fileOf("aliases.csv", "Dr.,Doctor\nSt.,Saint\n") },
  });
  expect(imported.isError).toBeUndefined();
  expect(listNarrationAliases(h.deps.db).map((alias) => alias.spoken)).toEqual(["Doctor", "Saint"]);
});

it("says what to do when saving the aliases fails without a reason", async () => {
  const deps = routeCallDeps(async () => new Response(null, { status: 500 }));
  const refused = await importLibrary(deps, "aliases", fileOf("aliases.csv", "Dr.,Doctor\n"));
  expect(refused.isError).toBe(true);
  expect(textOf(refused.content)).toBe(
    "aliases.csv wasn't imported: Import prompts, intros and outros, PDF looks or pronunciations failed: Slopify answered HTTP 500 without saying why. Call import_library again; if it keeps failing, use Download diagnostics in Settings and report it.",
  );
});
