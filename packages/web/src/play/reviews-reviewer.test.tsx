import type { ReviewSettingsForm } from "@app/slices/reviews/model.js";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { type ReactElement, useState } from "react";
import { afterEach, expect, it } from "vitest";
import { renderApp, testDeps } from "@/test-app";
import { emptyReviews, ReviewSettings } from "./reviews";

afterEach(cleanup);

function Harness({ seen }: { readonly seen: ReviewSettingsForm[] }): ReactElement {
  const [value, setValue] = useState<ReviewSettingsForm>({
    ...emptyReviews,
    stages: { images: { mode: "flag", prompt: "" } },
  });
  return (
    <ReviewSettings
      value={value}
      providers={[]}
      prompts={[]}
      makes={() => true}
      problem={() => undefined}
      onChange={(next) => {
        seen.push(next);
        setValue(next);
      }}
    />
  );
}

it("offers the external agent as the reviewer and keeps the model pickers, disabled", () => {
  const seen: ReviewSettingsForm[] = [];
  renderApp(<Harness seen={seen} />, testDeps({}));
  fireEvent.click(screen.getByRole("button", { name: "External agent (MCP)" }));
  expect(seen.at(-1)?.reviewer).toBe("agent");
  expect(screen.getByText(/answers through MCP/)).toBeTruthy();
  expect(screen.queryByText(/need Claude Code or Codex/)).toBeNull();
  expect(screen.getByLabelText("Reviewer model").closest("fieldset[disabled]")).not.toBeNull();
});
