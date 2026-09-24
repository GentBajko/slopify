const { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { createHash, randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const { basename, join } = require("node:path");
const { spawn } = require("node:child_process");

const home = process.env.HOME;
if (!home || !existsSync(join(home, "fixture-only"))) throw new Error("Not a test home");
const provider = basename(process.argv[1]);
const args = process.argv.slice(2);
const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
if (args.includes("--version")) {
  console.log(provider === "claude" ? "2.1.263" : provider === "codex" ? "0.149.1" : "0.61.0");
} else if (args.includes("status")) {
  console.log(provider === "claude" ? '{"loggedIn":true}' : "Logged in using ChatGPT");
} else if (provider === "claude" && args.includes("--input-format")) {
  let input = "";
  process.stdin.on("data", (bytes) => {
    input += bytes;
    if (!input.includes("\n")) return;
    const { request_id } = JSON.parse(input);
    emit({
      type: "control_response",
      response: {
        request_id,
        subtype: "success",
        response: {
          models: [{ value: "sonnet", resolvedModel: "claude-sonnet-5", displayName: "Sonnet" }],
        },
      },
    });
  });
} else {
  if (!(provider === "codex" && args[args.indexOf("image_generation") - 1] === "--enable")) {
    let prompt = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (text) => {
      prompt += text;
    });
    process.stdin.on("end", () => generate(prompt).catch(fail));
  } else generate(args.at(-1)).catch(fail);
}
function fail(error) {
  console.error(error);
  process.exitCode = 1;
}
async function readDocuments(prompt) {
  let config;
  if (provider === "claude" && args.includes("--mcp-config"))
    config = JSON.parse(readFileSync(args[args.indexOf("--mcp-config") + 1], "utf8")).mcpServers
      .slopify_research;
  else if (
    provider === "codex" &&
    args.some((arg) => arg.startsWith("mcp_servers.slopify_research.command="))
  ) {
    const value = (key) =>
      JSON.parse(
        args
          .find((arg) => arg.startsWith(`mcp_servers.slopify_research.${key}=`))
          .split("=")
          .slice(1)
          .join("="),
      );
    config = { command: value("command"), args: value("args") };
  } else if (provider === "gemini")
    config = JSON.parse(
      readFileSync(join(process.env.GEMINI_CLI_HOME, ".gemini", "settings.json"), "utf8"),
    ).mcpServers?.slopify_research;
  if (!config) return [];
  const fromApp = createRequire(config.args[0]);
  const { Client } = fromApp("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = fromApp("@modelcontextprotocol/sdk/client/stdio.js");
  const index = JSON.parse(/Research document index[^\n]*\n([^\n]+)/.exec(prompt)[1]);
  const client = new Client({ name: "fixture-cli", version: "1" });
  const documents = [];
  try {
    await client.connect(new StdioClientTransport(config));
    for (const document of index) {
      let offset = 0;
      let content = "";
      do {
        const result = await client.callTool({
          name: "read_document",
          arguments: { id: document.id, offset },
        });
        if (result.isError) throw new Error("Fixture document read failed");
        const page = JSON.parse(result.content[0].text);
        content += page.text;
        offset = page.nextOffset;
      } while (offset !== null);
      documents.push({
        id: document.id,
        sha256: createHash("sha256").update(content).digest("hex"),
      });
    }
  } finally {
    await client.close();
  }
  return documents;
}
async function generate(prompt) {
  const documents = await readDocuments(prompt);
  const threadId = randomUUID();
  const held = /HOLD_(CANCEL|FINISH|DROP)/.exec(prompt)?.[0];
  const child = held
    ? spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
    : undefined;
  appendFileSync(
    join(home, "calls.jsonl"),
    `${JSON.stringify({
      provider,
      pid: process.pid,
      child: child?.pid,
      uid: process.getuid(),
      cwd: process.cwd(),
      home,
      held,
      documents,
    })}\n`,
  );
  if (provider === "codex") emit({ type: "thread.started", thread_id: threadId });
  process.on("SIGTERM", () => {
    if (!child) process.exit(0);
    child.once("exit", () => process.exit(0));
    child.kill();
  });
  const finish = () => {
    if (provider === "codex") {
      if (args[args.indexOf("image_generation") - 1] === "--enable") {
        const directory = join(home, ".codex", "generated_images", threadId);
        mkdirSync(directory, { recursive: true });
        writeFileSync(
          join(directory, `exec-${randomUUID()}.png`),
          readFileSync(join(home, "image.png")),
        );
      } else
        emit({
          type: "item.completed",
          item: { type: "agent_message", text: "Host fixture answer." },
        });
      emit({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 2 } });
    } else if (provider === "claude") {
      emit({
        type: "assistant",
        message: { content: [{ type: "text", text: "Host fixture answer." }] },
      });
      emit({ type: "result", subtype: "success", result: "Host fixture answer." });
    } else {
      emit({ type: "message", role: "assistant", content: "Host fixture answer." });
      emit({ type: "result", status: "success" });
    }
    child?.kill();
  };
  if (held) {
    emit({ type: provider === "codex" ? "turn.started" : "init" });
    const interval = setInterval(() => {
      if (held === "HOLD_FINISH" && existsSync(join(home, "finish"))) {
        clearInterval(interval);
        finish();
      }
    }, 20);
  } else finish();
}
