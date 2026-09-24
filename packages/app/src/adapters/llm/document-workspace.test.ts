import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, it } from "vitest";
import { documentWorkspace } from "./document-workspace.js";

it("serves a full large document through bounded pages, only for this request", async () => {
  const content = `${"ç🌊".repeat(50000)}\nSources\nhttps://example.test`;
  const workspace = documentWorkspace([{ id: "research-1", title: "Original report", content }]);
  const other = documentWorkspace([{ id: "other", title: "Other request", content: "Private" }]);
  if (!workspace || !other) throw new Error("workspace missing");
  const client = new Client({ name: "slopify-test", version: "1" });
  try {
    expect(() => workspace.verifyRead()).toThrow(/not read/i);
    expect(readFileSync(`${workspace.directory}/research-1.md`, "utf8")).toBe(content);
    await client.connect(
      new StdioClientTransport({ command: workspace.command, args: [...workspace.args] }),
    );
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(["read_document"]);
    const unknown = await client.callTool({
      name: "read_document",
      arguments: { id: "other", offset: 0 },
    });
    expect(unknown.isError).toBe(true);
    const traversal = await client.callTool({
      name: "read_document",
      arguments: { id: "../research-1", offset: 0 },
    });
    expect(traversal.isError).toBe(true);
    let result = "";
    while (result.length < content.length) {
      const page = await client.callTool({
        name: "read_document",
        arguments: { id: "research-1", offset: result.length },
      });
      const blocks = page.content as { type: string; text: string }[];
      const value = JSON.parse(blocks[0]?.text ?? "null");
      expect(value.text.length).toBeLessThanOrEqual(16000);
      result += value.text;
      expect(value.nextOffset).toBe(result.length === content.length ? null : result.length);
    }
    expect(result).toBe(content);
    expect(() => workspace.verifyRead()).not.toThrow();
    expect(() => other.verifyRead()).toThrow(/not read/i);
  } finally {
    await client.close();
    workspace.remove();
    other.remove();
  }
  expect(existsSync(workspace.directory)).toBe(false);
});

it("rejects unsafe, duplicate and oversized documents before starting a provider", () => {
  expect(() => documentWorkspace([{ id: "../secret", title: "bad", content: "bad" }])).toThrow();
  expect(() =>
    documentWorkspace([1, 2].map(() => ({ id: "same", title: "duplicate", content: "x" }))),
  ).toThrow();
  expect(() =>
    documentWorkspace([{ id: "big", title: "big", content: "x".repeat(2 * 1024 * 1024 + 1) }]),
  ).toThrow();
  expect(documentWorkspace([])).toBeUndefined();
});

it("refuses a report changed after its request was frozen", async () => {
  const workspace = documentWorkspace([
    { id: "research-1", title: "Original", content: "Untouched report." },
  ]);
  if (!workspace) throw new Error("workspace missing");
  const client = new Client({ name: "slopify-test", version: "1" });
  try {
    writeFileSync(`${workspace.directory}/research-1.md`, "Changed report.");
    await expect(
      client.connect(
        new StdioClientTransport({
          command: workspace.command,
          args: [...workspace.args],
          stderr: "pipe",
        }),
      ),
    ).rejects.toThrow();
    expect(() => workspace.verifyRead()).toThrow(/not read/);
  } finally {
    await client.close();
    workspace.remove();
  }
});
