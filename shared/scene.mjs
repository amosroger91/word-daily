// Frame drawing for the verse video, in The Word's visual language: deep sage
// paper, Literata Scripture, Atkinson labels, a gold ✦ flourish, and the
// reader's gold "speaking" highlight moving word by word.

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const PALETTE = {
  night: "#17211b",
  surface: "#202d24",
  surfaceSoft: "#293a2e",
  ink: "#e7eadd",
  inkSoft: "#adb9a7",
  accent: "#b5cda8",
  gold: "#d4bd87",
  goldDeep: "#947849",
  flourish: "#b0986b",
  dot: "#d1dbb4",
  scrim: "9,17,9",
};
export const FONTS = {
  scripture: "Literata, Georgia, serif",
  label: "'Atkinson Hyperlegible', Arial, sans-serif",
};
// fa-book-bible (Font Awesome Free 6, CC BY 4.0): The Word's logo mark, 448×512.
export const MARK_PATH =
  "M96 0C43 0 0 43 0 96V416c0 53 43 96 96 96H384h32c17.7 0 32-14.3 32-32s-14.3-32-32-32V384c17.7 0 32-14.3 32-32V32c0-17.7-14.3-32-32-32H384 96zm0 384H352v64H96c-17.7 0-32-14.3-32-32s14.3-32 32-32zM208 80c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v48h48c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H272V304c0 8.8-7.2 16-16 16H224c-8.8 0-16-7.2-16-16V192H160c-8.8 0-16-7.2-16-16V144c0-8.8 7.2-16 16-16h48V80z";

// Seconds. The narration starts while the intro card is still lifting.
export const INTRO = 2.8;
export const VOICE_START = 2.45;
export const HOLD = 1.3;
export const OUTRO = 3.8;
export function timeline(narrationDuration) {
  const voiceEnd = VOICE_START + narrationDuration;
  const outroStart = voiceEnd + HOLD;
  return { voiceStart: VOICE_START, voiceEnd, outroStart, duration: outroStart + OUTRO };
}

export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const ease = (t) => 1 - (1 - clamp(t)) ** 3;
export const smooth = (t) => clamp(t) * clamp(t) * (3 - 2 * clamp(t));
export const span = (t, from, to) => clamp((t - from) / (to - from));

const MARGIN = 92;
const TEXT_WIDTH = WIDTH - MARGIN * 2;

