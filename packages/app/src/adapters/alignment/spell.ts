// Number words for the languages the multilingual model times, so a numeral in the article
// matches what the voice said. Lower case, words separated by spaces (hyphens are spaces to
// the aligner anyway). Each speller covers 0 to 999,999,999,999; the aligner reads longer
// numbers digit by digit, as it does in English.

export interface Speller {
  readonly cardinal: (value: number) => string;
  // How a number between 1100 and 1999 is read as a year, where that differs; tried first,
  // as English reads 1990 as "nineteen ninety" before "one thousand nine hundred ninety".
  readonly year?: (value: number) => string | undefined;
  // Other ways the same number is commonly read (a regional or dropped "one").
  readonly alternatives?: (value: number) => readonly string[];
  readonly decimal: string;
  readonly percent: string;
  readonly euro: string;
  readonly dollar: string;
  readonly pound: string;
  readonly and: string;
}

const split = (value: number, size: number): readonly [number, number] => [
  Math.floor(value / size),
  value % size,
];
const join = (...parts: readonly string[]): string => parts.filter((part) => part !== "").join(" ");

// Spanish.
const esSmall = [
  "cero",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte",
  "veintiuno",
  "veintidós",
  "veintitrés",
  "veinticuatro",
  "veinticinco",
  "veintiséis",
  "veintisiete",
  "veintiocho",
  "veintinueve",
];
const esTens = [
  "",
  "",
  "",
  "treinta",
  "cuarenta",
  "cincuenta",
  "sesenta",
  "setenta",
  "ochenta",
  "noventa",
];
const esHundreds = [
  "",
  "ciento",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
  "seiscientos",
  "setecientos",
  "ochocientos",
  "novecientos",
];
// "uno" shortens before a noun: veintiún mil, treinta y un millones.
const esApocope = (words: string): string =>
  words.replace(/veintiuno$/, "veintiún").replace(/(^|\s)uno$/, "$1un");
function es(value: number): string {
  if (value < 30) return esSmall[value] ?? "";
  if (value < 100) {
    const [tens, unit] = split(value, 10);
    return unit === 0 ? (esTens[tens] ?? "") : `${esTens[tens]} y ${esSmall[unit]}`;
  }
  if (value < 1000) {
    if (value === 100) return "cien";
    const [hundreds, rest] = split(value, 100);
    return join(esHundreds[hundreds] ?? "", rest === 0 ? "" : es(rest));
  }
  if (value < 1_000_000) {
    const [thousands, rest] = split(value, 1000);
    return join(
      thousands === 1 ? "mil" : `${esApocope(es(thousands))} mil`,
      rest === 0 ? "" : es(rest),
    );
  }
  const [millions, rest] = split(value, 1_000_000);
  return join(
    millions === 1 ? "un millón" : `${esApocope(es(millions))} millones`,
    rest === 0 ? "" : es(rest),
  );
}

// German: one word below a million.
const deSmall = [
  "null",
  "eins",
  "zwei",
  "drei",
  "vier",
  "fünf",
  "sechs",
  "sieben",
  "acht",
  "neun",
  "zehn",
  "elf",
  "zwölf",
  "dreizehn",
  "vierzehn",
  "fünfzehn",
  "sechzehn",
  "siebzehn",
  "achtzehn",
  "neunzehn",
];
const deTens = [
  "",
  "",
  "zwanzig",
  "dreißig",
  "vierzig",
  "fünfzig",
  "sechzig",
  "siebzig",
  "achtzig",
  "neunzig",
];
const deCompound = (value: number): string => (value === 1 ? "ein" : de(value));
function deUnder100(value: number): string {
  if (value < 20) return deSmall[value] ?? "";
  const [tens, unit] = split(value, 10);
  return `${unit === 0 ? "" : `${deCompound(unit)}und`}${deTens[tens]}`;
}
function de(value: number, one = "ein"): string {
  if (value < 100) return deUnder100(value);
  if (value < 1000) {
    const [hundreds, rest] = split(value, 100);
    return `${hundreds === 1 ? one : deSmall[hundreds]}hundert${rest === 0 ? "" : deUnder100(rest)}`;
  }
  if (value < 1_000_000) {
    const [thousands, rest] = split(value, 1000);
    return `${thousands === 1 ? one : deCompound(thousands)}tausend${rest === 0 ? "" : de(rest)}`;
  }
  const [millions, rest] = split(value, 1_000_000);
  return join(
    millions === 1 ? "eine million" : `${de(millions)} millionen`,
    rest === 0 ? "" : de(rest),
  );
}
function deYear(value: number): string | undefined {
  if (value < 1100 || value >= 2000) return undefined;
  const [hundreds, rest] = split(value, 100);
  return `${deUnder100(hundreds)}hundert${rest === 0 ? "" : deUnder100(rest)}`;
}
function deAlternatives(value: number): readonly string[] {
  // "hundert" and "tausend" without the "ein".
  const plain = de(value, "");
  return plain === de(value) ? [] : [plain];
}

