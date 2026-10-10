import { spawn } from "node:child_process";
import path from "node:path";
import { createCanvas, Path2D } from "./canvas.mjs";
import { ffmpegPath, FPS } from "./config.mjs";
import { drawScene, layoutVerse, timeline, WIDTH, HEIGHT, INTRO } from "../shared/scene.mjs";

const CROSSFADE = 1.2;

// Builds the FFmpeg graph: B-roll clips (looped if short) cross-faded and
// lightly graded, The Word overlay on top; the narration warmed and leveled.
// No music bed: music is added in TikTok's editor.
export function filterGraph({ clips, duration, voiceStart }) {
  const n = clips.length;
  const each = (duration + CROSSFADE * (n - 1)) / n;
  const video = clips.map(
    (_, i) =>
      `[${i + 1}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WIDTH}:${HEIGHT},fps=${FPS},setsar=1,trim=duration=${each.toFixed(3)},setpts=PTS-STARTPTS[c${i}]`,
  );
  let last = "c0";
  for (let i = 1; i < n; i++) {
    video.push(`[${last}][c${i}]xfade=transition=fade:duration=${CROSSFADE}:offset=${(i * (each - CROSSFADE)).toFixed(3)}[x${i}]`);
    last = `x${i}`;
  }
  video.push(
    `[${last}]eq=saturation=0.86:contrast=1.03:brightness=-0.015:gamma=0.98,colorbalance=rs=0.03:gs=0.02:bs=-0.03:rm=0.02:bm=-0.02,vignette=angle=PI/5,format=rgba[bg]`,
    `[bg][0:v]overlay=0:0:format=auto,format=yuv420p[v]`,
  );
  const voice = n + 1;
  const audio = [
    `[${voice}:a]aresample=48000,highpass=f=70,equalizer=f=180:t=q:w=1:g=1.5,equalizer=f=6500:t=q:w=1.4:g=-1.5,acompressor=threshold=0.12:ratio=2.5:attack=8:release=160:makeup=1.3,aecho=0.85:0.55:38|73:0.07|0.05,loudnorm=I=-14:TP=-1.5:LRA=7,aresample=48000,adelay=${Math.round(voiceStart * 1000)}:all=1,aformat=channel_layouts=stereo,apad=whole_dur=${duration.toFixed(3)},alimiter=limit=0.9,atrim=duration=${duration.toFixed(3)}[a]`,
  ];
  return [...video, ...audio].join(";");
}

export async function renderVerseVideo({ verse, words, narration, clips, output, dateLabel, appLabel }, report, signal) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const layout = layoutVerse(ctx, words);
  const scene = { verse, words, narration, layout, dateLabel, appLabel };
  const { duration, voiceStart, voiceEnd } = timeline(narration.duration);
  const count = Math.ceil(duration * FPS);
  const args = [
    "-y", "-v", "error",
    "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${WIDTH}x${HEIGHT}`, "-framerate", String(FPS), "-i", "pipe:0",
    ...clips.flatMap((file) => ["-stream_loop", "-1", "-i", file]),
    "-i", narration.file,
    "-filter_complex", filterGraph({ clips, duration, voiceStart }),
    "-map", "[v]", "-map", "[a]",
    "-t", duration.toFixed(3),
    "-c:v", "libx264", "-preset", process.env.X264_PRESET || "slow", "-crf", "17", "-profile:v", "high", "-tune", "film",
    "-g", String(FPS * 2), "-bf", "2", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    "-threads", "4",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
    "-movflags", "+faststart",
    "-metadata", `title=${verse.reference} · Verse of the Day · The Word`,
    output,
  ];
  const encoder = spawn(ffmpegPath, args, { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
  let errorText = "", failure;
  encoder.stderr.on("data", (chunk) => (errorText = (errorText + chunk).slice(-4000)));
  encoder.on("error", (error) => (failure = error));
  encoder.stdin.on("error", (error) => (failure ||= error));
  const done = new Promise((resolve) => encoder.on("close", resolve));
  const abort = () => {
    failure = new Error("Cancelled.");
    encoder.kill();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    for (let i = 0; i < count; i++) {
      if (failure || encoder.exitCode !== null) throw failure || new Error(errorText || "The video encoder stopped unexpectedly.");
      drawScene(ctx, Path2D, scene, i / FPS);
      const frame = canvas.data();
      if (!encoder.stdin.write(frame)) await new Promise((resolve) => encoder.stdin.once("drain", resolve));
      if (i % 15 === 0) report(Math.round((i / count) * 100), `Rendering frame ${i + 1} of ${count}…`);
    }
    encoder.stdin.end();
    const code = await done;
    if (failure || code !== 0) throw failure || new Error(errorText || "Video encoding failed.");
    return { duration, frames: count, posterTime: voiceStart + (voiceEnd - voiceStart) * 0.55, layout: { size: layout.size, lines: layout.lines } };
  } catch (error) {
    encoder.kill();
    await done;
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
export { INTRO };
