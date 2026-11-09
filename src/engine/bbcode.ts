// Portage de io.github.gcjojo.liblib.bbcode.* (BBCodeParser, TextEffects).

import { colorFromString, lerpColor, rgba, WHITE, type Color } from './color';
import { charWidth, LINE_HEIGHT } from './font';

type BBNode = { text: string } | { tag: string; params: Record<string, string>; children: BBNode[] };

export interface CharTransform {
  offsetX: number;
  offsetY: number;
  rotation: number;
  scale: number;
  color: Color;
}
export type TextEffect = (charIndex: number, time: number, base: Color) => CharTransform;

export interface StyledChar {
  ch: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: Color | null;
  effects: TextEffect[];
}

export const STYLE_TAGS = ['b', 'i', 'u', 's', 'color'];
export const EFFECT_TAGS = ['shake', 'wave', 'tornado', 'rainbow', 'gradient'];

const tokenPattern = () => /\[(\/?)(\w+)((?:\s+\w+=[^\s\]]+)*)]|([^[]+)/g;

function parseParams(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || !raw.trim()) return out;
  for (const pair of raw.trim().split(/\s+/)) {
    const eq = pair.indexOf('=');
    if (eq >= 0) out[pair.slice(0, eq)] = pair.slice(eq + 1).replace(/"/g, '');
  }
  return out;
}

export function parseBBCode(input: string): BBNode[] {
  const children: BBNode[][] = [[]];
  const tags: { name: string; params: Record<string, string> }[] = [];
  const close = () => {
    const closed = children.shift()!;
    const open = tags.shift()!;
    children[0].push({ tag: open.name, params: open.params, children: closed });
  };

  for (const m of input.matchAll(tokenPattern())) {
    if (m[4] !== undefined) {
      children[0].push({ text: m[4] });
    } else if (m[1] === '/') {
      // Comme le parser Java, une balise fermante ferme la dernière ouverte, quel que soit son nom.
      if (children.length > 1) close();
    } else {
      tags.unshift({ name: m[2], params: parseParams(m[3]) });
      children.unshift([]);
    }
  }
  while (children.length > 1) close();
  return children[0];
}

function getFloat(p: Record<string, string>, key: string, def: number): number {
  if (!(key in p)) return def;
  const v = Number(p[key]);
  return p[key].trim() === '' || Number.isNaN(v) ? def : v;
}

function countChars(nodes: BBNode[]): number {
  return nodes.reduce((n, node) => n + ('text' in node ? node.text.length : countChars(node.children)), 0);
}

/** java.util.Random : mêmes nombres pour la même graine, donc le même tremblement qu'en jeu. */
function javaRandomFloats(seed: number, count: number): number[] {
  const MULT = 0x5deece66dn;
  const MASK = (1n << 48n) - 1n;
  let s = (BigInt.asUintN(64, BigInt(Math.trunc(seed))) ^ MULT) & MASK;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    s = (s * MULT + 0xbn) & MASK;
    out.push(Number(s >> 24n) / (1 << 24));
  }
  return out;
}

function hsbToRgb(hue: number, sat: number, bri: number): Color {
  const v = (x: number) => Math.trunc(x * 255 + 0.5);
  if (sat === 0) return rgba(v(bri), v(bri), v(bri), 255);
  const h = (hue - Math.floor(hue)) * 6;
  const f = h - Math.floor(h);
  const p = bri * (1 - sat);
  const q = bri * (1 - sat * f);
  const t = bri * (1 - sat * (1 - f));
  const table = [
    [bri, t, p],
    [q, bri, p],
    [p, bri, t],
    [p, q, bri],
    [t, p, bri],
    [bri, p, q],
  ][Math.floor(h)];
  return rgba(v(table[0]), v(table[1]), v(table[2]), 255);
}

const plain = (color: Color, partial: Partial<CharTransform> = {}): CharTransform => ({
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  scale: 1,
  color,
  ...partial,
});

