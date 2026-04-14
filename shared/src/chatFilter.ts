export interface ChatFilterRule {
  label: string;
  pattern: RegExp;
}

export interface ChatFilterOptions {
  extraPhrases?: readonly string[];
}

// Neue Chatfilter-Regeln hier ergänzen.
// Nutze bewusst Regex, damit auch getrennte Schreibweisen wie "f u c k" erkannt werden.
export const CHAT_FILTER_RULES: ChatFilterRule[] = [
  { label: "arsch", pattern: /a[\W_]*r[\W_]*s[\W_]*c[\W_]*h(?:[\W_]*l[\W_]*o[\W_]*c[\W_]*h)?/giu },
  { label: "bastard", pattern: /b[\W_]*a[\W_]*s[\W_]*t[\W_]*a[\W_]*r[\W_]*d/giu },
  { label: "depp", pattern: /d[\W_]*e[\W_]*p[\W_]*p/giu },
  { label: "dummkopf", pattern: /d[\W_]*u[\W_]*m[\W_]*m[\W_]*k[\W_]*o[\W_]*p[\W_]*f/giu },
  { label: "hurensohn", pattern: /h[\W_]*u[\W_]*r[\W_]*e[\W_]*n[\W_]*s[\W_]*o[\W_]*h[\W_]*n/giu },
  { label: "idiot", pattern: /i[\W_]*d[\W_]*i[\W_]*o[\W_]*t/giu },
  { label: "kacke", pattern: /k[\W_]*a[\W_]*c[\W_]*k[\W_]*e/giu },
  { label: "scheisse", pattern: /s[\W_]*c[\W_]*h[\W_]*e[\W_]*i[\W_]*(?:s|ß)[\W_]*e/giu },
  { label: "spast", pattern: /s[\W_]*p[\W_]*a[\W_]*s[\W_]*t/giu },
  { label: "wichser", pattern: /w[\W_]*i[\W_]*c[\W_]*h[\W_]*s[\W_]*e[\W_]*r/giu },
  { label: "fuck", pattern: /f[\W_]*[uüv][\W_]*c[\W_]*k/giu },
  { label: "shit", pattern: /s[\W_]*h[\W_]*[i1!|][\W_]*t/giu },
  { label: "n-word-a", pattern: /n[\W_]*[i1!|][\W_]*[gq9][\W_]*[gq9][\W_]*a/giu },
  { label: "n-word-er", pattern: /n[\W_]*[i1!|][\W_]*[gq9][\W_]*[gq9][\W_]*e[\W_]*r/giu },
  { label: "neger", pattern: /n[\W_]*e[\W_]*g[\W_]*e[\W_]*r/giu },

  { label: "opfer", pattern: /o[\W_]*p[\W_]*f[\W_]*e[\W_]*r/giu },
  { label: "loser", pattern: /l[\W_]*o[\W_]*s[\W_]*e[\W_]*r/giu },
  { label: "penner", pattern: /p[\W_]*e[\W_]*n[\W_]*n[\W_]*e[\W_]*r/giu },
  { label: "mongo", pattern: /m[\W_]*o[\W_]*n[\W_]*g[\W_]*o/giu },
  { label: "missgeburt", pattern: /m[\W_]*[i1!|][\W_]*s[\W_]*s[\W_]*g[\W_]*e[\W_]*b[\W_]*[uü][\W_]*r[\W_]*t/giu },
  { label: "fotze", pattern: /f[\W_]*o[\W_]*t[\W_]*z[\W_]*e/giu },
  { label: "schlampe", pattern: /s[\W_]*c[\W_]*h[\W_]*l[\W_]*a[\W_]*m[\W_]*p[\W_]*e/giu },
  { label: "nutte", pattern: /n[\W_]*[uü][\W_]*t[\W_]*t[\W_]*e/giu },
  { label: "hure", pattern: /h[\W_]*[uü][\W_]*r[\W_]*e/giu },
  { label: "fresse", pattern: /f[\W_]*r[\W_]*e[\W_]*s[\W_]*s[\W_]*e/giu },
  { label: "schwuchtel", pattern: /s[\W_]*c[\W_]*h[\W_]*w[\W_]*[uü][\W_]*c[\W_]*h[\W_]*t[\W_]*e[\W_]*l/giu },
  { label: "kanake", pattern: /k[\W_]*a[\W_]*n[\W_]*a[\W_]*k[\W_]*e/giu },
  { label: "bitch", pattern: /b[\W_]*[i1!|][\W_]*t[\W_]*c[\W_]*h/giu },
  { label: "cunt", pattern: /c[\W_]*[uü][\W_]*n[\W_]*t/giu },
  { label: "motherfucker", pattern: /m[\W_]*o[\W_]*t[\W_]*h[\W_]*e[\W_]*r[\W_]*f[\W_]*[uüv][\W_]*c[\W_]*k[\W_]*e[\W_]*r/giu },
  { label: "pussy", pattern: /p[\W_]*[uü][\W_]*s[\W_]*s[\W_]*y/giu },
  { label: "dick", pattern: /d[\W_]*[i1!|][\W_]*c[\W_]*k/giu },
  { label: "cock", pattern: /c[\W_]*o[\W_]*c[\W_]*k/giu },
  { label: "retard", pattern: /r[\W_]*e[\W_]*t[\W_]*a[\W_]*r[\W_]*d/giu },
  { label: "faggot", pattern: /f[\W_]*a[\W_]*g[\W_]*g[\W_]*o[\W_]*t/giu },
  { label: "verpiss dich", pattern: /v[\W_]*e[\W_]*r[\W_]*p[\W_]*[i1!|][\W_]*s[\W_]*s[\W_]*d[\W_]*[i1!|][\W_]*c[\W_]*h/giu },
  { label: "leck mich", pattern: /l[\W_]*e[\W_]*c[\W_]*k[\W_]*m[\W_]*[i1!|][\W_]*c[\W_]*h/giu },
];

