import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ACTIONS, GROUP_LABELS, RAW_ACTIONS } from '../model/schema';
import { en } from './en';
import { getLang, setLang, t } from './index';

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') && name !== 'en.ts' ? [path] : [];
  });
}

/** Clés écrites dans le code : t('…'), tr('…') et N_('…'). */
function keysInCode(): Set<string> {
  const keys = new Set<string>();
  const call = /(?<![\w.])(?:t|tr|N_)\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")/g;
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(call)) keys.add((m[1] ?? m[2]).replace(/\\(.)/g, '$1'));
  }
  return keys;
}

/** Textes du schéma. Les exemples qui ne sont pas du français (nombres, identifiants du jeu) restent tels quels. */
function keysInSchema(): Set<string> {
  const keys = new Set<string>(Object.values(GROUP_LABELS));
  for (const a of [...ACTIONS, ...RAW_ACTIONS]) {
    keys.add(a.label);
    keys.add(a.description);
  }
  for (const a of ACTIONS) {
    for (const f of a.fields) {
      keys.add(f.label);
      if (f.hint) keys.add(f.hint);
      if (f.placeholder && !/^(?:[\d.]+|minecraft:.*)$/.test(f.placeholder)) keys.add(f.placeholder);
    }
  }
  return keys;
}

const paramsOf = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('traductions', () => {
  afterEach(() => setLang('fr'));

  it('toutes les clés du code et du schéma sont traduites en anglais', () => {
    const missing = [...keysInCode(), ...keysInSchema()].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });
  it('le dictionnaire ne garde pas de clé devenue inutile', () => {
    const used = new Set([...keysInCode(), ...keysInSchema()]);
    expect(Object.keys(en).filter((k) => !used.has(k))).toEqual([]);
  });
  it('chaque traduction reprend les mêmes paramètres', () => {
    const wrong = Object.entries(en).filter(([k, v]) => paramsOf(k).join() !== paramsOf(v).join());
    expect(wrong).toEqual([]);
  });
  it('remplace les paramètres et suit la langue choisie', () => {
    setLang('fr');
    expect(t('Option {n}', { n: 2 })).toBe('Option 2');
    expect(t('Enregistrer')).toBe('Enregistrer');
    setLang('en');
    expect(getLang()).toBe('en');
    expect(t('Enregistrer')).toBe('Save');
    expect(t('{n} fichier(s) importé(s).', { n: 3 })).toBe(en['{n} fichier(s) importé(s).'].replace('{n}', '3'));
  });
  it('une clé inconnue reste affichée telle quelle', () => {
    setLang('en');
    expect(t('Texte sans traduction')).toBe('Texte sans traduction');
  });
});
