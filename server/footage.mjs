import { createWriteStream } from "node:fs";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dataDir, ffmpegPath, FPS } from "./config.mjs";
import { run } from "./process.mjs";
import { BROLL, seeded } from "./library.mjs";
import { WIDTH, HEIGHT } from "../shared/scene.mjs";

// Mixkit Stock Video Free License. `q` is the best source rendition (4K
// horizontals are cropped to a sharp vertical frame).
const mix = (id, tags, label, focus = 0.5, q = 2160) => ({ kind: "clip", key: `mixkit-${id}`, url: `https://assets.mixkit.co/videos/${id}/${id}-${q}.mp4`, tags, label, focus, credit: "Mixkit" });
const vertical = (id, tags, label) => mix(id, tags, label, 0.5, 1080);
const commons = (file, tags, label) => ({ kind: "still", key: `dore-${file.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 60)}`, url: `https://upload.wikimedia.org/wikipedia/commons/${file}`, tags, label, credit: "Gustave Doré (public domain, Wikimedia Commons)" });

// Uplifting: sunlight, flowers, worship, people dancing and singing.
export const UPLIFT = [
  mix(4702, ["joy", "dance", "flower", "field", "rejoice", "glad"], "Dancing in a field of flowers"),
  mix(4856, ["joy", "dance", "rejoice", "glad", "praise"], "Dancing for joy"),
  mix(4636, ["joy", "dance", "love", "together"], "A couple dancing"),
  mix(4556, ["joy", "friends", "celebrate", "together", "rejoice"], "Friends with colored smoke", 0.45),
  mix(4831, ["joy", "run", "life", "free", "strength"], "Running through the park"),
  mix(962, ["flower", "peace", "beauty", "creation", "grace"], "Lavender and a butterfly"),
  mix(4530, ["love", "flower", "together", "walk"], "Walking through lavender"),
  mix(1086, ["light", "morning", "new", "hope", "sun", "day"], "Sunrise over the ocean"),
  mix(3394, ["light", "evening", "tree", "rest"], "Sunset through the pines"),
  mix(4743, ["sing", "praise", "song", "music", "voice"], "Singing", 0.5),
  mix(50326, ["sing", "praise", "song", "worship"], "A singer in an old hall", 0.5),
  mix(50330, ["music", "song", "praise", "worship"], "Hands on the piano", 0.55),
  mix(22721, ["church", "house", "worship", "light"], "Church tower in the sun"),
  mix(22712, ["church", "worship", "light", "glory"], "Stained glass and a chandelier"),
  mix(22713, ["prayer", "pray", "church", "worship"], "Praying at the altar", 0.4),
  ...BROLL.filter((clip) => [1187, 1186, 1181, 1170, 1183, 1178, 1168].includes(clip.id)).map((clip) => vertical(clip.id, clip.tags, clip.label)),
];

