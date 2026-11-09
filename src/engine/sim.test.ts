import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { setLang } from '../i18n';
import { combineEffects, flattenBBCode, layoutChars } from './bbcode';
import { colorFromString, encodeColor, lerpColor, WHITE } from './color';
import { MessageAction, NULL_PAINTER, parseResourceLocation, PreviewRun, type ImageDraw, type Painter, type RawAction, type SimWorld } from './sim';

beforeAll(() => setLang('fr'));

const world = (dialogues: Record<string, RawAction[]>, lang: Record<string, string> = {}): SimWorld => ({
  dialogue: (id) => dialogues[id],
  speakers: [{ id: 'blablalib:dog', name: 'Dog', color: '#FFFFFFFF', sounds: [] }],
  translate: (k) => lang[k] ?? k,
});
const opts = { width: 640, height: 360, network: false };
const msg = (text: string) => ({ action: 'blablalib:message', speaker: 'blablalib:dog', text });
const wait = (time: number) => ({ action: 'blablalib:wait', time });
const command = (c: string) => ({ action: 'blablalib:command', command: c });

function run(actions: RawAction[], extra: Record<string, RawAction[]> = {}, network = false) {
  return new PreviewRun(world({ 't:a': actions, ...extra }), 't:a', { ...opts, network });
}
function pump(r: PreviewRun, ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    r.tick();
    r.render(NULL_PAINTER, 0, 0, 1);
  }
}
/** Valide un message : un clic pour révéler, un clic pour avancer. */
function clickThrough(r: PreviewRun) {
  r.click(0, 0);
  r.click(0, 0);
  pump(r);
}
const commands = (r: PreviewRun) => r.events.filter((e) => e.kind === 'command').map((e) => e.text);
const current = (r: PreviewRun) => r.screen!.currentActions.at(-1) as MessageAction;

describe('couleurs', () => {
  it('lit #RRGGBBAA, #RRGGBB et les noms', () => {
    expect(colorFromString('#FF000080')).toEqual({ r: 255, g: 0, b: 0, a: 128 });
    expect(colorFromString('#FFFFFFFF')).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(colorFromString('#00FF00')).toEqual({ r: 0, g: 255, b: 0, a: 255 });
    expect(colorFromString('FFFFFFFF')).toBeNull();
    expect(colorFromString('RED')).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });
  it('interpole chaque canal avec lui-même', () => {
    const c = lerpColor(colorFromString('#00000000')!, colorFromString('#FF804020')!, 1);
    expect(c).toEqual({ r: 255, g: 128, b: 64, a: 32 });
  });
  it('encodeColor est l’inverse de colorFromString', () => {
    const target = { r: 200, g: 20, b: 30, a: 40 };
    expect(colorFromString(encodeColor(target))).toEqual(target);
  });
});

describe('BBCode', () => {
  it('retire les balises et applique les styles', () => {
    const chars = flattenBBCode('[b]Hi[/b] [shake]yo[/shake]');
    expect(chars.map((c) => c.ch).join('')).toBe('Hi yo');
    expect(chars[0].bold).toBe(true);
    expect(chars[3].effects).toHaveLength(1);
    expect(chars[2].effects).toHaveLength(0);
  });
  it('un paramètre n’avale plus le texte qui suit', () => {
    const chars = flattenBBCode('[color v=#FF5555FF]prêt[/color] ?');
    expect(chars.map((c) => c.ch).join('')).toBe('prêt ?');
    expect(chars[0].color).toEqual({ r: 255, g: 85, b: 85, a: 255 });
    expect(chars[5].color).toBeNull();
  });
  it('ne lit toujours pas [color=...]', () => {
    expect(flattenBBCode('[color=red]x').map((c) => c.ch).join('')).toBe('color=red]x');
  });
  it('ferme les balises restées ouvertes', () => {
    expect(flattenBBCode('[i]a').map((c) => [c.ch, c.italic])).toEqual([['a', true]]);
  });
  it('le dégradé reste stable d’une image à l’autre', () => {
    const chars = flattenBBCode('[gradient from=#FF0000FF to=#0000FFFF]abc[/gradient]');
    const colorsOfFrame = () => chars.map((c, i) => combineEffects(c.effects, i, 0, WHITE).color);
    const first = colorsOfFrame();
    expect(first[0]).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(first[2]).toEqual({ r: 0, g: 0, b: 255, a: 255 });
    expect(colorsOfFrame()).toEqual(first);
  });
});