// French.
const frSmall = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
];
const frTens = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];
function frUnder100(value: number): string {
  if (value <= 16) return frSmall[value] ?? "";
  if (value < 20) return `dix ${frSmall[value - 10]}`;
  if (value < 70) {
    const [tens, unit] = split(value, 10);
    if (unit === 0) return frTens[tens] ?? "";
    return unit === 1 ? `${frTens[tens]} et un` : `${frTens[tens]} ${frSmall[unit]}`;
  }
  if (value < 80) return value === 71 ? "soixante et onze" : `soixante ${frUnder100(value - 60)}`;
  if (value === 80) return "quatre vingts";
  return `quatre vingt ${frUnder100(value - 80)}`;
}
function fr(value: number): string {
  if (value < 100) return frUnder100(value);
  if (value < 1000) {
    const [hundreds, rest] = split(value, 100);
    const head = hundreds === 1 ? "cent" : `${frSmall[hundreds]} cent${rest === 0 ? "s" : ""}`;
    return join(head, rest === 0 ? "" : frUnder100(rest));
  }
  // "vingts" and "cents" lose their s before mille.
  const plain = (words: string): string => words.replace(/(vingt|cent)s$/, "$1");
  if (value < 1_000_000) {
    const [thousands, rest] = split(value, 1000);
    return join(
      thousands === 1 ? "mille" : `${plain(fr(thousands))} mille`,
      rest === 0 ? "" : fr(rest),
    );
  }
  const [millions, rest] = split(value, 1_000_000);
  return join(
    millions === 1 ? "un million" : `${fr(millions)} millions`,
    rest === 0 ? "" : fr(rest),
  );
}
function frYear(value: number): string | undefined {
  // Old-fashioned but still heard: "dix-neuf cent quatre-vingt-dix".
  if (value < 1100 || value >= 2000) return undefined;
  const [hundreds, rest] = split(value, 100);
  return join(`${frUnder100(hundreds)} cent`, rest === 0 ? "" : frUnder100(rest));
}

