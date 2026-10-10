import { spawn } from "node:child_process";
import { createCanvas, Path2D } from "./canvas.mjs";
import { ffmpegPath, FPS } from "./config.mjs";
import { WIDTH, HEIGHT } from "../shared/scene.mjs";
import { sceneFor } from "../shared/scenes.mjs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { renderBackground, overlayGraph } from "./footage.mjs";

// Narration treatment per style. Voice only: music is added in TikTok's editor.
const VOICE_CHAINS = {
  classic: "highpass=f=70,equalizer=f=180:t=q:w=1:g=1.5,equalizer=f=6500:t=q:w=1.4:g=-1.5,acompressor=threshold=0.12:ratio=2.5:attack=8:release=160:makeup=1.3,aecho=0.85:0.55:38|73:0.07|0.05",
  uplifting: "highpass=f=80,equalizer=f=3200:t=q:w=1.2:g=1.5,acompressor=threshold=0.12:ratio=2.5:attack=8:release=160:makeup=1.3,aecho=0.85:0.5:32|61:0.05|0.03",
  // Deep and weathered: pitch down ~14% (about 2.5 semitones; tempo restored so
  // word timing holds), more chest, less mud and air, a little grit, a cathedral tail.
  warrior:
    "asetrate=41280,aresample=48000,atempo=1.1627907,highpass=f=45,equalizer=f=110:t=q:w=0.9:g=4,equalizer=f=380:t=q:w=1.2:g=-2.5,equalizer=f=2300:t=q:w=1.1:g=2.5,equalizer=f=8500:t=q:w=1:g=-3,asoftclip=type=atan:threshold=0.6:output=0.95,acompressor=threshold=0.08:ratio=5:attack=4:release=220:makeup=1.8,aecho=0.8:0.72:70|140|230:0.16|0.11|0.07",
};

export function audioGraph(style, input, { voiceStart, duration }) {
  return `[${input}:a]aresample=48000,${VOICE_CHAINS[style] || VOICE_CHAINS.classic},loudnorm=I=-14:TP=-1.5:LRA=7,aresample=48000,adelay=${Math.round(voiceStart * 1000)}:all=1,aformat=channel_layouts=stereo,apad=whole_dur=${duration.toFixed(3)},alimiter=limit=0.9,atrim=duration=${duration.toFixed(3)}[a]`;
}

export async function renderVerseVideo({ style, scene, plan, files, output }, report, signal) {
  const S = sceneFor(style);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const tl = S.timeline(scene.narration.duration);
  const count = Math.ceil(tl.duration * FPS);
  // The footage bed is cut shot by shot first; the final pass then has just
  // three inputs (overlay, footage, voice), which keeps memory flat.
  const background = await renderBackground(style, plan, files, path.dirname(output), count, (fraction, message) => report(Math.round(fraction * 25), message), signal);
  const args = [
    "-y", "-v", "error",
    "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${WIDTH}x${HEIGHT}`, "-framerate", String(FPS), "-i", "pipe:0",
    ...background.input,
    "-i", scene.narration.file,
    "-filter_complex", `${overlayGraph(style)};${audioGraph(style, 2, tl)}`,
    "-map", "[v]", "-map", "[a]",
    "-t", tl.duration.toFixed(3),
    "-c:v", "libx264", "-preset", process.env.X264_PRESET || "slow", "-crf", "17", "-profile:v", "high", "-tune", style === "warrior" ? "grain" : "film",
    "-g", String(FPS * 2), "-bf", "2", "-x264-params", "rc-lookahead=30", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    // Matches the container's two CPUs and bounds encoder memory.
    "-threads", "2",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
    "-movflags", "+faststart",
    "-metadata", `title=${scene.verse.reference} · The Word`,
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
      S.draw(ctx, Path2D, scene, i / FPS);
      const frame = canvas.data();
      // If the encoder dies mid-write, "drain" never comes; its exit ends the wait.
      if (!encoder.stdin.write(frame)) await Promise.race([new Promise((resolve) => encoder.stdin.once("drain", resolve)), done]);
      if (i % 15 === 0) report(25 + Math.round((i / count) * 75), `Rendering frame ${i + 1} of ${count}…`);
    }
    encoder.stdin.end();
    const code = await done;
    if (failure || code !== 0) throw failure || new Error(errorText || "Video encoding failed.");
    return { duration: tl.duration, frames: count, posterTime: tl.voiceStart + (tl.voiceEnd - tl.voiceStart) * 0.55 };
  } catch (error) {
    encoder.kill();
    await done;
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    await Promise.all(background.cleanup.map((file) => rm(file, { force: true })));
  }
}
