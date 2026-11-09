// Portage ligne à ligne de DialogueScreen, DialogueManager, DialogueLoader et des DialogueAction,
// d'après BlablaLib 2.0.2 et LibLib 0.2.2. Volontairement fidèle, bugs compris : la preview doit
// montrer ce que le jeu fait réellement. Toute correction de comportement doit d'abord être faite
// dans le mod.
//
// Trois écarts volontaires, marqués « Écart » : des erreurs de ces versions qui rendraient la preview
// inutilisable alors que l'intention est claire (voir aussi colorFromString dans color.ts).

import { combineEffects, flattenBBCode, layoutChars, type CharLayout, type StyledChar } from './bbcode';
import { colorFromString, colorFromStringOr, lerpColor, rgba, TRANSPARENT, WHITE, type Color } from './color';
import { EASINGS, type Easing } from './easing';
import { textWidth } from './font';
import { t as tr } from '../i18n';

export type RawAction = Record<string, unknown>;

export interface SimSpeaker {
  id: string;
  name: string;
  color: string;
  sounds: string[];
}

export interface SimWorld {
  /** Les actions d'un dialogue, par identifiant normalisé `ns:clé`. */
  dialogue(id: string): RawAction[] | undefined;
  speakers: SimSpeaker[];
  /** Component.translatable(key).getString() : la clé elle-même si aucune traduction. */
  translate(key: string): string;
}

export interface GlyphDraw {
  ch: string;
  x: number;
  y: number;
  color: Color;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  shadow: boolean;
  scale?: number;
  rotation?: number;
}

export interface ImageDraw {
  texture: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  width: number;
  height: number;
  alpha: number;
}

export interface ButtonDraw {
  x: number;
  y: number;
  width: number;
  height: number;
  hovered: boolean;
  label: string;
  clip: [number, number, number, number];
}

export interface Painter {
  fill(x0: number, y0: number, x1: number, y1: number, c: Color): void;
  gradient(x0: number, y0: number, x1: number, y1: number, top: Color, bottom: Color): void;
  glyph(g: GlyphDraw): void;
  text(s: string, x: number, y: number, c: Color, shadow: boolean, scale?: number, rotation?: number): void;
  triangle(x: number, y: number): void;
  image(d: ImageDraw): void;
  button(d: ButtonDraw): void;
}

export const NULL_PAINTER: Painter = {
  fill() {},
  gradient() {},
  glyph() {},
  text() {},
  triangle() {},
  image() {},
  button() {},
};

// --- Lecture JSON, mêmes conversions que Gson ------------------------------------------------

const has = (o: RawAction, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  throw new Error(tr('valeur non textuelle : {value}', { value: JSON.stringify(v) }));
}
function asNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  throw new Error(tr('valeur non numérique : {value}', { value: JSON.stringify(v) }));
}
const asInt = (v: unknown) => Math.trunc(asNumber(v));
function asBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  throw new Error(tr('valeur non booléenne : {value}', { value: JSON.stringify(v) }));
}
function asObject(v: unknown): RawAction {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as RawAction;
  throw new Error(tr('objet JSON attendu'));
}

/** ResourceLocation.tryParse : null si invalide, namespace `minecraft` par défaut. */
export function parseResourceLocation(s: string): string | null {
  const i = s.indexOf(':');
  const ns = i >= 0 ? s.slice(0, i) : '';
  const path = i >= 0 ? s.slice(i + 1) : s;
  const namespace = ns === '' ? 'minecraft' : ns;
  if (!/^[a-z0-9_.-]+$/.test(namespace) || !/^[a-z0-9/._-]+$/.test(path)) return null;
  return `${namespace}:${path}`;
}

// --- Actions ----------------------------------------------------------------------------------

export abstract class Action {
  screen!: DialogueScreen;
  /** Position de l'action dans le dialogue, pour la surligner dans l'éditeur. */
  index = -1;
  abstract readonly blocking: boolean;
  abstract readonly skippable: boolean;
  /** Identifie la classe Java (clear ciblé, recherche de l'image...). */
  abstract readonly cls: string;
  setup(screen: DialogueScreen) {
    this.screen = screen;
  }
  step() {}
  draw(_p: Painter, _mx: number, _my: number, _dt: number) {}
  mouseClicked(_x: number, _y: number, _button: number) {}
  keyPressed(_key: number) {}
  completed(_server: Server) {}
  referencedSpeaker(): string | null {
    return null;
  }
}

/** Largeur passée à setTextWidth par DialogueMessage.setup. */
export const MESSAGE_TEXT_WIDTH = 270;

class RichText {
  private tick = 0;
  chars: StyledChar[];
  layout: CharLayout;
  drawn = -1;
  constructor(text: string, width: number) {
    this.chars = flattenBBCode(text);
    this.layout = layoutChars(this.chars, width);
  }
  lastDrawnChar(): string {
    if (this.drawn > -1 && this.drawn < this.chars.length) return this.chars[this.drawn].ch;
    return this.chars[this.chars.length - 1].ch;
  }
  draw(p: Painter, x: number, y: number, dt: number) {
    this.tick += dt;
    const time = this.tick * 0.05;
    for (let i = 0; i < this.chars.length; i++) {
      if (this.drawn > -1 && i > this.drawn) break;
      const c = this.chars[i];
      const pos = this.layout.positions[i];
      if (!pos) continue;
      const t = combineEffects(c.effects, i, time, c.color ?? WHITE);
      p.glyph({
        ch: c.ch,
        x: x + pos.x + t.offsetX,
        y: y + pos.y + t.offsetY,
        color: t.color,
        bold: c.bold,
        italic: c.italic,
        underline: c.underline,
        strike: c.strike,
        shadow: true,
        scale: t.scale,
        rotation: t.rotation,
      });
    }
  }
}

