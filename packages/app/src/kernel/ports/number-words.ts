// English number words, as a narrator reads digits: subtitle timing matches them against the
// audio (`adapters/alignment/text.ts`) and the pauses weigh a sentence by how long it takes to
// say (`slices/narration/pauses.ts`).

const small = [
  "ZERO",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
  "TEN",
  "ELEVEN",
  "TWELVE",
  "THIRTEEN",
  "FOURTEEN",
  "FIFTEEN",
  "SIXTEEN",
  "SEVENTEEN",
  "EIGHTEEN",
  "NINETEEN",
] as const;
const tens = [
  "",
  "",
  "TWENTY",
  "THIRTY",
  "FORTY",
  "FIFTY",
  "SIXTY",
  "SEVENTY",
  "EIGHTY",
  "NINETY",
] as const;
const ordinal: Readonly<Record<string, string>> = {
  ONE: "FIRST",
  TWO: "SECOND",
  THREE: "THIRD",
  FIVE: "FIFTH",
  EIGHT: "EIGHTH",
  NINE: "NINTH",
  TWELVE: "TWELFTH",
};

export function cardinal(value: number): string {
  if (value < 20) return small[value] ?? "";
  if (value < 100)
    return `${tens[Math.floor(value / 10)] ?? ""} ${value % 10 === 0 ? "" : cardinal(value % 10)}`.trim();
  for (const [size, name] of [
    [1_000_000_000, "BILLION"],
    [1_000_000, "MILLION"],
    [1000, "THOUSAND"],
    [100, "HUNDRED"],
  ] as const) {
    if (value >= size)
      return `${cardinal(Math.floor(value / size))} ${name}${value % size === 0 ? "" : ` ${cardinal(value % size)}`}`;
  }
  return "";
}

export function numberForms(raw: string): readonly string[] {
  const match = /^(\d[\d,]*)(?:\.(\d+))?(s|st|nd|rd|th)?$/i.exec(raw);
  if (match === null) return [raw.replace(/\d/g, (digit) => ` ${small[Number(digit)] ?? ""} `)];
  const digits = (match[1] ?? "").replaceAll(",", "");
  const value = Number(digits);
  if (!Number.isSafeInteger(value) || value >= 1_000_000_000_000)
    return [
      digits
        .split("")
        .map((digit) => small[Number(digit)])
        .join(" "),
    ];
  const fraction = match[2];
  const suffix = match[3]?.toLowerCase();
  const decimal =
    fraction === undefined
      ? ""
      : ` POINT ${fraction
          .split("")
          .map((digit) => small[Number(digit)])
          .join(" ")}`;
  const ordinary = `${cardinal(value)}${decimal}`;
  const forms = [...(fraction === undefined ? yearForms(value) : []), ordinary];
  if (suffix === "s") return forms.map((form) => `${form.replace(/Y$/, "IE")}S`);
  if (suffix !== undefined)
    return forms.map((form) =>
      form.replace(
        /[A-Z]+$/,
        (word) => ordinal[word] ?? (word.endsWith("Y") ? `${word.slice(0, -1)}IETH` : `${word}TH`),
      ),
    );
  return forms;
}

// A four-digit number said as a year: "eleven fifty seven", "eleven o four", "thirteen hundred".
// Any year from 1000 is read this way, not only this age's: a history or a fantasy setting's
// calendar ("the year 1104") has them all through it. 2000 to 2009 are "two thousand four".
function yearForms(value: number): readonly string[] {
  if (value < 1000 || value > 2099 || (value >= 2000 && value <= 2009)) return [];
  const century = cardinal(Math.floor(value / 100));
  const rest = value % 100;
  if (rest === 0) return [`${century} HUNDRED`];
  if (rest < 10) return [`${century} O ${cardinal(rest)}`, `${century} OH ${cardinal(rest)}`];
  return [`${century} ${cardinal(rest)}`];
}
