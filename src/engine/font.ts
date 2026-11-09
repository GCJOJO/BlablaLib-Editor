// Police pixel originale (dessinée pour cet éditeur, pas de ressource Mojang dans le site).
// Seules les LARGEURS reprennent celles de la police par défaut de Minecraft 1.21.1 (mesurées sur
// ascii.png) : c'est ce qui rend fiables les calculs de dépassement de la boîte de dialogue.

export const LINE_HEIGHT = 9;

// Chaque ligne : 5 bits, bit 0x10 = colonne gauche. 7 lignes + 1 optionnelle pour les jambages.
const G: Record<string, string> = {
  A: '0e 11 11 1f 11 11 11', B: '1e 11 11 1e 11 11 1e', C: '0e 11 10 10 10 11 0e', D: '1e 11 11 11 11 11 1e',
  E: '1f 10 10 1e 10 10 1f', F: '1f 10 10 1e 10 10 10', G: '0f 10 10 13 11 11 0e', H: '11 11 11 1f 11 11 11',
  I: '1c 08 08 08 08 08 1c', J: '01 01 01 01 01 11 0e', K: '11 12 14 18 14 12 11', L: '10 10 10 10 10 10 1f',
  M: '11 1b 15 15 11 11 11', N: '11 19 15 13 11 11 11', O: '0e 11 11 11 11 11 0e', P: '1e 11 11 1e 10 10 10',
  Q: '0e 11 11 11 15 12 0d', R: '1e 11 11 1e 14 12 11', S: '0f 10 10 0e 01 01 1e', T: '1f 04 04 04 04 04 04',
  U: '11 11 11 11 11 11 0e', V: '11 11 11 11 11 0a 04', W: '11 11 11 15 15 1b 11', X: '11 11 0a 04 0a 11 11',
  Y: '11 11 0a 04 04 04 04', Z: '1f 01 02 04 08 10 1f',
  a: '00 00 0e 01 0f 11 0f', b: '10 10 16 19 11 11 1e', c: '00 00 0e 11 10 11 0e', d: '01 01 0d 13 11 11 0f',
  e: '00 00 0e 11 1f 10 0e', f: '06 08 1c 08 08 08 08', g: '00 00 0f 11 11 0f 01 1e', h: '10 10 16 19 11 11 11',
  i: '10 00 10 10 10 10 10', j: '01 00 01 01 01 01 11 0e', k: '10 10 12 14 18 14 12', l: '10 10 10 10 10 10 08',
  m: '00 00 1a 15 15 15 15', n: '00 00 16 19 11 11 11', o: '00 00 0e 11 11 11 0e', p: '00 00 16 19 11 11 1e 10',
  q: '00 00 0d 13 11 11 0f 01', r: '00 00 16 19 10 10 10', s: '00 00 0f 10 0e 01 1e', t: '08 08 1c 08 08 08 04',
  u: '00 00 11 11 11 13 0d', v: '00 00 11 11 11 0a 04', w: '00 00 11 11 15 15 0a', x: '00 00 11 0a 04 0a 11',
  y: '00 00 11 11 11 0f 01 1e', z: '00 00 1f 02 04 08 1f',
  0: '0e 11 13 15 19 11 0e', 1: '04 0c 04 04 04 04 1f', 2: '0e 11 01 06 08 10 1f', 3: '0e 11 01 06 01 11 0e',
  4: '02 06 0a 12 1f 02 02', 5: '1f 10 1e 01 01 11 0e', 6: '06 08 10 1e 11 11 0e', 7: '1f 01 02 04 04 04 04',
  8: '0e 11 11 0e 11 11 0e', 9: '0e 11 11 0f 01 02 0c',
  '!': '10 10 10 10 10 00 10', '"': '14 14 00 00 00 00 00', '#': '0a 0a 1f 0a 1f 0a 0a', $: '04 0f 14 0e 05 1e 04',
  '%': '11 12 02 04 08 09 11', '&': '08 14 14 08 15 12 0d', "'": '10 10 00 00 00 00 00', '(': '04 08 10 10 10 08 04',
  ')': '10 08 04 04 04 08 10', '*': '00 14 08 14 00 00 00', '+': '00 04 04 1f 04 04 00', ',': '00 00 00 00 00 00 10 10',
  '-': '00 00 00 1f 00 00 00', '.': '00 00 00 00 00 00 10', '/': '01 02 02 04 08 08 10', ':': '00 00 10 00 00 00 10',
  ';': '00 00 10 00 00 00 10 10', '<': '02 04 08 10 08 04 02', '=': '00 00 1f 00 00 1f 00', '>': '10 08 04 02 04 08 10',
  '?': '0e 11 01 02 04 00 04', '[': '1c 10 10 10 10 10 1c', '\\': '10 08 08 04 02 02 01', ']': '1c 04 04 04 04 04 1c',
  '^': '04 0a 11 00 00 00 00', _: '00 00 00 00 00 00 00 1f', '`': '10 08 00 00 00 00 00', '{': '04 08 08 10 08 08 04',
  '|': '10 10 10 10 10 10 10 10', '}': '10 08 08 04 08 08 10',
  'œ': '00 00 0a 15 17 14 0b', 'æ': '00 00 0a 05 0f 14 0b', 'Œ': '0f 14 14 17 14 14 0f', 'Æ': '0f 14 14 1f 14 14 17',
  '°': '0c 12 0c 00 00 00 00', '€': '07 08 1e 08 1e 08 07', '…': '00 00 00 00 00 00 15', '–': '00 00 00 1f 00 00 00',
  '—': '00 00 00 1f 00 00 00', '’': '10 10 00 00 00 00 00', '‘': '10 10 00 00 00 00 00',
  'î': '08 14 00 08 08 08 08', 'ï': '00 14 00 08 08 08 08', 'í': '04 08 00 08 08 08 08', 'ì': '10 08 00 08 08 08 08',
};

