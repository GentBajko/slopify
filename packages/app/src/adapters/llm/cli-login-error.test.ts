import { expect, it } from "vitest";
import { cliLoginError } from "./cli-login-error.js";

it.each([
  "Not logged in",
  "Please run /login",
  "Not logged in. Run codex login",
  "Authentication required",
  "Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.",
  "OAuth token has expired. Please run /login.",
])("recognizes explicit CLI login failure: %s", (text) => {
  expect(cliLoginError("codex", text)?.fault.kind).toBe("missing_key");
});
it.each([
  "Invalid API key · Please run /login",
  "unknown model",
  "An article about authentication",
])("leaves other errors alone: %s", (text) => {
  expect(cliLoginError("claude-code", text)).toBeUndefined();
});
