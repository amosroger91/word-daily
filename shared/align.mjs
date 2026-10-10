import { verseTokens, wordKey, speechChunks } from "./verse.mjs";

function similar(a, b) {
  if (a === b) return 2;
  if (!a || !b) return -1;
  if (a.length > 3 && b.length > 3 && (a.startsWith(b) || b.startsWith(a))) return 1;
  if (Math.abs(a.length - b.length) > 1 || a.length < 4) return -1;
  let edits = 0;
  for (let i = 0, j = 0; i < a.length || j < b.length; ) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return -1;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return 1;
}

// Global alignment of the known verse words to recognised words.
// Returns, per token, the index of its matched recognised word or -1.
export function alignKeys(tokens, heard) {
  const n = tokens.length, m = heard.length, gap = -1;
  const score = Array.from({ length: n + 1 }, (_, i) => new Float64Array(m + 1).fill(0).map((_, j) => (i + j) * gap));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      score[i][j] = Math.max(
        score[i - 1][j - 1] + similar(tokens[i - 1], heard[j - 1]),
        score[i - 1][j] + gap,
        score[i][j - 1] + gap,
      );
  const match = new Array(n).fill(-1);
  for (let i = n, j = m; i > 0 && j > 0; ) {
    const s = similar(tokens[i - 1], heard[j - 1]);
    if (score[i][j] === score[i - 1][j - 1] + s) {
      if (s > 0) match[i - 1] = j - 1;
      i--; j--;
    } else if (score[i][j] === score[i - 1][j] + gap) i--;
    else j--;
  }
  return match;
}

// Reading weight of a word: longer words and trailing punctuation take longer.
const weight = (word) => Math.max(2, wordKey(word).length) + (/[,;:—]$/.test(word) ? 3 : /[.!?][”’)]*$/.test(word) ? 5 : 0);

// Spreads words between two known times in proportion to their reading weight.
function spread(words, from, to) {
  const total = words.reduce((sum, word) => sum + weight(word.word), 0) || 1;
  let t = from;
  for (const word of words) {
    word.start = t;
    t += ((to - from) * weight(word.word)) / total;
    word.end = t;
  }
}

/**
 * Timed verse words for highlighting.
 * @param text the verse
 * @param segments narration chunks [{kind, start, end}] from the voice step
 * @param heard recognised words [{text, start, end}] in narration time, or []
 */
export function timeVerseWords(text, segments, heard = []) {
  const tokens = verseTokens(text);
  const verseSegments = segments.filter((segment) => segment.kind === "verse");
  const chunks = speechChunks(text);
  if (chunks.length !== verseSegments.length) throw new Error("Narration chunks do not match the verse.");
  let index = 0;
  for (const [c, chunk] of chunks.entries()) {
    const count = verseTokens(chunk).length;
    const words = tokens.slice(index, index + count);
    index += count;
    const { start, end } = verseSegments[c];
    const inside = heard.filter((word) => word.start >= start - 0.15 && word.start < end + 0.1);
    const match = alignKeys(words.map((word) => word.key), inside.map((word) => wordKey(word.text)));
    // Anchors: chunk edges plus every confidently matched word start.
    const anchors = [{ at: -1, time: start }];
    match.forEach((m, i) => {
      if (m < 0) return;
      const time = Math.min(end, Math.max(start, inside[m].start));
      if (time > anchors.at(-1).time + 0.02) anchors.push({ at: i, time });
    });
    anchors.push({ at: words.length, time: end });
    for (let a = 0; a < anchors.length - 1; a++) {
      const from = anchors[a], to = anchors[a + 1];
      const span = words.slice(from.at < 0 ? 0 : from.at, to.at);
      if (span.length) spread(span, from.time, to.time);
    }
  }
  if (index !== tokens.length) throw new Error("Narration chunks do not cover the verse.");
  // Each word stays lit until the next begins; the last fades with the chunk.
  for (let i = 0; i < tokens.length - 1; i++) tokens[i].end = Math.max(tokens[i].start + 0.05, tokens[i + 1].start);
  return tokens.map(({ index, word, start, end }) => ({ index, word, start: round(start), end: round(end) }));
}
const round = (value) => Math.round(value * 1000) / 1000;
