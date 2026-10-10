import { writeFile } from "node:fs/promises";
import { env } from "@huggingface/transformers";
import { modelCacheDir } from "./config.mjs";
import { speechChunks, spokenReference } from "../shared/verse.mjs";

// Kokoro-82M (Apache-2.0): natural, expressive narration that runs on the CPU.
env.cacheDir = modelCacheDir;
export const VOICES = {
  af_heart: "Heart — warm, gentle (female)",
  af_bella: "Bella — bright, clear (female)",
  bf_emma: "Emma — calm British (female)",
  am_michael: "Michael — steady, reassuring (male)",
  am_fenrir: "Fenrir — deep, resonant (male)",
  bm_george: "George — classic British (male)",
};
export const DEFAULT_VOICE = "af_heart";
const RATE = 24000;
// Unhurried, reverent reading pace and the pauses between phrases.
const SPEED = 0.9;
const PAUSE_AFTER_REFERENCE = 0.75;
const PAUSE_BETWEEN_CHUNKS = 0.38;

let engine;
async function loadVoice(report) {
  const { KokoroTTS } = await import("kokoro-js");
  let last = 0;
  engine ||= KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
    dtype: process.env.KOKORO_DTYPE || "fp32",
    device: "cpu",
    progress_callback: (event) => {
      if (event.status !== "progress" || Date.now() - last < 750) return;
      last = Date.now();
      report(`Downloading the narration voice: ${Math.round(event.progress || 0)}%…`);
    },
  });
  try {
    return await engine;
  } catch (error) {
    engine = null;
    throw error;
  }
}

// Gently fades a chunk's edges so joins never click.
function soften(samples) {
  const fade = Math.min(samples.length >> 2, Math.round(RATE * 0.012));
  for (let i = 0; i < fade; i++) {
    samples[i] *= i / fade;
    samples[samples.length - 1 - i] *= i / fade;
  }
  return samples;
}

// Narrates "<reference>. <verse>" and records where each spoken chunk sits,
// so word timings can be anchored to known boundaries.
export async function narrate(verse, voice, file, report = () => {}, signal) {
  if (!VOICES[voice]) voice = DEFAULT_VOICE;
  const tts = await loadVoice(report);
  const parts = [
    { kind: "reference", text: spokenReference(verse.ref), pause: PAUSE_AFTER_REFERENCE },
    ...speechChunks(verse.text).map((text) => ({ kind: "verse", text, pause: PAUSE_BETWEEN_CHUNKS })),
  ];
  const lead = Math.round(RATE * 0.15);
  const pieces = [new Float32Array(lead)];
  const segments = [];
  let cursor = lead;
  for (const [index, part] of parts.entries()) {
    signal?.throwIfAborted();
    report(`Recording the narration (${index + 1} of ${parts.length})…`);
    const audio = await tts.generate(part.text, { voice, speed: SPEED });
    const samples = soften(Float32Array.from(audio.audio));
    segments.push({ kind: part.kind, text: part.text, start: cursor / RATE, end: (cursor + samples.length) / RATE });
    pieces.push(samples, new Float32Array(Math.round(RATE * (index === parts.length - 1 ? 0.3 : part.pause))));
    cursor += samples.length + pieces.at(-1).length;
  }
  const total = new Float32Array(cursor);
  let offset = 0;
  for (const piece of pieces) {
    total.set(piece, offset);
    offset += piece.length;
  }
  await writeFile(file, wav(total, RATE));
  return { file, voice, rate: RATE, duration: total.length / RATE, segments };
}

// 16-bit mono PCM WAV.
export function wav(samples, rate) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++)
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buffer;
}
