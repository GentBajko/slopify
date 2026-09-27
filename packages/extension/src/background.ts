import { browserApi } from "./browser.js";
import type { ActivePack, FillPayload, WorkerAnswer, WorkerRequest } from "./pack.js";

// The background worker: the only part of the extension that talks to Slopify. It keeps the
// Slopify address and the pairing token, reads the chosen upload pack and its thumbnails, and
// hands them to the Studio page. It only reads; it never sends Slopify anything but the token.

const api = browserApi();

interface Pairing {
  readonly base: string;
  readonly token: string;
}

async function pairing(): Promise<Pairing | undefined> {
  const stored = await api.storage.local.get(["base", "token"]);
  return typeof stored.base === "string" && typeof stored.token === "string"
    ? { base: stored.base, token: stored.token }
    : undefined;
}

// A problem+json body's detail, else a sentence about the status.
async function failure(response: Response, what: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // Not JSON: fall through.
  }
  return `Slopify answered ${String(response.status)} when asked for ${what}. Check Slopify is running, then try again.`;
}

async function call(path: string, current: Pairing): Promise<Response> {
  try {
    return await fetch(`${current.base}${path}`, {
      headers: { authorization: `Bearer ${current.token}` },
    });
  } catch {
    throw new Error(
      `Couldn't reach Slopify at ${current.base}. Start Slopify, check the address in the extension's options, then try again.`,
    );
  }
}

function base64(bytes: ArrayBuffer): string {
  let binary = "";
  const view = new Uint8Array(bytes);
  for (let at = 0; at < view.length; at += 0x8000)
    binary += String.fromCharCode(...view.subarray(at, at + 0x8000));
  return btoa(binary);
}

async function payload(): Promise<FillPayload> {
  const current = await pairing();
  if (current === undefined)
    throw new Error(
      "The extension isn't paired with Slopify yet. Open the extension's options, paste the pairing token from Slopify's Settings → YouTube Studio and press Pair.",
    );
  const response = await call("/api/studio/ext/pack", current);
  if (!response.ok) throw new Error(await failure(response, "the upload pack"));
  const { pack, item } = (await response.json()) as ActivePack;
  const thumbnails = [];
  for (const file of item.thumbnails) {
    const got = await call(`/api/studio/ext/files/${pack.projectId}/${file.asset}`, current);
    if (!got.ok) throw new Error(await failure(got, `thumbnail ${file.filename}`));
    thumbnails.push({
      filename: file.filename,
      contentType: file.contentType,
      base64: base64(await got.arrayBuffer()),
    });
  }
  return { item, thumbnails };
}

async function pair(base: string, token: string): Promise<string> {
  const trimmed = base.trim().replace(/\/+$/, "");
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(trimmed))
    throw new Error(
      "The Slopify address must be this computer, like http://127.0.0.1:6969. Copy it from the browser tab Slopify is open in.",
    );
  let response: Response;
  try {
    response = await fetch(`${trimmed}/api/studio/ext/pair`, {
      method: "POST",
      headers: { authorization: `Bearer ${token.trim()}` },
    });
  } catch {
    throw new Error(`Couldn't reach Slopify at ${trimmed}. Start Slopify and check the address.`);
  }
  if (!response.ok) throw new Error(await failure(response, "pairing"));
  await api.storage.local.set({ base: trimmed, token: token.trim() });
  return trimmed;
}

async function answer(request: WorkerRequest): Promise<WorkerAnswer<unknown>> {
  try {
    if (request.type === "pair")
      return { ok: true, value: await pair(request.base, request.token) };
    if (request.type === "status") return { ok: true, value: (await pairing())?.base ?? null };
    return { ok: true, value: await payload() };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

api.runtime.onMessage.addListener((message, _sender, respond) => {
  void answer(message as WorkerRequest).then(respond);
  // The answer comes later.
  return true;
});

// The toolbar button opens the pairing page.
api.action?.onClicked.addListener(() => {
  void api.runtime.openOptionsPage();
});
