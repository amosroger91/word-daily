import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ffmpegPath, wordAppUrl } from "./config.mjs";
import { run } from "./process.mjs";
import { videoDir } from "./storage.mjs";
import { getDailyVerse } from "./verse.mjs";
import { writeCaption, composeCaption } from "./caption.mjs";
import { narrate, DEFAULT_VOICE, VOICES } from "./voice.mjs";
import { timeNarration } from "./align.mjs";
import { chooseBroll, clipFile } from "./library.mjs";
import { renderVerseVideo } from "./render.mjs";
import { probe } from "./media.mjs";
import { WIDTH, HEIGHT } from "../shared/scene.mjs";

// Progress bands for each step of the one-click flow.
const STAGES = [
  ["verse", 0, 3],
  ["caption", 3, 12],
  ["voice", 12, 30],
  ["timing", 30, 40],
  ["media", 40, 46],
  ["render", 46, 97],
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
  const voice = VOICES[options.voice] ? options.voice : DEFAULT_VOICE;

  stage(report, "verse")(0, "Fetching today's verse…");
  const verse = options.verse || (await getDailyVerse());
  signal.throwIfAborted();

  const captionReport = stage(report, "caption");
  captionReport(0, "Writing the caption…");
  const captionParts = await writeCaption(verse, (message) => captionReport(0.3, message), signal);

  const voiceReport = stage(report, "voice");
  voiceReport(0, "Warming up the narration voice…");
  const narration = await narrate(verse, voice, path.join(directory, "narration.wav"), (message) => voiceReport(0.4, message), signal);

  const timingReport = stage(report, "timing");
  timingReport(0, "Timing every word…");
  const { words, heard } = await timeNarration(verse, narration, (message) => timingReport(0.3, message), signal);

  const mediaReport = stage(report, "media");
  mediaReport(0, "Gathering B-roll…");
  const seed = `${verse.date}:${options.variation || 0}`;
  const broll = chooseBroll(verse.text, seed);
  const clips = [];
  for (const [index, clip] of broll.entries()) {
    clips.push(await clipFile(clip, signal));
    mediaReport((index + 1) / broll.length, `Gathering B-roll (${index + 1} of ${broll.length})…`);
  }

  const renderReport = stage(report, "render");
  const temporary = path.join(directory, "rendering.mp4");
  const output = path.join(directory, "verse-of-the-day.mp4");
  const rendered = await renderVerseVideo(
    { verse, words, narration, clips, output: temporary, dateLabel: prettyDate(verse.date), appLabel: appLabel(wordAppUrl) },
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
  // A clean B-roll still (no text) for the editor's verse card.
  await run(ffmpegPath, ["-y", "-v", "error", "-ss", "3", "-i", clips[0], "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "3", path.join(directory, "backdrop.jpg")], { signal });
  const caption = composeCaption(verse, captionParts);
  await writeFile(path.join(directory, "caption.txt"), caption, "utf8");
  const meta = {
    id,
    verse,
    voice,
    voiceLabel: VOICES[voice],
    broll: broll.map(({ id, label }) => ({ id, label })),
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
