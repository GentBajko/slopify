import { expect, it } from "vitest";
import { candidateReady } from "./readiness.js";

it("uses the private readiness endpoint so a different same-version instance cannot pass", async () => {
  const found = await candidateReady(
    "http://127.0.0.1:6969",
    "0.6.2",
    "a".repeat(64),
    () => false,
    async (url, init) => {
      expect(String(url)).toBe("http://127.0.0.1:6969/api/update/ready");
      expect(new Headers(init?.headers).get("X-Slopify-Update-Token")).toBe("a".repeat(64));
      return Response.json({ status: "ok", version: "0.6.2" }, { status: 403 });
    },
  );
  expect(found).toBe(false);
});
it("rejects a candidate that exits while its readiness response is arriving", async () => {
  let exited = false;
  expect(
    await candidateReady(
      "http://127.0.0.1:6969",
      "0.6.2",
      "a".repeat(64),
      () => exited,
      async () => {
        exited = true;
        return Response.json({ status: "ok", version: "0.6.2" });
      },
    ),
  ).toBe(false);
});
it("accepts a live authenticated candidate with the expected version", async () => {
  expect(
    await candidateReady(
      "http://127.0.0.1:6969",
      "0.6.2",
      "a".repeat(64),
      () => false,
      async () => Response.json({ status: "ok", version: "0.6.2" }),
    ),
  ).toBe(true);
});
