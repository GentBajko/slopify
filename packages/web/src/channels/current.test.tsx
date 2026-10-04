import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { ChannelPicker, CurrentChannelProvider, useCurrentChannel } from "./current.js";

afterEach(cleanup);

const channel = (id: string, name: string) => ({
  id,
  name,
  isDefault: id === "c1",
  brand: {},
  seriesBrief: "",
  version: 1,
  createdAt: "x",
  updatedAt: "x",
  templates: 0,
  cast: 0,
});

function Shows({ ids }: { readonly ids: readonly string[] }) {
  const current = useCurrentChannel();
  return <p>{`Showing: ${ids.filter((id) => current.includes(id)).join(", ")}`}</p>;
}

function mount(channels = [channel("c1", "My channel"), channel("c2", "History at Bedtime")]) {
  return renderApp(
    <CurrentChannelProvider>
      <ChannelPicker />
      <Shows ids={["c1", "c2"]} />
    </CurrentChannelProvider>,
    testDeps({ "GET /api/channels": jsonAnswer({ channels }) }),
  );
}

describe("the current channel", () => {
  it("shows every channel until one is picked, then only that one's work", async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.getByText("Showing: c1, c2")).not.toBeNull();
    const picker = screen.getByLabelText("Channel");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "History at Bedtime" })).not.toBeNull(),
    );
    await user.selectOptions(picker, "c2");
    expect(screen.getByText("Showing: c2")).not.toBeNull();
    await user.selectOptions(picker, "");
    expect(screen.getByText("Showing: c1, c2")).not.toBeNull();
  });

  it("reads a channel that no longer exists as every channel", async () => {
    try {
      window.localStorage.setItem("slopify.channel", "gone");
    } catch {
      return;
    }
    mount();
    await waitFor(() => expect(screen.getByRole("option", { name: "My channel" })).not.toBeNull());
    expect(screen.getByText("Showing: c1, c2")).not.toBeNull();
    window.localStorage.removeItem("slopify.channel");
  });
  it("follows a channel picked in another tab of this browser", async () => {
    mount();
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "History at Bedtime" })).not.toBeNull(),
    );
    try {
      window.localStorage.setItem("slopify.channel", "c2");
    } catch {
      return;
    }
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "slopify.channel", newValue: "c2" }));
    });
    expect(screen.getByText("Showing: c2")).not.toBeNull();
    try {
      window.localStorage.removeItem("slopify.channel");
    } catch {
      return;
    }
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "slopify.channel", newValue: null }));
    });
    expect(screen.getByText("Showing: c1, c2")).not.toBeNull();
  });
});