// Lays the verse out once: font size chosen to fill the reading area comfortably.
export function layoutVerse(ctx, words, { left = MARGIN, width = TEXT_WIDTH, maxHeight = 820, center = 1010, largest = 84, smallest = 46, weight = 400 } = {}) {
  const lineWidth = width;
  for (let size = largest; size >= smallest; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONTS.scripture}`;
    const space = ctx.measureText(" ").width;
    const lineHeight = Math.round(size * 1.48);
    const placed = [];
    let x = 0, line = 0;
    for (const word of words) {
      const width = ctx.measureText(word.word).width;
      if (x > 0 && x + width > lineWidth) {
        x = 0;
        line++;
      }
      placed.push({ ...word, x, line, width });
      x += width + space;
    }
    const lines = line + 1;
    if (lines * lineHeight <= maxHeight || size <= smallest) {
      const top = center - (lines * lineHeight) / 2;
      return {
        size,
        lineHeight,
        lines,
        top,
        bottom: top + lines * lineHeight,
        words: placed.map((word) => ({ ...word, x: left + word.x, y: top + word.line * lineHeight })),
      };
    }
  }
}

export function drawMark(ctx, Path2D, x, y, height, color, reveal = 1) {
  const scale = height / 512;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (reveal < 1) {
    ctx.beginPath();
    ctx.rect(0, 512 * (1 - reveal), 448, 512 * reveal);
    ctx.clip();
  }
  ctx.fillStyle = color;
  ctx.fill(new Path2D(MARK_PATH));
  ctx.restore();
}

// The Word's ✦ flourish, drawn as a four-point star (Literata has no glyph for it).
export function flourish(ctx, x, y, size, color, alpha = 1) {
  const r = size / 2, waist = r * 0.2;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.translate(x, y - r * 0.7);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.quadraticCurveTo(0, 0, Math.cos(a + Math.PI / 4) * waist, Math.sin(a + Math.PI / 4) * waist);
    ctx.quadraticCurveTo(0, 0, Math.cos(a + Math.PI / 2) * r, Math.sin(a + Math.PI / 2) * r);
  }
  ctx.fill();
  ctx.restore();
}

// Logo card used for both the intro and the outro: the mark rises in, the
// wordmark follows, then the tagline. `p` is local time in seconds.
function brandCard(ctx, Path2D, p, { lines = [], url } = {}) {
  const g = ctx.createRadialGradient(WIDTH / 2, 820, 60, WIDTH / 2, 960, 1250);
  g.addColorStop(0, PALETTE.surface);
  g.addColorStop(1, PALETTE.night);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const mark = ease(span(p, 0.15, 1.05));
  drawMark(ctx, Path2D, WIDTH / 2 - 78, 650 - 26 * (1 - mark), 178, PALETTE.accent, smooth(span(p, 0.1, 0.95)));
  ctx.save();
  ctx.globalAlpha *= mark;
  flourish(ctx, WIDTH / 2 + 132, 668, 40, PALETTE.flourish, ease(span(p, 0.75, 1.3)));
  ctx.restore();
  const word = ease(span(p, 0.45, 1.25));
  ctx.save();
  ctx.globalAlpha *= word;
  ctx.textAlign = "center";
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `500 132px ${FONTS.scripture}`;
  ctx.fillText("The Word", WIDTH / 2, 1000 + 22 * (1 - word));
  ctx.restore();
  const tag = ease(span(p, 0.95, 1.6));
  ctx.save();
  ctx.globalAlpha *= tag;
  ctx.textAlign = "center";
  ctx.fillStyle = PALETTE.inkSoft;
  ctx.font = `400 34px ${FONTS.label}`;
  ctx.letterSpacing = "1px";
  ctx.fillText("Free Scripture. No ads.", WIDTH / 2, 1078);
  lines.forEach((text, index) => {
    const a = ease(span(p, 1.25 + index * 0.18, 1.9 + index * 0.18));
    ctx.globalAlpha = a;
    ctx.fillStyle = index === 0 ? PALETTE.ink : PALETTE.inkSoft;
    ctx.font = index === 0 ? `400 52px ${FONTS.scripture}` : `400 34px ${FONTS.label}`;
    ctx.fillText(text, WIDTH / 2, 1290 + index * 74);
  });
  if (url) {
    const a = ease(span(p, 1.7, 2.3));
    ctx.globalAlpha = a;
    ctx.font = `700 34px ${FONTS.label}`;
    const width = ctx.measureText(url).width + 72;
    ctx.fillStyle = PALETTE.accent;
    ctx.beginPath();
    ctx.roundRect(WIDTH / 2 - width / 2, 1452, width, 84, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.night;
    ctx.fillText(url, WIDTH / 2, 1507);
  }
  ctx.restore();
}

// The reader's top bar: mark + wordmark, and a live "Reading aloud" pill.
function readerBar(ctx, Path2D, t, speaking) {
  drawMark(ctx, Path2D, MARGIN, 150, 58, PALETTE.accent);
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `400 52px ${FONTS.scripture}`;
  ctx.textAlign = "left";
  ctx.fillText("The Word", MARGIN + 74, 196);
  ctx.font = `400 22px ${FONTS.label}`;
  ctx.fillStyle = PALETTE.inkSoft;
  ctx.fillText("Free Scripture. No ads.", MARGIN + 76, 230);
  const pillW = 278, pillX = WIDTH - MARGIN - pillW, pillY = 150;
  ctx.fillStyle = `rgba(32,45,36,0.82)`;
  ctx.strokeStyle = "rgba(181,205,168,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, 70, 35);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const level = speaking ? 0.35 + 0.65 * Math.abs(Math.sin(t * (5.1 + i * 1.7) + i * 1.3)) : 0.25;
    const h = 8 + 26 * level;
    ctx.fillStyle = PALETTE.accent;
    ctx.beginPath();
    ctx.roundRect(pillX + 30 + i * 13, pillY + 35 - h / 2, 7, h, 3.5);
    ctx.fill();
  }
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `700 26px ${FONTS.label}`;
  ctx.fillText(speaking ? "Reading aloud" : "Read in The Word", pillX + 96, pillY + 45);
}

/**
 * Draws one transparent overlay frame; the B-roll is composited underneath.
 * scene: { verse, layout, words (timed), narration: { duration, segments }, date }
 */
export function drawScene(ctx, Path2D, scene, t) {
  const { layout, verse } = scene;
  const { voiceStart, voiceEnd, outroStart, duration } = timeline(scene.narration.duration);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "0px";

  // Reading scrim: sage-tinted, darker where the words sit.
  const scrim = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  scrim.addColorStop(0, `rgba(${PALETTE.scrim},0.5)`);
  scrim.addColorStop(0.2, `rgba(${PALETTE.scrim},0.26)`);
  scrim.addColorStop(0.5, `rgba(${PALETTE.scrim},0.46)`);
  scrim.addColorStop(1, `rgba(${PALETTE.scrim},0.82)`);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "rgba(23,33,27,0.14)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const narrationTime = t - voiceStart;
  const speaking = t >= voiceStart && t <= voiceEnd;
  const enter = ease(span(t, INTRO - 0.55, INTRO + 0.45));
  ctx.save();
  ctx.globalAlpha = enter;
  readerBar(ctx, Path2D, t, speaking);

  // Eyebrow: ✦ VERSE OF THE DAY · OCTOBER 10, 2026
  ctx.font = `700 25px ${FONTS.label}`;
  ctx.letterSpacing = "4px";
  flourish(ctx, MARGIN + 12, layout.top - 68, 34, PALETTE.gold);
  ctx.fillStyle = "rgba(231,234,221,0.9)";
  ctx.fillText(scene.eyebrow.toUpperCase(), MARGIN + 38, layout.top - 75);
  ctx.letterSpacing = "0px";

  // Scripture, word by word.
  const words = scene.words;
  let current = -1;
  for (let i = 0; i < words.length; i++) if (narrationTime >= words[i].start) current = i;
  const finished = narrationTime > words.at(-1).end;
  ctx.font = `400 ${layout.size}px ${FONTS.scripture}`;
  const rise = layout.size * 0.84;
  // The highlight glides between words rather than jumping.
  let pill = null;
  if (current >= 0 && !finished) {
    const now = layout.words[current];
    const prev = layout.words[Math.max(0, current - 1)];
    const k = current > 0 && prev.line === now.line ? smooth((narrationTime - words[current].start) / 0.12) : 1;
    const x = prev.x + (now.x - prev.x) * k, w = prev.width + (now.width - prev.width) * k;
    const padX = layout.size * 0.16, padY = layout.size * 0.16;
    pill = {
      x: x - padX,
      y: now.y + layout.lineHeight / 2 + layout.size * 0.04 - rise / 2 - padY,
      w: w + padX * 2,
      h: rise + padY * 2,
      r: layout.size * 0.14,
      line: now.line,
    };
    ctx.fillStyle = "rgba(212,189,135,0.95)";
    ctx.strokeStyle = PALETTE.goldDeep;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(pill.x, pill.y, pill.w, pill.h, pill.r);
    ctx.fill();
    ctx.stroke();
  }
  const baselineOf = (word, lineIn) => word.y + layout.lineHeight / 2 + layout.size * 0.32 + 18 * (1 - lineIn);
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#fbf8f1";
  layout.words.forEach((word, i) => {
    const lineIn = ease(span(t, INTRO - 0.35 + word.line * 0.07, INTRO + 0.5 + word.line * 0.07));
    const spoken = i <= current || finished;
    ctx.globalAlpha = enter * lineIn * (spoken ? 1 : 0.5);
    ctx.fillText(word.word, word.x, baselineOf(word, lineIn));
  });
  // Whatever sits under the gold pill reads as ink, wherever the pill is mid-glide.
  if (pill) {
    ctx.save();
    ctx.shadowColor = "transparent";
    ctx.beginPath();
    ctx.roundRect(pill.x, pill.y, pill.w, pill.h, pill.r);
    ctx.clip();
    ctx.globalAlpha = enter;
    ctx.fillStyle = PALETTE.night;
    for (const word of layout.words)
      if (word.line === pill.line && word.x < pill.x + pill.w && word.x + word.width > pill.x)
        ctx.fillText(word.word, word.x, baselineOf(word, 1));
    ctx.restore();
  }
  ctx.shadowColor = "transparent";
  ctx.globalAlpha = enter;

  // Reference: glows gold while it is being read.
  const refSegment = scene.narration.segments.find((segment) => segment.kind === "reference");
  const refActive = refSegment && narrationTime >= refSegment.start - 0.1 && narrationTime <= refSegment.end + 0.15;
  ctx.font = `400 40px ${FONTS.label}`;
  ctx.fillStyle = refActive ? PALETTE.gold : PALETTE.accent;
  ctx.fillText(`— ${verse.reference}`, MARGIN, layout.bottom + 92);

  // Reading progress, like The Word's read bar.
  const progress = clamp((t - voiceStart) / (voiceEnd - voiceStart));
  const barY = 1660;
  ctx.fillStyle = "rgba(57,74,61,0.9)";
  ctx.beginPath();
  ctx.roundRect(MARGIN, barY, TEXT_WIDTH, 10, 5);
  ctx.fill();
  ctx.fillStyle = PALETTE.accent;
  ctx.beginPath();
  ctx.roundRect(MARGIN, barY, Math.max(10, TEXT_WIDTH * progress), 10, 5);
  ctx.fill();
  ctx.font = `400 24px ${FONTS.label}`;
  ctx.fillStyle = PALETTE.inkSoft;
  ctx.fillText(verse.picked ? verse.translationName : `From ${verse.source}`, MARGIN, barY + 62);
  ctx.textAlign = "right";
  ctx.fillText("Read along in The Word", WIDTH - MARGIN, barY + 62);
  ctx.textAlign = "left";
  ctx.restore();

  // Intro card lifts away; the outro card settles in.
  if (t < INTRO) {
    ctx.save();
    ctx.globalAlpha = 1 - smooth(span(t, INTRO - 0.6, INTRO));
    brandCard(ctx, Path2D, t);
    ctx.restore();
  }
  if (t >= outroStart) {
    ctx.save();
    ctx.globalAlpha = smooth(span(t, outroStart, outroStart + 0.55));
    brandCard(ctx, Path2D, t - outroStart - 0.25, {
      lines: ["Read the full chapter free", "Scripture, read aloud. No account needed."],
      url: scene.appLabel,
    });
    ctx.restore();
  }
  // Final fade to the app's night color.
  if (t > duration - 0.45) {
    ctx.fillStyle = `rgba(23,33,27,${smooth(span(t, duration - 0.45, duration))})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}
