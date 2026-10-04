import type { CastMember, Channel } from "@app/slices/channels/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { DuplicateCastButton } from "./cast-duplicate.js";
import {
  castDeleteConsequence,
  channelDeleteConsequence,
  episodeDeleteConsequence,
} from "./delete-copy.js";

afterEach(cleanup);

const channelId = "00000000-0000-4000-8000-000000000001";
const channel: Channel = {
  id: channelId,
  name: "My channel",
  isDefault: true,
  brand: {},
  seriesBrief: "",
  aiDisclosure: "auto",
  version: 1,
  createdAt: "a",
  updatedAt: "a",
};
const member: CastMember = {
  id: "7a0c1f3e-2b4d-4e6f-8a9b-0c1d2e3f4a5b",
  channelId,
  kind: "character",
  name: "Cleopatra",
  aliases: ["the Last Pharaoh"],
  description: "A queen in gold.",
  voice: { provider: "openai-tts", model: "tts-1", voice: "alloy" },
  host: true,
  version: 1,
  images: [],
  createdAt: "a",
  updatedAt: "a",
};

it("duplicates a cast member under a free name, without its aliases or host role", async () => {
  const user = userEvent.setup();
  const sent: unknown[] = [];
  const opened: string[] = [];
  renderRouted(
    <DuplicateCastButton
      channelId={channelId}
      member={member}
      onCreated={(id) => opened.push(id)}
    />,
    testDeps({
      [`GET /api/channels/${channelId}`]: jsonAnswer({
        channel,
        cast: [member, { ...member, id: "x", name: "Cleopatra copy" }],
      }),
      [`POST /api/channels/${channelId}/cast`]: async (request) => {
        const body = (await request.json()) as { id: string; name: string };
        sent.push(body);
        return jsonAnswer({ ...member, ...body, aliases: [] })(request);
      },
    }),
  );
  const button = await screen.findByRole("button", { name: "Duplicate" });
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  await user.click(screen.getByRole("button", { name: "Duplicate" }));
  await waitFor(() => expect(opened).toHaveLength(1));
  expect(sent).toEqual([
    expect.objectContaining({
      name: "Cleopatra copy 2",
      kind: "character",
      aliases: [],
      description: "A queen in gold.",
      voice: member.voice,
      host: false,
    }),
  ]);
});

it("says every permanent deletion cannot be restored from Trash", () => {
  for (const text of [channelDeleteConsequence, castDeleteConsequence, episodeDeleteConsequence])
    expect(text).toMatch(/deleted permanently: .* do not go to Settings → Trash/u);
});
