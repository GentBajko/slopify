import { z } from "zod";
import { type Readiness, readinessIsUsable } from "../../kernel/ports/model.js";
import { formBody, type RouteTool } from "./route-tool.js";

const readinessShape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("keyed"), hasKey: z.boolean() }).loose(),
  z
    .object({ kind: z.literal("cli"), installed: z.boolean(), issue: z.string().optional() })
    .loose(),
  z
    .object({ kind: z.literal("local"), available: z.boolean(), issue: z.string().optional() })
    .loose(),
]);
const providerList = z.object({
  providers: z.array(
    z.object({
      id: z.string(),
      family: z.string(),
      displayName: z.string(),
      readiness: z.custom<Readiness>((value) => readinessShape.safeParse(value).success),
    }),
  ),
});

// Providers as agents see them: set up or not, never whether a key exists or where a CLI is.
export function configuredOrMissing(value: unknown): unknown {
  const parsed = providerList.safeParse(value);
  if (!parsed.success) return { providers: [] };
  return {
    providers: parsed.data.providers.map((provider) => ({
      id: provider.id,
      family: provider.family,
      displayName: provider.displayName,
      state: readinessIsUsable(provider.readiness) ? "configured" : "missing",
    })),
  };
}

// The Studio settings without the extension's pairing token (a credential) and its unpacked
// folder (host setup).
export function withoutExtensionSecrets(value: unknown): unknown {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  return parsed.success
    ? Object.fromEntries(
        Object.entries(parsed.data).filter(([key]) => key !== "pairing" && key !== "unpacked"),
      )
    : {};
}

// The Notification URL can carry a secret (a webhook's token, a private ntfy topic): agents are
// told only whether one is set, and change it with set_notification_url.
export function notificationUrlState(value: unknown): unknown {
  const parsed = z.object({ url: z.string().nullable() }).loose().safeParse(value);
  const url = parsed.success ? parsed.data.url : null;
  return { notificationUrl: url === null || url.trim() === "" ? "missing" : "configured" };
}

const settings: readonly RouteTool[] = [
  {
    name: "get_settings",
    route: "GET /api/settings",
    title: "Read production defaults",
    description: "Settings → Production defaults: silence gap, appearance and loudness.",
  },
  {
    name: "update_settings",
    route: "PUT /api/settings",
    title: "Save production defaults",
    description:
      "Body: {silenceGapSeconds, appearance: system | light | dark, loudness?: {enabled, videoLufs, audioFilesLufs}}.",
  },
  {
    name: "get_default_channel_links",
    route: "GET /api/settings/channel-links",
    title: "Read the default channel links",
    description:
      "Settings → Channel links: the links a description's {{Name}} placeholders fill from.",
  },
  {
    name: "set_default_channel_links",
    route: "PUT /api/settings/channel-links",
    title: "Save the default channel links",
    description: "Body: {links: [{name, url}]}.",
  },
  {
    name: "get_notification_url",
    route: "GET /api/settings/notifications",
    title: "Check the Notification URL",
    description:
      "Whether run notifications have somewhere to go: configured or missing. The address itself is never shown to agents.",
    shape: notificationUrlState,
  },
  {
    name: "set_notification_url",
    route: "PUT /api/settings/notifications",
    title: "Save the Notification URL",
    description:
      "Body: {url: an http(s) address, or empty to stop}. Answers configured or missing, never the address.",
    shape: notificationUrlState,
  },
  {
    name: "send_test_notification",
    route: "POST /api/settings/notifications/test",
    title: "Send a test notification",
    description: "Body: {url}.",
    readOnly: true,
    reachesOut: true,
  },
  {
    name: "list_voices",
    route: "GET /api/settings/voices",
    title: "List voices",
    description: "Settings → Voices.",
  },
  {
    name: "add_voice",
    route: "POST /api/settings/voices",
    title: "Add a voice",
    description: "Body: {provider, name, voiceId, languages?: [primary language codes]}.",
  },
  {
    name: "set_voice_languages",
    route: "PUT /api/settings/voices/:id/languages",
    title: "Set a voice's languages",
    description: formBody("Settings → Voices' languages"),
  },
  {
    name: "set_voice_real_person",
    route: "PUT /api/settings/voices/:id/real-person",
    title: "Mark a voice as a real person's",
    description: formBody("Settings → Voices' real-person box"),
  },
  {
    name: "remove_voice",
    route: "DELETE /api/settings/voices/:id",
    title: "Remove a voice",
    description: "Removes the voice from Settings → Voices.",
    confirm: "Projects that used this voice keep the audio they made with it.",
  },
  {
    name: "quote_voice_sample",
    route: "POST /api/auditions/quote",
    title: "Price a voice sample",
    description:
      "Try a sample's price, as Play shows it before playing one. Body: {lines: [{speaker, provider, model, text}]}.",
    readOnly: true,
  },
  {
    name: "get_usage",
    route: "GET /api/usage",
    title: "Read usage",
    description: "Settings → Usage: this machine's usage counters.",
  },
  {
    name: "get_diagnostics",
    route: "GET /api/diagnostics",
    title: "Download diagnostics",
    description:
      "What Download diagnostics saves: versions, secret-free provider readiness, the project count and the model catalogue's state.",
  },
  {
    name: "get_studio_settings",
    route: "GET /api/studio/settings",
    title: "Read YouTube Studio settings",
    description:
      "Settings → YouTube Studio: the playlists upload packs name, and whether the comment is posted.",
    shape: withoutExtensionSecrets,
  },
  {
    name: "set_studio_playlists",
    route: "PUT /api/studio/settings/playlists",
    title: "Save playlist kinds",
    description:
      "Playlist kinds: the playlists upload packs name (long videos, shorts or both), for every channel or one. Body: {playlists: [{name, byDefault, for?: long | shorts | both}], channelId?}.",
  },
  {
    name: "get_agent_connection",
    route: "GET /api/settings/agents",
    title: "Read Settings → Connections → Agents (MCP)",
    description:
      "When an agent last connected to Slopify's MCP endpoint, and the latest changes agents made, as Settings → Connections → Agents (MCP) lists them.",
  },
];

