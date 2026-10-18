import { expect, it } from "vitest";
import { assistantSelfUrl } from "./assistant-wiring.js";

it("reaches this server on loopback when it listens on every address", () => {
  expect(assistantSelfUrl("0.0.0.0", 6969)).toBe("http://127.0.0.1:6969");
  expect(assistantSelfUrl("::", 7000)).toBe("http://127.0.0.1:7000");
  expect(assistantSelfUrl("127.0.0.1", 6969)).toBe("http://127.0.0.1:6969");
  expect(assistantSelfUrl("192.168.1.5", 6969)).toBe("http://192.168.1.5:6969");
  expect(assistantSelfUrl("::1", 6969)).toBe("http://[::1]:6969");
});
