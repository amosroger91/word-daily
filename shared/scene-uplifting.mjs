// Uplifting: The Word's light theme over bright footage. A frosted paper card
// holds the verse, gold sparkles drift upward, and the brand cards are paper.
import { WIDTH, HEIGHT, FONTS, INTRO, timeline, clamp, ease, smooth, span, drawMark, flourish, layoutVerse } from "./scene.mjs";
export { timeline };

const LIGHT = {
  paper: "#f8f7f3",
  surface: "#fffefa",
  ink: "#283e34",
  inkSoft: "#687568",
  accent: "#31543f",
  sage: "#b5cda8",
  gold: "#d4bd87",
  goldDeep: "#947849",
  flourish: "#b0986b",
  line: "#dfe3d9",
};
const CARD_X = 60, CARD_W = WIDTH - 120, PAD = 64;

export function layout(ctx, words) {
  return layoutVerse(ctx, words, { left: CARD_X + PAD, width: CARD_W - PAD * 2, maxHeight: 600, center: 1270, largest: 70, smallest: 40 });
}

// Deterministic drifting sparkles.
const SPARKS = Array.from({ length: 16 }, (_, i) => {
  const r = (n) => ((Math.sin(i * 91.7 + n * 13.1) + 1) / 2);
  return { x: r(1) * WIDTH, y: r(2) * HEIGHT, size: 14 + r(3) * 22, speed: 22 + r(4) * 40, phase: r(5) * 6.28 };
});
function sparkles(ctx, t, alpha) {
  for (const s of SPARKS) {
    const y = (s.y - t * s.speed + HEIGHT * 2) % HEIGHT;
    const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + s.phase));
    flourish(ctx, s.x, y, s.size, "#fff4d6", alpha * twinkle * 0.8);
  }
}