// Warrior: Doré's angels, battles and crusaders, and dark footage — fire,
// storms, candles, cathedrals — all cut in black and white.
export const WARRIOR = [
  commons("5/53/152.The_Angel_Is_Sent_to_Deliver_Israel.jpg", ["angel", "deliver", "battle", "enemy", "victory", "lord"], "The Angel Is Sent to Deliver Israel"),
  commons("5/5c/Angel_decimates_Sennacherib%27s_army_%2889398167%29.jpg", ["angel", "enemy", "deliver", "army", "destroy"], "The Angel Destroys Sennacherib's Army"),
  commons("0/08/Gustave_Dor%C3%A9-La_chute_des_anges_rebelles.jpg", ["angel", "war", "heaven", "devil", "evil", "fall", "stand"], "The Fall of the Rebel Angels"),
  commons("b/b7/024.Jacob_Wrestles_with_the_Angel.jpg", ["wrestle", "struggle", "bless", "angel", "strength"], "Jacob Wrestles with the Angel"),
  commons("8/80/043.An_Angel_Appears_to_Balaam.jpg", ["angel", "sword", "way", "path"], "An Angel Appears to Balaam"),
  commons("0/00/071A.David_Slays_Goliath.jpg", ["giant", "courage", "battle", "fear", "strong", "victory"], "David Slays Goliath"),
  commons("a/a7/131.Daniel_in_the_Lions%27_Den.jpg", ["lion", "faith", "fear", "trust", "deliver"], "Daniel in the Lions' Den"),
  commons("8/8b/051.Joshua_Commands_the_Sun_to_Stand_Still.jpg", ["strong", "courage", "battle", "sun", "stand", "lord"], "Joshua Commands the Sun to Stand Still"),
  commons("d/d5/054.Gideon_Chooses_300_Soldiers.jpg", ["army", "few", "courage", "strong", "chosen"], "Gideon Chooses 300 Soldiers"),
  commons("5/54/041A.Moses_Breaks_the_Tables_of_the_Law.jpg", ["law", "command", "commandments", "sin"], "Moses Breaks the Tables of the Law"),
  commons("e/ef/127.Ezekiel%E2%80%99s_Vision_of_the_Valley_of_Dry_Bones.jpg", ["life", "death", "spirit", "bones", "rise", "breath"], "The Valley of Dry Bones"),
  commons("4/4d/Gustave_Dor%C3%A9_-_Crucifixion_of_Jesus.jpg", ["cross", "blood", "sacrifice", "died", "love", "sin", "christ"], "The Crucifixion"),
  commons("7/71/Gustave_Dor%C3%A9_-_The_Order_of_Chivalry.jpg", ["armour", "armor", "knight", "honor", "serve"], "The Order of Chivalry"),
  commons("1/12/Gustave_Dor%C3%A9_-_The_Crusaders_Cross_Mount_Taurus.jpg", ["march", "mountain", "endure", "way", "follow"], "The Crusaders Cross Mount Taurus"),
  commons("3/3d/Gustave_Dor%C3%A9_-_Celestial_Phenomena.jpg", ["heaven", "sign", "sky", "glory", "cross"], "Celestial Phenomena"),
  commons("2/25/Gustave_dore_crusades_the_discovery_of_the_true_cross.jpg", ["cross", "faith", "found", "christ"], "The Discovery of the True Cross"),
  mix(4422, ["storm", "power", "thunder", "night", "wrath"], "Thunderstorm at night"),
  mix(21576, ["sky", "heaven", "cloud", "storm"], "Clouds racing overhead"),
  vertical(52284, ["fire", "spirit", "burn", "zeal"], "Flames on black"),
  vertical(52292, ["fire", "spirit", "burn", "rise"], "Fire growing in the dark"),
  mix(52312, ["fire", "spirit", "refine"], "Flames, close"),
  vertical(3463, ["fire", "spark", "spirit", "light"], "Sparks in the dark"),
  mix(3461, ["light", "candle", "prayer", "darkness"], "Lighting candles in the dark", 0.5),
  vertical(3458, ["light", "candle", "prayer", "darkness"], "A single candle"),
  mix(22723, ["church", "temple", "house", "strength", "pillar"], "Gothic columns", 0.5),
  mix(22707, ["church", "heaven", "glory"], "Cathedral heights", 0.5),
  mix(22710, ["cross", "christ", "died", "sacrifice"], "Christ on the cross", 0.5),
  vertical(22726, ["cross", "christ", "sacrifice", "blood"], "Crucifix sculpture"),
  mix(22716, ["darkness", "church", "holy"], "Sacred art in the dark", 0.5),
  vertical(22724, ["door", "darkness", "church", "knock"], "A gothic door in the dark"),
  mix(4063, ["rock", "stand", "firm", "strength"], "A statue on the rocks", 0.5),
];

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

const themeWords = (text) => new Set(String(text).toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2).flatMap((w) => [w, w.replace(/(s|es|ed|eth|est|ing)$/, "")]));
function rank(assets, text, random) {
  const words = themeWords(text);
  return assets
    .map((asset) => ({ asset, score: asset.tags.filter((tag) => words.has(tag)).length * 3 + random() * 2 }))
    .sort((a, b) => b.score - a.score)
    .map(({ asset }) => asset);
}