// Glyphes sur 6 colonnes (bit 0x20 = colonne gauche).
const WIDE: Record<string, string> = {
  '@': '1e 21 2d 2d 2f 20 1e',
  '~': '00 00 19 26 00 00 00',
  '«': '00 00 09 12 24 12 09',
  '»': '00 00 24 12 09 12 24',
};

// Largeurs réelles de la police par défaut (avance, espacement compris). 6 par défaut.
const WIDTHS: Record<string, number> = {
  ' ': 4, '!': 2, '"': 4, "'": 2, '(': 4, ')': 4, '*': 4, ',': 2, '.': 2, ':': 2, ';': 2, '<': 5, '>': 5,
  '@': 7, I: 4, '[': 4, ']': 4, '`': 3, f: 5, i: 2, k: 5, l: 3, t: 4, '{': 4, '|': 2, '}': 4, '~': 7,
  '«': 7, '»': 7, '°': 5, 'î': 4, 'ï': 4, 'í': 4, 'ì': 4, '’': 2, '‘': 2,
};

// Lettres accentuées : glyphe de base + accent sur les deux lignes au-dessus.
const ACUTE = ['02', '04'];
const GRAVE = ['08', '04'];
const CIRC = ['04', '0a'];
const TREMA = ['00', '0a'];
const ACCENTS: Record<string, [string, string[]]> = {
  'é': ['e', ACUTE], 'è': ['e', GRAVE], 'ê': ['e', CIRC], 'ë': ['e', TREMA],
  'à': ['a', GRAVE], 'á': ['a', ACUTE], 'â': ['a', CIRC], 'ä': ['a', TREMA],
  'ù': ['u', GRAVE], 'ú': ['u', ACUTE], 'û': ['u', CIRC], 'ü': ['u', TREMA],
  'ô': ['o', CIRC], 'ö': ['o', TREMA], 'ó': ['o', ACUTE], 'ò': ['o', GRAVE], 'ñ': ['n', ['05', '0a']],
  'É': ['E', ACUTE], 'È': ['E', GRAVE], 'Ê': ['E', CIRC], 'Ë': ['E', TREMA],
  'À': ['A', GRAVE], 'Á': ['A', ACUTE], 'Â': ['A', CIRC], 'Ä': ['A', TREMA],
  'Ù': ['U', GRAVE], 'Û': ['U', CIRC], 'Ü': ['U', TREMA], 'Ô': ['O', CIRC], 'Ö': ['O', TREMA],
  'Î': ['I', ['08', '14']], 'Ï': ['I', ['00', '14']],
};

export interface Glyph {
  /** Pixels allumés par ligne, de gauche à droite : [ligne, colonneDébut, longueur]. */
  runs: [number, number, number][];
}

const hexRows = (s: string) => s.split(' ').map((h) => parseInt(h, 16));

function toRuns(rows: number[], topBit: number, firstRow = 0): Glyph['runs'] {
  const runs: Glyph['runs'] = [];
  rows.forEach((bits, r) => {
    let col = 0;
    for (let mask = topBit; mask > 0; mask >>= 1, col++) {
      if (!(bits & mask)) continue;
      const last = runs[runs.length - 1];
      if (last && last[0] === r + firstRow && last[1] + last[2] === col) last[2]++;
      else runs.push([r + firstRow, col, 1]);
    }
  });
  return runs;
}

const cache = new Map<string, Glyph | null>();

export function glyphFor(ch: string): Glyph | null {
  if (cache.has(ch)) return cache.get(ch)!;
  let glyph: Glyph | null = null;
  if (WIDE[ch]) glyph = { runs: toRuns(hexRows(WIDE[ch]), 0x20) };
  else if (G[ch]) glyph = { runs: toRuns(hexRows(G[ch]), 0x10) };
  else if (ch === 'ç' || ch === 'Ç') {
    glyph = { runs: toRuns([...hexRows(G[ch === 'ç' ? 'c' : 'C']), 0x04], 0x10) };
  } else if (ACCENTS[ch]) {
    const [base, accent] = ACCENTS[ch];
    const isUpper = base === base.toUpperCase();
    const baseRows = hexRows(G[base]);
    glyph = isUpper
      ? { runs: [...toRuns(hexRows(accent.join(' ')), 0x10, -2), ...toRuns(baseRows, 0x10)] }
      : { runs: toRuns([...hexRows(accent.join(' ')), ...baseRows.slice(2)], 0x10) };
  }
  cache.set(ch, glyph);
  return glyph;
}

export function charWidth(ch: string, bold = false): number {
  const cp = ch.codePointAt(0) ?? 0;
  const base = WIDTHS[ch] ?? (cp >= 0x2e80 ? 8 : 6);
  return base + (bold ? 1 : 0);
}

export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s.split('')) w += ch === '\n' ? 0 : charWidth(ch);
  return w;
}
