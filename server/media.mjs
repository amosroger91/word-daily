import { ffprobePath } from "./config.mjs";
import { run } from "./process.mjs";

export async function probe(file, signal) {
  return JSON.parse(
    await run(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { signal }),
  );
}
