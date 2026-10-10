import * as classic from "./scene.mjs";
import * as uplifting from "./scene-uplifting.mjs";
import * as warrior from "./scene-warrior.mjs";

// Each style: timeline(narrationSeconds), layout(ctx, words), draw(ctx, Path2D, scene, t).
export const SCENES = {
  classic: { timeline: classic.timeline, layout: (ctx, words) => classic.layoutVerse(ctx, words), draw: classic.drawScene },
  uplifting: { timeline: uplifting.timeline, layout: uplifting.layout, draw: uplifting.draw },
  warrior: { timeline: warrior.timeline, layout: warrior.layout, draw: warrior.draw },
};
export const sceneFor = (style) => SCENES[style] || SCENES.classic;
