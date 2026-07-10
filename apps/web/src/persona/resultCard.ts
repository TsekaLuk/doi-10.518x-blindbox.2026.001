import { rarityOf, type Persona } from "@vibe/shared";

/**
 * Renders a shareable "result card" for a generated Persona onto an HTML
 * canvas, Xiaohongshu-style (portrait-oriented, punchy typography,
 * screenshot-and-share friendly).
 *
 * Framework-agnostic: no React here. A separate integration component owns
 * the <canvas> ref and calls drawResultCard() + downloadCanvasAsPng().
 */

/** Fixed output size — a common Xiaohongshu portrait image ratio (4:5). */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

/** System font stack with solid CJK coverage; no custom web font is loaded for canvas use. */
const FONT_STACK = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';

export interface ResultCardParams {
  persona: Persona;
  portraitDataUrl: string;
}

/** Draws a rounded rect path, using ctx.roundRect when available and falling back otherwise. */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const maybeRoundRect = (
    ctx as CanvasRenderingContext2D & {
      roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
    }
  ).roundRect;
  if (typeof maybeRoundRect === "function") {
    ctx.beginPath();
    maybeRoundRect.call(ctx, x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** Parses a #rrggbb hex color into an [r,g,b] tuple. */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

/** Relative luminance (0-1) — used to decide dark vs light text/badge foreground. */
function luminanceOf(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Mixes a hex color toward white (amount 0-1) for lighter tints. */
function tint(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** Mixes a hex color toward black (amount 0-1) for darker shades. */
function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c * (1 - amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Wraps text to fit maxWidth, returning an array of lines (greedy, char-based so CJK wraps cleanly). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const chars = Array.from(text);
  const lines: string[] = [];
  let current = "";
  for (const ch of chars) {
    const candidate = current + ch;
    if (ctx.measureText(candidate).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  const consumed = lines.reduce((sum, l) => sum + l.length, 0);
  if (consumed < chars.length && lines.length === maxLines) {
    const last = lines[maxLines - 1] ?? "";
    lines[maxLines - 1] = last.length > 1 ? `${last.slice(0, -1)}…` : last;
  }
  return lines;
}

/** Draws a pill-shaped badge with centered text and returns its total width. */
function drawPill(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number; // top of the pill
    height: number;
    text: string;
    font: string;
    paddingX: number;
    fillStyle: string;
    textStyle: string;
    strokeStyle?: string;
  },
): number {
  const { x, y, height, text, font, paddingX, fillStyle, textStyle, strokeStyle } = opts;
  ctx.font = font;
  const textWidth = ctx.measureText(text).width;
  const width = textWidth + paddingX * 2;
  roundedRectPath(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
  ctx.fillStyle = textStyle;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + width / 2, y + height / 2 + 1);
  return width;
}

/**
 * Draws the full result-card composition for a Persona onto the given canvas.
 * Sets canvas.width/height to the fixed CARD_WIDTH x CARD_HEIGHT.
 */
export async function drawResultCard(canvas: HTMLCanvasElement, params: ResultCardParams): Promise<void> {
  const { persona, portraitDataUrl } = params;
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("resultCard: 2D canvas context unavailable");

  const FALLBACK_PALETTE: [string, string, string] = ["#7c5cff", "#ff5c8a", "#5cf0ff"];
  const c1 = persona.palette[0] ?? FALLBACK_PALETTE[0];
  const c2 = persona.palette[1] ?? FALLBACK_PALETTE[1];
  const c3 = persona.palette[2] ?? FALLBACK_PALETTE[2];
  const rarity = rarityOf(persona);

  // ---- Background gradient derived from persona.palette ----
  const bgGradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  bgGradient.addColorStop(0, shade(c1, 0.35));
  bgGradient.addColorStop(0.55, shade(c2, 0.5));
  bgGradient.addColorStop(1, shade(c3, 0.6));
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Soft radial glow accents using the palette, for depth.
  const glow1 = ctx.createRadialGradient(
    CARD_WIDTH * 0.2,
    CARD_HEIGHT * 0.1,
    0,
    CARD_WIDTH * 0.2,
    CARD_HEIGHT * 0.1,
    CARD_WIDTH * 0.7,
  );
  glow1.addColorStop(0, withAlpha(c1, 0.35));
  glow1.addColorStop(1, withAlpha(c1, 0));
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const glow2 = ctx.createRadialGradient(
    CARD_WIDTH * 0.85,
    CARD_HEIGHT * 0.75,
    0,
    CARD_WIDTH * 0.85,
    CARD_HEIGHT * 0.75,
    CARD_WIDTH * 0.6,
  );
  glow2.addColorStop(0, withAlpha(c3, 0.3));
  glow2.addColorStop(1, withAlpha(c3, 0));
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // ---- Portrait: top ~60% of the card ----
  const portraitMargin = 40;
  const portraitX = portraitMargin;
  const portraitY = 40;
  const portraitWidth = CARD_WIDTH - portraitMargin * 2;
  const portraitHeight = Math.round(CARD_HEIGHT * 0.6);
  const portraitRadius = 36;

  const img = new Image();
  img.src = portraitDataUrl;
  await img.decode();

  ctx.save();
  roundedRectPath(ctx, portraitX, portraitY, portraitWidth, portraitHeight, portraitRadius);
  ctx.clip();

  // Cover-fit the portrait into the frame (center-crop).
  const frameAspect = portraitWidth / portraitHeight;
  const imgAspect = img.width / img.height;
  let drawWidth: number;
  let drawHeight: number;
  if (imgAspect > frameAspect) {
    drawHeight = portraitHeight;
    drawWidth = drawHeight * imgAspect;
  } else {
    drawWidth = portraitWidth;
    drawHeight = drawWidth / imgAspect;
  }
  const drawX = portraitX + (portraitWidth - drawWidth) / 2;
  const drawY = portraitY + (portraitHeight - drawHeight) / 2;
  ctx.fillStyle = shade(c2, 0.4);
  ctx.fillRect(portraitX, portraitY, portraitWidth, portraitHeight);
  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

  // Bottom scrim inside the portrait frame so the rarity badge stays legible.
  const scrim = ctx.createLinearGradient(0, portraitY + portraitHeight - 220, 0, portraitY + portraitHeight);
  scrim.addColorStop(0, "rgba(0,0,0,0)");
  scrim.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = scrim;
  ctx.fillRect(portraitX, portraitY + portraitHeight - 220, portraitWidth, 220);
  ctx.restore();

  // Portrait frame border, tinted with palette accent.
  roundedRectPath(ctx, portraitX, portraitY, portraitWidth, portraitHeight, portraitRadius);
  ctx.lineWidth = 4;
  ctx.strokeStyle = withAlpha(tint(c1, 0.3), 0.8);
  ctx.stroke();

  // ---- Rarity badge — top-right corner of the portrait ----
  const stars = "★".repeat(Math.max(0, rarity.stars));
  ctx.font = `700 34px ${FONT_STACK}`;
  const rarityText = `${stars} ${rarity.label}`;
  ctx.textAlign = "right";
  const rarityPadX = 24;
  const rarityWidth = ctx.measureText(rarityText).width + rarityPadX * 2;
  const rarityHeight = 62;
  const rarityX = portraitX + portraitWidth - 24 - rarityWidth;
  const rarityY = portraitY + 24;
  roundedRectPath(ctx, rarityX, rarityY, rarityWidth, rarityHeight, rarityHeight / 2);
  const rarityGradient = ctx.createLinearGradient(rarityX, 0, rarityX + rarityWidth, 0);
  rarityGradient.addColorStop(0, shade(c1, 0.05));
  rarityGradient.addColorStop(1, shade(c3, 0.05));
  ctx.fillStyle = rarityGradient;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(rarityText, rarityX + rarityWidth / 2, rarityY + rarityHeight / 2 + 2);

  // ---- "人格盲盒" wordmark/watermark — top-left corner of the portrait ----
  ctx.font = `700 30px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const wordmarkX = portraitX + 28;
  const wordmarkY = portraitY + 24 + rarityHeight / 2;
  ctx.fillText("人格盲盒", wordmarkX, wordmarkY);

  // ---- Content area below the portrait ----
  let cursorY = portraitY + portraitHeight + 56;
  const contentX = 56;
  const contentWidth = CARD_WIDTH - contentX * 2;

  // Name — large bold headline.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 76px ${FONT_STACK}`;
  ctx.fillText(persona.name, contentX, cursorY + 60, contentWidth);
  cursorY += 78;

  // Code — small monospace-ish caption under the name.
  ctx.font = '600 30px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.fillStyle = withAlpha(tint(c1, 0.6), 0.9);
  ctx.fillText(persona.code, contentX, cursorY + 30);
  cursorY += 58;

  // Tagline — medium, punchy.
  ctx.font = `600 42px ${FONT_STACK}`;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  const taglineLines = wrapText(ctx, persona.tagline, contentWidth, 2);
  for (const line of taglineLines) {
    cursorY += 52;
    ctx.fillText(line, contentX, cursorY);
  }
  cursorY += 44;

  // Attachment style + archetype pills.
  const pillFont = `600 30px ${FONT_STACK}`;
  const pillHeight = 58;
  let pillX = contentX;
  pillX +=
    drawPill(ctx, {
      x: pillX,
      y: cursorY,
      height: pillHeight,
      text: persona.attachmentStyle,
      font: pillFont,
      paddingX: 28,
      fillStyle: withAlpha(tint(c2, 0.15), 0.9),
      textStyle: luminanceOf(c2) > 0.6 ? "#111111" : "#ffffff",
      strokeStyle: "rgba(255,255,255,0.35)",
    }) + 20;
  drawPill(ctx, {
    x: pillX,
    y: cursorY,
    height: pillHeight,
    text: persona.archetype,
    font: pillFont,
    paddingX: 28,
    fillStyle: withAlpha(tint(c3, 0.15), 0.9),
    textStyle: luminanceOf(c3) > 0.6 ? "#111111" : "#ffffff",
    strokeStyle: "rgba(255,255,255,0.35)",
  });
  cursorY += pillHeight + 32;

  // Tag chips — 3 small chips, wrap to a new row if they overflow.
  const chipFont = `500 26px ${FONT_STACK}`;
  const chipHeight = 50;
  let chipX = contentX;
  let chipY = cursorY;
  for (const tag of persona.tags) {
    ctx.font = chipFont;
    const chipTextWidth = ctx.measureText(`#${tag}`).width;
    const chipPad = 22;
    const chipWidth = chipTextWidth + chipPad * 2;
    if (chipX + chipWidth > contentX + contentWidth) {
      chipX = contentX;
      chipY += chipHeight + 16;
    }
    roundedRectPath(ctx, chipX, chipY, chipWidth, chipHeight, chipHeight / 2);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`#${tag}`, chipX + chipWidth / 2, chipY + chipHeight / 2 + 1);
    chipX += chipWidth + 16;
  }
  cursorY = chipY + chipHeight + 40;

  // ---- Footer wordmark ----
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 26px ${FONT_STACK}`;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText("人格盲盒 · Persona Blind Box", CARD_WIDTH - contentX, CARD_HEIGHT - 40);
}

/**
 * Converts the canvas to a PNG data URI and triggers a browser download.
 * Safe from tainted-canvas errors because the only drawn image source is a
 * data: URI (never a remote URL).
 */
export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename = "persona-card.png"): void {
  const dataUrl = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