export class MessageAction extends Action {
  readonly cls = 'message';
  readonly blocking = true;
  readonly skippable = true;
  speakerId: string | null;
  line: string;
  rich!: RichText;
  charIndex = 0;
  tickCount = 0;
  characterTimer = 0;
  pauseTimer = 0;

  constructor(o: RawAction) {
    super();
    this.speakerId = has(o, 'speaker') ? parseResourceLocation(asString(o.speaker)) : null;
    this.line = has(o, 'text') ? asString(o.text) : '';
  }
  referencedSpeaker() {
    return this.speakerId;
  }
  private lastCharIndex() {
    return this.rich.chars.length - 1;
  }
  get fullyDrawn() {
    return this.charIndex >= this.lastCharIndex();
  }
  setup(screen: DialogueScreen) {
    super.setup(screen);
    // La traduction se fait désormais ici, côté client.
    this.rich = new RichText(screen.world.translate(this.line), MESSAGE_TEXT_WIDTH);
    this.rich.drawn = 0;
    if (this.line.length === 0) screen.queueAdvanceDialogue();
  }
  step() {
    this.tickCount++;
    if (this.pauseTimer > 0) {
      this.pauseTimer--;
      return;
    }
    if (++this.characterTimer < this.screen.dialogueSpeed) return;
    if (this.fullyDrawn) return;

    this.characterTimer = 0;
    this.charIndex++;
    this.rich.drawn = this.charIndex;

    const c = this.rich.lastDrawnChar();
    if (c === '.' || c === '!' || c === '?') {
      this.pauseTimer = this.screen.dialogueSpeed * this.screen.waitMultiplier;
    }
  }
  draw(p: Painter, _mx: number, _my: number, dt: number) {
    const boxWidth = 300;
    const boxHeight = 80;
    const boxX = Math.trunc((this.screen.width - boxWidth) / 2);
    const boxY = this.screen.height - boxHeight - 20;
    const speaker = this.screen.getSpeaker(this.speakerId);

    p.fill(boxX, boxY, boxX + boxWidth, boxY + boxHeight, rgba(0, 0, 0, 0x80));
    p.text(this.screen.world.translate(speaker.name), boxX + 10, boxY + 5, speaker.colorValue, false);
    this.rich.draw(p, boxX + 10, boxY + 20, dt);
    if (this.fullyDrawn && this.tickCount % 20 < 10) {
      p.triangle(boxX + boxWidth - 15, boxY + boxHeight - 15);
    }
  }
  private advanceOrReveal() {
    if (this.fullyDrawn) this.screen.queueAdvanceDialogue();
    else {
      this.charIndex = this.lastCharIndex();
      this.rich.drawn = this.charIndex;
    }
  }
  mouseClicked() {
    this.advanceOrReveal();
  }
  keyPressed(key: number) {
    if (key === 257 || key === 32) this.advanceOrReveal();
  }
}

export interface ChoiceOption {
  name: string;
  next: string | null;
  save: string | null;
  action: string;
}

const CHOICE_W = 140;
const CHOICE_H = 20;

export class ChoiceAction extends Action {
  readonly cls = 'choice';
  readonly blocking = true;
  readonly skippable = false;
  options: ChoiceOption[] = [];

  constructor(o: RawAction) {
    super();
    if (['option1', 'next1', 'save1', 'action1', 'option2', 'next2', 'save2', 'action2'].every((k) => has(o, k))) {
      for (const n of [1, 2]) {
        this.options.push({
          name: asString(o[`option${n}`]),
          next: parseResourceLocation(asString(o[`next${n}`])),
          save: parseResourceLocation(asString(o[`save${n}`])),
          action: asString(o[`action${n}`]),
        });
      }
    }
    if (Array.isArray(o.choices)) {
      for (const el of o.choices) {
        if (!el || typeof el !== 'object' || Array.isArray(el)) continue;
        const c = el as RawAction;
        if (!has(c, 'name')) continue;
        this.options.push({
          name: asString(c.name),
          next: has(c, 'next') ? parseResourceLocation(asString(c.next)) : null,
          save: has(c, 'save') ? parseResourceLocation(asString(c.save)) : null,
          action: has(c, 'action') ? asString(c.action) : '',
        });
      }
    }
  }
  private layout() {
    const s = this.screen;
    const xPos = s.width * 0.5 - CHOICE_W * 0.5;
    const yPos = s.height * 0.5 - CHOICE_H * this.options.length;
    const clip: [number, number, number, number] = [xPos, yPos, xPos + CHOICE_W + 2, yPos + (CHOICE_H + 8) * this.options.length];
    return this.options.map((option, i) => {
      const label = s.world.translate(option.name);
      // GuiButton : largeur minimale = texte + 10 de marge. Le conteneur (142 px) coupe le surplus.
      const width = Math.max(CHOICE_W, textWidth(label) + 10);
      const height = CHOICE_H;
      const cx = xPos + width * 0.5;
      const cy = yPos + i * (height + 4) + height * 0.5;
      return { option, label, width, height, x: cx - width / 2, y: cy - height / 2, clip };
    });
  }
  draw(p: Painter, mx: number, my: number) {
    for (const b of this.layout()) {
      const hovered = mx >= b.x && mx <= b.x + b.width && my >= b.y && my <= b.y + b.height;
      p.button({ x: b.x, y: b.y, width: b.width, height: b.height, hovered, label: b.label, clip: b.clip });
    }
  }
  mouseClicked(x: number, y: number, button: number) {
    if (button !== 0) return;
    for (const b of this.layout()) {
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
        this.handleClick(b.option);
        return;
      }
    }
  }
  handleClick(option: ChoiceOption) {
    this.screen.run.emit('choice', tr('Choix : « {name} »', { name: this.screen.world.translate(option.name) }), this.index);
    if (option.next !== null && option.save !== null) this.screen.run.sendChoice(option);
    this.screen.queueEndDialogue();
  }
}

