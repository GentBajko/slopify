const { appendFileSync, existsSync, readFileSync, writeFileSync } = require("node:fs");
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
  const prompt = args.at(-1);
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
    })}\n`,
  );
  process.on("SIGTERM", () => {
    if (!child) process.exit(0);
    child.once("exit", () => process.exit(0));
    child.kill();
  });
  const finish = () => {
    if (provider === "codex") {
      if (args[args.indexOf("image_generation") - 1] === "--enable")
        writeFileSync(join(process.cwd(), "result.png"), readFileSync(join(home, "image.png")));
      else
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
      emit({ type: "result", subtype: "success" });
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
