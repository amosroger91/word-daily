import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { dataDir } from "./config.mjs";

export const uuidSchema = z.string().uuid();
export const videoDir = (id) => path.join(dataDir, "videos", uuidSchema.parse(id));
export async function saveJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(value));
  await rename(`${file}.tmp`, file);
}
export const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
