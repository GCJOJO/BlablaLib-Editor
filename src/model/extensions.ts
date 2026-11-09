// Extensions : fichiers JSON qui décrivent les actions custom d'autres mods (registerCustomAction).
// Ils ne contiennent aucun code : l'éditeur en tire les formulaires, les vérifications et un
// comportement approché pour la preview. Le format est décrit dans docs/plan-extensions.md.

import { ACTION_CLASSES, parseResourceLocation, type RawAction, type SimCustomAction } from '../engine/sim';
import { t } from '../i18n';
import type { ActionDef, FieldDef, FieldType } from './schema';

export const EXTENSION_FORMAT = 1;
export const EXTENSION_FOLDER = 'blablalib-extensions';

export const EXT_FIELD_TYPES = ['text', 'multiline', 'number', 'bool', 'select', 'color', 'dialogue', 'speaker', 'texture', 'json'] as const;
export type ExtFieldType = (typeof EXT_FIELD_TYPES)[number];

export const PREVIEW_MODES = ['instant', 'ticks', 'input'] as const;
export type PreviewMode = (typeof PREVIEW_MODES)[number];

/** Noms d'icônes acceptés. Le dessin correspondant est dans ui/icons.ts. */
export const EXTENSION_ICONS = ['puzzle', 'wand', 'sparkles', 'camera', 'music', 'flag', 'star', 'zap', 'heart', 'box', 'map', 'sword', 'shield', 'user', 'eye', 'bell', 'clock', 'message'] as const;

/** Texte simple, ou une traduction par langue du site : { "fr": "…", "en": "…" }. */
export type Localized = string | Record<string, string>;

export interface ExtensionField {
  key: string;
  label: Localized;
  type: ExtFieldType;
  required?: boolean;
  default?: unknown;
  hint?: Localized;
  placeholder?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  slider?: boolean;
  translatable?: boolean;
  /** Propriétés inconnues de cette version du format, conservées telles quelles. */
  extras: Record<string, unknown>;
}

export interface ExtensionPreview {
  mode: PreviewMode;
  ticks?: number;
  ticksField?: string;
  log?: string;
}

export interface ExtensionAction {
  id: string;
  label: Localized;
  description?: Localized;
  icon?: string;
  blocking: boolean;
  skippable: boolean;
  preview?: ExtensionPreview;
  fields: ExtensionField[];
  extras: Record<string, unknown>;
}

export interface Extension {
  uid: string;
  originPath?: string;
  id: string;
  name: string;
  version?: string;
  actions: ExtensionAction[];
  extras: Record<string, unknown>;
}

export interface ExtensionIssue {
  severity: 'error' | 'warning';
  message: string;
  /** Index de l'action concernée, s'il y en a une. */
  action?: number;
}

/** Actions que le mod enregistre déjà : registerCustomAction refuserait ces noms. */
export const RESERVED_ACTION_IDS = new Set([...Object.keys(ACTION_CLASSES), 'minecraft:hide_ui', 'minecraft:show_ui', 'blablalib:hide_ui', 'blablalib:show_ui']);

export function localize(text: Localized | undefined, lang: string): string {
  if (text === undefined) return '';
  if (typeof text === 'string') return text;
  return text[lang] ?? text.en ?? text.fr ?? Object.values(text)[0] ?? '';
}

// --- Lecture -------------------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isLocalized = (v: unknown): v is Localized => typeof v === 'string' || (isObject(v) && Object.values(v).every((x) => typeof x === 'string'));

function pickExtras(o: Record<string, unknown>, known: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([k]) => !known.includes(k)));
}

const FIELD_KEYS = ['key', 'label', 'type', 'required', 'default', 'hint', 'placeholder', 'options', 'min', 'max', 'step', 'slider', 'translatable'];
const ACTION_KEYS = ['id', 'label', 'description', 'icon', 'blocking', 'skippable', 'preview', 'fields'];
const TOP_KEYS = ['format', 'id', 'name', 'version', 'actions'];

