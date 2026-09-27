import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { freshDraftDocument } from "./draft-state";
import { ImageScaleControl } from "./image-scale";

afterEach(cleanup);

const start: PlayDraftDocument = {
  ...freshDraftDocument,
  // 9,000 words is an hour of narration.
  expectedWords: "9000",
  form: {
    ...freshDraftDocument.form,
    imagePrompts: [
      { name: "Wide", number: "3" },
      { name: "Close", number: "1" },
    ],
  },
};

let latest: PlayDraftDocument = start;
function Subject({ initial = start }: { readonly initial?: PlayDraftDocument }) {
  const [document, setDocument] = useState(initial);
  latest = document;
  return (
    <ImageScaleControl
      document={document}
      problem={() => undefined}
      onEdit={(next) => {
        latest = next;
        setDocument(next);
      }}
    />
  );
}

describe("more images for long videos", () => {
  it("is off by default and adds nothing to the draft", () => {
    render(<Subject />);
    const toggle = screen.getByRole("switch", { name: "More images for long videos" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByLabelText("Minutes per image")).toBeNull();
    expect("imageScale" in latest.form).toBe(false);
  });

  it("switches on at one image every two minutes, pans and zooms by turns, and says what it makes", () => {
    render(<Subject />);
    fireEvent.click(screen.getByRole("switch", { name: "More images for long videos" }));
    expect(latest.form.imageScale).toEqual({ every: "minutes", value: "2" });
    expect(latest.form.motionStyle).toBe("mixed");
    expect(
      screen.getByText(
        "For about 60 minutes (9,000 words expected, set on Review): 30 images, 26 more than the prompts' 4.",
      ),
    ).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Minutes per image"), { target: { value: "0" } });
    expect(screen.getByText("Enter a number of minutes between 0.25 and 60.")).not.toBeNull();
  });

  it("keeps the rate when it is given per hour instead", () => {
    render(<Subject />);
    fireEvent.click(screen.getByRole("switch", { name: "More images for long videos" }));
    fireEvent.change(screen.getByLabelText("Minutes per image"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "N per hour" }));
    expect(latest.form.imageScale).toEqual({ every: "hour", value: "12" });
    expect((screen.getByLabelText("Images per hour") as HTMLInputElement).value).toBe("12");
  });

  it("leaves a motion style the user picked, and removes the setting when switched off", () => {
    render(<Subject initial={{ ...start, form: { ...start.form, motionStyle: "still" } }} />);
    const toggle = screen.getByRole("switch", { name: "More images for long videos" });
    fireEvent.click(toggle);
    expect(latest.form.motionStyle).toBe("still");
    fireEvent.click(toggle);
    expect("imageScale" in latest.form).toBe(false);
  });
});
