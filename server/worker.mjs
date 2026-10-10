import { rm } from "node:fs/promises";
import path from "node:path";
import { videoDir } from "./storage.mjs";

const controller = new AbortController();
process.on("message", async (message) => {
  if (message.type === "cancel") {
    controller.abort();
    return;
  }
  if (message.type !== "start") return;
  const { job } = message;
  const report = (progress, message, stage) => process.send?.({ type: "progress", progress, message, stage });
  try {
    const result =
      job.type === "tiktok"
        ? await (await import("./tiktok.mjs")).uploadDraft(
            path.join(videoDir(job.input.videoId), "verse-of-the-day.mp4"),
            report,
            controller.signal,
          )
        : await (await import("./pipeline.mjs")).generateVideo(job.id, job.input, report, controller.signal);
    controller.signal.throwIfAborted();
    process.send?.({ type: "complete", result }, () => process.disconnect());
  } catch (error) {
    if (job.type === "video") await rm(videoDir(job.id), { recursive: true, force: true }).catch(() => {});
    process.send?.(
      { type: "failed", error: controller.signal.aborted ? "Cancelled." : String(error.message).slice(0, 600) },
      () => process.disconnect(),
    );
  }
});