function readField(o: unknown, where: string, errors: string[]): ExtensionField | null {
  if (!isObject(o)) {
    errors.push(t('{where} : objet attendu.', { where }));
    return null;
  }
  const key = typeof o.key === 'string' ? o.key : '';
  if (!key) errors.push(t('{where} : « key » manquante.', { where }));
  const type = EXT_FIELD_TYPES.includes(o.type as ExtFieldType) ? (o.type as ExtFieldType) : null;
  if (!type) errors.push(t('{where} : type « {type} » inconnu. Types acceptés : {list}.', { where, type: String(o.type ?? ''), list: EXT_FIELD_TYPES.join(', ') }));
  if ('label' in o && !isLocalized(o.label)) errors.push(t('{where} : « {prop} » doit être un texte ou un objet de traductions.', { where, prop: 'label' }));
  if ('hint' in o && !isLocalized(o.hint)) errors.push(t('{where} : « {prop} » doit être un texte ou un objet de traductions.', { where, prop: 'hint' }));
  for (const prop of ['min', 'max', 'step'] as const) {
    if (prop in o && typeof o[prop] !== 'number') errors.push(t('{where} : « {prop} » doit être un nombre.', { where, prop }));
  }
  for (const prop of ['required', 'slider', 'translatable'] as const) {
    if (prop in o && typeof o[prop] !== 'boolean') errors.push(t('{where} : « {prop} » doit valoir true ou false.', { where, prop }));
  }
  if ('placeholder' in o && typeof o.placeholder !== 'string') errors.push(t('{where} : « {prop} » doit être un texte.', { where, prop: 'placeholder' }));
  if ('options' in o && !(Array.isArray(o.options) && o.options.every((x) => typeof x === 'string'))) {
    errors.push(t('{where} : « options » doit être une liste de textes.', { where }));
  }
  if (!key || !type) return null;
  const field: ExtensionField = { key, label: isLocalized(o.label) ? o.label : key, type, extras: pickExtras(o, FIELD_KEYS) };
  if (typeof o.required === 'boolean') field.required = o.required;
  if ('default' in o) field.default = o.default;
  if (isLocalized(o.hint)) field.hint = o.hint;
  if (typeof o.placeholder === 'string') field.placeholder = o.placeholder;
  if (Array.isArray(o.options)) field.options = o.options.filter((x): x is string => typeof x === 'string');
  for (const prop of ['min', 'max', 'step'] as const) if (typeof o[prop] === 'number') field[prop] = o[prop] as number;
  if (typeof o.slider === 'boolean') field.slider = o.slider;
  if (typeof o.translatable === 'boolean') field.translatable = o.translatable;
  return field;
}

function readAction(o: unknown, where: string, errors: string[]): ExtensionAction | null {
  if (!isObject(o)) {
    errors.push(t('{where} : objet attendu.', { where }));
    return null;
  }
  const id = typeof o.id === 'string' ? o.id : '';
  if (!id) errors.push(t('{where} : « id » manquant.', { where }));
  if (!isLocalized(o.label)) errors.push(t('{where} : « {prop} » doit être un texte ou un objet de traductions.', { where, prop: 'label' }));
  if ('description' in o && !isLocalized(o.description)) errors.push(t('{where} : « {prop} » doit être un texte ou un objet de traductions.', { where, prop: 'description' }));
  for (const prop of ['blocking', 'skippable'] as const) {
    if (typeof o[prop] !== 'boolean') errors.push(t('{where} : « {prop} » doit valoir true ou false.', { where, prop }));
  }
  if ('icon' in o && typeof o.icon !== 'string') errors.push(t('{where} : « {prop} » doit être un texte.', { where, prop: 'icon' }));

  let preview: ExtensionPreview | undefined;
  if ('preview' in o) {
    const p = o.preview;
    if (!isObject(p) || !PREVIEW_MODES.includes(p.mode as PreviewMode)) {
      errors.push(t('{where} : « preview.mode » doit valoir {list}.', { where, list: PREVIEW_MODES.join(', ') }));
    } else {
      preview = { mode: p.mode as PreviewMode };
      if ('ticks' in p) {
        if (typeof p.ticks === 'number' && p.ticks >= 0) preview.ticks = p.ticks;
        else errors.push(t('{where} : « preview.ticks » doit être un nombre positif.', { where }));
      }
      if (typeof p.ticksField === 'string') preview.ticksField = p.ticksField;
      if (typeof p.log === 'string') preview.log = p.log;
    }
  }

  const fields: ExtensionField[] = [];
  if ('fields' in o && !Array.isArray(o.fields)) errors.push(t('{where} : « fields » doit être une liste.', { where }));
  if (Array.isArray(o.fields)) {
    o.fields.forEach((f, i) => {
      const field = readField(f, `${where} › fields[${i}]`, errors);
      if (field) fields.push(field);
    });
  }
  if (!id || !isLocalized(o.label) || typeof o.blocking !== 'boolean' || typeof o.skippable !== 'boolean') return null;
  const action: ExtensionAction = { id, label: o.label, blocking: o.blocking, skippable: o.skippable, fields, extras: pickExtras(o, ACTION_KEYS) };
  if (isLocalized(o.description)) action.description = o.description;
  if (typeof o.icon === 'string') action.icon = o.icon;
  if (preview) action.preview = preview;
  return action;
}

