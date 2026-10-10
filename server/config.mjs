import "dotenv/config";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const dataDir = path.resolve(
  process.env.DATA_DIR || path.join(root, "data"),
);
export const modelCacheDir =
  process.env.MODEL_CACHE_DIR ||
  path.join(os.homedir(), ".cache", "word-daily", "models");
export const ffmpegPath = process.env.FFMPEG_PATH || ffmpeg;
export const ffprobePath = process.env.FFPROBE_PATH || ffprobe.path;
export const host = process.env.HOST || "127.0.0.1";
export const port = Number(process.env.PORT || 4319);
// Public origin when deployed behind a reverse proxy, e.g. https://word.example.com
export const publicUrl = process.env.PUBLIC_URL?.replace(/\/+$/, "") || "";
export const verseApi =
  process.env.VERSE_API_URL || "https://discoverybiblestudy.org/daily/api/";
// The Word reader that every video credits and links to.
export const wordAppUrl =
  process.env.WORD_APP_URL || "https://amosroger91.github.io/The-Word/";
export const FPS = 30;
export const SAMPLE_RATE = 16000;
