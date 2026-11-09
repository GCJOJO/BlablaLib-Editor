// Modèle du projet et lecture / écriture des fichiers de datapack.

import { parseResourceLocation, type RawAction, type SimSpeaker, type SimWorld } from '../engine/sim';
import { getLang, t } from '../i18n';
import { simCustomActions, type Extension } from './extensions';

export interface ActionEntry {
  uid: string;
  raw: RawAction;
}

export interface DialogueEntry {
  uid: string;
  key: string;
  actions: ActionEntry[];
}

export interface DialogueFile {
  uid: string;
  namespace: string;
  /** Chemin relatif au dossier `dialogues/`, ex. `dialogues.json`. */
  path: string;
  /** Chemin d'origine dans le dossier ouvert, pour réécrire au bon endroit. */
  originPath?: string;
  speakers: SimSpeaker[];
  dialogues: DialogueEntry[];
  /** Clés de premier niveau qui ne sont pas des tableaux : conservées telles quelles. */
  extras: Record<string, unknown>;
}

export interface LangFile {
  uid: string;
  namespace: string;
  locale: string;
  originPath?: string;
  entries: Record<string, string>;
}

export interface Project {
  name: string;
  files: DialogueFile[];
  langs: LangFile[];
  /** Schémas d'actions custom. Absent des sauvegardes faites avant les extensions. */
  extensions: Extension[];
}

let counter = 0;
export const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Retire commentaires et virgules finales : Gson les accepte, et les exemples de la doc en ont. */
export function parseLenientJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    let out = '';
    let i = 0;
    let inString = false;
    while (i < text.length) {
      const c = text[i];
      if (inString) {
        out += c;
        if (c === '\\') out += text[++i] ?? '';
        else if (c === '"') inString = false;
        i++;
      } else if (c === '"') {
        inString = true;
        out += c;
        i++;
      } else if (c === '/' && text[i + 1] === '/') {
        while (i < text.length && text[i] !== '\n') i++;
      } else if (c === '/' && text[i + 1] === '*') {
        i = text.indexOf('*/', i + 2);
        i = i < 0 ? text.length : i + 2;
      } else if (c === ']' || c === '}') {
        // Virgule finale : hors d'une chaîne, on la retire de ce qui a déjà été recopié.
        out = out.replace(/,\s*$/, '') + c;
        i++;
      } else {
        out += c;
        i++;
      }
    }
    return JSON.parse(out);
  }
}

export function parseDialogueFile(text: string, namespace: string, path: string, originPath?: string): DialogueFile {
  const json = parseLenientJson(text);
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error(t('Le fichier doit contenir un objet JSON.'));
  const file: DialogueFile = { uid: uid(), namespace, path, originPath, speakers: [], dialogues: [], extras: {} };
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (key === 'speakers') {
      if (Array.isArray(value)) file.speakers = value as SimSpeaker[];
      else file.extras[key] = value;
    } else if (Array.isArray(value)) {
      file.dialogues.push({ uid: uid(), key, actions: value.map((raw) => ({ uid: uid(), raw: raw as RawAction })) });
    } else {
      file.extras[key] = value;
    }
  }
  return file;
}

/**
 * JSON du fichier. `speakers` est toujours écrit : sans cette clé, DialogueLoader.loadSpeakers lève
 * une NullPointerException et TOUT le fichier est ignoré.
 */
export function fileToJson(file: DialogueFile): Record<string, unknown> {
  const out: Record<string, unknown> = { speakers: file.speakers };
  for (const d of file.dialogues) out[d.key] = d.actions.map((a) => a.raw);
  return { ...out, ...file.extras };
}

export const serializeFile = (file: DialogueFile) => `${JSON.stringify(fileToJson(file), null, 2)}\n`;
export const serializeLang = (lang: LangFile) => `${JSON.stringify(lang.entries, null, 2)}\n`;

export const dialogueId = (file: DialogueFile, d: DialogueEntry) => `${file.namespace}:${d.key}`;
export const datapackFilePath = (file: DialogueFile) => `data/${file.namespace}/dialogues/${file.path}`;
export const datapackLangPath = (lang: LangFile) => `assets/${lang.namespace}/lang/${lang.locale}.json`;

/** `blablalib:textures/gui/a.png` -> `assets/blablalib/textures/gui/a.png` */
export function texturePath(rl: string): string | null {
  const parsed = parseResourceLocation(rl);
  if (!parsed) return null;
  const [ns, path] = parsed.split(/:(.*)/s);
  return `assets/${ns}/${path}`;
}

export function findDialogue(project: Project, id: string): { file: DialogueFile; dialogue: DialogueEntry } | null {
  const norm = parseResourceLocation(id);
  // Comme `newDialogues.putAll` fichier par fichier : en cas de doublon, le dernier fichier gagne.
  for (const file of sortedFiles(project).reverse()) {
    for (const dialogue of file.dialogues) {
      if (dialogueId(file, dialogue) === norm) return { file, dialogue };
    }
  }
  return null;
}

export const sortedFiles = (project: Project) =>
  [...project.files].sort((a, b) => `${a.namespace}:${a.path}`.localeCompare(`${b.namespace}:${b.path}`));

export function allDialogueIds(project: Project): string[] {
  return project.files.flatMap((f) => f.dialogues.map((d) => dialogueId(f, d)));
}

export function allSpeakers(project: Project): SimSpeaker[] {
  return sortedFiles(project).flatMap((f) => f.speakers);
}

export function translate(project: Project, locale: string, key: string): string {
  for (const l of project.langs) if (l.locale === locale && key in l.entries) return l.entries[key];
  for (const l of project.langs) if (l.locale === 'en_us' && key in l.entries) return l.entries[key];
  return key;
}

export function hasTranslation(project: Project, key: string): boolean {
  return project.langs.some((l) => key in l.entries);
}

export function localesOf(project: Project): string[] {
  const set = new Set(project.langs.map((l) => l.locale));
  return [...set].sort();
}

export function makeWorld(project: Project, locale: string, lang = getLang()): SimWorld {
  return {
    customActions: simCustomActions(project.extensions, lang),
    dialogue: (id) => findDialogue(project, id)?.dialogue.actions.map((a) => a.raw),
    speakers: allSpeakers(project),
    translate: (key) => translate(project, locale, key),
  };
}

export const SAMPLE_PROJECT_BASE = 'sample/';

export function emptyProject(): Project {
  const ns = t('mon_datapack');
  const narrator = t('narrateur');
  return {
    name: t('Nouveau projet'),
    files: [
      {
        uid: uid(),
        namespace: ns,
        path: 'dialogues.json',
        speakers: [{ id: `${ns}:${narrator}`, name: t('Narrateur'), color: '#FFFFFFFF', sounds: [] }],
        dialogues: [
          {
            uid: uid(),
            key: 'intro',
            actions: [{ uid: uid(), raw: { action: 'blablalib:message', speaker: `${ns}:${narrator}`, text: t('Bonjour !') } }],
          },
        ],
        extras: {},
      },
    ],
    langs: [],
    extensions: [],
  };
}