// Italian: one word below a million; the tens drop their vowel before uno and otto.
const itSmall = [
  "zero",
  "uno",
  "due",
  "tre",
  "quattro",
  "cinque",
  "sei",
  "sette",
  "otto",
  "nove",
  "dieci",
  "undici",
  "dodici",
  "tredici",
  "quattordici",
  "quindici",
  "sedici",
  "diciassette",
  "diciotto",
  "diciannove",
];
const itTens = [
  "",
  "",
  "venti",
  "trenta",
  "quaranta",
  "cinquanta",
  "sessanta",
  "settanta",
  "ottanta",
  "novanta",
];
function itUnder1000(value: number): string {
  if (value < 20) return itSmall[value] ?? "";
  if (value < 100) {
    const [tens, unit] = split(value, 10);
    const head = itTens[tens] ?? "";
    if (unit === 0) return head;
    return `${unit === 1 || unit === 8 ? head.slice(0, -1) : head}${itSmall[unit]}`;
  }
  const [hundreds, rest] = split(value, 100);
  const head = hundreds === 1 ? "cento" : `${itSmall[hundreds]}cento`;
  if (rest === 0) return head;
  return `${Math.floor(rest / 10) === 8 ? head.slice(0, -1) : head}${itUnder1000(rest)}`;
}
function it(value: number): string {
  // A compound ending in tre is written tré: ventitré, centotré.
  const accent = (words: string): string => (value > 3 ? words.replace(/tre$/, "tré") : words);
  if (value < 1000) return accent(itUnder1000(value));
  if (value < 1_000_000) {
    const [thousands, rest] = split(value, 1000);
    return accent(
      `${thousands === 1 ? "mille" : `${itUnder1000(thousands)}mila`}${rest === 0 ? "" : itUnder1000(rest)}`,
    );
  }
  const [millions, rest] = split(value, 1_000_000);
  return join(
    millions === 1 ? "un milione" : `${it(millions)} milioni`,
    rest === 0 ? "" : it(rest),
  );
}

// Portuguese: Brazilian spelling first, European second where they differ.
const ptSmall = [
  "zero",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "catorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const ptTens = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];
const ptHundreds = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];
function ptUnder1000(value: number): string {
  if (value < 20) return ptSmall[value] ?? "";
  if (value < 100) {
    const [tens, unit] = split(value, 10);
    return unit === 0 ? (ptTens[tens] ?? "") : `${ptTens[tens]} e ${ptSmall[unit]}`;
  }
  if (value === 100) return "cem";
  const [hundreds, rest] = split(value, 100);
  return rest === 0
    ? (ptHundreds[hundreds] ?? "")
    : `${ptHundreds[hundreds]} e ${ptUnder1000(rest)}`;
}
// "e" joins a thousand to what follows only when that is below a hundred or a round hundred.
const ptRest = (rest: number): string =>
  rest === 0 ? "" : rest < 100 || rest % 100 === 0 ? `e ${ptUnder1000(rest)}` : ptUnder1000(rest);
function pt(value: number): string {
  if (value < 1000) return ptUnder1000(value);
  if (value < 1_000_000) {
    const [thousands, rest] = split(value, 1000);
    return join(thousands === 1 ? "mil" : `${ptUnder1000(thousands)} mil`, ptRest(rest));
  }
  const [millions, rest] = split(value, 1_000_000);
  return join(
    millions === 1 ? "um milhão" : `${pt(millions)} milhões`,
    rest === 0 ? "" : rest < 1000 ? ptRest(rest) : pt(rest),
  );
}
function ptAlternatives(value: number): readonly string[] {
  const european = pt(value)
    .replaceAll("dezesseis", "dezasseis")
    .replaceAll("dezessete", "dezassete")
    .replaceAll("dezenove", "dezanove");
  return european === pt(value) ? [] : [european];
}

// Catalan.
const caSmall = [
  "zero",
  "u",
  "dos",
  "tres",
  "quatre",
  "cinc",
  "sis",
  "set",
  "vuit",
  "nou",
  "deu",
  "onze",
  "dotze",
  "tretze",
  "catorze",
  "quinze",
  "setze",
  "disset",
  "divuit",
  "dinou",
];
const caTens = [
  "",
  "",
  "vint",
  "trenta",
  "quaranta",
  "cinquanta",
  "seixanta",
  "setanta",
  "vuitanta",
  "noranta",
];
function caUnder1000(value: number): string {
  if (value < 20) return caSmall[value] ?? "";
  if (value < 100) {
    const [tens, unit] = split(value, 10);
    if (unit === 0) return caTens[tens] ?? "";
    return tens === 2 ? `vint i ${caSmall[unit]}` : `${caTens[tens]} ${caSmall[unit]}`;
  }
  const [hundreds, rest] = split(value, 100);
  return join(
    hundreds === 1 ? "cent" : `${caSmall[hundreds]} cents`,
    rest === 0 ? "" : caUnder1000(rest),
  );
}
const caOne = (words: string): string => words.replace(/(^|\s)u$/, "$1un");
function ca(value: number): string {
  if (value < 1000) return caUnder1000(value);
  if (value < 1_000_000) {
    const [thousands, rest] = split(value, 1000);
    return join(
      thousands === 1 ? "mil" : `${caOne(caUnder1000(thousands))} mil`,
      rest === 0 ? "" : caUnder1000(rest),
    );
  }
  const [millions, rest] = split(value, 1_000_000);
  return join(
    millions === 1 ? "un milió" : `${caOne(ca(millions))} milions`,
    rest === 0 ? "" : ca(rest),
  );
}

