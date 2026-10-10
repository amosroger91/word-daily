import { readdir } from "node:fs/promises";
import path from "node:path";
import { dataDir, verseApi } from "./config.mjs";
import { readJson, saveJson } from "./storage.mjs";
import { decodeEntities, displayReference, typeset } from "../shared/verse.mjs";

const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// "10th Oct 2026" → "2026-10-10"
export function isoDate(value, fallback = new Date()) {
  const match = String(value || "").match(/(\d{1,2})\w*\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (match && months[match[2].toLowerCase()])
    return `${match[3]}-${String(months[match[2].toLowerCase()]).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return fallback.toISOString().slice(0, 10);
}

export function normalizeVerse(data) {
  if (typeof data?.text !== "string" || typeof data?.ref !== "string" || !data.text.trim())
    throw new Error("The Daily Discovery API returned an unexpected verse format.");
  return {
    date: isoDate(data.date),
    text: typeset(data.text),
    ref: decodeEntities(data.ref).trim(),
    reference: displayReference(data.ref),
    url: data.verseUrl || data.url || null,
    source: "Daily Discovery Bible Study",
  };
}

const verseDir = () => path.join(dataDir, "verses");

// Today's verse, cached per day. Falls back to the newest cached verse when offline.
export async function getDailyVerse({ fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(verseApi, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Daily Discovery API returned ${response.status}.`);
    const verse = normalizeVerse(await response.json());
    await saveJson(path.join(verseDir(), `${verse.date}.json`), verse);
    return verse;
  } catch (error) {
    const files = (await readdir(verseDir()).catch(() => []))
      .filter((file) => file.endsWith(".json"))
      .sort();
    if (!files.length)
      throw new Error(`Could not load today's verse: ${error.message}`);
    return { ...(await readJson(path.join(verseDir(), files.at(-1)))), stale: true };
  }
}