describe('retour à la ligne', () => {
  const lines = (text: string, width: number) => layoutChars(flattenBBCode(text), width).lines;
  it('coupe aux espaces selon la largeur', () => {
    const result = lines('mot '.repeat(40).trim(), 270);
    expect(result.length).toBeGreaterThan(1);
    expect(Math.max(...result)).toBeLessThanOrEqual(270);
  });
  it('sans largeur, ne coupe qu’aux \\n', () => {
    expect(lines('mot '.repeat(40).trim(), 0)).toHaveLength(1);
    expect(lines('a\nb', 0)).toHaveLength(2);
  });
  it('la mesure d’un mot s’arrête au \\n', () => {
    // « bbb » tient sur la ligne : « ccc », après le \n, ne doit pas compter.
    expect(lines('aaaaa bbb\ncccccccccccccccc', 60)).toHaveLength(2);
  });
  it('un mot trop long n’est pas coupé', () => {
    expect(lines('m'.repeat(100), 270)[0]).toBe(600);
  });
});

describe('resource locations', () => {
  it('normalise comme ResourceLocation.tryParse', () => {
    expect(parseResourceLocation('entity.wolf.whine')).toBe('minecraft:entity.wolf.whine');
    expect(parseResourceLocation('a:b/c')).toBe('a:b/c');
    expect(parseResourceLocation('Bad:Name')).toBeNull();
  });
});