/** Lit un fichier d'extension. Toute erreur de structure empêche l'import. */
export function parseExtension(json: unknown, uidValue: string, originPath?: string): { extension: Extension | null; errors: string[] } {
  const errors: string[] = [];
  if (!isObject(json)) return { extension: null, errors: [t('Le fichier doit contenir un objet JSON.')] };
  if ('format' in json && json.format !== EXTENSION_FORMAT) {
    errors.push(
      typeof json.format === 'number' && json.format > EXTENSION_FORMAT
        ? t('Format {n} : ce fichier vient d’une version plus récente de l’éditeur.', { n: json.format })
        : t('« format » doit valoir {n}.', { n: EXTENSION_FORMAT }),
    );
  }
  const id = typeof json.id === 'string' ? json.id : '';
  if (!id) errors.push(t('« id » manquant : c’est le namespace de l’extension.'));
  if (!Array.isArray(json.actions)) errors.push(t('« actions » doit être une liste.'));
  const actions: ExtensionAction[] = [];
  if (Array.isArray(json.actions)) {
    json.actions.forEach((a, i) => {
      const action = readAction(a, `actions[${i}]`, errors);
      if (action) actions.push(action);
    });
  }
  if (errors.length) return { extension: null, errors };
  const extension: Extension = {
    uid: uidValue,
    originPath,
    id,
    name: typeof json.name === 'string' && json.name ? json.name : id,
    actions,
    extras: pickExtras(json, TOP_KEYS),
  };
  if (typeof json.version === 'string') extension.version = json.version;
  return { extension, errors: [] };
}

// --- Écriture ------------------------------------------------------------------------------------

function fieldToJson(f: ExtensionField): Record<string, unknown> {
  const out: Record<string, unknown> = { key: f.key, label: f.label, type: f.type };
  if (f.required !== undefined) out.required = f.required;
  if (f.default !== undefined) out.default = f.default;
  if (f.hint !== undefined) out.hint = f.hint;
  if (f.placeholder !== undefined) out.placeholder = f.placeholder;
  if (f.options !== undefined) out.options = f.options;
  if (f.min !== undefined) out.min = f.min;
  if (f.max !== undefined) out.max = f.max;
  if (f.step !== undefined) out.step = f.step;
  if (f.slider !== undefined) out.slider = f.slider;
  if (f.translatable !== undefined) out.translatable = f.translatable;
  return { ...out, ...f.extras };
}

function actionToJson(a: ExtensionAction): Record<string, unknown> {
  const out: Record<string, unknown> = { id: a.id, label: a.label };
  if (a.description !== undefined) out.description = a.description;
  if (a.icon !== undefined) out.icon = a.icon;
  out.blocking = a.blocking;
  out.skippable = a.skippable;
  if (a.preview) out.preview = a.preview;
  out.fields = a.fields.map(fieldToJson);
  return { ...out, ...a.extras };
}

export function extensionToJson(e: Extension): Record<string, unknown> {
  const out: Record<string, unknown> = { format: EXTENSION_FORMAT, id: e.id, name: e.name };
  if (e.version !== undefined) out.version = e.version;
  out.actions = e.actions.map(actionToJson);
  return { ...out, ...e.extras };
}

