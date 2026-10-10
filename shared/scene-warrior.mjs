// Warrior: dark, cinematic "edit" style. Black-and-white footage and Doré
// engravings cut hard on the words, The Word's mark burning red,
// and the phrase being read set huge, one line at a time, with the spoken
// word burning white over a red glow. The Word's mark opens and closes it.
import { WIDTH, HEIGHT, FONTS, clamp, ease, smooth, span, drawMark } from "./scene.mjs";

export const INTRO = 2.3;
export const VOICE_START = 2.0;
export const HOLD = 1.0;
export const OUTRO = 3.4;
export function timeline(narrationDuration) {
  const voiceEnd = VOICE_START + narrationDuration;
  const outroStart = voiceEnd + HOLD;
  return { voiceStart: VOICE_START, voiceEnd, outroStart, duration: outroStart + OUTRO, intro: INTRO };
}
const DARK = { black: "#050505", bone: "#ece6da", ash: "#8f8a80", red: "#b3121a", glow: "rgba(214,24,32,0.9)" };
const FPS_HINT = 30;
// Words that burn red when they're spoken.
const POWER = /^(GOD|LORD|LORD’S|JESUS|CHRIST|STRONG|STRENGTH|COURAGE|COURAGEOUS|FEAR|AFRAID|WAR|BATTLE|FIGHT|STAND|POWER|MIGHT|MIGHTY|FIRE|SWORD|VICTORY|OVERCOME|FAITH|DEATH|DEAD|LIFE|SPIRIT|HOLY|KING|BLOOD|CROSS|DEVIL|ENEMY|ENEMIES|CHAMPION|SLEW|ARMOUR|ARMOR|SHIELD|GLORY|SALVATION|REDEEMER|ALMIGHTY|WRATH|THUNDER|LION|GIANT|SIN|EVIL|DARKNESS|LIGHT)$/;

// Deterministic per-frame noise, so renders are reproducible.
function noise(seed) {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return Array.from({ length: 8 }, () => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    return (h % 10000) / 10000;
  });
}