export class TextAction extends Action {
  readonly cls = 'text';
  readonly blocking = false;
  readonly skippable = true;
  text = '';
  fadeIn = 0;
  hold = 5;
  fadeOut = 0;
  x = 50;
  y = 50;
  rotation = 0;
  scale = 1;
  color: Color | null = WHITE;
  alignment: 'left' | 'center' | 'right' = 'center';
  state: 'in' | 'hold' | 'out' | 'gone' = 'in';
  alpha = 0;
  currentTime = 0;

  constructor(o: RawAction) {
    super();
    if (has(o, 'text')) this.text = asString(o.text);
    if (has(o, 'fade_in_time')) this.fadeIn = asNumber(o.fade_in_time);
    if (has(o, 'hold_time')) this.hold = asNumber(o.hold_time);
    if (has(o, 'fade_out_time')) this.fadeOut = asNumber(o.fade_out_time);
    if (has(o, 'x')) this.x = asNumber(o.x);
    if (has(o, 'y')) this.y = asNumber(o.y);
    if (has(o, 'rotation')) this.rotation = asNumber(o.rotation);
    if (has(o, 'scale')) this.scale = asNumber(o.scale);
    if (has(o, 'color')) this.color = colorFromString(asString(o.color));
    if (has(o, 'alignment')) {
      const a = asString(o.alignment);
      this.alignment = a === 'center' ? 'center' : a === 'right' ? 'right' : 'left';
    }
  }
  draw(p: Painter, _mx: number, _my: number, dt: number) {
    if (this.state === 'gone') return;
    this.alpha = 0;
    const pct = (time: number, total: number) => {
      const v = time / total;
      return Number.isNaN(v) ? NaN : Math.min(1, Math.max(0, v));
    };
    if (this.state === 'in') {
      this.alpha = Math.trunc(pct(this.currentTime, this.fadeIn) * 255) || 0;
      if (this.currentTime >= this.fadeIn) {
        this.currentTime = 0;
        this.state = 'hold';
      }
    } else if (this.state === 'hold') {
      this.alpha = 255;
      if (this.currentTime >= this.hold) {
        this.currentTime = 0;
        this.state = 'out';
      }
    } else if (this.state === 'out') {
      this.alpha = 255 - (Math.trunc(pct(this.currentTime, this.fadeOut) * 255) || 0);
      if (this.currentTime >= this.fadeOut) {
        this.currentTime = 0;
        this.state = 'gone';
        this.alpha = 0;
      }
    }
    if (!this.color) throw new Error(tr('DialogueText : couleur invalide (color est null)'));
    const label = this.screen.world.translate(this.text);
    const s = this.screen;
    const w = textWidth(label) * this.scale;
    const base = s.width * (this.x * 0.01);
    const xPos = Math.trunc(this.alignment === 'left' ? base : this.alignment === 'right' ? base - w : base - w * 0.5);
    const yPos = Math.trunc(s.height * (this.y * 0.01));
    const a = Math.trunc((this.alpha * this.color.a) / 255);
    if (a >= 8) p.text(label, xPos, yPos, { ...this.color, a }, true, this.scale, this.rotation);
    this.currentTime += dt;
  }
}

export class ImageAction extends Action {
  readonly cls = 'image';
  readonly blocking = false;
  readonly skippable = true;
  imageId = 0;
  image: string | null = null;
  width = 0;
  height = 0;
  x = 0;
  y = 0;
  rotation = 0;
  scale = 1;
  alpha = 255;

  constructor(o: RawAction) {
    super();
    if (has(o, 'id')) this.imageId = asInt(o.id);
    if (has(o, 'image')) this.image = parseResourceLocation(asString(o.image));
    if (has(o, 'width')) this.width = asInt(o.width);
    if (has(o, 'height')) this.height = asInt(o.height);
    if (has(o, 'x')) this.x = asNumber(o.x);
    if (has(o, 'y')) this.y = asNumber(o.y);
    if (has(o, 'rotation')) this.rotation = asNumber(o.rotation);
    if (has(o, 'scale')) this.scale = asNumber(o.scale);
    if (has(o, 'alpha')) this.alpha = asInt(o.alpha);
  }
  draw(p: Painter) {
    if (this.alpha <= 8) return;
    if (this.alpha >= 255) this.alpha = 255;
    if (!this.image) throw new Error(tr('DialogueImage : aucune image (image est null)'));
    const s = this.screen;
    p.image({
      texture: this.image,
      x: s.width * this.x * 0.01,
      y: s.height * this.y * 0.01,
      // Hauteur à l'écran : moitié de l'écran * scale, largeur proportionnelle.
      scale: ((s.height * 0.5) / this.height) * this.scale,
      rotation: this.rotation,
      width: this.width,
      height: this.height,
      alpha: this.alpha / 255,
    });
  }
}

interface Anim<T> {
  time: number;
  start: T | null;
  end: T | null;
  easing: Easing;
}

function readAnim<T>(raw: RawAction, startKey: string, endKey: string, parse: (v: unknown) => T | null): Anim<T> {
  return {
    time: has(raw, 'time') ? asNumber(raw.time) : 0,
    start: has(raw, startKey) ? parse(raw[startKey]) : null,
    end: has(raw, endKey) ? parse(raw[endKey]) : null,
    // Easings.get renvoie LINEAR pour un nom inconnu.
    easing: has(raw, 'easing') ? (EASINGS[asString(raw.easing)] ?? EASINGS.linear) : EASINGS.linear,
  };
}
const NO_ANIM: Anim<never> = { time: 0, start: null, end: null, easing: EASINGS.linear };

