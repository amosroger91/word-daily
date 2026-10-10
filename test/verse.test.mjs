import test from "node:test";
import assert from "node:assert/strict";
import { decodeEntities, displayReference, parseReference, speechChunks, spokenReference, typeset, verseTokens } from "../shared/verse.mjs";
import { isoDate, normalizeVerse } from "../server/verse.mjs";
import { timeVerseWords, alignKeys } from "../shared/align.mjs";
import { parseCaption, composeCaption } from "../server/caption.mjs";
import { chooseBroll, BROLL } from "../server/library.mjs";

test("normalizes the Daily Discovery payload", () => {
  const verse = normalizeVerse({
    text: "They kept on demanding an answer, so he stood up and told them, &quot;Whichever one of you has never sinned may throw the first stone at her.&quot;",
    ref: "John 8: 7",
    date: "22nd Sep 2026",
    verseUrl: "https://discoverybiblestudy.org/daily/d/2026-09-22",
  });
  assert.equal(verse.date, "2026-09-22");
  assert.equal(verse.reference, "John 8:7");
  assert.match(verse.text, /them, “Whichever .* her\.”$/);
  assert.throws(() => normalizeVerse({ ref: "John 1: 1" }));
  assert.equal(isoDate("1st Jan 2027"), "2027-01-01");
  assert.equal(decodeEntities("a &amp; b &#8217; c"), "a & b ’ c");
});

test("reads references the way a narrator would", () => {
  assert.deepEqual(parseReference("John 10: 27-28"), { book: "John", chapter: 10, verses: [27, 28], endChapter: 10 });
  assert.equal(displayReference("John 10: 27-28"), "John 10:27–28");
  assert.equal(spokenReference("John 10: 27-28"), "John, chapter 10, verses 27 through 28.");
  assert.equal(spokenReference("1 John 4: 19"), "First John, chapter 4, verse 19.");
  assert.equal(spokenReference("Psalm 23: 1"), "Psalm 23, verse 1.");
  assert.equal(displayReference("Matthew 5: 48-6: 2"), "Matthew 5:48–6:2");
  assert.equal(spokenReference("Odd ref"), "Odd ref.");
});

test("splits narration at sentences and keeps every word", () => {
  const text = "My sheep recognize my voice; I know them, and they follow me. I give them eternal life; they shall never be lost, and no one can snatch them from me.";
  const chunks = speechChunks(text);
  assert.deepEqual(chunks, [
    "My sheep recognize my voice; I know them, and they follow me.",
    "I give them eternal life; they shall never be lost, and no one can snatch them from me.",
  ]);
  assert.equal(chunks.flatMap((chunk) => verseTokens(chunk)).length, verseTokens(text).length);
  assert.equal(typeset(`He said "go" -- now.`), "He said “go”—now.");
});

test("aligns heard words onto the verse and keeps timing monotonic", () => {
  assert.deepEqual(alignKeys(["the", "lord", "is", "my", "shepherd"], ["the", "lord", "is", "a", "shepherd"]), [0, 1, 2, -1, 4]);
  const text = "The Lord is my shepherd; I shall not want.";
  const segments = [{ kind: "reference", start: 0.15, end: 2 }, { kind: "verse", start: 2.75, end: 6 }];
  const heard = [
    { text: "The", start: 2.78 }, { text: "Lord", start: 3.0 }, { text: "is", start: 3.4 },
    { text: "my", start: 3.55 }, { text: "shepherd.", start: 3.75 }, { text: "I", start: 4.6 },
    { text: "shall", start: 4.75 }, { text: "not", start: 5.1 }, { text: "want.", start: 5.4 },
  ];
  const words = timeVerseWords(text, segments, heard);
  assert.equal(words.length, 9);
  assert.equal(words[1].word, "Lord");
  assert.equal(words[1].start, 3);
  assert.equal(words[5].start, 4.6);
  for (let i = 1; i < words.length; i++) assert.ok(words[i].start >= words[i - 1].start);
  // Without recognition, phrase pacing still covers the whole phrase.
  const paced = timeVerseWords(text, segments, []);
  assert.equal(paced[0].start, 2.75);
  assert.ok(paced.at(-1).end <= 6.001 && paced.at(-1).start > 5);
});

test("accepts only on-brief AI captions", () => {
  const good = parseCaption('<think>\n</think>{"hook":"You are known by name.","reflection":"Jesus knows his own and holds them fast. Nothing today can pull you out of his hand.","hashtags":["#GoodShepherd","Faith","#Hope!"]}');
  assert.deepEqual(good, { hook: "You are known by name.", reflection: "Jesus knows his own and holds them fast. Nothing today can pull you out of his hand.", hashtags: ["#GoodShepherd", "#Faith", "#Hope"] });
  assert.equal(parseCaption("not json"), null);
  assert.equal(parseCaption('{"hook":"Wow!","reflection":"Amazing!","hashtags":[]}'), null);
  const caption = composeCaption({ text: "Be still.", reference: "Psalm 46:10", source: "Daily Discovery Bible Study" }, good);
  assert.match(caption, /^You are known by name\.\n\n“Be still\.” — Psalm 46:10/);
  assert.match(caption, /Read it free in The Word/);
  assert.match(caption, /#TheWord #VerseOfTheDay #GoodShepherd/);
});

test("picks B-roll that fits the verse, reproducibly per day", () => {
  const shepherd = chooseBroll("My sheep recognize my voice", "2026-10-10");
  assert.equal(shepherd.length, 3);
  assert.ok(shepherd.some((clip) => clip.tags.includes("shepherd") || clip.tags.includes("field")));
  assert.deepEqual(chooseBroll("Be still", "a"), chooseBroll("Be still", "a"));
  assert.equal(new Set(BROLL.map((clip) => clip.id)).size, BROLL.length);
});
