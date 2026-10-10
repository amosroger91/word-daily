import { createWriteStream } from "node:fs";
import { access, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dataDir } from "./config.mjs";

// Vertical 1080×1920 B-roll from Mixkit (Mixkit Stock Video Free License:
// free for commercial use, no attribution required). Tags steer the pick
// toward the verse's imagery.
export const BROLL = [
  { id: 1166, label: "Calm sea at the horizon", tags: ["peace", "water", "rest", "still"] },
  { id: 1165, label: "Pier at golden hour", tags: ["light", "water", "peace", "hope"] },
  { id: 1197, label: "Wooden pier over still water", tags: ["peace", "path", "water", "rest"] },
  { id: 1183, label: "Sun over the hills", tags: ["light", "morning", "hills", "glory"] },
  { id: 1170, label: "Sunrise through palms", tags: ["light", "morning", "new", "hope"] },
  { id: 1191, label: "Palm against the sunset", tags: ["light", "evening", "rest"] },
  { id: 1222, label: "Shoreline at sunset", tags: ["light", "water", "evening"] },
  { id: 1164, label: "Waves on open water", tags: ["water", "power", "sea", "storm"] },
  { id: 1220, label: "Rocks against the sea", tags: ["rock", "strength", "refuge", "water"] },
  { id: 1200, label: "Heron on the water", tags: ["creation", "water", "care", "bird"] },
  { id: 1202, label: "Water plants in the light", tags: ["growth", "water", "life", "living"] },
  { id: 1178, label: "Grass under drifting clouds", tags: ["field", "sky", "grass", "shepherd", "pasture"] },
  { id: 1173, label: "Branches against the sky", tags: ["tree", "sky", "growth", "branch"] },
  { id: 1185, label: "Leaves in the breeze", tags: ["tree", "life", "spirit", "wind"] },
  { id: 1188, label: "Tree canopy", tags: ["tree", "shelter", "growth", "branch"] },
  { id: 1187, label: "White blossoms", tags: ["flower", "beauty", "pure", "grace"] },
  { id: 1186, label: "Pink flowers and sky", tags: ["flower", "joy", "beauty"] },
  { id: 1184, label: "Purple blossoms", tags: ["flower", "beauty", "grace"] },
  { id: 1181, label: "Frangipani", tags: ["flower", "beauty", "joy"] },
  { id: 1168, label: "Bougainvillea", tags: ["flower", "joy", "life"] },
];
const clipUrl = (id) => `https://assets.mixkit.co/videos/${id}/${id}-1080.mp4`;

// Gentle piano and ambient scores by Kevin MacLeod (incompetech.com), CC BY 4.0.
export const MUSIC = [
  "Meditation Impromptu 01",
  "Meditation Impromptu 02",
  "Meditation Impromptu 03",
  "At Rest",
  "Inner Light",
  "Healing",
  "Lasting Hope",
  "Heartwarming",
  "Dreamer",
  "Clean Soul",
  "Calmant",
].map((title) => ({
  id: title.toLowerCase().replace(/\s+/g, "-"),
  title,
  url: `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(title)}.mp3`,
  credit: `Music: “${title}” by Kevin MacLeod (incompetech.com), licensed under CC BY 4.0`,
}));

// Verse words that suggest a B-roll theme.
const themes = {
  water: /\b(water|waters|river|sea|stream|rain|drink|thirst|wash|well|flood|deep)\b/i,
  light: /\b(light|sun|morning|dawn|day|shine|glory|lamp|star|bright)\b/i,
  shepherd: /\b(sheep|shepherd|flock|pasture|lamb|fold)\b/i,
  growth: /\b(seed|grow|fruit|vine|branch|root|harvest|plant|tree|leaf)\b/i,
  flower: /\b(flower|lily|lilies|grass|bloom|field|beauty|beautiful)\b/i,
  rock: /\b(rock|refuge|fortress|stronghold|strength|shield|stand)\b/i,
  peace: /\b(peace|rest|still|quiet|calm|comfort|weary|burden)\b/i,
  hope: /\b(hope|new|eternal|life|promise|future|joy)\b/i,
};
const related = { shepherd: ["shepherd", "pasture", "field"], flower: ["flower", "beauty"], growth: ["growth", "tree", "branch", "life"] };

// A small deterministic random source so a day's picks are reproducible.
export function seeded(seed) {
  let h = 2166136261;
  for (const char of String(seed)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function chooseBroll(text, seed, count = 3) {
  const random = seeded(`broll:${seed}`);
  const wanted = Object.entries(themes).flatMap(([theme, pattern]) => (pattern.test(text) ? related[theme] || [theme] : []));
  const scored = BROLL.map((clip) => ({
    clip,
    score: clip.tags.filter((tag) => wanted.includes(tag)).length * 2 + random() * 1.5,
  })).sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map(({ clip }) => clip);
}
export const chooseMusic = (seed, id) =>
  MUSIC.find((track) => track.id === id) || MUSIC[Math.floor(seeded(`music:${seed}`)() * MUSIC.length)];

const libraryDir = () => path.join(dataDir, "library");
async function cached(file, url, signal) {
  if (await access(file).then(() => true, () => false)) return file;
  await mkdir(path.dirname(file), { recursive: true });
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]) });
  if (!response.ok) throw new Error(`Could not download ${path.basename(file)} (${response.status}).`);
  const partial = `${file}.part`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
    await rename(partial, file);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
  return file;
}
export const clipFile = (clip, signal) => cached(path.join(libraryDir(), "broll", `${clip.id}.mp4`), clipUrl(clip.id), signal);
export const musicFile = (track, signal) => cached(path.join(libraryDir(), "music", `${track.id}.mp3`), track.url, signal);