// Dutch: one word below a million; "ën" after a vowel it would merge with.
const nlSmall = [
  "nul",
  "een",
  "twee",
  "drie",
  "vier",
  "vijf",
  "zes",
  "zeven",
  "acht",
  "negen",
  "tien",
  "elf",
  "twaalf",
  "dertien",
  "veertien",
  "vijftien",
  "zestien",
  "zeventien",
  "achttien",
  "negentien",
];
const nlTens = [
  "",
  "",
  "twintig",
  "dertig",
  "veertig",
  "vijftig",
  "zestig",
  "zeventig",
  "tachtig",
  "negentig",
];
function nlUnder100(value: number): string {
  if (value < 20) return nlSmall[value] ?? "";
  const [tens, unit] = split(value, 10);
  if (unit === 0) return nlTens[tens] ?? "";
  return `${nlSmall[unit]}${unit === 2 || unit === 3 ? "ën" : "en"}${nlTens[tens]}`;
}
function nlUnder1000(value: number): string {
  if (value < 100) return nlUnder100(value);
  const [hundreds, rest] = split(value, 100);
  return `${hundreds === 1 ? "" : nlSmall[hundreds]}honderd${rest === 0 ? "" : nlUnder100(rest)}`;
}
function nl(value: number): string {
  if (value < 1000) return nlUnder1000(value);
  if (value < 1_000_000) {
    const [thousands, rest] = split(value, 1000);
    return join(
      `${thousands === 1 ? "" : nlUnder1000(thousands)}duizend`,
      rest === 0 ? "" : nlUnder1000(rest),
    );
  }
  const [millions, rest] = split(value, 1_000_000);
  return join(`${nl(millions)} miljoen`, rest === 0 ? "" : nl(rest));
}
function nlYear(value: number): string | undefined {
  if (value < 1100 || value >= 2000) return undefined;
  const [hundreds, rest] = split(value, 100);
  return `${nlUnder100(hundreds)}honderd${rest === 0 ? "" : nlUnder100(rest)}`;
}
function nlAlternatives(value: number): readonly string[] {
  // Written as one word too: "duizendtweehonderd".
  const joined = value >= 1000 && value < 1_000_000 ? nl(value).replace(" ", "") : nl(value);
  return joined === nl(value) ? [] : [joined];
}

// Polish and Czech pick the noun's form by the count.
const slavicPlural = (count: number, one: string, few: string, many: string): string => {
  if (count === 1) return one;
  const unit = count % 10;
  const teen = count % 100 >= 12 && count % 100 <= 14;
  return unit >= 2 && unit <= 4 && !teen ? few : many;
};