export class MoveImageAction extends Action {
  readonly cls = 'image_move';
  readonly blocking = false;
  readonly skippable = true;
  imageId = 0;
  x: Anim<number> = NO_ANIM;
  y: Anim<number> = NO_ANIM;
  rot: Anim<number> = NO_ANIM;
  scl: Anim<number> = NO_ANIM;
  col: Anim<Color> = NO_ANIM;
  currentTime = 0;

  constructor(o: RawAction) {
    super();
    if (has(o, 'id')) this.imageId = asInt(o.id);
    if (has(o, 'position')) {
      const r = asObject(o.position);
      this.x = readAnim(r, 'x_start', 'x_end', asNumber);
      this.y = readAnim(r, 'y_start', 'y_end', asNumber);
    }
    if (has(o, 'rotation')) this.rot = readAnim(asObject(o.rotation), 'from', 'to', asNumber);
    if (has(o, 'scale')) this.scl = readAnim(asObject(o.scale), 'from', 'to', asNumber);
    if (has(o, 'color')) this.col = readAnim(asObject(o.color), 'from', 'to', (v) => colorFromString(asString(v)));
  }
  maxTime() {
    return Math.max(this.x.time, this.rot.time, this.scl.time, this.col.time);
  }
  private num(a: Anim<number>, t: number, current: number) {
    if (a.start === null || a.end === null) return current;
    const progress = a.easing(Math.min(1, t / a.time));
    return a.start + (a.end - a.start) * progress;
  }
  draw(_p: Painter, _mx: number, _my: number, dt: number) {
    if (this.currentTime > this.maxTime()) return;
    const image = this.screen.currentActions.find((a) => a instanceof ImageAction && a.imageId === this.imageId) as
      | ImageAction
      | undefined;
    if (!image) return;
    const t = this.currentTime;
    image.x = this.num(this.x, t, image.x);
    image.y = this.num(this.y, t, image.y);
    image.rotation = this.num(this.rot, t, image.rotation);
    image.scale = this.num(this.scl, t, image.scale);
    if (this.col.start && this.col.end) {
      image.alpha = lerpColor(this.col.start, this.col.end, this.col.easing(Math.min(1, t / this.col.time))).a;
    }
    this.currentTime += dt;
  }
}

export class FadeAction extends Action {
  readonly cls = 'fade';
  readonly blocking = false;
  readonly skippable = true;
  from: Color | null = null;
  to: Color | null = null;
  time = 0;
  elapsed = 0;

  constructor(o: RawAction) {
    super();
    if (has(o, 'from')) this.from = colorFromStringOr(asString(o.from), TRANSPARENT);
    if (has(o, 'to')) this.to = colorFromStringOr(asString(o.to), TRANSPARENT);
    if (has(o, 'time')) this.time = asNumber(o.time);
  }
  draw(p: Painter, _mx: number, _my: number, dt: number) {
    this.elapsed += dt;
    const v = this.elapsed / this.time;
    const pct = Number.isNaN(v) ? NaN : Math.min(1, Math.max(0, v));
    if (!this.from || !this.to) throw new Error(tr('DialogueFading : "from" ou "to" manquant (couleur null)'));
    p.fill(0, 0, this.screen.width, this.screen.height, lerpColor(this.from, this.to, pct));
  }
}

export class ClearAction extends Action {
  readonly cls = 'clear';
  readonly blocking = true;
  readonly skippable = true;
  cleared: string | null = null;

  constructor(o: RawAction) {
    super();
    if (has(o, 'cleared_actions')) this.cleared = parseResourceLocation(asString(o.cleared_actions));
  }
  setup(screen: DialogueScreen) {
    super.setup(screen);
    if (this.cleared !== null) screen.clearActionsOf(this.cleared);
    else screen.clearActions();
    screen.queueAdvanceDialogue();
  }
}

export class PressEnterAction extends Action {
  readonly cls = 'press_enter';
  readonly blocking = true;
  readonly skippable = false;
  keyPressed(key: number) {
    if (key === 257) this.screen.queueAdvanceDialogue();
  }
}

export class NextAction extends Action {
  readonly cls = 'next_dialogue';
  readonly blocking = true;
  readonly skippable = false;
  next: string | null = null;

  constructor(o: RawAction) {
    super();
    if (has(o, 'set')) this.next = parseResourceLocation(asString(o.set));
    if (has(o, 'dialogue')) this.next = parseResourceLocation(asString(o.dialogue));
  }
  completed(server: Server) {
    server.openDialogue(this.next);
  }
}

export class WaitAction extends Action {
  readonly cls = 'wait';
  readonly blocking = true;
  readonly skippable = true;
  time = 0;
  current = 0;

  constructor(o: RawAction) {
    super();
    if (has(o, 'time')) this.time = asNumber(o.time);
  }
  step() {
    this.current++;
    if (this.current >= this.time) this.screen.queueAdvanceDialogue();
  }
}

export class TimingsAction extends Action {
  readonly cls = 'timings';
  readonly blocking = true;
  readonly skippable = false;
  speed = 1;
  wait = 8;

  constructor(o: RawAction) {
    super();
    if (has(o, 'speed')) this.speed = asInt(o.speed);
    if (has(o, 'wait')) this.wait = asInt(o.wait);
  }
  setup(screen: DialogueScreen) {
    this.screen = screen;
    screen.dialogueSpeed = this.speed;
    screen.waitMultiplier = this.wait;
    screen.queueAdvanceDialogue();
  }
}

export class SoundAction extends Action {
  readonly cls = 'sound';
  readonly blocking = false;
  readonly skippable = true;
  sound: string | null = null;
  pitch = 1;
  volume = 1;

