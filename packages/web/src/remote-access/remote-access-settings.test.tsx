import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import type { RemoteAccessView } from "./api";
import { RemoteAccessSettings } from "./remote-access-settings";

afterEach(cleanup);

const view = (over: Partial<RemoteAccessView> = {}): RemoteAccessView => ({
  available: true,
  enabled: false,
  state: "off",
  address: null,
  httpsPort: 443,
  suggestedPort: null,
  summary: "Off: Slopify answers only on this computer, at http://127.0.0.1:6969.",
  fix: null,
  link: null,
  local: "http://127.0.0.1:6969",
  changeable: true,
  ...over,
});

const on = view({
  enabled: true,
  state: "on",
  address: "https://box.tail1234.ts.net",
  summary: "On: any device in your tailnet can open this address, never the public internet.",
});

it("turns it on and shows the address with a copy button and a QR code", async () => {
  let sent: unknown;
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  renderApp(
    <RemoteAccessSettings />,
    testDeps({
      "GET /api/settings/remote-access": jsonAnswer(view()),
      "PUT /api/settings/remote-access": async (request) => {
        sent = await request.json();
        return jsonAnswer(on)(request);
      },
    }),
  );
  const toggle = await screen.findByRole("switch", {
    name: "Open on my other devices (Tailscale)",
  });
  await userEvent.click(toggle);
  await waitFor(() => expect(sent).toEqual({ enabled: true }));
  expect(await screen.findByText("https://box.tail1234.ts.net")).not.toBeNull();
  expect(
    screen.getByRole("img", { name: "QR code for https://box.tail1234.ts.net" }),
  ).not.toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Copy the remote address" }));
  expect(writeText).toHaveBeenCalledWith("https://box.tail1234.ts.net");
});

it("offers another HTTPS port when 443 is taken, and asks for it", async () => {
  let sent: unknown;
  renderApp(
    <RemoteAccessSettings />,
    testDeps({
      "GET /api/settings/remote-access": jsonAnswer(
        view({
          enabled: true,
          state: "port-taken",
          suggestedPort: 8443,
          summary:
            "HTTPS port 443 on your tailnet address is already used by another Tailscale serve setting (a proxy to http://127.0.0.1:3000).",
          fix: "Press Use port 8443 to give Slopify its own address, or remove the other setting with tailscale serve --https=443 off and press Check again.",
        }),
      ),
      "PUT /api/settings/remote-access": async (request) => {
        sent = await request.json();
        return jsonAnswer({ ...on, httpsPort: 8443, address: "https://box.tail1234.ts.net:8443" })(
          request,
        );
      },
    }),
  );
  expect(
    await screen.findByText(/already used by another Tailscale serve setting/u),
  ).not.toBeNull();
  expect(screen.getByRole("button", { name: "Check again" })).not.toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Use port 8443" }));
  await waitFor(() => expect(sent).toEqual({ enabled: true, httpsPort: 8443 }));
  expect(await screen.findByText("https://box.tail1234.ts.net:8443")).not.toBeNull();
});

it("shows a problem's fix and the page it names", async () => {
  renderApp(
    <RemoteAccessSettings />,
    testDeps({
      "GET /api/settings/remote-access": jsonAnswer(
        view({
          enabled: true,
          state: "https-off",
          summary: "Your tailnet has no HTTPS certificates.",
          fix: "In the Tailscale admin console open DNS, then under HTTPS Certificates press Enable HTTPS.",
          link: "https://login.tailscale.com/admin/dns",
        }),
      ),
    }),
  );
  expect(await screen.findByText(/Enable HTTPS/u)).not.toBeNull();
  const link = screen.getByRole("link", { name: "Open the Tailscale admin console" });
  expect(link.getAttribute("href")).toBe("https://login.tailscale.com/admin/dns");
});

it("on a page opened through the remote address, shows it but leaves the switch to the computer", async () => {
  renderApp(
    <RemoteAccessSettings />,
    testDeps({ "GET /api/settings/remote-access": jsonAnswer({ ...on, changeable: false }) }),
  );
  const toggle = await screen.findByRole("switch", {
    name: "Open on my other devices (Tailscale)",
  });
  expect(toggle.hasAttribute("disabled") || toggle.getAttribute("aria-disabled") === "true").toBe(
    true,
  );
  expect(screen.getByText(/on the computer Slopify runs on/u)).not.toBeNull();
});

it("in Docker, says it needs Slopify started on the computer", async () => {
  renderApp(
    <RemoteAccessSettings />,
    testDeps({
      "GET /api/settings/remote-access": jsonAnswer(
        view({
          available: false,
          state: "docker",
          changeable: false,
          summary:
            "Slopify runs in Docker here, so it can't set up Tailscale on the computer itself.",
          fix: "Remote access needs Slopify started on the computer itself (npx @gentbajko/slopify).",
        }),
      ),
    }),
  );
  expect(await screen.findByText(/npx @gentbajko\/slopify/u)).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Check again" })).toBeNull();
});
