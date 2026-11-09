// Dessin sur canvas des appels du moteur. Les coordonnées restent celles de l'interface Minecraft
// (pixels GUI) ; `k` est le nombre de pixels canvas par pixel GUI.

import { cssColor, type Color } from './color';
import { charWidth, glyphFor } from './font';
import type { ButtonDraw, GlyphDraw, ImageDraw, Painter } from './sim';

export type TextureLookup = (resourceLocation: string) => CanvasImageSource | null;

/** MC : une couleur dont l'alpha est < 4 est dessinée opaque (Font.adjustColor). */
const adjust = (c: Color): Color => (c.a < 4 ? { ...c, a: 255 } : c);
const shadowOf = (c: Color): Color => ({ r: c.r >> 2, g: c.g >> 2, b: c.b >> 2, a: c.a });

export class CanvasPainter implements Painter {
  private missing: HTMLCanvasElement | null = null;

  constructor(
    private ctx: CanvasRenderingContext2D,
    private k: number,
    private textures: TextureLookup,
  ) {
    ctx.imageSmoothingEnabled = false;
  }

  /** Aligne une coordonnée sur la grille du canvas pour garder des pixels nets. */
  private snap(v: number) {
    return Math.round(v * this.k) / this.k;
  }

  fill(x0: number, y0: number, x1: number, y1: number, c: Color) {
    this.ctx.fillStyle = cssColor(c);
    this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  gradient(x0: number, y0: number, x1: number, y1: number, top: Color, bottom: Color) {
    const g = this.ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, cssColor(top));
    g.addColorStop(1, cssColor(bottom));
    this.ctx.fillStyle = g;
    this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  private pixels(ch: string, x: number, y: number, c: Color, g: Pick<GlyphDraw, 'bold' | 'italic'>) {
    const ctx = this.ctx;
    ctx.fillStyle = cssColor(c);
    const glyph = glyphFor(ch);
    if (!glyph) {
      if (ch.trim() === '') return;
      // Caractère hors de la police de l'éditeur : repli sur une police système.
      ctx.font = '8px sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(ch, x, y + 7);
      return;
    }
    const passes = g.bold ? [0, 1] : [0];
    for (const dx of passes) {
      for (const [row, col, len] of glyph.runs) {
        const shear = g.italic ? 1 - 0.25 * row : 0;
        ctx.fillRect(x + dx + col + shear, y + row, len, 1);
      }
    }
  }

  private decorations(g: GlyphDraw, x: number, y: number, c: Color) {
    const w = charWidth(g.ch, g.bold);
    this.ctx.fillStyle = cssColor(c);
    if (g.underline) this.ctx.fillRect(x - 1, y + 8, w + 1, 1);
    if (g.strike) this.ctx.fillRect(x - 1, y + 3.5, w + 1, 1);
  }

  glyph(g: GlyphDraw) {
    const ctx = this.ctx;
    const scale = g.scale ?? 1;
    const rotated = !!g.rotation || scale !== 1;
    const color = adjust(g.color);
    if (rotated) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.scale(scale, scale);
      if (g.rotation) ctx.rotate((g.rotation * Math.PI) / 180);
    }
    const x = rotated ? 0 : this.snap(g.x);
    const y = rotated ? 0 : this.snap(g.y);
    if (g.shadow) {
      const s = shadowOf(color);
      this.pixels(g.ch, x + 1, y + 1, s, g);
      this.decorations(g, x + 1, y + 1, s);
    }
    this.pixels(g.ch, x, y, color, g);
    this.decorations(g, x, y, color);
    if (rotated) ctx.restore();
  }

  text(s: string, x: number, y: number, c: Color, shadow: boolean, scale = 1, rotation = 0) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    let cx = 0;
    const color = adjust(c);
    for (const ch of s.split('')) {
      if (shadow) this.pixels(ch, cx + 1, 1, shadowOf(color), { bold: false, italic: false });
      this.pixels(ch, cx, 0, color, { bold: false, italic: false });
      cx += charWidth(ch);
    }
    ctx.restore();
  }

  triangle(x: number, y: number) {
    this.ctx.fillStyle = '#fff';
    for (let row = 0; row < 4; row++) this.ctx.fillRect(x + row, y + 1 + row, 7 - row * 2, 1);
  }

  /** Damier noir et magenta : la texture manquante, comme en jeu. */
  private missingTexture(): HTMLCanvasElement {
    if (!this.missing) {
      const c = document.createElement('canvas');
      c.width = c.height = 2;
      const g = c.getContext('2d')!;
      g.fillStyle = '#000';
      g.fillRect(0, 0, 2, 2);
      g.fillStyle = '#f800f8';
      g.fillRect(0, 0, 1, 1);
      g.fillRect(1, 1, 1, 1);
      this.missing = c;
    }
    return this.missing;
  }

  image(d: ImageDraw) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = d.alpha;
    ctx.translate(d.x, d.y);
    ctx.rotate((d.rotation * Math.PI) / 180);
    ctx.scale(d.scale, d.scale);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.textures(d.texture) ?? this.missingTexture(), -d.width / 2, -d.height / 2, d.width, d.height);
    ctx.restore();
  }

  button(d: ButtonDraw) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(d.clip[0], d.clip[1], d.clip[2] - d.clip[0], d.clip[3] - d.clip[1]);
    ctx.clip();
    // Bouton dessiné à la main, dans l'esprit du bouton vanilla.
    ctx.fillStyle = '#000';
    ctx.fillRect(d.x, d.y, d.width, d.height);
    ctx.fillStyle = d.hovered ? '#ffffff' : '#000000';
    ctx.fillRect(d.x, d.y, d.width, d.height);
    ctx.fillStyle = '#707070';
    ctx.fillRect(d.x + 1, d.y + 1, d.width - 2, d.height - 2);
    ctx.fillStyle = '#a8a8a8';
    ctx.fillRect(d.x + 1, d.y + 1, d.width - 2, 1);
    ctx.fillRect(d.x + 1, d.y + 1, 1, d.height - 2);
    ctx.fillStyle = '#505050';
    ctx.fillRect(d.x + 1, d.y + d.height - 2, d.width - 2, 1);
    ctx.fillRect(d.x + d.width - 2, d.y + 1, 1, d.height - 2);
    let w = 0;
    for (const ch of d.label.split('')) w += charWidth(ch);
    this.text(d.label, Math.round(d.x + d.width / 2 - w / 2), Math.round(d.y + d.height / 2 - 4.5), { r: 255, g: 255, b: 255, a: 255 }, true);
    ctx.restore();
  }
}

/** Fond de monde généré (pas de capture Minecraft) quand aucun fond personnalisé n'est choisi. */
export function drawPlaceholderWorld(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#7fb0ee');
  sky.addColorStop(0.65, '#bcd8f5');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const hills: [string, number, number, number][] = [
    ['#7d9aa8', 0.58, 26, 0.013],
    ['#5b8a52', 0.68, 18, 0.021],
    ['#46753f', 0.79, 12, 0.034],
  ];
  const block = Math.max(4, Math.round(h / 45));
  for (const [color, base, amp, freq] of hills) {
    ctx.fillStyle = color;
    for (let x = 0; x < w; x += block) {
      const y = Math.round((h * base + Math.sin(x * freq) * amp + Math.sin(x * freq * 2.7 + 1) * amp * 0.4) / block) * block;
      ctx.fillRect(x, y, block, h - y);
    }
  }
}