describe('déroulement', () => {
  it('tape une lettre par tick puis attend un clic', () => {
    const r = run([msg('abcd')]);
    const m = current(r);
    pump(r, 2);
    expect(m.charIndex).toBe(2);
    r.click(0, 0); // révèle
    expect(m.charIndex).toBe(3);
    expect(m.fullyDrawn).toBe(true);
    r.click(0, 0); // avance
    pump(r);
    expect(r.screen!.currentFadingTime).toBeGreaterThanOrEqual(0);
  });

  it('la frappe ne compte que les caractères visibles', () => {
    const r = run([msg('[b]a[/b]')]);
    expect(current(r).fullyDrawn).toBe(true);
  });

  it('un texte fait uniquement de balises ne plante plus', () => {
    const r = run([msg('[shake][/shake]'), msg('x')]);
    pump(r, 3);
    expect(r.crash).toBeNull();
    expect(current(r).fullyDrawn).toBe(true);
  });

  it('traduit le texte des messages au moment de les afficher', () => {
    const r = new PreviewRun(world({ 't:a': [msg('key.x')] }, { 'key.x': 'Bonjour' }), 't:a', opts);
    expect(current(r).line).toBe('key.x');
    expect(current(r).rich.chars.map((c) => c.ch).join('')).toBe('Bonjour');
  });

  it('`wait` de timings fait une pause sur la ponctuation', () => {
    const r = run([{ action: 'blablalib:timings', speed: 1, wait: 50 }, msg('a.bcd')]);
    pump(r);
    expect(current(r).charIndex).toBe(1);
    expect(current(r).pauseTimer).toBe(50);
    pump(r, 3);
    expect(current(r).charIndex).toBe(1);
    expect(current(r).pauseTimer).toBe(47);
  });

  it('la pause n’est pas répétée sur le dernier caractère', () => {
    const r = run([{ action: 'blablalib:timings', speed: 1, wait: 2 }, msg('[b]Fin.[/b]')]);
    pump(r, 30);
    expect(current(r).fullyDrawn).toBe(true);
    expect(current(r).pauseTimer).toBe(0);
  });

  it('`speed` ralentit bien la frappe', () => {
    const r = run([{ action: 'blablalib:timings', speed: 10 }, msg('abcdef')]);
    pump(r, 2);
    const m = current(r);
    pump(r, 20);
    expect(m.charIndex).toBe(2);
  });

  it('wait bloque le temps demandé', () => {
    const r = run([wait(10), msg('x')]);
    pump(r, 9);
    expect(r.screen!.actionIndex).toBe(0);
    pump(r, 2);
    expect(r.screen!.actionIndex).toBe(1);
  });

  it('exécute chaque commande une seule fois', () => {
    const r = run([msg('a'), command('say 1'), msg('b'), command('say 2')]);
    clickThrough(r);
    pump(r, 2);
    clickThrough(r);
    pump(r, 3);
    expect(commands(r)).toEqual(['/say 1', '/say 2']);
  });

  it('exécute une commande seule dans un dialogue', () => {
    const r = run([command('say seule')]);
    pump(r, 3);
    expect(commands(r)).toEqual(['/say seule']);
  });

  it('remplace <PLAYER> dans les commandes', () => {
    const r = run([wait(1), command('tp <PLAYER> ~ ~ ~')]);
    pump(r, 4);
    expect(commands(r)[0]).toBe('/tp Joueur ~ ~ ~');
  });

  it('le message après un clear s’affiche normalement, une seule fois', () => {
    const r = run([{ action: 'blablalib:clear' }, msg('abc'), msg('z')]);
    pump(r);
    const first = current(r);
    expect(r.screen!.actionIndex).toBe(1);
    r.click(0, 0);
    r.click(0, 0);
    pump(r);
    expect(r.screen!.actionIndex).toBe(2);
    expect(current(r)).not.toBe(first);
  });

  it('clear ciblé ne retire que la classe demandée, sans rien rejouer', () => {
    const r = run([
      { action: 'blablalib:fade', from: '#00000000', to: '#000000FF', time: 5 },
      { action: 'blablalib:image', id: 0, image: 'a:b.png', width: 16, height: 16 },
      { action: 'blablalib:clear', cleared_actions: 'blablalib:fade' },
      msg('x'),
    ]);
    pump(r);
    expect(r.screen!.currentActions.map((a) => a.cls)).toEqual(['image', 'message']);
  });

  it('hide_ui agit avec ou sans namespace', () => {
    expect(run([{ action: 'hide_ui' }, msg('x')]).screen!.guiVisible).toBe(false);
    expect(run([{ action: 'blablalib:hide_ui' }, msg('x')]).screen!.guiVisible).toBe(false);
  });

  it('une action de constructeur invalide devient inconnue, sans planter', () => {
    const r = run([{ action: 'blablalib:npc' }, msg('x')]);
    expect(r.crash).toBeNull();
    expect(r.screen!.currentActions.map((a) => a.cls)).toEqual(['message']);
  });

  it('Échap passe les actions passables mais s’arrête sur un choix', () => {
    const r = run([msg('a'), wait(99), { action: 'blablalib:choice', choices: [{ name: 'x' }] }, msg('z')]);
    r.key(256);
    expect(r.screen!.actionIndex).toBe(2);
    expect(r.screen!.currentActions.map((a) => a.cls)).toEqual(['choice']);
  });

  it('Échap à travers un clear ne saute pas le choix qui suit', () => {
    const r = run([msg('a'), { action: 'blablalib:clear' }, { action: 'blablalib:choice', choices: [{ name: 'x' }] }, msg('z')]);
    r.key(256);
    pump(r, 3);
    expect(r.screen!.actionIndex).toBe(2);
    expect(r.screen!.currentFadingTime).toBe(-1);
  });

  it('un dialogue qui finit par une action non bloquante se ferme au tick suivant', () => {
    const r = run([msg('a'), { action: 'blablalib:image', id: 0, image: 'a:b.png', width: 16, height: 16 }, { action: 'blablalib:sound', sound: 'a' }]);
    clickThrough(r);
    expect(r.screen!.currentFadingTime).toBe(-1);
    pump(r);
    expect(r.screen!.currentFadingTime).toBeGreaterThanOrEqual(0);
    expect(r.events.filter((e) => e.kind === 'sound')).toHaveLength(1);
  });
});

