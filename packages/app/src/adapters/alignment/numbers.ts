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
  const year =
    value >= 1900 && value <= 2099 && value % 100 >= 10
      ? `${cardinal(Math.floor(value / 100))} ${cardinal(value % 100)}`
      : undefined;
  const forms = year === undefined ? [ordinary] : [year, ordinary];
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