const plSmall = [
  "zero",
  "jeden",
  "dwa",
  "trzy",
  "cztery",
  "pięć",
  "sześć",
  "siedem",
  "osiem",
  "dziewięć",
  "dziesięć",
  "jedenaście",
  "dwanaście",
  "trzynaście",
  "czternaście",
  "piętnaście",
  "szesnaście",
  "siedemnaście",
  "osiemnaście",
  "dziewiętnaście",
];
const plTens = [
  "",
  "",
  "dwadzieścia",
  "trzydzieści",
  "czterdzieści",
  "pięćdziesiąt",
  "sześćdziesiąt",
  "siedemdziesiąt",
  "osiemdziesiąt",
  "dziewięćdziesiąt",
];
const plHundreds = [
  "",
  "sto",
  "dwieście",
  "trzysta",
  "czterysta",
  "pięćset",
  "sześćset",
  "siedemset",
  "osiemset",
  "dziewięćset",
];
function plUnder1000(value: number): string {
  if (value < 20) return plSmall[value] ?? "";
  if (value < 100) {
    const [tens, unit] = split(value, 10);
    return join(plTens[tens] ?? "", unit === 0 ? "" : (plSmall[unit] ?? ""));
  }
  const [hundreds, rest] = split(value, 100);
  return join(plHundreds[hundreds] ?? "", rest === 0 ? "" : plUnder1000(rest));
}
function pl(value: number): string {
  if (value < 1000) return plUnder1000(value);
  if (value < 1_000_000) {
    const [thousands, rest] = split(value, 1000);
    const head =
      thousands === 1
        ? "tysiąc"
        : `${plUnder1000(thousands)} ${slavicPlural(thousands, "tysiąc", "tysiące", "tysięcy")}`;
    return join(head, rest === 0 ? "" : plUnder1000(rest));
  }
  const [millions, rest] = split(value, 1_000_000);
  const head =
    millions === 1
      ? "milion"
      : `${pl(millions)} ${slavicPlural(millions, "milion", "miliony", "milionów")}`;
  return join(head, rest === 0 ? "" : pl(rest));
}

const csSmall = [
  "nula",
  "jedna",
  "dva",
  "tři",
  "čtyři",
  "pět",
  "šest",
  "sedm",
  "osm",
  "devět",
  "deset",
  "jedenáct",
  "dvanáct",
  "třináct",
  "čtrnáct",
  "patnáct",
  "šestnáct",
  "sedmnáct",
  "osmnáct",
  "devatenáct",
];
const csTens = [
  "",
  "",
  "dvacet",
  "třicet",
  "čtyřicet",
  "padesát",
  "šedesát",
  "sedmdesát",
  "osmdesát",
  "devadesát",
];
function csUnder1000(value: number): string {
  if (value < 20) return csSmall[value] ?? "";
  if (value < 100) {
    const [tens, unit] = split(value, 10);
    return join(csTens[tens] ?? "", unit === 0 ? "" : (csSmall[unit] ?? ""));
  }
  const [hundreds, rest] = split(value, 100);
  const head =
    hundreds === 1
      ? "sto"
      : hundreds === 2
        ? "dvě stě"
        : hundreds <= 4
          ? `${csSmall[hundreds]} sta`
          : `${csSmall[hundreds]} set`;
  return join(head, rest === 0 ? "" : csUnder1000(rest));
}
// Czech uses the "few" form only for exactly two to four.
const csPlural = (count: number, one: string, few: string, many: string): string =>
  count === 1 ? one : count >= 2 && count <= 4 ? few : many;
function cs(value: number): string {
  if (value < 1000) return csUnder1000(value);
  if (value < 1_000_000) {
    const [thousands, rest] = split(value, 1000);
    const count = thousands === 2 ? "dva" : csUnder1000(thousands);
    const head =
      thousands === 1 ? "tisíc" : `${count} ${csPlural(thousands, "tisíc", "tisíce", "tisíc")}`;
    return join(head, rest === 0 ? "" : csUnder1000(rest));
  }
  const [millions, rest] = split(value, 1_000_000);
  const head =
    millions === 1
      ? "milion"
      : `${millions === 2 ? "dva" : cs(millions)} ${csPlural(millions, "milion", "miliony", "milionů")}`;
  return join(head, rest === 0 ? "" : cs(rest));
}
function csAlternatives(value: number): readonly string[] {
  // Counting reads one as "jedna"; before a masculine noun and in "jeden tisíc" it is "jeden".
  const masculine = cs(value).replace(/(^|\s)jedna(?=\s|$)/g, "$1jeden");
  return masculine === cs(value) ? [] : [masculine];
}

