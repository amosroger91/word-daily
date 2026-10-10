// Verse text helpers shared by the server pipeline and the editor.

const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeEntities(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => entities[name.toLowerCase()] ?? match);
}

// Typographic quotes and dashes, the way The Word sets Scripture.
export function typeset(text) {
  return decodeEntities(text)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s([{—-])"/g, "$1“")
    .replace(/"/g, "”")
    .replace(/(^|[\s([{—-])'/g, "$1‘")
    .replace(/'/g, "’")
    .replace(/\s?--\s?/g, "—");
}

const ordinals = { 1: "First", 2: "Second", 3: "Third" };
// "John 10: 27-28" → { book: "John", chapter: 10, verses: [27, 28] }
export function parseReference(ref) {
  const match = String(ref)
    .trim()
    .match(/^((?:[1-3]\s*)?[A-Za-z][A-Za-z .]*?)\s*(\d+)\s*[:.]\s*(\d+)(?:\s*[-–]\s*(?:(\d+)\s*[:.]\s*)?(\d+))?$/);
  if (!match) return null;
  const [, book, chapter, first, endChapter, last] = match;
  return {
    book: book.replace(/\s+/g, " ").trim(),
    chapter: Number(chapter),
    verses: [Number(first), last ? Number(last) : Number(first)],
    endChapter: endChapter ? Number(endChapter) : Number(chapter),
  };
}

// "John 10:27–28", as The Word displays references.
export function displayReference(ref) {
  const parsed = parseReference(ref);
  if (!parsed) return decodeEntities(ref).trim();
  const { book, chapter, verses, endChapter } = parsed;
  if (endChapter !== chapter) return `${book} ${chapter}:${verses[0]}–${endChapter}:${verses[1]}`;
  return verses[0] === verses[1]
    ? `${book} ${chapter}:${verses[0]}`
    : `${book} ${chapter}:${verses[0]}–${verses[1]}`;
}

// What the narrator says before the verse: "John, chapter 10, verses 27 through 28."
export function spokenReference(ref) {
  const parsed = parseReference(ref);
  if (!parsed) return `${decodeEntities(ref).trim()}.`;
  const { chapter, verses, endChapter } = parsed;
  const book = parsed.book.replace(/^([1-3])\s*/, (_, n) => `${ordinals[n]} `);
  if (book === "Psalm" || book === "Psalms")
    return verses[0] === verses[1]
      ? `Psalm ${chapter}, verse ${verses[0]}.`
      : `Psalm ${chapter}, verses ${verses[0]} through ${verses[1]}.`;
  if (endChapter !== chapter)
    return `${book}, chapter ${chapter}, verse ${verses[0]}, through chapter ${endChapter}, verse ${verses[1]}.`;
  return verses[0] === verses[1]
    ? `${book}, chapter ${chapter}, verse ${verses[0]}.`
    : `${book}, chapter ${chapter}, verses ${verses[0]} through ${verses[1]}.`;
}

// Words as displayed (punctuation attached) with a plain key for alignment.
export function verseTokens(text) {
  return typeset(text)
    .split(" ")
    .filter(Boolean)
    .map((word, index) => ({ index, word, key: wordKey(word) }));
}
export const wordKey = (word) =>
  String(word)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]/g, "");

// Sentence-sized pieces for the voice model, kept under its token budget.
export function speechChunks(text, maxChars = 220) {
  const sentences = typeset(text).match(/[^.!?;:]+[.!?;:]+[”’)]*|[^.!?;:]+$/g) || [text];
  const chunks = [];
  for (const sentence of sentences.map((s) => s.trim()).filter(Boolean)) {
    const last = chunks.at(-1);
    if (last && last.length + sentence.length + 1 <= maxChars && !/[.!?][”’)]*$/.test(last))
      chunks[chunks.length - 1] = `${last} ${sentence}`;
    else chunks.push(sentence);
  }
  return chunks;
}
