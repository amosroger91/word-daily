import { readFile } from "node:fs/promises";
import { env, pipeline } from "@huggingface/transformers";
import { modelCacheDir } from "./config.mjs";
import { timeVerseWords } from "../shared/align.mjs";

env.cacheDir = modelCacheDir;
export const whisperModel =
  process.env.WHISPER_MODEL || "onnx-community/whisper-base_timestamped";

// 16-bit mono WAV → Float32 samples at 16 kHz (the rate Whisper expects).
function wavTo16k(buffer) {
  const rate = buffer.readUInt32LE(24);
  const data = buffer.indexOf("data", 36) + 8;
  const input = new Float32Array((buffer.length - data) >> 1);
  for (let i = 0; i < input.length; i++) input[i] = buffer.readInt16LE(data + i * 2) / 32768;
  const ratio = rate / 16000;
  const output = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const at = i * ratio, low = Math.floor(at), frac = at - low;
    output[i] = input[low] * (1 - frac) + (input[low + 1] ?? input[low]) * frac;
  }
  return output;
}

// Word-by-word timing of the narration: Whisper hears the voice, and the
// known verse text is aligned onto what it heard.
export async function timeNarration(verse, narration, report = () => {}, signal) {
  let heard = [];
  try {
    report("Listening back to time every word…");
    const transcriber = await pipeline("automatic-speech-recognition", whisperModel, {
      device: "cpu",
      dtype: { encoder_model: "fp32", decoder_model_merged: "q8" },
      session_options: { intraOpNumThreads: 4, interOpNumThreads: 1 },
    });
    const samples = wavTo16k(await readFile(narration.file));
    // Each narrated phrase is heard on its own: short, clean input keeps
    // Whisper's word timestamps exact (long-form chunking drifts on pauses).
    for (const segment of narration.segments.filter((s) => s.kind === "verse")) {
      signal?.throwIfAborted();
      const from = Math.max(0, segment.start - 0.08);
      const slice = samples.subarray(Math.floor(from * 16000), Math.ceil((segment.end + 0.12) * 16000));
      const output = await transcriber(slice, { return_timestamps: "word", language: "en", task: "transcribe" });
      for (const chunk of output.chunks || []) {
        const [start, end] = chunk.timestamp || [];
        if (!Number.isFinite(start) || start > segment.end - from + 0.2) continue;
        heard.push({ text: chunk.text.trim(), start: from + start, end: from + (Number.isFinite(end) ? end : start + 0.2) });
      }
    }
    await transcriber.dispose?.();
  } catch (error) {
    if (signal?.aborted) throw error;
    // Proportional timing within each narrated phrase still tracks the voice closely.
    console.warn(`Word timing fell back to phrase pacing: ${error.message}`);
  }
  return { words: timeVerseWords(verse.text, narration.segments, heard), heard: heard.length };
}
