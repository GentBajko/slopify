import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { findField, videoInput } from "../src/selectors.js";

const fixture = readFileSync(join(import.meta.dirname, "fixtures", "studio-upload.html"), "utf8");

it("finds the upload dialog's video input on its first step, and never a thumbnail input", () => {
  document.body.innerHTML = `
    <ytcp-uploads-dialog>
      <ytcp-uploads-file-picker>
        <input type="file" name="Filedata" hidden />
      </ytcp-uploads-file-picker>
    </ytcp-uploads-dialog>`;
  expect(findField(document, videoInput)?.getAttribute("name")).toBe("Filedata");
  // The Details step holds only image inputs (the thumbnail slots).
  document.body.innerHTML = fixture;
  expect(findField(document, videoInput)).toBeNull();
});
