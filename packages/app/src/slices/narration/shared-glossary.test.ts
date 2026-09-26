import { expect, it } from "vitest";
import { withSharedGlossary } from "./shared-glossary.js";

it("keeps the project's own pronunciation of a term the others also define", () => {
  expect(
    withSharedGlossary(
      [{ term: "Thay", ipa: ["teɪ"] }],
      [
        { term: "thay", ipa: ["θeɪ"] },
        { term: "Zulkir", ipa: ["zʊlkɪɹ"] },
      ],
    ),
  ).toEqual([
    { term: "Thay", ipa: ["teɪ"] },
    { term: "Zulkir", ipa: ["zʊlkɪɹ"] },
  ]);
  expect(withSharedGlossary([{ term: "A", ipa: ["eɪ"] }], undefined)).toEqual([
    { term: "A", ipa: ["eɪ"] },
  ]);
});