const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/gu;
const FILTER_CHAR_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "!": "i",
  "|": "i",
  "3": "e",
  "4": "a",
  "@": "a",
  "5": "s",
  "$": "s",
  "7": "t",
  "8": "b",
  "9": "g",
  "\u0430": "a",
  "\u0251": "a",
  "\u0391": "a",
  "\u0412": "b",
  "\u042c": "b",
  "\u0441": "c",
  "\u03f2": "c",
  "\u0435": "e",
  "\u0395": "e",
  "\u0456": "i",
  "\u0406": "i",
  "\u04cf": "i",
  "\u043e": "o",
  "\u039f": "o",
  "\u0440": "p",
  "\u03a1": "p",
  "\u0455": "s",
  "\u0405": "s",
  "\u0442": "t",
  "\u03a4": "t",
  "\u03c5": "u",
  "\u00b5": "u",
  "\u0445": "x",
  "\u03a7": "x",
  "€": "e",
  "ß": "ss",
};
const NORMALIZED_CHAT_BLOCKLIST = [
  "arsch",
  "arschloch",
  "penis",
  "bastard",
  "depp",
  "dummkopf",
  "hurensohn",
  "idiot",
  "kacke",
  "scheisse",
  "scheiße",
  "spast",
  "ns",
  "hs",
  "nga",
  "maher",
  "fck",
  "bimbo",
  "nazi",
  "nationalsozialsit",
  "69",
  "67",
  "88",
  "hh",
  "bimbo",
  "törke",
  "ausländer",
  "türke",
  "kurde",
  "hdf",
  "stfu",
  "dumm",
  "KI",
  "ChatGPT",
  "AI",
  "wichser",
  "fuck",
  "shit",
  "neger",
  "opfer",
  "loser",
  "penner",
  "mongo",
  "missgeburt",
  "fotze",
  "schlampe",
  "nutte",
  "hure",
  "fresse",
  "kanake",
  "bitch",
  "cunt",
  "motherfucker",
  "pussy",
  "retard",
  "verpissdich",
  "leckmich",
].map(normalizePhraseForFilter);
const NORMALIZED_CHAT_PATTERNS = buildRepeatedLetterPatterns(NORMALIZED_CHAT_BLOCKLIST);

