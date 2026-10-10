// Runs the full one-click pipeline once and prints where the video landed.
//   node scripts/smoke-render.mjs [--style=warrior] [--ref="Joshua 1:9"] [--translation=kjv] [--voice=bm_lewis] [--hits]
import { randomUUID } from "node:crypto";
import { generateVideo } from "../server/pipeline.mjs";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const started = Date.now();
let lastStage = "";
const result = await generateVideo(
  randomUUID(),
  { style: arg("style"), ref: arg("ref"), translation: arg("translation"), voice: arg("voice"), hits: process.argv.includes("--hits") },
  (progress, message, stage) => {
    if (stage !== lastStage) console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] ${stage}`);
    lastStage = stage;
    process.stdout.write(`  ${progress}% ${message}\r`);
  },
  new AbortController().signal,
);
console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(JSON.stringify({ id: result.id, style: result.style, reference: result.verse.reference, duration: result.duration, voice: result.voice, footage: result.footage.map((f) => f.label), captionModel: result.captionModel, heardWords: result.heardWords, words: result.words.length }, null, 2));
for (const shot of result.shots) console.log(`  ${String(shot.at).padStart(5)}s  ${shot.label.padEnd(38)} ← ${JSON.stringify(shot.phrase)}`);
console.log(result.caption);
