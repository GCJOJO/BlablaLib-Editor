import { beforeAll, describe, expect, it } from 'vitest';
import { NULL_PAINTER, PreviewRun, type RawAction } from '../engine/sim';
import { setLang } from '../i18n';
import { checkExtension, customActionDefs, parseExtension, serializeExtension, type Extension } from './extensions';
import { makeWorld, parseDialogueFile, type Project } from './project';
import { actionDef } from './schema';
import { validateProject } from './validate';

beforeAll(() => setLang('fr'));

const SAMPLE = {
  format: 1,
  id: 'mon_mod',
  name: 'Mon mod',
  version: '1.0.0',
  actions: [
    {
      id: 'mon_mod:shake',
      label: { fr: 'Secousse', en: 'Shake' },
      icon: 'zap',
      blocking: true,
      skippable: true,
      preview: { mode: 'ticks', ticksField: 'time', log: 'force {force}' },
      fields: [
        { key: 'time', label: 'Durée', type: 'number', required: true, default: 10 },
        { key: 'force', label: 'Force', type: 'number', default: 1, min: 0, max: 5 },
        { key: 'mode', label: 'Mode', type: 'select', options: ['a', 'b'] },
      ],
    },
    { id: 'mon_mod:wait_click', label: 'Clic', blocking: true, skippable: false, preview: { mode: 'input' }, fields: [] },
    { id: 'mon_mod:instant', label: 'Instant', blocking: true, skippable: true, fields: [] },
    { id: 'mon_mod:overlay', label: 'Calque', blocking: false, skippable: true, fields: [] },
  ],
  overloads: { futur: true },
};

function load(json: unknown = SAMPLE): Extension {
  const { extension, errors } = parseExtension(json, 'u1');
  expect(errors).toEqual([]);
  return extension!;
}

function project(actions: RawAction[], extensions: Extension[]): Project {
  const file = parseDialogueFile(JSON.stringify({ speakers: [], a: actions }), 'x', 'a.json');
  return { name: '', files: [file], langs: [], extensions };
}

function run(actions: RawAction[], ext = load()) {
  const r = new PreviewRun(makeWorld(project(actions, [ext]), 'en_us', 'fr'), 'x:a', { width: 640, height: 360, network: false });
  return r;
}
function pump(r: PreviewRun, ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    r.tick();
    r.render(NULL_PAINTER, 0, 0, 1);
  }
}
const wait = (time: number) => ({ action: 'blablalib:wait', time });

describe('format des extensions', () => {
  it('relit et réécrit un fichier à l’identique, propriétés inconnues comprises', () => {
    const text = `${JSON.stringify(SAMPLE, null, 2)}\n`;
    expect(serializeExtension(load(JSON.parse(text)))).toBe(text);
  });
  it('refuse une structure invalide avec des erreurs précises', () => {
    const { extension, errors } = parseExtension({ id: 'x', actions: [{ id: 'x:a', label: 'A', blocking: 'oui', skippable: true, fields: [{ key: 'k', type: 'date' }] }] }, 'u');
    expect(extension).toBeNull();
    expect(errors.join('\n')).toContain('blocking');
    expect(errors.join('\n')).toContain('date');
  });
  it('signale un nom déjà pris par BlablaLib ou par une autre extension', () => {
    const a = load({ id: 'a', actions: [{ id: 'blablalib:wait', label: 'W', blocking: true, skippable: true }, { id: 'a:x', label: 'X', blocking: true, skippable: true }] });
    const b = load({ id: 'b', actions: [{ id: 'a:x', label: 'X', blocking: true, skippable: true }] });
    const issues = checkExtension(a, [a, b]).map((i) => i.message).join('\n');
    expect(issues).toContain('registerCustomAction');
    expect(issues).toContain('« b »');
  });
  it('fournit les formulaires dans la langue du site', () => {
    const defs = customActionDefs([load()], 'en');
    expect(defs.map((d) => d.label)).toContain('Shake');
    expect(actionDef({ action: 'mon_mod:shake' }, defs)?.defaults).toEqual({ action: 'mon_mod:shake', time: 10, force: 1 });
    // Les actions de BlablaLib passent avant celles des extensions.
    expect(actionDef({ action: 'blablalib:wait' }, defs)?.group).toBe('rythme');
  });
});

describe('preview des actions custom', () => {
  it('mode ticks : bloque pendant la durée lue dans le champ et écrit le journal', () => {
    const r = run([{ action: 'mon_mod:shake', time: 5, force: 3 }, wait(40)]);
    pump(r, 3);
    expect(r.screen!.actionIndex).toBe(0);
    pump(r, 6);
    expect(r.screen!.actionIndex).toBe(1);
    expect(r.events.find((e) => e.kind === 'custom')?.text).toBe('Secousse : force 3');
  });
  it('mode input : attend un clic, et l’avance rapide le passe', () => {
    const r = run([{ action: 'mon_mod:wait_click' }, wait(40)]);
    pump(r, 5);
    expect(r.waitingForInput).toBe(true);
    r.click(10, 10);
    pump(r);
    expect(r.screen!.actionIndex).toBe(1);
    const fast = run([{ action: 'mon_mod:wait_click' }, wait(40)]);
    expect(fast.fastForwardTo(1)).toBe(true);
  });
  it('mode instant et action non bloquante : le dialogue continue aussitôt', () => {
    const r = run([{ action: 'mon_mod:instant' }, { action: 'mon_mod:overlay' }, wait(40)]);
    pump(r, 3);
    expect(r.screen!.actionIndex).toBe(2);
    expect(r.screen!.currentActions.map((a) => a.cls)).toContain('mon_mod:overlay');
  });
  it('un clear ciblé retire l’action custom', () => {
    const r = run([{ action: 'mon_mod:overlay' }, { action: 'blablalib:clear', cleared_actions: 'mon_mod:overlay' }, wait(40)]);
    pump(r, 4);
    expect(r.screen!.currentActions.map((a) => a.cls)).not.toContain('mon_mod:overlay');
  });
  it('sans l’extension, l’action redevient inconnue et la preview la passe', () => {
    const p = project([{ action: 'mon_mod:shake', time: 5 }, wait(40)], []);
    const r = new PreviewRun(makeWorld(p, 'en_us', 'fr'), 'x:a', { width: 640, height: 360, network: false });
    pump(r, 2);
    expect(r.screen!.actionIndex).toBe(1);
    expect(p.files[0].dialogues[0].actions[0].raw).toEqual({ action: 'mon_mod:shake', time: 5 });
  });
});

describe('validation avec extensions', () => {
  const messages = (actions: RawAction[], exts: Extension[]) =>
    validateProject(project(actions, exts), new Set(), 'en_us')
      .map((p) => p.message)
      .join('\n');

  it('vérifie les valeurs selon le schéma', () => {
    const text = messages([{ action: 'mon_mod:shake', force: 9, mode: 'c' }, wait(1)], [load()]);
    expect(text).toContain('« time » absent');
    expect(text).toContain('hors des limites');
    expect(text).toContain('options');
    expect(text).not.toContain('inconnue de BlablaLib');
  });
  it('tient compte du blocage déclaré pour la dernière action', () => {
    expect(messages([{ action: 'mon_mod:wait_click' }], [load()])).not.toContain('Dernière action non bloquante');
    expect(messages([{ action: 'mon_mod:overlay' }], [load()])).toContain('Dernière action non bloquante');
  });
  it('sans l’extension, l’action est signalée comme inconnue', () => {
    expect(messages([{ action: 'mon_mod:shake', time: 1 }, wait(1)], [])).toContain('inconnue de BlablaLib');
  });
});
