// Slices pasted notes or an AI reply into memory blocks: one idea each, with a short title, a guessed kind
// and the "because" part split out as the reason. Pure functions, English and Chinese.

const CJK = /[一-鿿]/;
const TITLE_WORDS = 7;
const TITLE_CHARS_CJK = 16;
const MIN_WORDS = 3;
const MIN_MEMORY_WORDS = 2;
const MIN_CHARS_CJK = 4;
const ABBREVIATIONS = new Set(['prof', 'dr', 'mr', 'mrs', 'ms', 'e.g', 'i.e', 'etc', 'vs', 'st', 'no', 'fig', 'ch', 'sec']);

const OPEN = /\?|？|\b(not sure|unsure|tbd|to be decided|undecided|whether|open question|still deciding)\b|是否|待定|还没定|不确定|要不要/i;
const CONSTRAINT = /^(no|keep|avoid|only)\b|\b(never|always|do not|don't|must|must not|should not|cannot|can't|at most|no more than|kept under|stay under)\b|\bonly,|不要|不能|不可|必须|保持|禁止|不超过|别/i;
const DECISION = /\b(decided|decide to|agreed|chose|chosen|will|we'll|going with)\b|决定|采用|确定|选择|选用/i;

// Headings such as "Do not change:" set the kind of the lines that follow. "why" lines are reasons, not memories.
const HEADINGS = [
  [/do not change|don.t change|constraint|\brules?\b|不要改|约束|限制|规则/i, 'constraint'],
  [/open|undecided|not decided|to decide|待定|未定|还没定/i, 'open_item'],
  [/decision|decided|决定/i, 'decision'],
  [/background|fact|context|背景|事实/i, 'fact'],
  [/why|reason|原因/i, 'skip'],
];

const MARKER = /^\[.*\]$|^(your job|plan text|result|this is the result|how to use this)\b/i;
const FILLER = /^(sure|ok|okay|great|thanks|thank you|here (you go|is|are)|hope this helps|let me know)\b/i;
const BULLET = /^([-*•]|\d+[.)])\s+/;
const TRAILING_FILLER = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'to', 'in', 'on', 'with', 'for', 'at', 'by']);
const LEADING_DECISION = /^(we|i)\s+(have\s+)?(decided|agreed|chose)\s+(that\s+|to\s+)?/i;

export function guessKind(text) {
  if (OPEN.test(text)) return 'open_item';
  if (CONSTRAINT.test(text)) return 'constraint';
  if (DECISION.test(text)) return 'decision';
  return 'fact';
}

export function autoTitle(text) {
  const plain = text.trim().replace(/[.。!！?？;；,，:：]+$/, '');
  if (!plain) return 'Untitled';
  const stripped = plain.replace(LEADING_DECISION, '').split(/\s+because\s+|因为/)[0].trim();
  const [firstClause] = stripped.split(/[，；;]|,(?!\d)/);
  // Cut at the first comma only when what comes before it can stand alone as a title.
  const clause = (CJK.test(firstClause) ? firstClause.length >= MIN_CHARS_CJK : firstClause.trim().split(/\s+/).length >= MIN_WORDS)
    ? firstClause.trim()
    : stripped;
  if (CJK.test(clause)) return clause.slice(0, TITLE_CHARS_CJK);
  const words = clause.split(/\s+/).slice(0, TITLE_WORDS);
  while (words.length > 1 && TRAILING_FILLER.has(words.at(-1).toLowerCase())) words.pop();
  const title = words.join(' ').replace(/[,，;；:：]+$/, '');
  return title.charAt(0).toUpperCase() + title.slice(1);
}

// A line ending in a colon introduces what follows: a known heading sets the kind, any other is skipped.
function headingKind(line) {
  if (!/[:：]$/.test(line)) return undefined;
  const found = HEADINGS.find(([pattern]) => pattern.test(line));
  return found ? found[1] : null;
}

// Splits after . ! ? when the next sentence starts with a capital, digit, quote or Chinese,
// and after Chinese sentence marks, but never after an abbreviation such as "Prof." or "e.g.".
function sentences(line) {
  const out = [];
  let start = 0;
  const boundary = /[.!?](?=\s+["“A-Z0-9一-鿿])|[。！？；](?=.)/g;
  for (const match of line.matchAll(boundary)) {
    const end = match.index + 1;
    const lastWord = line.slice(start, match.index).split(/\s+/).pop().toLowerCase();
    if (match[0] === '.' && ABBREVIATIONS.has(lastWord)) continue;
    out.push(line.slice(start, end).trim());
    start = end;
  }
  out.push(line.slice(start).trim());
  return out.filter(Boolean);
}

const isTooShort = (text) =>
  (CJK.test(text) ? text.replace(/[^一-鿿]/g, '').length < MIN_CHARS_CJK : text.split(/\s+/).length < MIN_MEMORY_WORDS);

function splitReason(sentence) {
  const end = /[.。!！]$/.exec(sentence)?.[0] ?? '';
  const match = /^(.*?)\s+because\s+(.+)$/i.exec(sentence) ?? /^(.*?)[，,]?\s*因为(.+)$/.exec(sentence);
  if (!match) return { text: sentence, reason: '' };
  return { text: `${match[1].trim()}${end}`, reason: match[2].trim().replace(/[.。!！]+$/, '') };
}

export function sliceIntoMemories(raw) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  let sectionKind = null;
  return lines.flatMap((line) => {
    const heading = headingKind(line);
    if (heading !== undefined) {
      sectionKind = heading;
      return [];
    }
    if (MARKER.test(line) || sectionKind === 'skip') return [];
    return sentences(line.replace(BULLET, ''))
      .filter((s) => !FILLER.test(s) && !isTooShort(s))
      .map((source) => {
        const { text, reason } = splitReason(source);
        return { title: autoTitle(text), text, reason, kind: sectionKind ?? guessKind(source), source };
      });
  });
}
