// Runs the full one-click pipeline once against today's verse (or a fixture)
// and prints where the finished video landed.
import { randomUUID } from "node:crypto";
import { generateVideo } from "../server/pipeline.mjs";

const fixture = process.argv.includes("--fixture")
  ? {
      date: "2026-10-10",
      text: "My sheep recognize my voice; I know them, and they follow me. I give them eternal life; they shall never be lost, and no one can snatch them from me.",
      ref: "John 10: 27-28",
      reference: "John 10:27–28",
      url: null,
      source: "Daily Discovery Bible Study",
    }
  : undefined;
const voice = process.argv.find((arg) => arg.startsWith("--voice="))?.slice(8);
const started = Date.now();
let lastStage = "";
const result = await generateVideo(randomUUID(), { verse: fixture, voice }, (progress, message, stage) => {
  if (stage !== lastStage) console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] ${stage}`);
  lastStage = stage;
  if (progress % 10 === 0) process.stdout.write(`  ${progress}% ${message}\r`);
}, new AbortController().signal);
console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(JSON.stringify({ id: result.id, duration: result.duration, voice: result.voice, music: result.music.title, broll: result.broll, captionModel: result.captionModel, heardWords: result.heardWords }, null, 2));
console.log(result.caption);