function resolveEffect(name: string, p: Record<string, string>, children: BBNode[]): TextEffect | null {
  switch (name.toLowerCase()) {
    case 'shake': {
      const intensity = getFloat(p, 'intensity', 2);
      const speed = getFloat(p, 'speed', 1);
      return (i, time, base) => {
        const [a, b] = javaRandomFloats(i * 1000 + Math.trunc(time * speed * 20), 2);
        return plain(base, { offsetX: (a - 0.5) * intensity, offsetY: (b - 0.5) * intensity });
      };
    }
    case 'wave': {
      const amp = getFloat(p, 'amplitude', 3);
      const freq = getFloat(p, 'frequency', 0.3);
      const speed = getFloat(p, 'speed', 5);
      return (i, time, base) => plain(base, { offsetY: Math.sin(time * speed + i * freq) * amp });
    }
    case 'tornado': {
      const radius = getFloat(p, 'radius', 3);
      const speed = getFloat(p, 'speed', 4);
      return (i, time, base) => {
        const angle = time * speed + i * 0.5;
        return plain(base, {
          offsetX: Math.cos(angle) * radius,
          offsetY: Math.sin(angle) * radius,
          rotation: ((angle * 180) / Math.PI) % 360,
        });
      };
    }
    case 'rainbow': {
      const speed = getFloat(p, 'speed', 0.3);
      const sat = getFloat(p, 'saturation', 0.8);
      const bri = getFloat(p, 'brightness', 1);
      return (i, time) => plain(hsbToRgb((time * speed + i * 0.1) % 1, sat, bri));
    }
    case 'gradient': {
      const len = countChars(children);
      const from = colorFromString(p.from ?? '#FFFFFFFF');
      const to = colorFromString(p.to ?? '#000000FF');
      if (!from || !to) return () => plain(WHITE);
      let firstIndex = -1;
      return (i) => {
        if (firstIndex < 0) firstIndex = i;
        const t = len <= 1 ? 0 : (i - firstIndex) / (len - 1);
        return plain(lerpColor(from, to, t));
      };
    }
    default:
      return null; // BBCodeEffectRegistry : effet personnalisé d'un autre mod, inconnu ici.
  }
}

function flattenRec(nodes: BBNode[], style: Omit<StyledChar, 'ch' | 'effects'>, effects: TextEffect[], out: StyledChar[]) {
  for (const node of nodes) {
    if ('text' in node) {
      for (const ch of node.text.split('')) out.push({ ch, ...style, effects });
      continue;
    }
    const name = node.tag.toLowerCase();
    if (STYLE_TAGS.includes(name)) {
      const next = { ...style };
      if (name === 'b') next.bold = true;
      if (name === 'i') next.italic = true;
      if (name === 'u') next.underline = true;
      if (name === 's') next.strike = true;
      if (name === 'color') {
        const raw = Object.values(node.params)[0];
        if (raw !== undefined) next.color = colorFromString(raw);
      }
      flattenRec(node.children, next, effects, out);
    } else {
      const effect = resolveEffect(node.tag, node.params, node.children);
      flattenRec(node.children, style, effect ? [...effects, effect] : effects, out);
    }
  }
}

export function flattenBBCode(input: string): StyledChar[] {
  const out: StyledChar[] = [];
  flattenRec(parseBBCode(input), { bold: false, italic: false, underline: false, strike: false, color: null }, [], out);
  return out;
}

export interface CharLayout {
  /** Position de chaque caractère ; null s'il n'est pas dessiné (\n, espace remplacée par un retour). */
  positions: ({ x: number; y: number } | null)[];
  /** Largeur de chaque ligne obtenue. */
  lines: number[];
}

/** Mise en page de GuiRichText.drawContents, retour à la ligne automatique compris. */
export function layoutChars(chars: StyledChar[], textWidth: number): CharLayout {
  const positions: CharLayout['positions'] = [];
  const lines = [0];
  let x = 0;
  let y = 0;
  const newLine = () => {
    x = 0;
    y += LINE_HEIGHT;
    lines.push(0);
  };
  chars.forEach((c, i) => {
    if (c.ch === '\n') {
      positions.push(null);
      newLine();
      return;
    }
    if (textWidth > 0 && c.ch === ' ') {
      let wordWidth = 0;
      for (let j = i + 1; j < chars.length; j++) {
        const next = chars[j].ch;
        if (next === ' ' || next === '\n') break;
        wordWidth += charWidth(next);
      }
      if (x + wordWidth >= textWidth) {
        positions.push(null);
        newLine();
        return;
      }
    }
    positions.push({ x, y });
    x += charWidth(c.ch, c.bold);
    lines[lines.length - 1] = x;
  });
  return { positions, lines };
}

export function combineEffects(effects: TextEffect[], i: number, time: number, base: Color): CharTransform {
  const total = plain(base);
  for (const effect of effects) {
    const t = effect(i, time, total.color);
    total.offsetX += t.offsetX;
    total.offsetY += t.offsetY;
    total.rotation += t.rotation;
    total.scale *= t.scale;
    total.color = t.color;
  }
  return total;
}
