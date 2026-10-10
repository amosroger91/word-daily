import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../server/app.mjs";

const added = [];
const { app } = await createApp({
  jobs: {
    jobs: new Map(),
    init: async () => {},
    list: () => [],
    add: async (type, input) => (added.push({ type, input }), { type, input, status: "queued" }),
    cancel: async () => undefined,
  },
});

test("one click queues a video job with sensible defaults", async () => {
  const response = await request(app).post("/api/videos").send({}).expect(202);
  assert.equal(response.body.type, "video");
  assert.deepEqual(added.at(-1).input, { voice: "af_heart", variation: 0 });
  await request(app).post("/api/videos").send({ voice: "nobody" }).expect(400);
});
test("lists voices for the editor", async () => {
  const { body } = await request(app).get("/api/options").expect(200);
  assert.ok(body.voices.some((voice) => voice.id === "am_michael"));
});
test("guards hosts, cross-origin writes, and missing videos", async () => {
  await request(app).get("/api/health").set("Host", "evil.test").expect(403);
  await request(app).post("/api/videos").set("Origin", "https://evil.test").send({}).expect(403);
  await request(app).get("/api/videos/310b3a1c-9693-4a5e-9eec-c3da41060270/video").expect(404);
  await request(app).get("/api/videos/nope/video").expect(400);
  await request(app).post("/api/tiktok/drafts").send({ videoId: "310b3a1c-9693-4a5e-9eec-c3da41060270" }).expect(404);
});
