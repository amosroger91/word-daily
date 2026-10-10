import { GlobalFonts, createCanvas, loadImage, Path2D } from "@napi-rs/canvas";
import path from "node:path";
import { root } from "./config.mjs";

// The Word's typefaces: Literata for Scripture and the wordmark, Atkinson
// Hyperlegible for interface labels. Static faces keep weights exact in Skia.
const faces = [
  ["literata-400-normal.ttf", "Literata"],
  ["literata-500-normal.ttf", "Literata"],
  ["literata-400-italic.ttf", "Literata"],
  ["atkinson-hyperlegible-400-normal.ttf", "Atkinson Hyperlegible"],
  ["atkinson-hyperlegible-700-normal.ttf", "Atkinson Hyperlegible"],
];
for (const [file, family] of faces)
  GlobalFonts.registerFromPath(path.join(root, "assets/fonts", file), family);
export { createCanvas, loadImage, Path2D };