  constructor(o: RawAction) {
    super();
    if (has(o, 'sound')) this.sound = asString(o.sound);
    if (has(o, 'pitch')) this.pitch = asNumber(o.pitch);
    if (has(o, 'volume')) this.volume = asNumber(o.volume);
  }
  setup(screen: DialogueScreen) {
    super.setup(screen);
    if (this.sound === null) throw new Error(tr('DialogueSound : aucun son (ResourceLocation.tryParse(null))'));
    const opts = this.pitch !== 1 || this.volume !== 1 ? ` (pitch ${this.pitch}, volume ${this.volume})` : '';
    screen.run.emit('sound', tr('Son : {sound}{options}', { sound: this.sound, options: opts }), this.index);
  }
}

export class CommandAction extends Action {
  readonly cls = 'command';
  readonly blocking = true;
  readonly skippable = false;
  command: string | null = null;

  constructor(o: RawAction) {
    super();
    if (has(o, 'command')) this.command = asString(o.command);
  }
  setup(screen: DialogueScreen) {
    super.setup(screen);
    screen.queueAdvanceDialogue();
  }
  completed(server: Server) {
    if (this.command !== null) server.run.emit('command', `/${this.command.replace(/<PLAYER>/g, tr('Joueur'))}`, this.index);
  }
}

export class NpcAction extends Action {
  readonly cls = 'npc';
  readonly blocking = true;
  readonly skippable = false;
  npc: number;
  variable: string;
  type: string;
  value: unknown;

  constructor(o: RawAction) {
    super();
    this.npc = has(o, 'npc') ? asInt(o.npc) : -1;
    this.variable = asString(o.variable);
    this.type = asString(o.type);
    this.value = o.value;
    const t = this.type;
    if (!['bool', 'number', 'string', 'resource_location', 'unknown'].includes(t)) throw new Error(tr('Type de variable inconnu : {type}', { type: t }));
    if (t === 'bool' && typeof this.value !== 'boolean') throw new Error(tr('valeur bool attendue'));
    if (t === 'number' && typeof this.value !== 'number') throw new Error(tr('valeur number attendue'));
    if (t === 'string' && typeof this.value !== 'string') throw new Error(tr('valeur string attendue'));
    if (t === 'resource_location' && (typeof this.value !== 'string' || !parseResourceLocation(this.value))) {
      throw new Error(tr('resource_location attendue'));
    }
  }
  setup(screen: DialogueScreen) {
    super.setup(screen);
    screen.queueAdvanceDialogue();
  }
  completed(server: Server) {
    server.run.emit('npc', tr('PNJ #{npc} : {variable} = {value}', { npc: this.npc, variable: this.variable, value: JSON.stringify(this.value) }), this.index);
  }
}

export class QuestStateAction extends Action {
  readonly cls = 'quest_state';
  readonly blocking = true;
  readonly skippable = false;
  quest: string | null = null;
  task: string | null = null;
  state: string | null = null;

  constructor(o: RawAction) {
    super();
    if (has(o, 'quest')) this.quest = parseResourceLocation(asString(o.quest));
    if (has(o, 'task')) this.task = parseResourceLocation(asString(o.task));
    if (has(o, 'state')) this.state = asString(o.state);
  }
  setup(screen: DialogueScreen) {
    super.setup(screen);
    screen.queueAdvanceDialogue();
  }
  completed(server: Server) {
    if (this.state === null) throw new Error(tr('DialogueQuestStateAction : "state" manquant'));
    if (this.state !== '' && this.quest) {
      const target = this.task ? `${this.quest} / tâche ${this.task}` : this.quest;
      server.run.emit('quest', tr('Quête {target} → {state}', { target, state: this.state }), this.index);
    }
  }
}

export const SIMULATED_CUTSCENE_TICKS = 60;

export class PlayCutsceneAction extends Action {
  readonly cls = 'play_cutscene';
  readonly skippable = false;
  cutscene: string | null = null;
  waitForEnd = false;
  remaining = -1;
  get blocking() {
    return this.waitForEnd;
  }

  constructor(o: RawAction) {
    super();
    if (has(o, 'cutscene')) this.cutscene = parseResourceLocation(asString(o.cutscene));
    if (has(o, 'wait_for_end')) this.waitForEnd = asBool(o.wait_for_end);
  }
  setup(screen: DialogueScreen) {
    super.setup(screen);
    if (!this.cutscene) throw new Error(tr('DialoguePlayCutscene : aucune cinématique'));
    screen.run.emit('cutscene', this.waitForEnd
        ? tr('Cinématique : {name} (fin simulée après {n} ticks)', { name: this.cutscene, n: SIMULATED_CUTSCENE_TICKS })
        : tr('Cinématique : {name}', { name: this.cutscene }), this.index);
    if (!this.waitForEnd) {
      screen.queueAdvanceDialogue();
      return;
    }
    this.remaining = SIMULATED_CUTSCENE_TICKS;
    screen.pendingCutscenes.push(this);
  }
}

export class UnknownAction extends Action {
  readonly cls = 'unknown';
  readonly blocking = false;
  readonly skippable = true;
  raw: string;
  constructor(raw: string) {
    super();
    this.raw = raw;
  }
}

type Ctor = (o: RawAction, world: SimWorld) => Action;

