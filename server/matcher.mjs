import { env } from "@huggingface/transformers";
import { modelCacheDir } from "./config.mjs";
import { seeded } from "./library.mjs";

// Chooses footage for every shot from what is being read at that moment.
//
// 1. Gates: some imagery is only right for certain verses. Crucifixion and
//    Christ imagery never appears unless the verse is about Christ.
// 2. Stories: names and story words ("David", "Goliath", "Pharaoh") lock a
//    shot onto that story's engraving.
// 3. Meaning: a small sentence-embedding model (MiniLM, ONNX on the CPU)
//    scores each asset's description against the phrase being spoken and the
//    verse as a whole.
// 4. Variety: no asset within three shots of itself, few repeats overall.

env.cacheDir = modelCacheDir;
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";

// Imagery that must be earned by the verse itself.
export const GATES = {
  christ: /\b(cross|crucif\w*|jesus|christ|lamb of god|the lamb|his blood|blood of|precious blood|calvary|golgotha|nails|pierced|it is finished|died for|laid down his life|savio(u)?r|redeem\w*|begotten son|only son|son of god|son of man|gave himself)\b/i,
  teaching: /\b(jesus|christ|blessed are|kingdom of heaven|disciples|multitudes?|taught|sermon)\b/i,
};

// Story-specific engravings, by label fragment. Names mean the verse *is*
// that story (other stories' engravings then stay out); themes only lean
// toward it.
const STORIES = {
  "Sennacherib": { names: ["sennacherib", "assyria", "assyrians", "hezekiah"], themes: [] },
  "Rebel Angels": { names: ["satan", "lucifer", "michael"], themes: ["devil", "dragon", "fallen angels", "principalities", "spiritual wickedness"] },
  "Jacob Wrestles": { names: ["jacob", "peniel"], themes: ["wrestle", "wrestled"] },
  "Balaam": { names: ["balaam"], themes: ["donkey"] },
  "David Slays Goliath": { names: ["david", "goliath", "philistine", "philistines"], themes: ["giant", "sling", "champion", "smooth stones"] },
  "Daniel in the Lions": { names: ["daniel", "darius"], themes: ["lions", "den"] },
  "Samson Slays a Lion": { names: ["samson", "delilah"], themes: ["lion", "jawbone"] },
  "Joshua Commands": { names: ["joshua", "jericho", "amorites"], themes: ["sun stand"] },
  "Gideon Chooses": { names: ["gideon", "midian", "midianites"], themes: ["three hundred", "trumpets"] },
  "Red Sea": { names: ["pharaoh", "egypt", "egyptians", "red sea"], themes: ["horse and his rider", "chariots"] },
  "Leviathan": { names: ["leviathan"], themes: ["dragon", "serpent", "sea monster"] },
  "The Deluge": { names: ["noah"], themes: ["flood", "ark", "deluge"] },
  "Chariot of Fire": { names: ["elijah", "elisha"], themes: ["chariot of fire", "whirlwind"] },
  "Moses Breaks": { names: ["moses", "sinai"], themes: ["tables", "tablets", "commandments", "golden calf"] },
  "Abraham": { names: ["abraham", "isaac", "moriah"], themes: ["ram", "will provide"] },
  "Dry Bones": { names: ["ezekiel"], themes: ["dry bones", "bones"] },
  "Tower of Babel": { names: ["babel"], themes: ["pride", "one language"] },
  "Sermon on the Mount": { names: [], themes: ["blessed are", "sermon", "multitudes", "disciples"] },
  "white horse": { names: [], themes: ["white horse", "faithful and true", "rider"] },
};
const storyFor = (asset) => Object.entries(STORIES).find(([fragment]) => asset.label.toLowerCase().includes(fragment.toLowerCase()))?.[1];
const GATED = {
  christ: ["The Crucifixion", "Christ on the Cross", "The Discovery of the True Cross", "Christ on the cross, carved", "Crucifix sculpture"],
  teaching: ["The Sermon on the Mount"],
};
export const gateOf = (asset) => Object.entries(GATED).find(([, labels]) => labels.includes(asset.label))?.[0] || null;