// Soft, out-of-focus discs of light drifting slowly upward.
const BOKEH = Array.from({ length: 11 }, (_, i) => {
  const r = (n) => (Math.sin(i * 57.3 + n * 21.7) + 1) / 2;
  return { x: r(1) * WIDTH, y: r(2) * HEIGHT, size: 50 + r(3) * 110, speed: 8 + r(4) * 18, phase: r(5) * 6.28, warm: r(6) > 0.4 };
});
function bokeh(ctx, t, alpha) {
  for (const b of BOKEH) {
    const y = (b.y - t * b.speed + HEIGHT * 2) % HEIGHT;
    const x = b.x + Math.sin(t * 0.4 + b.phase) * 24;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, b.size);
    const a = alpha * (0.1 + 0.08 * Math.sin(t * 0.9 + b.phase));
    glow.addColorStop(0, b.warm ? `rgba(255,236,196,${a})` : `rgba(255,255,255,${a})`);
    glow.addColorStop(0.7, b.warm ? `rgba(255,236,196,${a * 0.6})` : `rgba(255,255,255,${a * 0.6})`);
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, b.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paperCard(ctx, Path2D, p, { lines = [], url } = {}) {
  const g = ctx.createRadialGradient(WIDTH / 2, 760, 80, WIDTH / 2, 960, 1250);
  g.addColorStop(0, LIGHT.surface);
  g.addColorStop(1, "#ecefe4");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(WIDTH * 0.78, 260, 20, WIDTH * 0.78, 260, 700);
  glow.addColorStop(0, "rgba(212,189,135,0.35)");
  glow.addColorStop(1, "rgba(212,189,135,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const mark = ease(span(p, 0.15, 1.05));
  drawMark(ctx, Path2D, WIDTH / 2 - 78, 650 - 26 * (1 - mark), 178, LIGHT.accent, smooth(span(p, 0.1, 0.95)));
  ctx.save();
  ctx.globalAlpha *= mark;
  flourish(ctx, WIDTH / 2 + 132, 668, 40, LIGHT.flourish, ease(span(p, 0.75, 1.3)));
  ctx.restore();
  ctx.save();
  ctx.textAlign = "center";
  ctx.globalAlpha *= ease(span(p, 0.45, 1.25));
  ctx.fillStyle = LIGHT.ink;
  ctx.font = `500 132px ${FONTS.scripture}`;
  ctx.fillText("The Word", WIDTH / 2, 1000 + 22 * (1 - ease(span(p, 0.45, 1.25))));
  ctx.restore();
  ctx.save();
  ctx.textAlign = "center";
  ctx.globalAlpha *= ease(span(p, 0.95, 1.6));
  ctx.fillStyle = LIGHT.inkSoft;
  ctx.font = `400 34px ${FONTS.label}`;
  ctx.fillText("Free Scripture. No ads.", WIDTH / 2, 1078);
  lines.forEach((text, index) => {
    ctx.globalAlpha = ease(span(p, 1.25 + index * 0.18, 1.9 + index * 0.18));
    ctx.fillStyle = index === 0 ? LIGHT.ink : LIGHT.inkSoft;
    ctx.font = index === 0 ? `400 52px ${FONTS.scripture}` : `400 34px ${FONTS.label}`;
    ctx.fillText(text, WIDTH / 2, 1290 + index * 74);
  });
  if (url) {
    ctx.globalAlpha = ease(span(p, 1.7, 2.3));
    ctx.font = `700 34px ${FONTS.label}`;
    const width = ctx.measureText(url).width + 72;
    ctx.fillStyle = LIGHT.accent;
    ctx.beginPath();
    ctx.roundRect(WIDTH / 2 - width / 2, 1452, width, 84, 10);
    ctx.fill();
    ctx.fillStyle = LIGHT.surface;
    ctx.fillText(url, WIDTH / 2, 1507);
  }
  ctx.restore();
}

function topBar(ctx, Path2D, t, speaking) {
  ctx.save();
  ctx.shadowColor = "rgba(40,62,52,0.18)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "rgba(255,254,250,0.92)";
  ctx.beginPath();
  ctx.roundRect(CARD_X, 120, 470, 112, 56);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(WIDTH - CARD_X - 300, 141, 300, 70, 35);
  ctx.fill();
  ctx.restore();
  drawMark(ctx, Path2D, CARD_X + 40, 147, 58, LIGHT.accent);
  ctx.fillStyle = LIGHT.ink;
  ctx.font = `400 50px ${FONTS.scripture}`;
  ctx.fillText("The Word", CARD_X + 112, 190);
  ctx.font = `400 21px ${FONTS.label}`;
  ctx.fillStyle = LIGHT.inkSoft;
  ctx.fillText("Free Scripture. No ads.", CARD_X + 114, 220);
  const pillX = WIDTH - CARD_X - 300;
  for (let i = 0; i < 4; i++) {
    const level = speaking ? 0.35 + 0.65 * Math.abs(Math.sin(t * (5.1 + i * 1.7) + i * 1.3)) : 0.25;
    const h = 8 + 26 * level;
    ctx.fillStyle = LIGHT.accent;
    ctx.beginPath();
    ctx.roundRect(pillX + 32 + i * 13, 176 - h / 2, 7, h, 3.5);
    ctx.fill();
  }
  ctx.fillStyle = LIGHT.ink;
  ctx.font = `700 26px ${FONTS.label}`;
  ctx.fillText(speaking ? "Reading aloud" : "Read in The Word", pillX + 98, 186);
}

export function draw(ctx, Path2D, scene, t) {
  const { layout: L, verse, words } = scene;
  const { voiceStart, voiceEnd, outroStart, duration } = timeline(scene.narration.duration);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.letterSpacing = "0px";
  // Warm light from above keeps bright footage cohesive with the paper card.
  const wash = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  wash.addColorStop(0, "rgba(255,248,230,0.18)");
  wash.addColorStop(0.5, "rgba(255,248,230,0)");
  wash.addColorStop(1, "rgba(40,62,52,0.22)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const enter = ease(span(t, INTRO - 0.55, INTRO + 0.45));
  bokeh(ctx, t, enter);
  sparkles(ctx, t, enter);
  // A warm light leak sweeps across each cross-fade.
  for (const at of scene.transitions || []) {
    const k = (t - (at - 0.9)) / 1.8;
    if (k <= 0 || k >= 1) continue;
    const x = -300 + (WIDTH + 600) * k;
    const leak = ctx.createRadialGradient(x, HEIGHT * 0.35, 40, x, HEIGHT * 0.45, 900);
    const a = Math.sin(Math.PI * k);
    leak.addColorStop(0, `rgba(255,236,190,${0.55 * a})`);
    leak.addColorStop(0.4, `rgba(255,190,120,${0.22 * a})`);
    leak.addColorStop(1, "rgba(255,190,120,0)");
    ctx.fillStyle = leak;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  const narrationTime = t - voiceStart;
  const speaking = t >= voiceStart && t <= voiceEnd;
  ctx.save();
  ctx.globalAlpha = enter;
  topBar(ctx, Path2D, t, speaking);

  // Frosted paper card, rising gently into place.
  const lift = 40 * (1 - ease(span(t, INTRO - 0.4, INTRO + 0.6)));
  const cardTop = L.top - 170 + lift, cardBottom = L.bottom + 190 + lift;
  ctx.save();
  ctx.shadowColor = "rgba(40,62,52,0.28)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = "rgba(255,254,250,0.93)";
  ctx.beginPath();
  ctx.roundRect(CARD_X, cardTop, CARD_W, cardBottom - cardTop, 40);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(0, lift);
  flourish(ctx, CARD_X + PAD + 12, L.top - 82, 34, LIGHT.flourish);
  ctx.font = `700 24px ${FONTS.label}`;
  ctx.letterSpacing = "4px";
  ctx.fillStyle = LIGHT.accent;
  ctx.fillText(scene.eyebrow.toUpperCase(), CARD_X + PAD + 40, L.top - 89);
  ctx.letterSpacing = "0px";

  let current = -1;
  for (let i = 0; i < words.length; i++) if (narrationTime >= words[i].start) current = i;
  const finished = narrationTime > words.at(-1).end;
  ctx.font = `400 ${L.size}px ${FONTS.scripture}`;
  const rise = L.size * 0.84;
  let pill = null;
  if (current >= 0 && !finished) {
    const now = L.words[current], prev = L.words[Math.max(0, current - 1)];
    const k = current > 0 && prev.line === now.line ? smooth((narrationTime - words[current].start) / 0.12) : 1;
    const x = prev.x + (now.x - prev.x) * k, w = prev.width + (now.width - prev.width) * k;
    const pad = L.size * 0.16;
    pill = { x: x - pad, y: now.y + L.lineHeight / 2 + L.size * 0.04 - rise / 2 - pad, w: w + pad * 2, h: rise + pad * 2, r: L.size * 0.14, line: now.line };
    ctx.fillStyle = LIGHT.gold;
    ctx.strokeStyle = LIGHT.goldDeep;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(pill.x, pill.y, pill.w, pill.h, pill.r);
    ctx.fill();
    ctx.stroke();
  }
  const baseline = (word) => word.y + L.lineHeight / 2 + L.size * 0.32;
  ctx.fillStyle = LIGHT.ink;
  L.words.forEach((word, i) => {
    ctx.globalAlpha = enter * (i <= current || finished ? 1 : 0.4);
    ctx.fillText(word.word, word.x, baseline(word));
  });
  ctx.globalAlpha = enter;
  // Reference and reading progress.
  const ref = scene.narration.segments.find((s) => s.kind === "reference");
  const refActive = ref && narrationTime >= ref.start - 0.1 && narrationTime <= ref.end + 0.15;
  ctx.font = `700 36px ${FONTS.label}`;
  ctx.fillStyle = refActive ? LIGHT.goldDeep : LIGHT.accent;
  ctx.fillText(`— ${verse.reference}`, CARD_X + PAD, L.bottom + 78);
  const progress = clamp((t - voiceStart) / (voiceEnd - voiceStart));
  ctx.fillStyle = LIGHT.line;
  ctx.beginPath();
  ctx.roundRect(CARD_X + PAD, L.bottom + 118, CARD_W - PAD * 2, 8, 4);
  ctx.fill();
  ctx.fillStyle = LIGHT.accent;
  ctx.beginPath();
  ctx.roundRect(CARD_X + PAD, L.bottom + 118, Math.max(8, (CARD_W - PAD * 2) * progress), 8, 4);
  ctx.fill();
  ctx.restore();
  ctx.restore();

  if (t < INTRO) {
    ctx.save();
    ctx.globalAlpha = 1 - smooth(span(t, INTRO - 0.6, INTRO));
    paperCard(ctx, Path2D, t);
    ctx.restore();
  }
  if (t >= outroStart) {
    ctx.save();
    ctx.globalAlpha = smooth(span(t, outroStart, outroStart + 0.55));
    paperCard(ctx, Path2D, t - outroStart - 0.25, { lines: ["Read the full chapter free", "Scripture, read aloud. No account needed."], url: scene.appLabel });
    ctx.restore();
  }
  if (t > duration - 0.45) {
    ctx.fillStyle = `rgba(248,247,243,${smooth(span(t, duration - 0.45, duration))})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}
