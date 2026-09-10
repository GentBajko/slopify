import { expect, it } from "vitest";
import { publishedVersion } from "./registry.js";

it("checks only the fixed npm package with a bounded request and refuses redirects", async () => {
  expect(
    await publishedVersion(async (url, init) => {
      expect(String(url)).toBe("https://registry.npmjs.org/@gentbajko%2Fslopify/latest");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.redirect).toBe("error");
      return Response.json({ name: "@gentbajko/slopify", version: "0.6.2" });
    }),
  ).toBe("0.6.2");
});

it.each([
  { name: "another-package", version: "0.6.2" },
  { name: "@gentbajko/slopify", version: "https://other.example/package.tgz" },
  { name: "@gentbajko/slopify", version: "0.6.2-beta.1" },
])("rejects untrusted release metadata %j", async (body) => {
  await expect(publishedVersion(async () => Response.json(body))).rejects.toThrow("invalid");
});