/** DialogueManager.registerDefaultActions. */
export const ACTION_CLASSES: Record<string, { cls: string; make: Ctor }> = {
  'blablalib:clear': { cls: 'clear', make: (o) => new ClearAction(o) },
  'blablalib:wait': { cls: 'wait', make: (o) => new WaitAction(o) },
  'blablalib:choice': { cls: 'choice', make: (o) => new ChoiceAction(o) },
  'blablalib:change_set': { cls: 'next_dialogue', make: (o) => new NextAction(o) },
  'blablalib:next_dialogue': { cls: 'next_dialogue', make: (o) => new NextAction(o) },
  'blablalib:fade': { cls: 'fade', make: (o) => new FadeAction(o) },
  'blablalib:message': { cls: 'message', make: (o) => new MessageAction(o) },
  // Écart : DialoguePressEnter existe dans BlablaLib 2.0.2 mais n'est pas enregistrée dans
  // registerDefaultActions. En jeu, ce nom reste pour l'instant une action inconnue.
  'blablalib:press_enter': { cls: 'press_enter', make: () => new PressEnterAction() },
  'blablalib:image': { cls: 'image', make: (o) => new ImageAction(o) },
  'blablalib:credit': { cls: 'text', make: (o) => new TextAction(o) },
  'blablalib:text': { cls: 'text', make: (o) => new TextAction(o) },
  'blablalib:image_move': { cls: 'image_move', make: (o) => new MoveImageAction(o) },
  'blablalib:command': { cls: 'command', make: (o) => new CommandAction(o) },
  'blablalib:sound': { cls: 'sound', make: (o) => new SoundAction(o) },
  'blablalib:timings': { cls: 'timings', make: (o) => new TimingsAction(o) },
  'blablalib:npc': { cls: 'npc', make: (o) => new NpcAction(o) },
  'blablalib:quest_state': { cls: 'quest_state', make: (o) => new QuestStateAction(o) },
  'blablalib:play_cutscene': { cls: 'play_cutscene', make: (o) => new PlayCutsceneAction(o) },
};

/** DialogueLoader.loadDialogue : objets sans `action` ignorés, erreurs de constructeur -> action inconnue. */
export function loadActions(raw: RawAction[], world: SimWorld): Action[] {
  const out: Action[] = [];
  raw.forEach((o, index) => {
    if (!o || typeof o !== 'object' || !has(o, 'action')) return;
    const name = String(o.action);
    const id = parseResourceLocation(name);
    const def = id ? ACTION_CLASSES[id] : undefined;
    let action: Action = new UnknownAction(name);
    if (def) {
      try {
        action = def.make(o, world);
      } catch {
        action = new UnknownAction(name);
      }
    }
    action.index = index;
    out.push(action);
  });
  return out;
}

// --- DialogueScreen ------------------------------------------------------------------------------

const END_FADE = 7.5;
const GRADIENT_TOP = rgba(0, 0, 0, 0x11);
const GRADIENT_BOTTOM = rgba(0, 0, 0, 0xdd);

interface ScreenSpeaker {
  id: string;
  name: string;
  colorValue: Color;
  sounds: string[];
}
const DEFAULT_SPEAKER: ScreenSpeaker = { id: 'blablalib:empty', name: '', colorValue: WHITE, sounds: [] };

export class DialogueScreen {
  advanceAtTickEnd = false;
  speakers: ScreenSpeaker[] = [DEFAULT_SPEAKER];
  currentFadingTime = -1;
  guiVisible = true;
  dialogueActions: Action[] = [];
  dialogueSpeed = 1;
  waitMultiplier = 8;
  currentActions: Action[] = [];
  queueEnd = false;
  actionIndex = 0;
  closed = false;
  ticks = 0;
  pendingCutscenes: PlayCutsceneAction[] = [];
  /** Indices d'actions déjà passées par setup() : sert à l'avance rapide. */
  seen = new Set<number>();
  readonly world: SimWorld;

  constructor(
    readonly run: PreviewRun,
    readonly dialogueId: string,
    readonly width: number,
    readonly height: number,
  ) {
    this.world = run.world;
  }

  receiveSpeakers(list: ScreenSpeaker[]) {
    this.speakers.push(...list);
  }
  receiveActions(list: Action[]) {
    const first = this.dialogueActions.length === 0;
    this.dialogueActions.push(...list);
    if (first && this.dialogueActions.length > 0) {
      this.refreshActions();
      this.run.sendAdvanced(this, this.actionIndex);
    }
  }
  tick() {
    this.ticks++;
    if (this.ticks === 3 && this.dialogueActions.length === 0) this.closed = true; // exitScreenIfEmpty

    for (const c of [...this.pendingCutscenes]) {
      if (--c.remaining <= 0) {
        this.pendingCutscenes.splice(this.pendingCutscenes.indexOf(c), 1);
        this.queueAdvanceDialogue();
      }
    }
    if (this.advanceAtTickEnd) {
      this.advanceAtTickEnd = false;
      this.advanceDialogue();
    }
    if (this.queueEnd) {
      this.queueEnd = false;
      this.endDialogue();
      return;
    }
    if (this.actionIndex >= this.dialogueActions.length) return;
    [...this.currentActions].forEach((a) => a.step());
  }
  render(p: Painter, mx: number, my: number, dt: number) {
    if (this.currentFadingTime >= 0) {
      if (this.currentFadingTime >= END_FADE || !this.guiVisible) {
        this.closed = true;
        return;
      }
      const pct = this.currentFadingTime / END_FADE;
      const top = Math.trunc(pct * Math.trunc(this.height * 0.5));
      p.gradient(0, top, this.width, this.height, lerpColor(GRADIENT_TOP, TRANSPARENT, pct), lerpColor(GRADIENT_BOTTOM, TRANSPARENT, pct));
      this.currentFadingTime += dt;
      return;
    }
    if (this.actionIndex >= this.dialogueActions.length) return;
    if (this.guiVisible) p.gradient(0, 0, this.width, this.height, GRADIENT_TOP, GRADIENT_BOTTOM);
    [...this.currentActions].forEach((a) => a.draw(p, mx, my, dt));
  }
  mouseClicked(x: number, y: number, button: number) {
    if (this.actionIndex < this.dialogueActions.length) {
      [...this.currentActions].forEach((a) => a.mouseClicked(x, y, button));
    }
  }
  keyPressed(key: number) {
    if (key === 256) {
      this.skipDialogue();
      return;
    }
    if (this.actionIndex < this.dialogueActions.length) {
      [...this.currentActions].forEach((a) => a.keyPressed(key));
    }
  }
  queueAdvanceDialogue() {
    this.advanceAtTickEnd = true;
  }
  advanceDialogue() {
    this.actionIndex++;
    if (this.dialogueActions.length === 0 || this.actionIndex >= this.dialogueActions.length) {
      this.endDialogue();
      return;
    }
    this.currentActions = this.currentActions.filter((a) => !a.blocking);
    this.refreshActions();
    this.run.sendAdvanced(this, this.actionIndex);
  }
  refreshActions() {
    for (let i = this.actionIndex; i <= this.dialogueActions.length - 1; i++) {
      const action = this.dialogueActions[i];
      if (action instanceof UnknownAction) {
        if (action.raw === 'hide_ui' || action.raw === 'blablalib:hide_ui') this.guiVisible = false;
        else if (action.raw === 'show_ui' || action.raw === 'blablalib:show_ui') this.guiVisible = true;
        this.seen.add(action.index);
        continue;
      }
      this.currentActions.push(action);
      this.seen.add(action.index);
      action.setup(this);
      if (action.blocking) {
        this.actionIndex = i;
        return;
      }
    }
    // Aucune action bloquante jusqu'au bout : le dialogue se termine au tick suivant.
    this.actionIndex = this.dialogueActions.length - 1;
    this.queueAdvanceDialogue();
  }
  getSpeaker(id: string | null): ScreenSpeaker {
    return this.speakers.find((s) => s.id === id) ?? DEFAULT_SPEAKER;
  }
  clearActions() {
    this.currentActions = [];
  }
  clearActionsOf(rl: string) {
    const def = ACTION_CLASSES[rl];
    if (def) this.currentActions = this.currentActions.filter((a) => a.cls !== def.cls);
  }
  skipDialogue() {
    while (this.actionIndex < this.dialogueActions.length && this.dialogueActions[this.actionIndex].skippable) {
      this.advanceAtTickEnd = false;
      this.advanceDialogue();
    }
  }
  queueEndDialogue() {
    this.queueEnd = true;
  }
  endDialogue() {
    this.clearActions();
    this.currentFadingTime = 0;
    this.run.sendCompleted(this);
  }
}

