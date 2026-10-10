// The three looks a video can take. Shared by the editor and the pipeline.
export const STYLES = {
  classic: {
    name: "The Word",
    tagline: "Calm and reverent, in The Word's deep sage reader style.",
    voice: "af_heart",
    translation: "web",
    speed: 0.9,
    pause: 0.38,
  },
  uplifting: {
    name: "Uplifting",
    tagline: "Bright and joyful: sunlight, flowers, worship, people dancing.",
    voice: "af_bella",
    translation: "web",
    speed: 0.96,
    pause: 0.32,
  },
  warrior: {
    name: "Warrior",
    tagline: "Dark and cinematic: angels and battle engravings, hard cuts.",
    voice: "bm_lewis",
    translation: "kjv",
    speed: 0.8,
    pause: 0.55,
  },
};
export const DEFAULT_STYLE = "classic";
export const styleOf = (id) => STYLES[id] || STYLES[DEFAULT_STYLE];
