import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CommandText } from "./command-text";

afterEach(cleanup);

const commands = (text: string) =>
  [...render(<CommandText text={text} />).container.querySelectorAll("code")].map(
    (code) => code.textContent,
  );

it("sets each command in a sentence apart as code, exactly as typed", () => {
  expect(
    commands("Turn Funnel off with tailscale funnel --https=443 off, then press Check again."),
  ).toEqual(["tailscale funnel --https=443 off"]);
  expect(
    commands(
      "Or set Tailscale up yourself on the host: tailscale serve --bg --https=443 http://127.0.0.1:<Slopify's port>.",
    ),
  ).toEqual(["tailscale serve --bg --https=443 http://127.0.0.1:<Slopify's port>"]);
  expect(commands("Run tailscale serve status in a terminal to see what Tailscale has.")).toEqual([
    "tailscale serve status",
  ]);
  expect(commands("Start Slopify with npx @gentbajko/slopify to use it.")).toEqual([
    "npx @gentbajko/slopify",
  ]);
});

it("keeps the sentence around the command word for word", () => {
  const text = "Remove it yourself with tailscale serve --https=8443 off.";
  const { container } = render(<CommandText text={text} />);
  expect(container.textContent).toBe(text);
  expect(container.querySelector("code")?.className).toContain("sl-command");
});