const words = (text) => ` ${String(text).toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ")} `;
// { names, themes }: how many of the story's names and theme words appear.
export function storyScore(asset, text) {
  const story = storyFor(asset);
  if (!story) return { names: 0, themes: 0 };
  const haystack = words(text);
  const count = (terms) => terms.filter((term) => haystack.includes(` ${term} `)).length;
  return { names: count(story.names), themes: count(story.themes) };
}
export const allowed = (asset, verseText) => {
  const gate = gateOf(asset);
  return !gate || GATES[gate].test(verseText);
};

let embedder;
async function embed(texts) {
  const { pipeline } = await import("@huggingface/transformers");
  embedder ||= pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8", device: "cpu" });
  const extract = await embedder;
  const output = await extract(texts, { pooling: "mean", normalize: true });
  return output.tolist();
}
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

/**
 * @param assets candidate footage
 * @param verse { text }
 * @param shots [{ phrase }] text spoken during each shot
 * @param options { seed, mix: (shotIndex, previousKinds) => bonus by kind }
 * @returns one asset per shot
 */
export async function matchShots(assets, verse, shots, { seed = "", mix = () => ({}), embedder: embedText = embed } = {}) {
  const random = seeded(`match:${seed}`);
  const pool = assets.filter((asset) => allowed(asset, verse.text));
  let vectors = null;
  try {
    // Shots with no words of their own borrow their neighbours' words.
    const phrases = shots.map((shot, i) => shot.phrase || [shots[i - 1]?.phrase, shots[i + 1]?.phrase].filter(Boolean).join(" ") || verse.text);
    vectors = await embedText([verse.text, ...phrases, ...pool.map((asset) => `${asset.label}. ${asset.about}`)]);
  } catch (error) {
    console.warn(`Footage matching fell back to story words: ${error.message}`);
  }
  const verseVector = vectors?.[0];
  const shotVectors = vectors?.slice(1, 1 + shots.length);
  const assetVectors = vectors?.slice(1 + shots.length);
  const verseStory = pool.map((asset) => storyScore(asset, verse.text));
  // A verse that tells a specific story keeps to it: its own engraving can
  // return on the key moments, and other stories' engravings stay out.
  const told = verseStory.some((score) => score.names > 0);
  const picks = [];
  const uses = new Map();
  for (const [i, shot] of shots.entries()) {
    const bonus = mix(i, picks.map((asset) => asset.kind));
    let best = null, bestScore = -Infinity;
    pool.forEach((asset, a) => {
      const own = verseStory[a].names > 0;
      const themed = verseStory[a].themes > 0;
      if (picks.slice(own ? -1 : -3).some((pick) => pick.key === asset.key) && pool.length > 3) return;
      const meaning = vectors ? 0.6 * dot(shotVectors[i], assetVectors[a]) + 0.4 * dot(verseVector, assetVectors[a]) : 0;
      const phrase = storyScore(asset, shot.phrase || "");
      // Story engravings belong to their story; elsewhere they need strong meaning to appear.
      let story = 0;
      if (storyFor(asset)) {
        if (own) story = 0.25 + 0.06 * Math.min(3, verseStory[a].names) + 0.08 * Math.min(2, phrase.names + phrase.themes);
        else if (told) story = -0.6;
        else if (themed) story = 0.1 + 0.06 * Math.min(2, phrase.themes);
        else story = -0.2;
      }
      const reuse = (own ? -0.13 : themed ? -0.2 : -0.18) * (uses.get(asset.key) || 0);
      const score = meaning + story + reuse + (bonus[asset.kind] || 0) + random() * 0.03;
      if (score > bestScore) [best, bestScore] = [asset, score];
    });
    best ||= pool[i % pool.length];
    picks.push(best);
    uses.set(best.key, (uses.get(best.key) || 0) + 1);
  }
  return picks;
}

export async function releaseEmbedder() {
  const loaded = await embedder?.catch(() => null);
  embedder = null;
  await loaded?.dispose?.();
}
