import { readFileSync } from "node:fs";
import path from "node:path";
import { root } from "./config.mjs";
import { typeset } from "../shared/verse.mjs";

// Public-domain translations bundled with The Word.
export const TRANSLATIONS = {
  web: { name: "World English Bible", short: "WEB" },
  kjv: { name: "King James Version", short: "KJV" },
};
const MAX_VERSES = 12;
const MAX_WORDS = 230;

const cache = {};
const load = (id) => (cache[id] ||= JSON.parse(readFileSync(path.join(root, "assets/bible", `${id}.json`), "utf8")));
const books = JSON.parse(readFileSync(path.join(root, "assets/bible/books.json"), "utf8"));

const normalize = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
// Book lookup by full name, The Word's short name, or a common abbreviation.
const extra = {
  ps: 19, psalm: 19, pss: 19, prov: 20, pr: 20, eccl: 21, ecc: 21, song: 22, songofsongs: 22, sos: 22,
  isa: 23, jer: 24, lam: 25, ezek: 26, eze: 26, dan: 27, hos: 28, obad: 31, mic: 33, nah: 34, hab: 35, zeph: 36, hag: 37, zech: 38, mal: 39,
  matt: 40, mt: 40, mk: 41, mrk: 41, lk: 42, luk: 42, jn: 43, jhn: 43, ac: 44, rom: 45, gal: 48, eph: 49, phil: 50, php: 50, col: 51,
  heb: 58, jas: 59, jam: 59, pet: 60, rev: 66, revelations: 66, gen: 1, ex: 2, exod: 2, lev: 3, num: 4, deut: 5, dt: 5, josh: 6, judg: 7, jdg: 7,
};
const bookIndex = new Map();
for (const [id, { name, shortName }] of Object.entries(books)) {
  bookIndex.set(normalize(name), Number(id));
  bookIndex.set(normalize(shortName), Number(id));
}
for (const [alias, id] of Object.entries(extra)) bookIndex.set(alias, id);
for (const [alias, id] of [...bookIndex]) {
  // "1cor" / "icor" / "firstcorinthians" all resolve.
  const match = alias.match(/^([123])(.+)$/);
  if (match) {
    const word = { 1: ["first", "i"], 2: ["second", "ii"], 3: ["third", "iii"] }[match[1]];
    for (const prefix of word) if (!bookIndex.has(prefix + match[2])) bookIndex.set(prefix + match[2], id);
  }
}
function findBook(text) {
  const key = normalize(text);
  if (bookIndex.has(key)) return bookIndex.get(key);
  // Unambiguous prefixes: "philem" → Philemon, "corin" is ambiguous without a number.
  const hits = [...new Set([...bookIndex].filter(([alias]) => alias.startsWith(key) && key.length >= 3).map(([, id]) => id))];
  return hits.length === 1 ? hits[0] : null;
}

// Drops quote marks left open or closed by verse boundaries (common in the WEB).
function balanceQuotes(text) {
  let open = 0;
  let result = "";
  for (const char of text) {
    if (char === "“") open++;
    if (char === "”") {
      if (!open) continue;
      open--;
    }
    result += char;
  }
  if (open) {
    for (let i = result.length - 1; i >= 0 && open; i--)
      if (result[i] === "“") {
        result = result.slice(0, i) + result.slice(i + 1);
        open--;
      }
  }
  return result.replace(/\s+/g, " ").trim();
}

/** "Joshua 1:9", "Eph 6:10-13", "1 Cor 13:4–7", "Psalm 23" */
export function lookupVerse(input, translation = "web") {
  if (!TRANSLATIONS[translation]) translation = "web";
  const match = String(input || "").trim().match(/^((?:[1-3]|i{1,3}|first|second|third)?\s*[a-z][a-z .]*?)\s*(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–—]\s*(\d+))?)?$/i);
  if (!match) throw Object.assign(new Error("Enter a reference like “Joshua 1:9” or “Romans 8:31–39”."), { status: 400 });
  const book = findBook(match[1]);
  if (!book) throw Object.assign(new Error(`Couldn't find the book “${match[1].trim()}”.`), { status: 400 });
  const chapter = Number(match[2]);
  const chapterText = load(translation)[book]?.[chapter];
  if (!chapterText) throw Object.assign(new Error(`${books[book].name} doesn't have a chapter ${chapter}.`), { status: 400 });
  const last = Math.max(...Object.keys(chapterText).map(Number));
  const first = match[3] ? Number(match[3]) : 1;
  const end = match[4] ? Number(match[4]) : match[3] ? first : last;
  if (!chapterText[first] || end < first) throw Object.assign(new Error(`${books[book].name} ${chapter} has verses 1–${last}.`), { status: 400 });
  const name = books[book].name === "Psalms" ? "Psalm" : books[book].name;
  if (end - first + 1 > MAX_VERSES)
    throw Object.assign(new Error(`Choose up to ${MAX_VERSES} verses so the video stays short (for example ${name} ${chapter}:${first}–${first + 5}).`), { status: 400 });
  const verses = [];
  for (let v = first; v <= Math.min(end, last); v++) if (chapterText[v]) verses.push(chapterText[v]);
  let text = balanceQuotes(typeset(verses.join(" ")));
  // Passages can begin mid-sentence ("but those who wait…").
  text = text.replace(/^([“‘(]?)([a-z])/, (_, q, c) => q + c.toUpperCase());
  if (text.split(" ").length > MAX_WORDS)
    throw Object.assign(new Error("That passage is long for a short video. Try fewer verses."), { status: 400 });
  const range = first === Math.min(end, last) ? `${first}` : `${first}–${Math.min(end, last)}`;
  return {
    date: new Date().toISOString().slice(0, 10),
    text,
    ref: `${name} ${chapter}: ${range.replace("–", "-")}`,
    reference: `${name} ${chapter}:${range}`,
    translation,
    translationName: TRANSLATIONS[translation].name,
    source: TRANSLATIONS[translation].name,
    picked: true,
    url: null,
  };
}
