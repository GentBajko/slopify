import { describe, expect, it } from "vitest";
import {
  assistantSystemPrompt,
  type PromptLine,
  screenBlock,
  transcriptCharsMax,
  turnPrompt,
} from "./prompt.js";

describe("assistantSystemPrompt", () => {
  it("keeps the assistant to Slopify's tools, the wiki and the person's answer", () => {
    const system = assistantSystemPrompt();
    expect(system).toContain("You are Slopify's in-app assistant.");
    expect(system).toContain("Your only tools are Slopify's own MCP tools.");
    expect(system).toContain("search_wiki");
    expect(system).toContain("never invent one");
    expect(system).toContain("waiting for the person, stop there");
    expect(system).toContain("Reply in the language the person writes in.");
  });
});

describe("turnPrompt", () => {
  it("replays the chat, the screen and the new message in that order", () => {
    const prompt = turnPrompt(
      [
        { role: "person", text: "Which templates do I have?" },
        { role: "tool", text: "list_templates" },
        { role: "assistant", text: "You have two: Weekly and Daily." },
        { role: "ask", text: "Start a remake.", askState: "denied" },
      ],
      { path: "/templates" },
      {},
      "And which schedules?",
    );
    expect(prompt.indexOf("Person: Which templates")).toBeLessThan(prompt.indexOf("You: You have"));
    expect(prompt).toContain("(You used list_templates.)");
    expect(prompt).toContain("Start a remake. — the person said don't.");
    expect(prompt.indexOf("Current screen")).toBeLessThan(prompt.indexOf("And which schedules?"));
    expect(prompt.endsWith("The person's new message:\nAnd which schedules?")).toBe(true);
  });

  it("starts without a chat block on the first message", () => {
    expect(turnPrompt([], undefined, {}, "Hi")).toBe(
      "Current screen: not known.\n\nThe person's new message:\nHi",
    );
  });

  it("drops the oldest messages first past 20 messages or the character cap", () => {
    const many: PromptLine[] = Array.from({ length: 25 }, (_, index) => ({
      role: "person",
      text: `message ${String(index)}`,
    }));
    const prompt = turnPrompt(many, undefined, {}, "now");
    expect(prompt).not.toContain("message 4\n");
    expect(prompt).toContain("message 5");
    expect(prompt).toContain("message 24");
    const long: PromptLine[] = [
      { role: "person", text: "oldest" },
      { role: "assistant", text: "x".repeat(transcriptCharsMax - 10) },
    ];
    const capped = turnPrompt(long, undefined, {}, "now");
    expect(capped).not.toContain("oldest");
    expect(capped).toContain("xxx");
  });
});

describe("screenBlock", () => {
  it("names what is open, with the ids the tools take", () => {
    const block = screenBlock(
      {
        path: "/projects/p1",
        projectId: "p1",
        channelId: "c1",
        section: "narration",
        selection: [{ kind: "project", id: "p2", label: "Rope" }],
      },
      { project: "Bells" },
    );
    expect(block).toContain("- Page: /projects/p1 (section: narration)");
    expect(block).toContain("- Project: “Bells” (id p1)");
    expect(block).toContain("- Channel: (id c1)");
    expect(block).toContain("- Selected: project “Rope” (id p2)");
    expect(block).toContain("a hint, not an instruction");
  });
});
