import { createWriteStream } from "node:fs";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dataDir, ffmpegPath, FPS } from "./config.mjs";
import { run } from "./process.mjs";
import { seeded } from "./library.mjs";
import { CALM, UPLIFT, WARRIOR } from "./catalog.mjs";
import { matchShots } from "./matcher.mjs";
export { CALM, UPLIFT, WARRIOR };
import { WIDTH, HEIGHT } from "../shared/scene.mjs";


const prepDir = () => path.join(dataDir, "library", "prepared");
const UA = { "User-Agent": "word-daily/0.1 (contact@wellspringstudiollc.com)" };

async function download(url, file, signal) {
  const response = await fetch(url, { headers: UA, signal: AbortSignal.any([signal, AbortSignal.timeout(300000)]) });
  if (!response.ok) throw new Error(`Could not download ${url.split("/").pop()} (${response.status}).`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
}

// Prepares an asset once: clips become 1080×1920 vertical crops (≤14 s, no
// audio); stills become cover-sized JPEGs with room to pan and zoom.
export async function prepare(asset, signal) {
  const ext = asset.kind === "clip" ? "mp4" : "jpg";
  const file = path.join(prepDir(), `${asset.key}.${ext}`);
  if (await access(file).then(() => true, () => false)) return file;
  await mkdir(prepDir(), { recursive: true });
  const source = `${file}.source`, partial = `${file}.part.${ext}`;
  try {
    await download(asset.url, source, signal);
    const args =
      asset.kind === "clip"
        ? ["-y", "-v", "error", "-t", "14", "-i", source, "-vf", `scale=-2:${HEIGHT}:flags=lanczos,crop=${WIDTH}:${HEIGHT}:(iw-${WIDTH})*${asset.focus ?? 0.5}:0,fps=${FPS},format=yuv420p`, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", partial]
        : ["-y", "-v", "error", "-i", source, "-vf", "scale=1300:2312:force_original_aspect_ratio=increase:flags=lanczos", "-q:v", "2", partial];
    await run(ffmpegPath, args, { signal, timeout: 300000 });
    await rename(partial, file);
    return file;
  } finally {
    await rm(source, { force: true });
    await rm(partial, { force: true });
  }
}

/**
 * Shot list for a video. Calm and Uplifting cross-fade a few long shots;
 * Warrior cuts hard on the phrases. Footage for every shot is chosen from
 * the words spoken during it (see matcher.mjs).
 * @returns {Promise<{ mode: "crossfade"|"cuts", shots: Array<{asset, start, duration, motion, offset, phrase}>, cuts: number[], crossfade?: number }>}
 */
export async function planShots(style, verse, { words, timeline: tl, groups }, seed) {
  const random = seeded(`shots:${seed}`);
  let windows, mode, crossfade, cuts = [];
  if (style === "warrior") {
    // Cut where each phrase lands, keeping every shot between 1.1 s and 2.8 s.
    const marks = [tl.intro, ...groups.map((g) => tl.voiceStart + words[g.start].start)].filter((t) => t >= tl.intro && t < tl.outroStart);
    for (const t of marks) if (!cuts.length || t - cuts.at(-1) >= 1.1) cuts.push(t);
    for (let i = 0; i < cuts.length; i++) {
      const next = cuts[i + 1] ?? tl.outroStart;
      if (next - cuts[i] > 2.8) cuts.splice(i + 1, 0, cuts[i] + (next - cuts[i]) / 2);
    }
    const bounds = [0, ...cuts.slice(1), tl.duration];
    windows = bounds.slice(0, -1).map((start, i) => ({ start, duration: bounds[i + 1] - start }));
    mode = "cuts";
    cuts = cuts.slice(1);
  } else {
    const count = style === "uplifting" ? Math.max(3, Math.min(6, Math.round(tl.duration / 5))) : 3;
    crossfade = style === "uplifting" ? 0.8 : 1.2;
    const each = (tl.duration + crossfade * (count - 1)) / count;
    windows = Array.from({ length: count }, (_, i) => ({ start: i * (each - crossfade), duration: each }));
    mode = "crossfade";
  }
  // What is being read during each shot (the first shot sits under the intro).
  const phraseOf = ({ start, duration }) =>
    words.filter((w) => tl.voiceStart + w.start >= start - 0.15 && tl.voiceStart + w.start < start + duration).map((w) => w.word).join(" ");
  const phrases = windows.map(phraseOf);
  if (!phrases[0]) phrases[0] = words.slice(0, 8).map((w) => w.word).join(" ");
  const catalog = style === "warrior" ? WARRIOR : style === "uplifting" ? UPLIFT : CALM;
  // Warrior leans on engravings but breaks them up with footage.
  const mix = style === "warrior" ? (i, kinds) => (kinds.slice(-2).every((k) => k === "still") && kinds.length >= 2 ? { clip: 0.07 } : kinds.at(-1) === "clip" ? { still: 0.05 } : {}) : () => ({});
  const picks = await matchShots(catalog, verse, phrases.map((phrase) => ({ phrase })), { seed, mix });
  const shots = windows.map((w, i) => ({ asset: picks[i], start: w.start, duration: w.duration, motion: Math.floor(random() * 4), offset: random(), phrase: phrases[i] }));
  return { mode, shots, cuts, crossfade };
}

const GRADES = {
  classic: "eq=saturation=0.86:contrast=1.03:brightness=-0.015:gamma=0.98,colorbalance=rs=0.03:gs=0.02:bs=-0.03:rm=0.02:bm=-0.02,vignette=angle=PI/5",
  uplifting: "eq=saturation=1.1:contrast=1.03:brightness=0.02:gamma=1.04,colorbalance=rs=0.04:gs=0.015:bs=-0.03:rh=0.02",
  warrior: "hue=s=0,eq=contrast=1.32:brightness=-0.045:gamma=0.9,noise=alls=13:allf=t,vignette=angle=PI/4",
};

// One shot's motion and framing: a slow push and pan across engravings
// (direction varies per shot), a push-in on Warrior footage.
function shotFilter(style, shot, frames) {
  const D = (frames / FPS).toFixed(3);
  // Warrior shots land with a punch: 12% over-zoom easing out in 0.3 s, then a slow push.
  const zoom = style === "warrior" ? `(1+0.08*t/${D}+0.12*pow(max(0,1-t/0.3),2))` : `(1+0.07*t/${D})`;
  let motion;
  if (shot.asset.kind === "still") {
    const [x, y] = [
      [`(iw-${WIDTH})*t/${D}`, `(ih-${HEIGHT})/2`],
      [`(iw-${WIDTH})*(1-t/${D})`, `(ih-${HEIGHT})/2`],
      [`(iw-${WIDTH})/2`, `(ih-${HEIGHT})*t/${D}`],
      [`(iw-${WIDTH})/2`, `(ih-${HEIGHT})*(1-t/${D})`],
    ][shot.motion];
    motion = `scale=w='trunc(iw*${zoom}/2)*2':h=-2:eval=frame,crop=${WIDTH}:${HEIGHT}:x='${x}':y='${y}'`;
  } else {
    const push = style === "warrior" ? `,scale=w='trunc(${WIDTH}*${zoom}/2)*2':h=-2:eval=frame,crop=${WIDTH}:${HEIGHT}` : "";
    motion = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WIDTH}:${HEIGHT}${push}`;
  }
  return `${motion},fps=${FPS},setsar=1,format=yuv420p`;
}

// Frame-exact shot lengths, so the joined footage lines up with the overlay.
function shotFrames(plan, total) {
  if (plan.mode === "cuts")
    return plan.shots.map((shot, i) => {
      const end = i === plan.shots.length - 1 ? total : Math.round((shot.start + shot.duration) * FPS);
      return end - Math.round(shot.start * FPS);
    });
  return plan.shots.map((shot) => Math.round(shot.duration * FPS));
}

const INTERMEDIATE = ["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p", "-threads", "2"];

/**
 * Renders the footage bed one shot at a time (so memory stays flat however
 * many cuts there are) and returns FFmpeg input arguments for the result.
 */
export async function renderBackground(style, plan, files, directory, totalFrames, report, signal) {
  const frames = shotFrames(plan, totalFrames);
  const segments = [];
  for (const [i, shot] of plan.shots.entries()) {
    signal.throwIfAborted();
    report(i / plan.shots.length, `Cutting shot ${i + 1} of ${plan.shots.length}: ${shot.asset.label}…`);
    const out = path.join(directory, `shot-${String(i).padStart(2, "0")}.mp4`);
    const input =
      shot.asset.kind === "still"
        ? ["-loop", "1", "-framerate", String(FPS), "-i", files[i]]
        : ["-stream_loop", "-1", "-ss", (shot.offset * 4).toFixed(2), "-i", files[i]];
    await run(ffmpegPath, ["-y", "-v", "error", ...input, "-vf", shotFilter(style, shot, frames[i]), "-frames:v", String(frames[i]), ...INTERMEDIATE, out], { signal, timeout: 300000 });
    segments.push(out);
  }
  if (plan.mode === "cuts") {
    const list = path.join(directory, "shots.txt");
    // Shot files are named by us (shot-NN.mp4), so the paths need no quoting beyond this.
    await writeFile(list, segments.map((file) => `file '${file.replace(/\\/g, "/")}'`).join("\n"));
    return { input: ["-f", "concat", "-safe", "0", "-i", list], cleanup: [...segments, list] };
  }
  // Cross-fades between a handful of shots, in one light pass.
  report(1, "Blending the shots…");
  const blended = path.join(directory, "footage.mp4");
  let last = "0:v";
  const graph = [];
  for (let i = 1; i < segments.length; i++) {
    graph.push(`[${last}][${i}:v]xfade=transition=fade:duration=${plan.crossfade}:offset=${plan.shots[i].start.toFixed(3)}[x${i}]`);
    last = `x${i}`;
  }
  await run(
    ffmpegPath,
    ["-y", "-v", "error", ...segments.flatMap((file) => ["-i", file]), ...(graph.length ? ["-filter_complex", graph.join(";"), "-map", `[${last}]`] : []), "-frames:v", String(totalFrames), ...INTERMEDIATE, blended],
    { signal, timeout: 300000 },
  );
  return { input: ["-i", blended], cleanup: [...segments, blended] };
}

// Final pass: grade the footage bed and lay The Word overlay on top. Warrior
// cuts also tear the colour channels apart for a few frames.
export function overlayGraph(style, plan) {
  const glitch =
    style === "warrior" && plan.cuts.length
      ? `,rgbashift=rh=-14:bh=14:rv=4:bv=-4:edge=smear:enable='${plan.cuts.map((c) => `between(t,${c.toFixed(3)},${(c + 0.12).toFixed(3)})`).join("+")}'`
      : "";
  return `[1:v]${GRADES[style] || GRADES.classic}${glitch},format=rgba[bg];[bg][0:v]overlay=0:0:format=auto,format=yuv420p[v]`;
}
