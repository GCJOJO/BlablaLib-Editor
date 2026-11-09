// Ouverture et enregistrement : File System Access (Chrome, Edge), ou import / téléchargement ailleurs.

import { strToU8, zipSync } from 'fflate';
import { t } from '../i18n';
import { EXTENSION_FOLDER, extensionFileName, parseExtension, serializeExtension, type Extension } from './extensions';
import {
  datapackFilePath,
  datapackLangPath,
  parseDialogueFile,
  parseLenientJson,
  serializeFile,
  serializeLang,
  uid,
  type DialogueFile,
  type LangFile,
  type Project,
} from './project';

export type Textures = Map<string, Blob>;

export interface LoadedProject {
  project: Project;
  textures: Textures;
  errors: string[];
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.gradle', '.idea', 'build', 'run', 'dist', 'out', 'bin', 'gradle']);
const DIALOGUE_RE = /(?:^|\/)data\/([^/]+)\/dialogues\/(.+\.json)$/;
const LANG_RE = /(?:^|\/)assets\/([^/]+)\/lang\/([a-z0-9_]+)\.json$/;
const TEXTURE_RE = /(?:^|\/)assets\/([^/]+)\/(textures\/.+\.png)$/;

const EXTENSION_RE = new RegExp(`(?:^|/)${EXTENSION_FOLDER}/[^/]+\\.json$`);

export const isRelevantPath = (p: string) => DIALOGUE_RE.test(p) || LANG_RE.test(p) || TEXTURE_RE.test(p) || EXTENSION_RE.test(p);

/** Construit le projet à partir d'une liste de fichiers (chemin relatif + lecture paresseuse). */
export async function buildProject(name: string, entries: { path: string; read: () => Promise<Blob> }[]): Promise<LoadedProject> {
  const project: Project = { name, files: [], langs: [], extensions: [] };
  const textures: Textures = new Map();
  const errors: string[] = [];
  for (const entry of entries) {
    try {
      let m = DIALOGUE_RE.exec(entry.path);
      if (m) {
        project.files.push(parseDialogueFile(await (await entry.read()).text(), m[1], m[2], entry.path));
        continue;
      }
      m = LANG_RE.exec(entry.path);
      if (m) {
        const entries_ = parseLenientJson(await (await entry.read()).text()) as Record<string, string>;
        project.langs.push({ uid: uid(), namespace: m[1], locale: m[2], originPath: entry.path, entries: entries_ });
        continue;
      }
      if (EXTENSION_RE.test(entry.path)) {
        const { extension, errors: problems } = parseExtension(parseLenientJson(await (await entry.read()).text()), uid(), entry.path);
        if (extension) project.extensions.push(extension);
        else errors.push(t('{file} : {error}', { file: entry.path, error: problems.slice(0, 3).join(' ') }));
        continue;
      }
      m = TEXTURE_RE.exec(entry.path);
      if (m) textures.set(`${m[1]}:${m[2]}`, await entry.read());
    } catch (e) {
      errors.push(t('{file} : {error}', { file: entry.path, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  return { project, textures, errors };
}

// --- File System Access ------------------------------------------------------------------------

type DirHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>;
  queryPermission(o: { mode: string }): Promise<PermissionState>;
  requestPermission(o: { mode: string }): Promise<PermissionState>;
};

export const canUseFolders = () => 'showDirectoryPicker' in window;

async function walk(dir: DirHandle, prefix: string, out: { path: string; read: () => Promise<Blob> }[]) {
  for await (const handle of dir.values()) {
    if (handle.kind === 'directory') {
      if (!SKIP_DIRS.has(handle.name)) await walk(handle as DirHandle, `${prefix}${handle.name}/`, out);
    } else {
      const path = `${prefix}${handle.name}`;
      if (isRelevantPath(path)) out.push({ path, read: () => (handle as FileSystemFileHandle).getFile() });
    }
  }
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  return (window as unknown as { showDirectoryPicker(o: { mode: string }): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'readwrite' });
}

export async function loadFolder(handle: FileSystemDirectoryHandle): Promise<LoadedProject> {
  const list: { path: string; read: () => Promise<Blob> }[] = [];
  await walk(handle as DirHandle, '', list);
  return buildProject(handle.name, list);
}

export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as DirHandle;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}

async function writeFile(root: FileSystemDirectoryHandle, path: string, data: Blob | string) {
  const parts = path.split('/');
  let dir = root;
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
  const file = await dir.getFileHandle(parts[parts.length - 1], { create: true });
  const w = await file.createWritable();
  await w.write(data);
  await w.close();
}

/**
 * Racine où créer les nouveaux fichiers : dossier parent de `data/` ou `assets/` d'un fichier déjà
 * présent (ex. `common/src/main/resources/`), sinon la racine ouverte.
 */
function resourceRoot(project: Project): string {
  for (const item of [...project.files, ...project.langs]) {
    const m = item.originPath && /^(.*?)(?:data|assets)\//.exec(item.originPath);
    if (m) return m[1];
  }
  return '';
}

export async function saveToFolder(
  root: FileSystemDirectoryHandle,
  project: Project,
  files: DialogueFile[],
  langs: LangFile[],
  newTextures: Textures,
  extensions: Extension[] = [],
): Promise<string[]> {
  const base = resourceRoot(project);
  const written: string[] = [];
  for (const f of files) {
    const path = f.originPath ?? `${base}${datapackFilePath(f)}`;
    await writeFile(root, path, serializeFile(f));
    f.originPath = path;
    written.push(path);
  }
  for (const l of langs) {
    const path = l.originPath ?? `${base}${datapackLangPath(l)}`;
    await writeFile(root, path, serializeLang(l));
    l.originPath = path;
    written.push(path);
  }
  for (const [rl, blob] of newTextures) {
    const [ns, tex] = rl.split(/:(.*)/s);
    const path = `${base}assets/${ns}/${tex}`;
    await writeFile(root, path, blob);
    written.push(path);
  }
  // Les extensions ne servent qu'à l'éditeur : à la racine du dossier ouvert, hors des ressources du mod.
  for (const e of extensions) {
    const path = e.originPath ?? `${EXTENSION_FOLDER}/${extensionFileName(e)}`;
    await writeFile(root, path, serializeExtension(e));
    e.originPath = path;
    written.push(path);
  }
  return written;
}

// --- Téléchargements ---------------------------------------------------------------------------

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function downloadFile(file: DialogueFile) {
  downloadBlob(new Blob([serializeFile(file)], { type: 'application/json' }), file.path.split('/').pop() ?? 'dialogues.json');
}

const PACK_MCMETA = (name: string) =>
  `${JSON.stringify({ pack: { pack_format: 48, description: `${name} (BlablaLib Editor)` } }, null, 2)}\n`;

/**
 * Datapack prêt à l'emploi. pack_format 48 = Minecraft 1.21.1. Les lang et textures sont des
 * ressources client : le zip les range à part dans `resourcepack/`.
 */
export async function downloadDatapackZip(project: Project, textures: Textures) {
  const zip: Record<string, Uint8Array> = {};
  zip['pack.mcmeta'] = strToU8(PACK_MCMETA(project.name));
  for (const f of project.files) zip[datapackFilePath(f)] = strToU8(serializeFile(f));
  if (project.langs.length > 0 || textures.size > 0) {
    zip['resourcepack/pack.mcmeta'] = strToU8(
      `${JSON.stringify({ pack: { pack_format: 34, description: `${project.name} (BlablaLib Editor)` } }, null, 2)}\n`,
    );
    for (const l of project.langs) zip[`resourcepack/${datapackLangPath(l)}`] = strToU8(serializeLang(l));
    for (const [rl, blob] of textures) {
      const [ns, tex] = rl.split(/:(.*)/s);
      zip[`resourcepack/assets/${ns}/${tex}`] = new Uint8Array(await blob.arrayBuffer());
    }
  }
  downloadBlob(new Blob([zipSync(zip) as BlobPart], { type: 'application/zip' }), `${project.name.replace(/[^\w.-]+/g, '_') || 'datapack'}.zip`);
}

// --- Sauvegarde automatique dans le navigateur ---------------------------------------------------

const DB = 'blablalib-editor';
const STORE = 'state';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(key: string, value: unknown) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const result = await new Promise<T | undefined>((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

/** Exemple fourni : les vrais dialogues de test du mod. */
export async function loadSample(): Promise<LoadedProject> {
  const base = import.meta.env.BASE_URL;
  const paths = [
    'data/blablalib/dialogues/dialogues.json',
    'assets/blablalib/lang/en_us.json',
    'assets/blablalib/lang/fr_fr.json',
    'assets/blablalib/textures/gui/woof.png',
  ];
  return buildProject(
    t('Exemple BlablaLib'),
    paths.map((path) => ({
      path,
      read: async () => {
        const res = await fetch(`${base}sample/${path}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      },
    })),
  );
}