export const serializeExtension = (e: Extension) => `${JSON.stringify(extensionToJson(e), null, 2)}\n`;
export const extensionFileName = (e: Extension) => `${e.id.replace(/[^a-z0-9_.-]+/gi, '_') || 'extension'}.json`;

// --- Vérifications -------------------------------------------------------------------------------

/** Problèmes d'une extension, en tenant compte des autres extensions du projet. */
export function checkExtension(ext: Extension, all: Extension[]): ExtensionIssue[] {
  const issues: ExtensionIssue[] = [];
  if (!/^[a-z0-9_.-]+$/.test(ext.id)) issues.push({ severity: 'error', message: t('Identifiant « {id} » invalide : minuscules, chiffres et . _ - uniquement.', { id: ext.id }) });
  if (all.some((o) => o !== ext && o.id === ext.id)) issues.push({ severity: 'error', message: t('Une autre extension utilise déjà l’identifiant « {id} ».', { id: ext.id }) });

  const seen = new Set<string>();
  ext.actions.forEach((a, i) => {
    const add = (severity: ExtensionIssue['severity'], message: string) => issues.push({ severity, message, action: i });
    const id = a.id.includes(':') ? parseResourceLocation(a.id) : null;
    if (!id) add('error', t('Action « {id} » : identifiant invalide. Écrivez namespace:nom, en minuscules.', { id: a.id }));
    else {
      if (RESERVED_ACTION_IDS.has(id)) add('error', t('Action « {id} » : ce nom est déjà pris par BlablaLib, registerCustomAction le refuserait.', { id }));
      if (seen.has(id)) add('error', t('Action « {id} » : définie deux fois dans cette extension.', { id }));
      const other = all.find((o) => o !== ext && o.actions.some((x) => parseResourceLocation(x.id) === id));
      if (other) add('error', t('Action « {id} » : déjà définie par l’extension « {other} ».', { id, other: other.name }));
      seen.add(id);
    }
    const keys = new Set<string>();
    for (const f of a.fields) {
      if (f.key === 'action') add('error', t('Action « {id} » : la clé « action » est réservée.', { id: a.id }));
      else if (!f.key) add('error', t('Action « {id} » : un champ n’a pas de clé.', { id: a.id }));
      else if (keys.has(f.key)) add('error', t('Action « {id} » : clé « {key} » en double.', { id: a.id, key: f.key }));
      keys.add(f.key);
      if (f.type === 'select' && !f.options?.length) add('error', t('Action « {id} » : le champ « {key} » est une liste sans options.', { id: a.id, key: f.key }));
    }
    const p = a.preview;
    if (p?.mode === 'ticks' && p.ticks === undefined && !p.ticksField) {
      add('warning', t('Action « {id} » : mode « ticks » sans durée ni champ de durée, la preview la passe aussitôt.', { id: a.id }));
    }
    if (p?.ticksField && a.fields.find((f) => f.key === p.ticksField)?.type !== 'number') {
      add('warning', t('Action « {id} » : le champ de durée « {key} » n’est pas un champ numérique de l’action.', { id: a.id, key: p.ticksField }));
    }
  });
  return issues;
}

// --- Registre ------------------------------------------------------------------------------------

/** Action d'extension par identifiant normalisé. En cas de doublon, la première l'emporte. */
export function customActionMap(extensions: Extension[]): Map<string, ExtensionAction> {
  const map = new Map<string, ExtensionAction>();
  for (const e of extensions) {
    for (const a of e.actions) {
      const id = a.id.includes(':') ? parseResourceLocation(a.id) : null;
      if (id && !RESERVED_ACTION_IDS.has(id) && !map.has(id)) map.set(id, a);
    }
  }
  return map;
}

const FORM_TYPE: Record<ExtFieldType, FieldType> = {
  text: 'text',
  multiline: 'multiline',
  number: 'number',
  bool: 'bool',
  select: 'select',
  color: 'color',
  dialogue: 'dialogue',
  speaker: 'speaker',
  texture: 'texture',
  json: 'json',
};