// Old-film grit over the whole frame: scratches, dust and a faint flicker.
function filmDamage(ctx, t) {
  const frame = Math.floor(t * FPS_HINT);
  const r = noise(frame);
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${0.03 + 0.05 * r[0]})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // A scratch or two that wander between frames.
  const scratches = r[1] > 0.55 ? (r[2] > 0.8 ? 2 : 1) : 0;
  for (let i = 0; i < scratches; i++) {
    const x = WIDTH * noise(Math.floor(frame / 3) * 7 + i)[0];
    ctx.strokeStyle = `rgba(236,230,218,${0.08 + 0.14 * r[3 + i]})`;
    ctx.lineWidth = 1 + r[5] * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (r[6] - 0.5) * 30, HEIGHT);
    ctx.stroke();
  }
  // Dust specks, a few light and a few dark.
  for (let i = 0; i < 6; i++) {
    const d = noise(frame * 13 + i);
    if (d[0] > 0.45) continue;
    ctx.fillStyle = d[1] > 0.5 ? `rgba(236,230,218,${0.18 + 0.2 * d[2]})` : `rgba(0,0,0,${0.3 + 0.3 * d[2]})`;
    ctx.beginPath();
    ctx.ellipse(d[3] * WIDTH, d[4] * HEIGHT, 1.5 + d[5] * 4, 1 + d[6] * 3, d[7] * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
const LINE_WIDTH = 920;

// Phrases of up to three words, broken at punctuation, shown one at a time.
export function groupWords(words) {
  const groups = [];
  let group = [];
  for (const word of words) {
    const length = group.reduce((n, w) => n + w.word.length + 1, 0);
    if (group.length && (group.length >= 3 || length + word.word.length > 20)) {
      groups.push(group);
      group = [];
    }
    group.push(word);
    if (/[,;:.!?—][”’)]*$/.test(word.word)) {
      groups.push(group);
      group = [];
    }
  }
  if (group.length) groups.push(group);
  return groups.map((items) => ({ start: items[0].index, end: items.at(-1).index }));
}

export function layout(ctx, words) {
  const groups = groupWords(words).map((group) => {
    const items = words.slice(group.start, group.end + 1).map((w) => w.word.toUpperCase());
    for (let size = 150; size >= 70; size -= 4) {
      ctx.font = `500 ${size}px ${FONTS.scripture}`;
      ctx.letterSpacing = `${Math.round(size * 0.03)}px`;
      const space = ctx.measureText(" ").width;
      const widths = items.map((w) => ctx.measureText(w).width);
      const total = widths.reduce((a, b) => a + b, 0) + space * (items.length - 1);
      if (total <= LINE_WIDTH || size <= 70) {
        let x = (WIDTH - total) / 2;
        const placed = items.map((text, i) => {
          const item = { text, index: group.start + i, x, width: widths[i] };
          x += widths[i] + space;
          return item;
        });
        ctx.letterSpacing = "0px";
        return { ...group, size, words: placed };
      }
    }
  });
  return { groups };
}

// The Word's mark (the book-bible logo), centred, in burning red.
export function emblem(ctx, Path2D, cx, cy, height, color, { glow = 0, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (glow) {
    ctx.shadowColor = DARK.glow;
    ctx.shadowBlur = glow;
  }
  drawMark(ctx, Path2D, cx - (height * 448) / 512 / 2, cy - height / 2, height, color);
  ctx.restore();
}

function wordmark(ctx, Path2D, y, size, alpha, { mark = true } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `500 ${size}px ${FONTS.scripture}`;
  ctx.letterSpacing = `${Math.round(size * 0.18)}px`;
  const text = "THE WORD";
  const width = ctx.measureText(text).width;
  const markH = size * 1.05;
  const lead = mark ? markH * 0.875 + size * 0.5 : 0;
  const x = (WIDTH - (lead + width)) / 2;
  if (mark) drawMark(ctx, Path2D, x, y - markH * 0.82, markH, DARK.bone);
  ctx.fillStyle = DARK.bone;
  ctx.textAlign = "left";
  ctx.fillText(text, x + lead, y);
  ctx.restore();
}

function blackCard(ctx, Path2D, p, { reference, url, closing = false }) {
  ctx.fillStyle = DARK.black;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // The Word's mark slams in, overshooting slightly, with a flicker of light.
  const hit = span(p, 0.08, 0.42);
  const scale = 1.35 - 0.35 * ease(hit);
  const flicker = p > 0.42 && p < 0.7 ? 0.75 + 0.25 * Math.sin(p * 90) : 1;
  emblem(ctx, Path2D, WIDTH / 2, 760, 500 * scale, DARK.red, { glow: 80, alpha: ease(hit) * flicker });
  wordmark(ctx, Path2D, 1240, 76, ease(span(p, 0.5, 1.0)), { mark: false });
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = DARK.ash;
  ctx.font = `400 30px ${FONTS.label}`;
  ctx.letterSpacing = "6px";
  ctx.globalAlpha = ease(span(p, 0.8, 1.3));
  ctx.fillText(closing ? "READ IT IN THE WORD" : "FREE SCRIPTURE. NO ADS.", WIDTH / 2, 1320);
  if (reference) {
    ctx.globalAlpha = ease(span(p, 1.0, 1.5));
    ctx.fillStyle = DARK.bone;
    ctx.font = `500 46px ${FONTS.scripture}`;
    ctx.letterSpacing = "8px";
    ctx.fillText(reference.toUpperCase(), WIDTH / 2, 1470);
  }
  if (url) {
    ctx.globalAlpha = ease(span(p, 1.3, 1.8));
    ctx.fillStyle = DARK.ash;
    ctx.font = `700 30px ${FONTS.label}`;
    ctx.letterSpacing = "2px";
    ctx.fillText(url, WIDTH / 2, 1560);
  }
  ctx.restore();
}

export function draw(ctx, Path2D, scene, t) {
  const { layout: L, verse, words } = scene;
  const { voiceStart, outroStart, duration } = timeline(scene.narration.duration);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.letterSpacing = "0px";
  // Crush top and bottom so the type and branding sit in shadow.
  const shade = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  shade.addColorStop(0, "rgba(0,0,0,0.75)");
  shade.addColorStop(0.28, "rgba(0,0,0,0.25)");
  shade.addColorStop(0.62, "rgba(0,0,0,0.35)");
  shade.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const narrationTime = t - voiceStart;
  let current = -1;
  for (let i = 0; i < words.length; i++) if (narrationTime >= words[i].start) current = i;
  const finished = narrationTime > words.at(-1).end + 0.25;
  const groupIndex = Math.max(0, L.groups.findIndex((g) => current >= g.start && current <= g.end));
  const group = current < 0 ? L.groups[0] : L.groups[groupIndex];
  const groupStart = words[group.start].start;

  // The Word's mark, faint behind the words, pulsing as each phrase lands.
  const pulse = 1 - ease(span(narrationTime, groupStart, groupStart + 0.5));
  emblem(ctx, Path2D, WIDTH / 2, 990, 620 + 50 * pulse, DARK.red, { alpha: (0.07 + 0.13 * pulse) * (current >= 0 && !finished ? 1 : 0.6) });
  // A pool of shadow behind the type keeps it legible over busy engravings.
  const pool = ctx.createRadialGradient(WIDTH / 2, 990, 40, WIDTH / 2, 990, 620);
  pool.addColorStop(0, "rgba(0,0,0,0.62)");
  pool.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = pool;
  ctx.fillRect(0, 500, WIDTH, 980);

  // Branding stays on screen the whole time.
  wordmark(ctx, Path2D, 196, 40, 0.85);

  const refSegment = scene.narration.segments.find((segment) => segment.kind === "reference");
  if (current < 0 && refSegment && narrationTime >= refSegment.start - 0.3) {
    // While the reference is read, it fills the frame.
    const landed = ease(span(narrationTime, refSegment.start - 0.3, refSegment.start));
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `500 112px ${FONTS.scripture}`;
    ctx.letterSpacing = "10px";
    ctx.globalAlpha = landed;
    ctx.shadowColor = DARK.glow;
    ctx.shadowBlur = 40;
    ctx.fillStyle = "#ffffff";
    const ref = verse.reference.toUpperCase();
    const fit = Math.min(1, 940 / ctx.measureText(ref).width);
    ctx.translate(WIDTH / 2, 1000);
    ctx.scale(fit * (1.1 - 0.1 * landed), fit * (1.1 - 0.1 * landed));
    ctx.fillText(ref, 0, 38);
    ctx.restore();
  } else if (!finished) {
    const landed = ease(span(narrationTime, groupStart - 0.05, groupStart + 0.16));
    const scale = 1.12 - 0.12 * landed;
    // Each phrase lands with a short, decaying shake.
    const jolt = current >= 0 ? 1 - clamp((narrationTime - groupStart) / 0.22) : 0;
    const shake = noise(groupIndex * 31 + Math.floor(t * FPS_HINT));
    ctx.save();
    ctx.translate(WIDTH / 2 + (shake[0] - 0.5) * 16 * jolt, 1000 + (shake[1] - 0.5) * 12 * jolt);
    ctx.scale(scale, scale);
    ctx.translate(-WIDTH / 2, -1000);
    ctx.font = `500 ${group.size}px ${FONTS.scripture}`;
    ctx.letterSpacing = `${Math.round(group.size * 0.03)}px`;
    for (const word of group.words) {
      const active = word.index === current;
      const spoken = word.index < current;
      // Words of power burn red.
      const power = POWER.test(word.text.replace(/[^A-Z’']/g, ""));
      ctx.globalAlpha = (current < 0 ? 0.42 : active ? 1 : spoken ? 0.9 : 0.42) * (current < 0 ? ease(span(t, voiceStart - 0.4, voiceStart)) : landed);
      ctx.shadowColor = active || (power && spoken) ? DARK.glow : "rgba(0,0,0,0.8)";
      ctx.shadowBlur = active ? (power ? 60 : 42) : power && spoken ? 26 : 18;
      ctx.fillStyle = power && (active || spoken) ? (active ? "#ff3a2f" : "#d8433a") : active ? "#ffffff" : DARK.bone;
      ctx.fillText(word.text, word.x, 1000 + group.size * 0.34);
    }
    ctx.restore();
  }
  ctx.shadowColor = "transparent";

  // Reference along the bottom, framed by small marks.
  ctx.save();
  ctx.font = `500 34px ${FONTS.scripture}`;
  ctx.letterSpacing = "8px";
  ctx.textAlign = "center";
  ctx.fillStyle = DARK.bone;
  ctx.globalAlpha = 0.85;
  const label = `${verse.reference.toUpperCase()}${verse.translation ? ` · ${verse.translation.toUpperCase()}` : ""}`;
  ctx.fillText(label, WIDTH / 2, 1716);
  const w = ctx.measureText(label).width;
  emblem(ctx, Path2D, WIDTH / 2 - w / 2 - 44, 1704, 32, DARK.red);
  emblem(ctx, Path2D, WIDTH / 2 + w / 2 + 40, 1704, 32, DARK.red);
  ctx.restore();

  // Flash frames and a red light leak bleeding in on every hard cut.
  for (const [n, cut] of (scene.cuts || []).entries()) {
    if (t >= cut && t < cut + 0.14) {
      ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - (t - cut) / 0.14)})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    if (t >= cut && t < cut + 0.45) {
      const fade = 1 - (t - cut) / 0.45;
      const corner = n % 2 ? WIDTH : 0;
      const leak = ctx.createRadialGradient(corner, HEIGHT * (n % 3 ? 0.25 : 0.7), 30, corner, HEIGHT * 0.5, 1300);
      leak.addColorStop(0, `rgba(255,70,30,${0.42 * fade})`);
      leak.addColorStop(0.45, `rgba(180,18,26,${0.18 * fade})`);
      leak.addColorStop(1, "rgba(180,18,26,0)");
      ctx.fillStyle = leak;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }
  filmDamage(ctx, t);

  if (t < INTRO) {
    ctx.save();
    ctx.globalAlpha = 1 - smooth(span(t, INTRO - 0.25, INTRO));
    blackCard(ctx, Path2D, t, {});
    ctx.restore();
    if (t >= INTRO - 0.3) {
      ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - span(t, INTRO - 0.3, INTRO))})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }
  if (t >= outroStart) {
    ctx.save();
    ctx.globalAlpha = smooth(span(t, outroStart, outroStart + 0.25));
    blackCard(ctx, Path2D, t - outroStart, { reference: verse.reference, url: scene.appLabel, closing: true });
    ctx.restore();
  }
  if (t > duration - 0.35) {
    ctx.fillStyle = `rgba(5,5,5,${smooth(span(t, duration - 0.35, duration))})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}