describe('press_enter', () => {
  const press = { action: 'blablalib:press_enter' };
  it('ne cède qu’à la touche Entrée', () => {
    const r = run([press, msg('x')]);
    expect(r.waitingForEnter).toBe(true);
    r.click(10, 10);
    r.key(32);
    r.key(256);
    pump(r, 5);
    expect(r.screen!.actionIndex).toBe(0);
    r.key(257);
    pump(r);
    expect(r.screen!.actionIndex).toBe(1);
    expect(r.waitingForEnter).toBe(false);
  });
  it('garde les éléments non bloquants à l’écran', () => {
    const r = run([{ action: 'blablalib:image', id: 0, image: 'a:b.png', width: 16, height: 16 }, press]);
    pump(r, 5);
    expect(r.done).toBe(false);
    expect(r.screen!.currentActions.map((a) => a.cls)).toEqual(['image', 'press_enter']);
  });
  it('l’avance rapide sait la franchir', () => {
    const r = run([press, msg('x'), msg('y')]);
    expect(r.fastForwardTo(2)).toBe(true);
  });
  it('l’avance rapide s’arrête dessus sans la valider', () => {
    const r = run([msg('a'), press, msg('b')]);
    expect(r.fastForwardTo(1)).toBe(true);
    pump(r, 5);
    expect(r.screen!.actionIndex).toBe(1);
    expect(r.waitingForEnter).toBe(true);
  });
});

describe('cinématique', () => {
  const cut = (wait_for_end?: boolean) => ({ action: 'blablalib:play_cutscene', cutscene: 'a:b', ...(wait_for_end ? { wait_for_end } : {}) });
  it('avec attente, elle bloque jusqu’à la fin simulée', () => {
    const r = run([cut(true), msg('x')]);
    pump(r, 59);
    expect(r.screen!.actionIndex).toBe(0);
    pump(r);
    expect(r.screen!.actionIndex).toBe(1);
  });
  it('sans attente, le message qui suit est sauté', () => {
    const r = run([cut(), msg('a'), msg('b')]);
    expect(r.screen!.actionIndex).toBe(1);
    pump(r);
    expect(r.screen!.actionIndex).toBe(2);
  });
});

describe('choix et enchaînements', () => {
  const choice = (next?: string, save?: string) => ({
    action: 'blablalib:choice',
    choices: [{ name: 'Go', ...(next ? { next } : {}), ...(save ? { save } : {}) }],
  });
  const clickFirstButton = (r: PreviewRun) => r.click(320, 180 - 20 + 10);

  it('ouvre le dialogue suivant si next et save sont présents', () => {
    const r = run([choice('t:b', 't:b')], { 't:b': [msg('suite')] });
    clickFirstButton(r);
    expect(r.screen!.dialogueId).toBe('t:b');
  });
  it('sans save, le clic ferme le dialogue au lieu de continuer (contrairement à la doc)', () => {
    const r = run([choice('t:b')], { 't:b': [msg('suite')] });
    clickFirstButton(r);
    pump(r, 2);
    expect(r.screen!.dialogueId).toBe('t:a');
    expect(r.screen!.currentFadingTime).toBeGreaterThanOrEqual(0);
  });
  it('next_dialogue enchaîne dès qu’on l’atteint', () => {
    const r = run([msg('a'), { action: 'blablalib:next_dialogue', dialogue: 't:b' }], { 't:b': [msg('b')] });
    clickThrough(r);
    expect(r.screen!.dialogueId).toBe('t:b');
  });
  it('next_dialogue vers un id inconnu bloque l’écran', () => {
    const r = run([msg('a'), { action: 'blablalib:next_dialogue', dialogue: 't:nope' }]);
    clickThrough(r);
    pump(r, 5);
    expect(r.stuck).toBe(true);
    r.key(256);
    expect(r.stuck).toBe(true);
  });
  it('next_dialogue fonctionne aussi en première action', () => {
    const r = run([{ action: 'blablalib:next_dialogue', dialogue: 't:b' }], { 't:b': [msg('b')] });
    expect(r.screen!.dialogueId).toBe('t:b');
  });
  it('une boucle de next_dialogue ne bloque pas la preview', () => {
    const r = run([{ action: 'blablalib:next_dialogue', dialogue: 't:a' }]);
    expect(r.crash).toContain('Boucle');
  });
});

