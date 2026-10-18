// One read of a provider's free endpoint (an account page, a model list or a model's own
// page) with the key's headers: the answer, or undefined when nothing came back in time.
// Nothing is generated or billed. Shared by the health check's "Model reachable" and the
// model list's "Listed for you".
export interface ProbeAnswer {
  readonly status: number;
  readonly body: string;
}

export async function probeRead(
  fetch: typeof globalThis.fetch,
  url: string,
  headers: Readonly<Record<string, string>>,
  withBody: boolean,
): Promise<ProbeAnswer | undefined> {
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    const body = withBody ? await response.text() : "";
    if (!withBody) await response.body?.cancel().catch(() => {});
    return { status: response.status, body };
  } catch {
    return undefined;
  }
}