export const spellers: Readonly<Record<string, Speller>> = {
  es: {
    cardinal: es,
    decimal: "coma",
    percent: "por ciento",
    euro: "euros",
    dollar: "dólares",
    pound: "libras",
    and: "y",
  },
  de: {
    cardinal: de,
    year: deYear,
    alternatives: deAlternatives,
    decimal: "komma",
    percent: "prozent",
    euro: "euro",
    dollar: "dollar",
    pound: "pfund",
    and: "und",
  },
  fr: {
    cardinal: fr,
    year: frYear,
    decimal: "virgule",
    percent: "pour cent",
    euro: "euros",
    dollar: "dollars",
    pound: "livres",
    and: "et",
  },
  it: {
    cardinal: it,
    decimal: "virgola",
    percent: "per cento",
    euro: "euro",
    dollar: "dollari",
    pound: "sterline",
    and: "e",
  },
  pt: {
    cardinal: pt,
    alternatives: ptAlternatives,
    decimal: "vírgula",
    percent: "por cento",
    euro: "euros",
    dollar: "dólares",
    pound: "libras",
    and: "e",
  },
  ca: {
    cardinal: ca,
    decimal: "coma",
    percent: "per cent",
    euro: "euros",
    dollar: "dòlars",
    pound: "lliures",
    and: "i",
  },
  nl: {
    cardinal: nl,
    year: nlYear,
    alternatives: nlAlternatives,
    decimal: "komma",
    percent: "procent",
    euro: "euro",
    dollar: "dollar",
    pound: "pond",
    and: "en",
  },
  pl: {
    cardinal: pl,
    decimal: "przecinek",
    percent: "procent",
    euro: "euro",
    dollar: "dolarów",
    pound: "funtów",
    and: "i",
  },
  cs: {
    cardinal: cs,
    alternatives: csAlternatives,
    decimal: "celá",
    percent: "procent",
    euro: "eur",
    dollar: "dolarů",
    pound: "liber",
    and: "a",
  },
};

// Every way a numeral may have been read: "1.000" is a thousand in most of these languages,
// "3,5" is three point five, "1,000" could be either. Digits beyond the spellers' range are
// read one by one.
export function spokenNumber(raw: string, speller: Speller): readonly string[] {
  const digitsAlone = (digits: string): string =>
    digits
      .split("")
      .map((digit) => speller.cardinal(Number(digit)))
      .join(" ");
  const whole = (digits: string): readonly string[] => {
    const value = Number(digits);
    if (!Number.isSafeInteger(value) || value >= 1_000_000_000_000) return [digitsAlone(digits)];
    const year = speller.year?.(value);
    return [
      ...(year === undefined ? [] : [year]),
      speller.cardinal(value),
      ...(speller.alternatives?.(value) ?? []),
    ];
  };
  const grouped = /^\d{1,3}(?:[. {2}]\d{3})+$/.test(raw);
  const forms: string[] = [];
  if (/^\d+$/.test(raw)) forms.push(...whole(raw));
  else if (grouped) forms.push(...whole(raw.replace(/[. {2}]/g, "")));
  const fraction = /^(\d+)[.,](\d+)$/.exec(raw);
  if (fraction !== null && !grouped) {
    const [, integer = "", decimals = ""] = fraction;
    if (/^\d{1,3},\d{3}$/.test(raw)) forms.push(...whole(`${integer}${decimals}`));
    const head = whole(integer)[0] ?? "";
    forms.push(`${head} ${speller.decimal} ${whole(decimals.replace(/^0+(?=\d)/, ""))[0]}`);
    forms.push(`${head} ${speller.decimal} ${digitsAlone(decimals)}`);
  }
  if (forms.length === 0) forms.push(digitsAlone(raw.replace(/\D/g, "")));
  return [...new Set(forms)];
}