// --- Côté serveur : DialogueManager + BlablaLibNetwork -------------------------------------------

const BLOCKING_ACTIONS_SEND_AMOUNT = 3;

interface PlayerStatus {
  dialogueId: string;
  actions: Action[];
  lastReceived: number;
  lastCompleted: number;
}

export class Server {
  status: PlayerStatus | null = null;
  private opening = 0;
  constructor(readonly run: PreviewRun) {}

  openDialogue(id: string | null): boolean {
    const raw = id ? this.run.world.dialogue(id) : undefined;
    if (!id || !raw) {
      // BlablaLib.openDialogue : dialogue introuvable -> rien ne se passe, l'écran reste ouvert.
      this.run.emit('warn', tr("Dialogue introuvable : {id}. Le jeu n'ouvre rien.", { id: id ?? tr('(aucun)') }));
      return false;
    }
    // Sans latence simulée, des dialogues qui s'enchaînent en boucle s'appelleraient à l'infini.
    if (this.opening > 100) throw new Error(tr('Boucle de dialogues : des next_dialogue s’enchaînent sans fin'));
    this.opening++;
    try {
      this.open(id, raw);
    } finally {
      this.opening--;
    }
    return true;
  }

  private open(id: string, raw: RawAction[]) {
    const actions = loadActions(raw, this.run.world);
    this.status = { dialogueId: id, actions, lastReceived: 0, lastCompleted: -1 };
    const speakerIds = new Set(actions.map((a) => a.referencedSpeaker()).filter(Boolean));
    const speakers = this.run.world.speakers
      .filter((s) => speakerIds.has(parseResourceLocation(s.id) ?? ''))
      .map((s) => ({
        id: parseResourceLocation(s.id) ?? s.id,
        name: s.name,
        colorValue: colorFromStringOr(s.color, WHITE),
        sounds: s.sounds,
      }));
    this.run.toClient(() => {
      this.run.openScreen(id);
      this.run.screen!.receiveSpeakers(speakers);
    });
    this.sendNextActions();
  }

  sendNextActions() {
    const st = this.status;
    if (!st) return;
    let blocking = 0;
    let last = st.lastReceived;
    const sent: Action[] = [];
    const limit = this.run.network ? BLOCKING_ACTIONS_SEND_AMOUNT : Infinity;
    for (const action of st.actions.slice(st.lastReceived)) {
      if (blocking >= limit) break;
      sent.push(action);
      last++;
      if (action.blocking) blocking++;
    }
    st.lastReceived = last;
    // Sans simulation réseau, tout est déjà envoyé : le mod enverrait un lot vide, qu'on n'émule pas.
    if (sent.length > 0 || this.run.network) {
      this.run.toClient(() => this.run.screen?.receiveActions(sent));
    }
  }

  playerAdvanced(newIndex: number) {
    const st = this.status;
    if (!st) return;
    // Écart : BlablaLib 2.0.2 part de getLastCompletedIndex() sans le + 1, donc de -1 : actions.get(-1)
    // lève une exception dès le premier paquet, et sinon la dernière action serait rejouée.
    for (let i = st.lastCompleted + 1; i <= newIndex; i++) {
      st.lastCompleted = i;
      st.actions[i].completed(this);
    }
    this.sendNextActions();
  }

  completed() {
    if (this.status) this.run.emit('end', tr('Dialogue terminé : {id}', { id: this.status.dialogueId }));
    this.status = null;
  }

  choice(option: ChoiceOption) {
    if (option.action) this.run.emit('choice', tr('Action de choix envoyée : {action}', { action: option.action }));
    if (option.save) this.run.emit('choice', tr('Dialogue sauvegardé : {id}', { id: option.save }));
    this.openDialogue(option.next);
  }
}