describe('image', () => {
  const capture = () => {
    const images: ImageDraw[] = [];
    const p: Painter = { ...NULL_PAINTER, image: (d) => void images.push(d) };
    return { images, p };
  };
  const image = (extra: RawAction = {}) => ({ action: 'blablalib:image', id: 0, image: 'a:b.png', width: 100, height: 100, x: 50, y: 40, ...extra });

  it('x/y sont des pourcentages et le rapport largeur / hauteur est conservé', () => {
    const { images, p } = capture();
    const r = run([image({ width: 200, height: 100 }), msg('x')]);
    r.render(p, 0, 0, 1);
    const d = images[0];
    expect(d.x).toBe(320);
    expect(d.y).toBe(144);
    expect(d.height * d.scale).toBeCloseTo(180); // moitié de l'écran
    expect(d.width * d.scale).toBeCloseTo(360);
  });
  it('animation de position : l’alpha de l’image ne change pas', () => {
    const { images, p } = capture();
    const r = run([image({ alpha: 100 }), { action: 'blablalib:image_move', id: 0, position: { time: 10, y_start: 200, y_end: 40 } }, msg('x')]);
    r.render(p, 0, 0, 1);
    r.render(p, 0, 0, 1);
    expect(images.at(-1)!.alpha).toBeCloseTo(100 / 255);
  });
  it('animation de couleur : opacité interpolée', () => {
    const { images, p } = capture();
    const r = run([image(), { action: 'blablalib:image_move', id: 0, color: { time: 10, from: '#FFFFFF00', to: '#FFFFFFFF' } }, msg('x')]);
    for (let i = 0; i < 6; i++) r.render(p, 0, 0, 1);
    expect(images.at(-1)!.alpha).toBeCloseTo(0.4, 1);
  });
  it('une piste courte s’arrête sur sa valeur de fin', () => {
    const { images, p } = capture();
    const r = run([
      image(),
      { action: 'blablalib:image_move', id: 0, position: { time: 5, y_start: 200, y_end: 40 }, scale: { time: 20, from: 1, to: 2 } },
      msg('x'),
    ]);
    for (let i = 0; i < 30; i++) r.render(p, 0, 0, 1);
    expect(images.at(-1)!.y).toBeCloseTo(360 * 0.4);
    expect(images.at(-1)!.scale).toBeCloseTo(1.8 * 2);
  });
  it('easing inconnu : remplacé par linear', () => {
    const r = run([image(), { action: 'blablalib:image_move', id: 0, scale: { time: 5, from: 1, to: 2, easing: 'nope' } }, msg('x')]);
    r.render(NULL_PAINTER, 0, 0, 1);
    expect(r.crash).toBeNull();
  });
});