/**
 * Shot list for a video. Calm and Uplifting cross-fade a few long shots;
 * Warrior cuts hard on the phrases.
 * @returns {{ mode: "crossfade"|"cuts", shots: Array<{asset, start, duration, motion}>, cuts: number[] }}
 */
export function planShots(style, verse, { words, timeline: tl, groups }, seed) {
  const random = seeded(`shots:${seed}`);
  if (style === "warrior") {
    // Cut where each phrase lands, keeping every shot between 1.1 s and 2.8 s.
    const marks = [tl.intro, ...groups.map((g) => tl.voiceStart + words[g.start].start)].filter((t) => t >= tl.intro && t < tl.outroStart);
    const cuts = [];
    for (const t of marks) if (!cuts.length || t - cuts.at(-1) >= 1.1) cuts.push(t);
    for (let i = 0; i < cuts.length; i++) {
      const next = cuts[i + 1] ?? tl.outroStart;
      if (next - cuts[i] > 2.8) cuts.splice(i + 1, 0, cuts[i] + (next - cuts[i]) / 2);
    }
    const ranked = rank(WARRIOR, verse.text, random);
    const stills = ranked.filter((a) => a.kind === "still"), clips = ranked.filter((a) => a.kind === "clip");
    const shots = [];
    const bounds = [0, ...cuts.slice(1), tl.duration];
    for (let i = 0; i < bounds.length - 1; i++) {
      // Two engravings, then a piece of footage, so the cut rhythm varies.
      const pool = i % 3 === 2 ? clips : stills;
      const asset = pool[Math.floor(i / 3) % pool.length] || ranked[i % ranked.length];
      shots.push({ asset, start: bounds[i], duration: bounds[i + 1] - bounds[i], motion: Math.floor(random() * 4), offset: random() });
    }
    return { mode: "cuts", shots, cuts: cuts.slice(1) };
  }
  const assets = style === "uplifting" ? rank(UPLIFT, verse.text, random) : rank(BROLL.map((clip) => vertical(clip.id, clip.tags, clip.label)), verse.text, random);
  const count = style === "uplifting" ? Math.max(3, Math.min(6, Math.round(tl.duration / 5))) : 3;
  const crossfade = style === "uplifting" ? 0.8 : 1.2;
  const each = (tl.duration + crossfade * (count - 1)) / count;
  // Uplifting mixes people and places: take the best matches, then fill with variety.
  const picked = assets.slice(0, count);
  return {
    mode: "crossfade",
    crossfade,
    shots: picked.map((asset, i) => ({ asset, start: i * (each - crossfade), duration: each, motion: 0, offset: random() })),
    cuts: [],
  };
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
  let motion;
  if (shot.asset.kind === "still") {
    const [x, y] = [
      [`(iw-${WIDTH})*t/${D}`, `(ih-${HEIGHT})/2`],
      [`(iw-${WIDTH})*(1-t/${D})`, `(ih-${HEIGHT})/2`],
      [`(iw-${WIDTH})/2`, `(ih-${HEIGHT})*t/${D}`],
      [`(iw-${WIDTH})/2`, `(ih-${HEIGHT})*(1-t/${D})`],
    ][shot.motion];
    motion = `scale=w='trunc(iw*(1+0.07*t/${D})/2)*2':h=-2:eval=frame,crop=${WIDTH}:${HEIGHT}:x='${x}':y='${y}'`;
  } else {
    const push = style === "warrior" ? `,scale=w='trunc(${WIDTH}*(1+0.08*t/${D})/2)*2':h=-2:eval=frame,crop=${WIDTH}:${HEIGHT}` : "";
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

// Final pass: grade the footage bed and lay The Word overlay on top.
export const overlayGraph = (style) =>
  `[1:v]${GRADES[style] || GRADES.classic},format=rgba[bg];[bg][0:v]overlay=0:0:format=auto,format=yuv420p[v]`;
