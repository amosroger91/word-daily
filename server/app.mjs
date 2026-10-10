import express from "express";
import path from "node:path";
import { access, readdir } from "node:fs/promises";
import { z, ZodError } from "zod";
import { Jobs } from "./jobs.mjs";
import { readJson, uuidSchema, videoDir } from "./storage.mjs";
import { ffmpegPath, ffprobePath, host, publicUrl, root, wordAppUrl, dataDir } from "./config.mjs";
import { getDailyVerse } from "./verse.mjs";
import { VOICES, DEFAULT_VOICE } from "./voice.mjs";
import { authorizationUrl, completeAuthorization, disconnect, tiktokStatus } from "./tiktok.mjs";

export const videoSchema = z.object({
  voice: z.enum(Object.keys(VOICES)).default(DEFAULT_VOICE),
  variation: z.number().int().min(0).max(9999).default(0),
});

export async function createApp({ jobs = new Jobs() } = {}) {
  await jobs.init();
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const allowed = new Set(["localhost", "127.0.0.1", "[::1]", host]);
    if (publicUrl) allowed.add(new URL(publicUrl).hostname);
    if (!allowed.has(req.hostname)) return res.status(403).json({ error: "This app accepts local requests only." });
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "no-referrer");
    const origin = req.get("origin");
    if (origin && !["GET", "HEAD"].includes(req.method) && origin !== `${req.protocol}://${req.get("host")}` && origin !== publicUrl)
      return res.status(403).json({ error: "Cross-origin requests are not allowed." });
    next();
  });
  app.use(express.json({ limit: "64kb" }));
  // Public homepage, privacy policy, and terms.
  app.use("/site", express.static(path.join(root, "docs")));

  app.get("/api/health", async (_req, res) => {
    const available = (file) => access(file).then(() => true, () => false);
    const tools = { ffmpeg: await available(ffmpegPath), ffprobe: await available(ffprobePath) };
    res.json({ ok: true, ready: Object.values(tools).every(Boolean), tools });
  });
  app.get("/api/options", (_req, res) =>
    res.json({
      voices: Object.entries(VOICES).map(([id, label]) => ({ id, label })),
      defaultVoice: DEFAULT_VOICE,
      wordAppUrl,
    }),
  );
  app.get("/api/verse", async (_req, res) => res.json(await getDailyVerse()));

  app.get("/api/jobs", (_req, res) => res.json(jobs.list()));
  app.get("/api/jobs/:id", (req, res) => {
    const job = jobs.jobs.get(uuidSchema.parse(req.params.id));
    if (!job) return res.status(404).json({ error: "Job not found." });
    res.json(job);
  });
  app.post("/api/jobs/:id/cancel", async (req, res) => {
    const job = await jobs.cancel(uuidSchema.parse(req.params.id));
    if (!job) return res.status(404).json({ error: "Job not found." });
    res.json(job);
  });

  // One click: today's verse → caption → narration → timing → B-roll → MP4.
  app.post("/api/videos", async (req, res) =>
    res.status(202).json(await jobs.add("video", videoSchema.parse(req.body ?? {}))),
  );
  app.get("/api/videos", async (_req, res) => {
    const ids = await readdir(path.join(dataDir, "videos")).catch(() => []);
    const videos = (
      await Promise.all(
        ids.filter((id) => uuidSchema.safeParse(id).success).map((id) => readJson(path.join(videoDir(id), "meta.json")).catch(() => null)),
      )
    ).filter(Boolean);
    res.json(videos.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12).map(({ words, ...video }) => video));
  });
  for (const [route, file, download] of [
    ["video", "verse-of-the-day.mp4"],
    ["download", "verse-of-the-day.mp4", true],
    ["poster", "poster.jpg"],
    ["backdrop", "backdrop.jpg"],
    ["caption", "caption.txt", true],
  ]) {
    app.get(`/api/videos/:id/${route}`, async (req, res) => {
      const directory = videoDir(req.params.id);
      const meta = await readJson(path.join(directory, "meta.json"));
      const target = path.join(directory, file);
      if (!download) return res.sendFile(target);
      const slug = `${meta.verse.date}-${meta.verse.reference.replace(/[^A-Za-z0-9]+/g, "-")}`.replace(/-+$/, "");
      res.download(target, route === "caption" ? `${slug}-caption.txt` : `the-word-${slug}.mp4`);
    });
  }

  app.get("/api/tiktok/status", async (_req, res) => res.json(await tiktokStatus()));
  // With a shared connection, signing in happens in the studio that owns it.
  app.get("/api/tiktok/connect", (_req, res) => res.redirect(process.env.TIKTOK_CONNECT_URL || authorizationUrl()));
  app.get("/api/tiktok/callback", async (req, res) => {
    try {
      await completeAuthorization({
        code: String(req.query.code || ""),
        state: String(req.query.state || ""),
        error: req.query.error && String(req.query.error),
      });
      res.redirect("/?tiktok=connected");
    } catch (error) {
      res.redirect(`/?tiktok=${encodeURIComponent(error.message)}`);
    }
  });
  app.post("/api/tiktok/disconnect", async (_req, res) => {
    await disconnect();
    res.json(await tiktokStatus());
  });
  app.post("/api/tiktok/drafts", async (req, res) => {
    const videoId = uuidSchema.parse(req.body?.videoId);
    await readJson(path.join(videoDir(videoId), "meta.json"));
    if (!(await tiktokStatus()).connected) return res.status(400).json({ error: "Connect your TikTok account first." });
    res.status(202).json(await jobs.add("tiktok", { videoId }));
  });

  app.use("/api", (_req, res) => res.status(404).json({ error: "Endpoint not found." }));
  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError) return res.status(400).json({ error: error.issues[0]?.message || "Invalid request." });
    if (error.code === "ENOENT") return res.status(404).json({ error: "Video or file not found." });
    if (error.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
    if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: error.message?.startsWith("Could not load today") ? error.message : "The server could not complete the request. Check the terminal for details." });
  });
  return { app, jobs };
}