describe('texte libre', () => {
  it('fait un vrai fondu et applique la rotation', () => {
    const calls: { a: number; rotation?: number }[] = [];
    const p: Painter = { ...NULL_PAINTER, text: (s, _x, _y, c, _sh, _sc, rotation) => void (s === 'hi' && calls.push({ a: c.a, rotation })) };
    const r = run([{ action: 'blablalib:text', text: 'hi', fade_in_time: 10, hold_time: 5, fade_out_time: 10, rotation: 45 }, msg('x')]);
    for (let i = 0; i < 30; i++) r.render(p, 0, 0, 1);
    const alphas = calls.map((c) => c.a);
    expect(Math.max(...alphas)).toBe(255);
    expect(alphas[1]).toBeLessThan(alphas[4]);
    expect(alphas.at(-1)).toBeLessThan(128);
    expect(calls[0].rotation).toBe(45);
  });
  it('sans x ni y, il est centré', () => {
    let pos = { x: 0, y: 0 };
    const p: Painter = { ...NULL_PAINTER, text: (s, x, y) => void (s === 'hi' && (pos = { x, y })) };
    const r = run([{ action: 'blablalib:text', text: 'hi' }, msg('x')]);
    for (let i = 0; i < 3; i++) r.render(p, 0, 0, 1);
    expect(pos.y).toBe(180);
    expect(pos.x).toBeGreaterThan(300);
  });
});

describe('simulation réseau', () => {
  const six = [msg('1'), msg('2'), msg('3'), msg('4'), msg('5'), msg('6')];
  it('envoie par lots de 3 actions bloquantes', () => {
    const r = run(six, {}, true);
    pump(r, 2);
    expect(r.screen!.dialogueActions).toHaveLength(3);
  });
  it('un lot reçu ne relance plus l’action en cours', () => {
    const r = run(six, {}, true);
    pump(r, 3);
    r.click(0, 0);
    pump(r, 6);
    expect(r.screen!.actionIndex).toBe(1);
    expect(r.screen!.currentActions).toHaveLength(1);
    expect(r.screen!.dialogueActions.length).toBeGreaterThan(3);
  });
  it('joue tout le dialogue, commandes comprises', () => {
    const r = run([...six, command('say fin'), msg('7')], {}, true);
    for (let i = 0; i < 200 && !r.done; i++) {
      pump(r);
      r.click(0, 0);
    }
    expect(r.done).toBe(true);
    expect(commands(r)).toEqual(['/say fin']);
  });
});

describe('avance rapide', () => {
  it('amène l’écran à l’action demandée', () => {
    const r = run([msg('a'), wait(5), msg('b'), msg('c')]);
    expect(r.fastForwardTo(2)).toBe(true);
    expect(r.screen!.actionIndex).toBe(2);
  });
  it('s’arrête sur un choix', () => {
    const r = run([{ action: 'blablalib:choice', choices: [{ name: 'x' }] }, msg('b')]);
    expect(r.fastForwardTo(1)).toBe(false);
  });
});

describe('exemples du mod', () => {
  const file = JSON.parse(readFileSync('public/sample/data/blablalib/dialogues/dialogues.json', 'utf8'));
  const lang = JSON.parse(readFileSync('public/sample/assets/blablalib/lang/en_us.json', 'utf8'));
  const w: SimWorld = {
    dialogue: (id) => (id.startsWith('blablalib:') ? file[id.slice(10)] : undefined),
    speakers: file.speakers,
    translate: (k) => lang[k] ?? k,
  };
  for (const key of Object.keys(file).filter((k) => k !== 'speakers')) {
    it(`joue ${key} sans planter`, () => {
      const r = new PreviewRun(w, `blablalib:${key}`, opts);
      for (let i = 0; i < 2000 && !r.done; i++) {
        pump(r);
        r.key(32);
        const c = r.screen?.currentActions.find((a) => a.cls === 'choice');
        if (c) r.click(320, 180 - 40 + 10);
      }
      expect(r.crash).toBeNull();
      expect(r.done).toBe(true);
    });
  }
  it('dogcheck : sons et commandes, une fois chacun', () => {
    const r = new PreviewRun(w, 'blablalib:dogcheck', opts);
    for (let i = 0; i < 2000 && !r.done; i++) {
      pump(r);
      r.key(32);
    }
    expect(r.events.filter((e) => e.kind === 'sound').map((e) => e.text)).toContain('Son : entity.wolf.whine');
    expect(commands(r).filter((c) => c.startsWith('/title'))).toHaveLength(1);
    expect(commands(r).filter((c) => c.startsWith('/tp'))).toHaveLength(1);
  });
});

