import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ffmpegPath, wordAppUrl } from "./config.mjs";
import { run } from "./process.mjs";
import { videoDir } from "./storage.mjs";
import { getDailyVerse } from "./verse.mjs";
import { lookupVerse } from "./bible.mjs";
import { writeCaption, composeCaption } from "./caption.mjs";
import { narrate, VOICES } from "./voice.mjs";
import { timeNarration } from "./align.mjs";
import { planShots, prepare } from "./footage.mjs";
import { renderVerseVideo } from "./render.mjs";
import { probe } from "./media.mjs";
import { createCanvas } from "./canvas.mjs";
import { WIDTH, HEIGHT } from "../shared/scene.mjs";
import { sceneFor } from "../shared/scenes.mjs";
import { STYLES, styleOf } from "../shared/styles.mjs";

// Progress bands for each step of the one-click flow.
const STAGES = [
  ["verse", 0, 3],
  ["caption", 3, 12],
  ["voice", 12, 30],
  ["timing", 30, 38],
  ["media", 38, 48],
  ["render", 48, 97],
  ["check", 97, 100],
];
const stage = (report, name) => {
  const [, from, to] = STAGES.find(([id]) => id === name);
  return (fraction, message) => report(Math.round(from + (to - from) * Math.min(1, fraction)), message, name);
};
const prettyDate = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const appLabel = (url) => url.replace(/^https?:\/\//, "").replace(/\/+$/, "").replace(/\/the-word$/i, "/The-Word");

export async function generateVideo(id, options, report, signal) {
  const directory = videoDir(id);
  await mkdir(directory, { recursive: true });
  const style = STYLES[options.style] ? options.style : "classic";
  const look = styleOf(style);
  const voice = VOICES[options.voice] ? options.voice : look.voice;

  stage(report, "verse")(0, options.ref ? `Opening ${options.ref}…` : "Fetching today's verse…");
  const verse = options.verse || (options.ref ? lookupVerse(options.ref, options.translation || look.translation) : await getDailyVerse());
  signal.throwIfAborted();

  const captionReport = stage(report, "caption");
  captionReport(0, "Writing the caption…");
  const captionParts = await writeCaption(verse, (message) => captionReport(0.3, message), signal, style);

  const voiceReport = stage(report, "voice");
  voiceReport(0, "Warming up the narration voice…");
  const narration = await narrate(verse, voice, path.join(directory, "narration.wav"), (message) => voiceReport(0.4, message), signal, { speed: look.speed, pause: look.pause });

  const timingReport = stage(report, "timing");
  timingReport(0, "Timing every word…");
  const { words, heard } = await timeNarration(verse, narration, (message) => timingReport(0.3, message), signal);

  // Layout first: Warrior cuts land on its phrases.
  const S = sceneFor(style);
  const layout = S.layout(createCanvas(WIDTH, HEIGHT).getContext("2d"), words);
  const tl = S.timeline(narration.duration);
  const plan = planShots(style, verse, { words, timeline: { ...tl, intro: tl.intro ?? 2.8 }, groups: layout.groups || [] }, `${verse.reference}:${verse.date}:${options.variation || 0}`);

  const mediaReport = stage(report, "media");
  const unique = [...new Map(plan.shots.map((shot) => [shot.asset.key, shot.asset])).values()];
  const prepared = new Map();
  for (const [index, asset] of unique.entries()) {
    mediaReport(index / unique.length, `Preparing footage (${index + 1} of ${unique.length}): ${asset.label}…`);
    prepared.set(asset.key, await prepare(asset, signal));
  }

  const renderReport = stage(report, "render");
  const temporary = path.join(directory, "rendering.mp4");
  const output = path.join(directory, "verse-of-the-day.mp4");
  const eyebrow = verse.picked ? verse.translationName : `Verse of the day · ${prettyDate(verse.date)}`;
  const scene = { verse, words, narration, layout, eyebrow, dateLabel: prettyDate(verse.date), appLabel: appLabel(wordAppUrl), cuts: plan.cuts };
  const rendered = await renderVerseVideo(
    { style, scene, plan, files: plan.shots.map((shot) => prepared.get(shot.asset.key)), output: temporary },
    (percent, message) => renderReport(percent / 100, message),
    signal,
  );

  const checkReport = stage(report, "check");
  checkReport(0, "Checking the finished MP4…");
  const info = await probe(temporary, signal);
  const video = info.streams.find((s) => s.codec_type === "video");
  const audio = info.streams.find((s) => s.codec_type === "audio");
  if (video?.width !== WIDTH || video?.height !== HEIGHT || video?.codec_name !== "h264" || audio?.codec_name !== "aac" || Math.abs(Number(info.format.duration) - rendered.duration) > 0.2)
    throw new Error("The encoded video did not pass output validation.");
  await rename(temporary, output);
  await run(ffmpegPath, ["-y", "-v", "error", "-ss", rendered.posterTime.toFixed(2), "-i", output, "-frames:v", "1", "-q:v", "2", path.join(directory, "poster.jpg")], { signal });
  // A clean footage still (no text) for the editor's verse card.
  const first = plan.shots.find((shot) => shot.asset.kind === "clip") || plan.shots[0];
  await run(ffmpegPath, ["-y", "-v", "error", ...(first.asset.kind === "clip" ? ["-ss", "2"] : []), "-i", prepared.get(first.asset.key), "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "3", path.join(directory, "backdrop.jpg")], { signal });
  const caption = composeCaption(verse, captionParts);
  await writeFile(path.join(directory, "caption.txt"), caption, "utf8");
  const meta = {
    id,
    style,
    styleName: look.name,
    verse,
    voice,
    voiceLabel: VOICES[voice],
    footage: unique.map(({ label, credit, kind }) => ({ label, credit, kind })),
    caption,
    captionModel: captionParts.model,
    words,
    heardWords: heard,
    duration: rendered.duration,
    width: WIDTH,
    height: HEIGHT,
    videoUrl: `api/videos/${id}/video`,
    downloadUrl: `api/videos/${id}/download`,
    posterUrl: `api/videos/${id}/poster`,
    backdropUrl: `api/videos/${id}/backdrop`,
    captionUrl: `api/videos/${id}/caption`,
    createdAt: new Date().toISOString(),
  };
  await writeFile(path.join(directory, "meta.json"), JSON.stringify(meta), "utf8");
  return meta;
}