// --- Une lecture complète ------------------------------------------------------------------------

export type RunEventKind = 'sound' | 'command' | 'npc' | 'quest' | 'cutscene' | 'choice' | 'warn' | 'end' | 'open';

export interface RunEvent {
  id: number;
  tick: number;
  kind: RunEventKind;
  text: string;
  dialogueId: string | null;
  actionIndex?: number;
  fastForward: boolean;
}

export interface RunOptions {
  width: number;
  height: number;
  /** Simule les lots de 3 actions bloquantes et un tick de latence dans chaque sens. */
  network: boolean;
}

export class PreviewRun {
  readonly server = new Server(this);
  screen: DialogueScreen | null = null;
  events: RunEvent[] = [];
  crash: string | null = null;
  network: boolean;
  width: number;
  height: number;
  tickCount = 0;
  private fastForwarding = false;
  private nextEventId = 1;
  private net: { at: number; fn: () => void }[] = [];

  constructor(
    readonly world: SimWorld,
    dialogueId: string,
    opts: RunOptions,
  ) {
    this.network = opts.network;
    this.width = opts.width;
    this.height = opts.height;
    this.guard(() => {
      if (!this.server.openDialogue(dialogueId)) this.flushAll();
    });
    if (!this.network) this.flushAll();
  }

  emit(kind: RunEventKind, text: string, actionIndex?: number) {
    this.events.push({
      id: this.nextEventId++,
      tick: this.tickCount,
      kind,
      text,
      actionIndex,
      dialogueId: this.server.status?.dialogueId ?? this.screen?.dialogueId ?? null,
      fastForward: this.fastForwarding,
    });
    if (this.events.length > 300) this.events.shift();
  }

  private send(fn: () => void) {
    if (this.network) this.net.push({ at: this.tickCount + 1, fn });
    else fn();
  }
  toClient(fn: () => void) {
    this.send(fn);
  }
  private flushAll() {
    const pending = this.net;
    this.net = [];
    pending.forEach((m) => m.fn());
  }

  openScreen(id: string) {
    this.screen = new DialogueScreen(this, id, this.width, this.height);
    this.emit('open', tr('Ouverture : {id}', { id }));
  }
  sendAdvanced(from: DialogueScreen, index: number) {
    this.send(() => {
      if (from === this.screen || this.network) this.server.playerAdvanced(index);
    });
  }
  sendCompleted(from: DialogueScreen) {
    this.send(() => {
      if (from === this.screen || this.network) this.server.completed();
    });
  }
  sendChoice(option: ChoiceOption) {
    this.send(() => this.server.choice(option));
  }

  private guard(fn: () => void) {
    if (this.crash) return;
    try {
      fn();
    } catch (e) {
      this.crash = e instanceof Error ? e.message : String(e);
      this.emit('warn', tr('Le jeu planterait ici : {error}', { error: this.crash }));
    }
  }

  get done() {
    // Avec latence simulée, l'écran n'existe pas encore tant que les premiers paquets sont en route.
    if (!this.screen) return this.net.length === 0;
    return this.screen.closed;
  }

  tick() {
    this.guard(() => {
      this.tickCount++;
      const due = this.net.filter((m) => m.at <= this.tickCount);
      this.net = this.net.filter((m) => m.at > this.tickCount);
      due.forEach((m) => m.fn());
      this.screen?.tick();
    });
  }
  render(p: Painter, mx: number, my: number, dt: number) {
    this.guard(() => this.screen?.render(p, mx, my, dt));
  }
  click(x: number, y: number, button = 0) {
    this.guard(() => this.screen?.mouseClicked(x, y, button));
  }
  key(code: number) {
    this.guard(() => this.screen?.keyPressed(code));
  }

  /**
   * Joue le dialogue sans affichage jusqu'à ce que l'action `index` soit à l'écran. Les messages
   * sont validés automatiquement ; on s'arrête sur un choix, car la suite dépend du joueur.
   * Renvoie false si l'action n'a pas pu être atteinte.
   */
  fastForwardTo(index: number): boolean {
    const start = this.screen;
    this.fastForwarding = true;
    try {
      for (let i = 0; i < 20000; i++) {
        const screen = this.screen;
        if (this.crash || !screen || screen.closed || screen !== start) return false;
        if (screen.seen.has(index)) return true;
        const current = screen.dialogueActions[screen.actionIndex];
        if (current instanceof ChoiceAction) return false;
        this.tick();
        this.render(NULL_PAINTER, -1, -1, 1);
        // Une fois l'action atteinte, surtout ne pas la valider.
        if (this.screen?.seen.has(index)) continue;
        // Entrée valide à la fois les messages et press_enter.
        this.key(257);
      }
      return false;
    } finally {
      this.fastForwarding = false;
    }
  }

  /** Affiche d'un coup le texte du message en cours, comme un premier clic du joueur. */
  revealMessage() {
    const message = this.screen?.currentActions.find((a) => a instanceof MessageAction) as MessageAction | undefined;
    if (message && !message.fullyDrawn) this.guard(() => message.keyPressed(32));
  }

  /** L'écran n'affiche rien de plus et attend la touche Entrée. */
  get waitingForEnter(): boolean {
    const s = this.screen;
    return !!s && !s.closed && s.currentFadingTime < 0 && s.dialogueActions[s.actionIndex] instanceof PressEnterAction;
  }

  /** L'écran attend-il quelque chose qui n'arrivera jamais ? */
  get stuck(): boolean {
    const s = this.screen;
    if (!s || s.closed || s.currentFadingTime >= 0 || this.net.length > 0) return false;
    const current = s.dialogueActions[s.actionIndex];
    if (current instanceof NextAction) return true;
    return current instanceof ChoiceAction && current.options.length === 0;
  }
}