describe('validation', () => {
  it('compte les lignes comme en jeu', async () => {
    const { messageLines, MESSAGE_MAX_WIDTH } = await import('../model/validate');
    const lines = messageLines(`[b]${'mot '.repeat(40)}[/b]`);
    expect(lines.length).toBeGreaterThan(1);
    expect(Math.max(...lines)).toBeLessThanOrEqual(MESSAGE_MAX_WIDTH);
  });
  it('remarque les noms de la doc et propose le renommage', async () => {
    const { validateProject } = await import('../model/validate');
    const { parseDialogueFile } = await import('../model/project');
    const file = parseDialogueFile(
      JSON.stringify({
        speakers: [],
        a: [
          { action: 'blablalib:next', next: 'x:y' },
          { action: 'blablalib:move_image', id: 0 },
          { action: 'blablalib:clear', cleared_action: 'blablalib:fade' },
          { action: 'blablalib:text', text: 'hi', x: 0.5, y: 0.5 },
          { action: 'blablalib:press_enter' },
          { action: 'blablalib:choice', choices: [{ name: 'A', next: 'x:y' }] },
        ],
      }),
      'x',
      'a.json',
    );
    const problems = validateProject({ name: '', files: [file], langs: [], extensions: [] }, new Set(), 'en_us');
    const texts = problems.map((p) => p.message).join('\n');
    expect(texts).toContain('blablalib:next');
    expect(texts).toContain('blablalib:move_image');
    expect(texts).toContain('cleared_actions');
    expect(texts).toContain('en %');
    expect(texts).toContain('« next » ET « save »');
    expect(texts).toContain('registerDefaultActions');
    const fix = problems.find((p) => p.message.includes('blablalib:next'))!.fix!;
    expect(fix.apply({ action: 'blablalib:next', next: 'x:y' })).toEqual({ action: 'blablalib:next_dialogue', dialogue: 'x:y' });
  });
  it('ne signale plus les bugs corrigés dans le mod', async () => {
    const { validateProject } = await import('../model/validate');
    const { parseDialogueFile } = await import('../model/project');
    const speakers = [{ id: 'x:s', name: 'S', color: '#FFFFFFFF', sounds: [] }];
    const file = parseDialogueFile(
      JSON.stringify({
        speakers,
        a: [
          { action: 'blablalib:clear' },
          { action: 'blablalib:message', speaker: 'x:s', text: 'mot '.repeat(40) },
          { action: 'blablalib:command', command: 'say a' },
          { action: 'blablalib:timings', speed: 1, wait: 4 },
          { action: 'blablalib:fade', from: 'black', to: '#000000', time: 5 },
          { action: 'blablalib:hide_ui' },
          { action: 'blablalib:wait', time: 1 },
        ],
      }),
      'x',
      'a.json',
    );
    expect(validateProject({ name: '', files: [file], langs: [], extensions: [] }, new Set(), 'en_us')).toEqual([]);
  });
  it('fichier sans speakers : la clé est ajoutée à l’écriture', async () => {
    const { parseDialogueFile, serializeFile } = await import('../model/project');
    const f = parseDialogueFile('{"a":[]}', 'x', 'a.json');
    expect(JSON.parse(serializeFile(f))).toEqual({ speakers: [], a: [] });
  });
  it('lit le JSON tolérant de Gson sans abîmer les chaînes', async () => {
    const { parseLenientJson } = await import('../model/project');
    expect(parseLenientJson('{ // note\n "a": "http://x,]", "b": [1, 2,], }')).toEqual({ a: 'http://x,]', b: [1, 2] });
  });
});