interface FoldedSpan {
  start: number;
  end: number;
}

export function filterChatText(value: string, options: ChatFilterOptions = {}): string {
  const withoutInvisibleChars = value.replace(INVISIBLE_CHARS, "");
  const regexFiltered = CHAT_FILTER_RULES.reduce((text, rule) => text.replace(rule.pattern, "***"), withoutInvisibleChars);
  return maskNormalizedMatches(regexFiltered, options.extraPhrases || []);
}

export function normalizeReportedFilterTerm(value: string): string {
  const cleaned = value
    .replace(INVISIBLE_CHARS, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
  const normalized = normalizePhraseForFilter(cleaned);

  return normalized.length >= 2 && normalized.length <= 32 ? normalized : "";
}

export function isReportTermInText(text: string, normalizedTerm: string): boolean {
  if (!isUsableFilterTerm(normalizedTerm)) {
    return false;
  }

  const folded = foldTextForFilter(text);
  if (!folded.text) {
    return false;
  }

  const pattern = buildRepeatedLetterPattern(normalizedTerm);
  pattern.lastIndex = 0;
  return pattern.test(folded.text);
}

function maskNormalizedMatches(value: string, extraPhrases: readonly string[]): string {
  const folded = foldTextForFilter(value);
  if (!folded.text) {
    return value;
  }

  const ranges: FoldedSpan[] = [];
  const dynamicPatterns = buildRepeatedLetterPatterns(extraPhrases);
  for (const pattern of [...NORMALIZED_CHAT_PATTERNS, ...dynamicPatterns]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(folded.text);
    while (match) {
      const first = folded.spans[match.index];
      const last = folded.spans[match.index + match[0].length - 1];
      if (first && last) {
        ranges.push({ start: first.start, end: last.end });
      }

      match = pattern.exec(folded.text);
    }
  }

  return replaceRanges(value, mergeRanges(ranges));
}

function foldTextForFilter(value: string): { text: string; spans: FoldedSpan[] } {
  let text = "";
  const spans: FoldedSpan[] = [];

  for (let index = 0; index < value.length;) {
    const start = index;
    const codePoint = value.codePointAt(index);
    if (!codePoint) {
      index += 1;
      continue;
    }

    const char = String.fromCodePoint(codePoint);
    index += char.length;
    const folded = foldChar(char);
    for (const foldedChar of folded) {
      text += foldedChar;
      spans.push({ start, end: index });
    }
  }

  return { text, spans };
}

function foldChar(char: string): string {
  const normalized = char
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase();
  const mapped = Array.from(normalized, (entry) => FILTER_CHAR_MAP[entry] || entry).join("");
  return mapped.replace(/[^a-z]/gu, "");
}

function normalizePhraseForFilter(phrase: string): string {
  return Array.from(phrase, (char) => foldChar(char)).join("");
}

function buildRepeatedLetterPatterns(phrases: readonly string[]): RegExp[] {
  const seen = new Set<string>();
  const patterns: RegExp[] = [];

  for (const phrase of phrases) {
    const normalized = normalizePhraseForFilter(phrase);
    if (!isUsableFilterTerm(normalized) || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    patterns.push(buildRepeatedLetterPattern(normalized));
  }

  return patterns;
}

function buildRepeatedLetterPattern(phrase: string): RegExp {
  const source = Array.from(phrase, (char) => `${escapeRegExp(char)}+`).join("");
  return new RegExp(source, "gu");
}

function isUsableFilterTerm(value: string): boolean {
  return value.length >= 2 && value.length <= 32;
}

function mergeRanges(ranges: FoldedSpan[]): FoldedSpan[] {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: FoldedSpan[] = [];

  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}

function replaceRanges(value: string, ranges: FoldedSpan[]): string {
  return [...ranges]
    .sort((a, b) => b.start - a.start)
    .reduce((text, range) => `${text.slice(0, range.start)}***${text.slice(range.end)}`, value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