const providers: readonly RouteTool[] = [
  {
    name: "list_providers",
    route: "GET /api/providers",
    title: "List providers",
    description: "Each provider as configured or missing.",
    shape: configuredOrMissing,
  },
  {
    name: "list_models",
    route: "GET /api/providers/:id/models",
    title: "List a provider's models",
    description: "The models Slopify offers for the provider, with prices where known.",
  },
  {
    name: "list_system_voices",
    route: "GET /api/providers/system-voice/voices",
    title: "List the computer's voices",
    description: "Voices of the computer's own speech program.",
  },
  {
    name: "check_providers",
    route: "POST /api/providers/health",
    title: "Check providers",
    description:
      "Settings → Providers' Check all: which providers answer and which CLIs are signed in.",
    readOnly: true,
  },
  {
    name: "get_catalogue",
    route: "GET /api/providers/catalogue",
    title: "Read the model catalogue",
    description: "When the model catalogue was updated and any warning.",
  },
  {
    name: "check_catalogue",
    route: "POST /api/providers/catalogue/check",
    title: "Check the model catalogue",
    description:
      "Checks the published model catalogue and merges what changed into models.yaml (Settings → Models, Check now).",
  },
  {
    name: "refresh_catalogue",
    route: "POST /api/providers/catalogue/refresh",
    title: "Refresh the model catalogue",
    description: "Downloads the newest model catalogue.",
  },
  {
    name: "list_retired_models",
    route: "GET /api/providers/catalogue/retired",
    title: "List retired models in use",
    description: "Templates, drafts and schedules that use a retired model.",
  },
  {
    name: "switch_retired_model",
    route: "POST /api/providers/catalogue/retired/switch",
    title: "Switch a retired model",
    description: formBody("Settings → Models' Switch"),
  },
  {
    name: "switch_all_retired_models",
    route: "POST /api/providers/catalogue/retired/switch-all",
    title: "Switch every retired model",
    description: "Switches every use of a retired model to its suggested replacement.",
  },
];

export const setupTools: readonly RouteTool[] = [...settings, ...providers];
