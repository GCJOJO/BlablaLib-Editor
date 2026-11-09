// Portage de io.github.gcjojo.liblib.math.Color et de MathUtils.lerp(Color, ...).

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp255 = (v: number) => Math.min(255, Math.max(0, v));
export const rgba = (r: number, g: number, b: number, a: number): Color => ({
  r: clamp255(r),
  g: clamp255(g),
  b: clamp255(b),
  a: clamp255(a),
});

export const WHITE = rgba(255, 255, 255, 255);
export const BLACK = rgba(0, 0, 0, 255);
export const TRANSPARENT = rgba(0, 0, 0, 0);
const NAMED: Record<string, Color> = {
  white: WHITE,
  black: BLACK,
  transparent: TRANSPARENT,
  red: rgba(255, 0, 0, 255),
  green: rgba(0, 255, 0, 255),
  blue: rgba(0, 0, 255, 255),
};
export const COLOR_NAMES = Object.keys(NAMED);

/**
 * Color.fromString : `#RRGGBBAA`, `#RRGGBB` (opaque) ou un nom. Null si invalide.
 * Écart volontaire : LibLib 0.2.2 écrit `colorInt >> 24`, qui rend le rouge négatif dès 0x80 (donc 0
 * après clamp : #FFFFFFFF donnerait du cyan). On suit l'intention, `>>> 24`.
 */
export function colorFromString(s: string): Color | null {
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
    if (hex.length === 8) {
      const n = parseInt(hex, 16);
      return rgba(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
    }
    if (hex.length === 6) {
      const n = parseInt(hex, 16);
      return rgba((n >>> 16) & 255, (n >>> 8) & 255, n & 255, 255);
    }
    return null;
  }
  return NAMED[s.toLowerCase()] ?? null;
}

export const colorFromStringOr = (s: string, other: Color) => colorFromString(s) ?? other;

function lerpInt(a: number, b: number, t: number): number {
  const v = Math.round(a + (b - a) * t);
  return Number.isNaN(v) ? 0 : v; // (int) NaN vaut 0 en Java
}

/** MathUtils.lerp(Color, Color, float). */
export function lerpColor(from: Color, to: Color, t: number): Color {
  return rgba(lerpInt(from.r, to.r, t), lerpInt(from.g, to.g, t), lerpInt(from.b, to.b, t), lerpInt(from.a, to.a, t));
}

export const cssColor = (c: Color) => `rgba(${c.r},${c.g},${c.b},${c.a / 255})`;

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();

/** La chaîne JSON à écrire pour obtenir cette couleur. */
export const encodeColor = (c: Color) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${hex2(c.a)}`;