export function toFieldDef(f: ExtensionField, lang: string): FieldDef {
  return {
    key: f.key,
    label: localize(f.label, lang) || f.key,
    type: FORM_TYPE[f.type],
    hint: f.hint !== undefined ? localize(f.hint, lang) || undefined : undefined,
    placeholder: f.placeholder,
    options: f.options,
    min: f.min,
    max: f.max,
    step: f.step,
    slider: f.slider,
    translatable: f.translatable,
    half: f.type === 'number' || f.type === 'bool',
    required: f.required,
    literal: true,
    measure: false,
  };
}

export function defaultsOf(a: ExtensionAction): RawAction {
  const raw: RawAction = { action: a.id };
  for (const f of a.fields) if (f.default !== undefined) raw[f.key] = structuredClone(f.default);
  return raw;
}

/** Descriptions d'actions pour les formulaires, la palette et la liste, dans la langue du site. */
export function customActionDefs(extensions: Extension[], lang: string): ActionDef[] {
  const out: ActionDef[] = [];
  const used = customActionMap(extensions);
  for (const e of extensions) {
    for (const a of e.actions) {
      const id = a.id.includes(':') ? parseResourceLocation(a.id) : null;
      if (!id || used.get(id) !== a) continue;
      out.push({
        id,
        shortId: id,
        label: localize(a.label, lang) || id,
        group: 'extension',
        blocking: a.blocking,
        skippable: a.skippable,
        description: localize(a.description, lang),
        fields: a.fields.map((f) => toFieldDef(f, lang)),
        defaults: defaultsOf(a),
        literal: true,
        extension: e.name,
        icon: a.icon,
      });
    }
  }
  return out;
}

/** Comportement approché pour la preview. */
export function simCustomActions(extensions: Extension[], lang: string): Record<string, SimCustomAction> {
  const out: Record<string, SimCustomAction> = {};
  for (const [id, a] of customActionMap(extensions)) {
    out[id] = { label: localize(a.label, lang) || id, blocking: a.blocking, skippable: a.skippable, preview: a.preview ?? { mode: 'instant' } };
  }
  return out;
}

/** Nombre d'actions des dialogues qui utilisent cet identifiant. */
export function countUsage(dialogues: { actions: { raw: RawAction }[] }[], id: string): number {
  const target = parseResourceLocation(id);
  if (!target) return 0;
  let n = 0;
  for (const d of dialogues) for (const a of d.actions) if (typeof a.raw.action === 'string' && parseResourceLocation(a.raw.action) === target) n++;
  return n;
}

// --- Modèles pour l'éditeur ----------------------------------------------------------------------

export function newExtension(existing: Extension[], uidValue: string): Extension {
  const base = t('mon_extension');
  let id = base;
  for (let n = 2; existing.some((e) => e.id === id); n++) id = `${base}_${n}`;
  return {
    uid: uidValue,
    id,
    name: t('Mon extension'),
    version: '1.0.0',
    actions: [
      {
        id: `${id}:${t('mon_action')}`,
        label: { fr: 'Mon action', en: 'My action' },
        description: { fr: 'Décrivez ce que fait l’action en jeu.', en: 'Describe what the action does in game.' },
        icon: 'puzzle',
        blocking: true,
        skippable: true,
        preview: { mode: 'ticks', ticksField: 'time' },
        fields: [{ key: 'time', label: { fr: 'Durée', en: 'Duration' }, type: 'number', default: 20, min: 0, step: 1, hint: { fr: 'En ticks.', en: 'In ticks.' }, extras: {} }],
        extras: {},
      },
    ],
    extras: {},
  };
}

export function newAction(ext: Extension): ExtensionAction {
  let n = ext.actions.length + 1;
  while (ext.actions.some((a) => a.id === `${ext.id}:action_${n}`)) n++;
  return {
    id: `${ext.id}:action_${n}`,
    label: { fr: `Action ${n}`, en: `Action ${n}` },
    icon: 'puzzle',
    blocking: true,
    skippable: true,
    preview: { mode: 'instant' },
    fields: [],
    extras: {},
  };
}

export function newField(action: ExtensionAction): ExtensionField {
  let n = action.fields.length + 1;
  while (action.fields.some((f) => f.key === `field_${n}`)) n++;
  return { key: `field_${n}`, label: { fr: `Champ ${n}`, en: `Field ${n}` }, type: 'text', extras: {} };
}
