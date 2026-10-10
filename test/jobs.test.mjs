import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Jobs } from "../server/jobs.mjs";
import { readJson } from "../server/storage.mjs";

class Worker extends EventEmitter {
  stderr = new EventEmitter();
  messages = [];
  exitCode = null;
  send(message) {
    this.messages.push(message);
  }
  kill() {
    if (this.killed) return;
    this.killed = true;
    this.exitCode = 0;
    this.emit("exit", 0);
  }
}
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "finds-jobs-"));
  const workers = [];
  const jobs = new Jobs({
    directory,
    workerFactory: () => {
      const worker = new Worker();
      workers.push(worker);
      return worker;
    },
  });
  await jobs.init();
  t.after(async () => {
    await jobs.stop();
    for (const worker of workers) worker.kill();
    await rm(directory, { recursive: true, force: true });
  });
  return { jobs, workers, directory };
}
test("a cancelled queued job never starts and the next job runs serially", async (t) => {
  const { jobs, workers } = await fixture(t);
  const first = await jobs.add("demo");
  const second = await jobs.add("demo");
  const third = await jobs.add("demo");
  assert.equal(workers.length, 1);
  await jobs.cancel(second.id);
  workers[0].emit("message", { type: "complete", result: { id: first.id } });
  workers[0].emit("exit", 0);
  assert.equal(workers.length, 2);
  assert.equal(jobs.active.job.id, third.id);
  assert.equal(second.status, "cancelled");
});
test("cancelling inference terminates its worker without accepting a late completion", async (t) => {
  const { jobs, workers, directory } = await fixture(t);
  const job = await jobs.add("video", {});
  workers[0].emit("message", { type: "progress", stage: "voice", progress: 20, message: "Narrating" });
  await jobs.cancel(job.id);
  workers[0].emit("message", { type: "complete", result: {} });
  assert.equal(job.status, "cancelled");
  assert.equal(jobs.active, null);
  await jobs.writes.get(job.id);
  assert.equal(
    (await readJson(path.join(directory, `${job.id}.json`))).status,
    "cancelled",
  );
});

test("cancelling during word timing stops the video before it can complete", async (t) => {
  const { jobs, workers } = await fixture(t);
  const job = await jobs.add("video", {});
  workers[0].emit("message", { type: "progress", stage: "timing", progress: 35, message: "Timing" });
  await jobs.cancel(job.id);
  assert.equal(jobs.active, null);
  workers[0].emit("message", { type: "complete", result: { id: "late" } });
  assert.equal(job.status, "cancelled");
  assert.equal(job.result, undefined);
});
test("restart recovers completed jobs and marks interrupted jobs as failed", async (t) => {
  const { jobs, workers, directory } = await fixture(t);
  const first = await jobs.add("demo");
  workers[0].emit("message", { type: "complete", result: { title: "Saved" } });
  workers[0].emit("exit", 0);
  const second = await jobs.add("demo");
  await Promise.all([...jobs.writes.values()]);
  const recovered = new Jobs({ directory });
  await recovered.init();
  assert.equal(recovered.jobs.get(first.id).result.title, "Saved");
  assert.equal(recovered.jobs.get(second.id).status, "failed");
});
test("concurrent queue submissions cannot exceed the eight-job limit", async (t) => {
  const { jobs } = await fixture(t);
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, () => jobs.add("demo")),
  );
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 8);
  assert.equal(
    results.filter(
      (item) => item.status === "rejected" && item.reason.status === 429,
    ).length,
    4,
  );
});

test("a worker that ignores cancel is stopped so the queue moves on", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { jobs, workers } = await fixture(t);
  const job = await jobs.add("video", {});
  workers[0].emit("message", { type: "progress", stage: "render", progress: 70, message: "Rendering" });
  await jobs.cancel(job.id);
  assert.equal(workers[0].killed, undefined);
  t.mock.timers.tick(10000);
  assert.equal(workers[0].killed, true);
});
