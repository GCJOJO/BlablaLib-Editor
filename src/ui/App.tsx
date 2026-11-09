import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileDown,
  FilePlus2,
  FileUp,
  FolderOpen,
  Info,
  MessagesSquare,
  Redo2,
  Save,
  Sparkles,
  Undo2,
  XCircle,
} from 'lucide-react';
import { parseResourceLocation } from '../engine/sim';
import {
  allDialogueIds,
  allSpeakers,
  dialogueId,
  emptyProject,
  findDialogue,
  localesOf,
  makeWorld,
  parseDialogueFile,
  serializeFile,
  serializeLang,
  uid,
  type DialogueEntry,
  type DialogueFile,
  type Project,
} from '../model/project';
import {
  buildProject,
  canUseFolders,
  isRelevantPath,
  downloadDatapackZip,
  downloadFile,
  ensurePermission,
  idbGet,
  idbSet,
  loadFolder,
  loadSample,
  pickFolder,
  saveToFolder,
  type LoadedProject,
  type Textures,
} from '../model/io';
import { validateProject } from '../model/validate';
import { EditorCtx, type EditorContext } from './context';
import { PreviewPanel, type PlayStatus } from './PreviewPanel';
import { Sidebar, type View } from './Sidebar';
import { LangView, SpeakersView } from './TablesViews';
import { ProblemRow, Timeline } from './Timeline';

interface Selection {
  fileUid: string;
  dialogueUid: string;
  actionUid: string | null;
}

const snapshotOf = (p: Project) => {
  const map = new Map<string, string>();
  for (const f of p.files) map.set(f.uid, serializeFile(f));
  for (const l of p.langs) map.set(l.uid, serializeLang(l));
  return map;
};

const HISTORY_LIMIT = 200;

export function App() {
  const [project, setProject] = useState<Project | null>(null);
  const historyRef = useRef<{ past: Project[]; future: Project[]; lastKey?: string; lastAt: number }>({ past: [], future: [], lastAt: 0 });
  const [, forceHistory] = useState(0);

  const [textures, setTextures] = useState<Textures>(new Map());
  const [bitmaps, setBitmaps] = useState<Map<string, ImageBitmap>>(new Map());
  const [newTextures, setNewTextures] = useState<Textures>(new Map());
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [saved, setSaved] = useState<Map<string, string>>(new Map());

  const [selection, setSelection] = useState<Selection | null>(null);
  const [view, setView] = useState<View>('dialogue');
  const [locale, setLocale] = useState('en_us');
  const [playStatus, setPlayStatus] = useState<PlayStatus>({ dialogueId: null, current: -1, active: [] });
  const [playRequest, setPlayRequest] = useState<{ id: string; index: number; nonce: number } | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const notify = useCallback((kind: 'ok' | 'error', text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), kind === 'ok' ? 3500 : 8000);
  }, []);

  // --- Chargement ---------------------------------------------------------------------------

  const applyLoaded = useCallback(
    (loaded: LoadedProject, handle: FileSystemDirectoryHandle | null, isSaved = true) => {
      setProject(loaded.project);
      historyRef.current = { past: [], future: [], lastAt: 0 };
      setTextures(loaded.textures);
      setNewTextures(new Map());
      setRoot(handle);
      setSaved(isSaved ? snapshotOf(loaded.project) : new Map());
      const firstFile = loaded.project.files[0];
      const first = firstFile?.dialogues[0];
      setSelection(first ? { fileUid: firstFile.uid, dialogueUid: first.uid, actionUid: null } : null);
      setView('dialogue');
      const locales = localesOf(loaded.project);
      setLocale(locales.includes('fr_fr') ? 'fr_fr' : (locales[0] ?? 'en_us'));
      if (loaded.errors.length) notify('error', `${loaded.errors.length} fichier(s) illisible(s) : ${loaded.errors[0]}`);
    },
    [notify],
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const autosave = await idbGet<{ project: Project; textures: Textures; saved: [string, string][]; handle?: FileSystemDirectoryHandle; locale: string }>('autosave');
        if (autosave?.project) {
          applyLoaded({ project: autosave.project, textures: autosave.textures ?? new Map(), errors: [] }, autosave.handle ?? null);
          setSaved(new Map(autosave.saved));
          setLocale(autosave.locale);
          return;
        }
      } catch {
        // Sauvegarde locale illisible ou navigation privée : on repart de l'exemple.
      }
      try {
        applyLoaded(await loadSample(), null);
      } catch {
        applyLoaded({ project: emptyProject(), textures: new Map(), errors: [] }, null, false);
      }
    })();
  }, [applyLoaded]);

  // Sauvegarde automatique dans le navigateur.
  useEffect(() => {
    if (!project) return;
    const t = window.setTimeout(() => {
      idbSet('autosave', { project, textures, saved: [...saved], handle: root ?? undefined, locale }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [project, textures, saved, root, locale]);

  // Bitmaps des textures pour le canvas.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = new Map<string, ImageBitmap>();
      for (const [rl, blob] of textures) {
        try {
          next.set(rl, await createImageBitmap(blob));
        } catch {
          // Image illisible : la preview affichera la texture manquante.
        }
      }
      if (!cancelled) setBitmaps(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [textures]);

  // --- Modifications ------------------------------------------------------------------------

  const mutate = useCallback((fn: (p: Project) => void, coalesce?: string) => {
    setProject((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      fn(next);
      const h = historyRef.current;
      const now = Date.now();
      // Une suite de frappes dans le même champ forme une seule étape d'annulation.
      if (!(coalesce && h.lastKey === coalesce && now - h.lastAt < 1200)) {
        h.past.push(current);
        if (h.past.length > HISTORY_LIMIT) h.past.shift();
      }
      h.future = [];
      h.lastKey = coalesce;
      h.lastAt = now;
      return next;
    });
    forceHistory((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    setProject((current) => {
      const h = historyRef.current;
      const prev = h.past.pop();
      if (!prev || !current) return current;
      h.future.push(current);
      h.lastKey = undefined;
      return prev;
    });
    forceHistory((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    setProject((current) => {
      const h = historyRef.current;
      const next = h.future.pop();
      if (!next || !current) return current;
      h.past.push(current);
      h.lastKey = undefined;
      return next;
    });
    forceHistory((n) => n + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      } else if (k === 's') {
        e.preventDefault();
        document.getElementById('save-button')?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // --- Données dérivées -----------------------------------------------------------------------

  const current = useMemo(() => {
    if (!project || !selection) return null;
    const file = project.files.find((f) => f.uid === selection.fileUid);
    const dialogue = file?.dialogues.find((d) => d.uid === selection.dialogueUid);
    return file && dialogue ? { file, dialogue } : null;
  }, [project, selection]);

  const textureIds = useMemo(() => [...textures.keys()].sort(), [textures]);
  const problems = useMemo(() => (project ? validateProject(project, new Set(textureIds), locale) : []), [project, textureIds, locale]);
  const world = useMemo(() => (project ? makeWorld(project, locale) : null), [project, locale]);
  const dirty = useMemo(() => {
    if (!project) return { files: [], langs: [] };
    return {
      files: project.files.filter((f) => saved.get(f.uid) !== serializeFile(f)),
      langs: project.langs.filter((l) => saved.get(l.uid) !== serializeLang(l)),
    };
  }, [project, saved]);
  const dirtyCount = dirty.files.length + dirty.langs.length + newTextures.size;
  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0 };
    problems.forEach((p) => c[p.severity]++);
    return c;
  }, [problems]);

  const selectedIndex = current ? current.dialogue.actions.findIndex((a) => a.uid === selection?.actionUid) : -1;
  const currentId = current ? dialogueId(current.file, current.dialogue) : null;

  const openDialogueById = useCallback(
    (id: string) => {
      if (!project) return;
      const found = findDialogue(project, id);
      if (found) {
        setSelection({ fileUid: found.file.uid, dialogueUid: found.dialogue.uid, actionUid: null });
        setView('dialogue');
      }
    },
    [project],
  );

  const setTranslation = useCallback(
    (key: string, loc: string, value: string) => {
      mutate((p) => {
        const holder = p.langs.find((l) => l.locale === loc && key in l.entries) ?? p.langs.find((l) => l.locale === loc);
        if (holder) holder.entries[key] = value;
        else p.langs.push({ uid: uid(), namespace: p.files[0]?.namespace ?? 'minecraft', locale: loc, entries: { [key]: value } });
      }, `tr:${key}:${loc}`);
    },
    [mutate],
  );

  const addTexture = useCallback(async (rl: string, blob: Blob) => {
    const bmp = await createImageBitmap(blob);
    setTextures((t) => new Map(t).set(rl, blob));
    setNewTextures((t) => new Map(t).set(rl, blob));
    return { width: bmp.width, height: bmp.height };
  }, []);

  const ctx: EditorContext | null = useMemo(
    () =>
      project && {
        project,
        locale,
        dialogueIds: allDialogueIds(project),
        speakers: allSpeakers(project),
        textureIds,
        textureBitmaps: bitmaps,
        defaultNamespace: current?.file.namespace ?? project.files[0]?.namespace ?? 'minecraft',
        openDialogueById,
        setTranslation,
        addTexture,
      },
    [project, locale, textureIds, bitmaps, current?.file.namespace, openDialogueById, setTranslation, addTexture],
  );

  const mutateDialogue = useCallback(
    (fn: (d: DialogueEntry) => void, coalesce?: string) => {
      if (!selection) return;
      mutate((p) => {
        const d = p.files.find((f) => f.uid === selection.fileUid)?.dialogues.find((x) => x.uid === selection.dialogueUid);
        if (d) fn(d);
      }, coalesce);
    },
    [mutate, selection],
  );

  // --- Opérations sur les dialogues -----------------------------------------------------------

  const renameDialogue = (fileUid: string, dialogueUid: string, key: string) => {
    if (!project || !key) return;
    const file = project.files.find((f) => f.uid === fileUid)!;
    const entry = file.dialogues.find((d) => d.uid === dialogueUid)!;
    if (entry.key === key) return;
    if (key === 'speakers') {
      notify('error', '« speakers » est réservé à la liste des personnages.');
      return;
    }
    if (file.dialogues.some((d) => d.key === key)) {
      notify('error', `Un dialogue « ${key} » existe déjà dans ce fichier.`);
      return;
    }
    const oldId = dialogueId(file, entry);
    const newId = `${file.namespace}:${key}`;
    let refs = 0;
    const swap = (o: Record<string, unknown>, k: string) => {
      if (typeof o[k] === 'string' && parseResourceLocation(o[k] as string) === oldId) {
        o[k] = newId;
        refs++;
      }
    };
    mutate((p) => {
      p.files.find((f) => f.uid === fileUid)!.dialogues.find((d) => d.uid === dialogueUid)!.key = key;
      for (const f of p.files) {
        for (const d of f.dialogues) {
          for (const a of d.actions) {
            for (const k of ['dialogue', 'set', 'next1', 'next2', 'save1', 'save2']) swap(a.raw, k);
            if (Array.isArray(a.raw.choices)) {
              for (const c of a.raw.choices as Record<string, unknown>[]) {
                swap(c, 'next');
                swap(c, 'save');
              }
            }
          }
        }
      }
    });
    if (refs) notify('ok', `Renommé, ${refs} référence(s) mise(s) à jour.`);
  };

  const addDialogue = (fileUid: string) => {
    const newUid = uid();
    mutate((p) => {
      const f = p.files.find((x) => x.uid === fileUid)!;
      let n = f.dialogues.length + 1;
      while (f.dialogues.some((d) => d.key === `dialogue_${n}`)) n++;
      f.dialogues.push({ uid: newUid, key: `dialogue_${n}`, actions: [] });
    });
    setSelection({ fileUid, dialogueUid: newUid, actionUid: null });
    setView('dialogue');
  };

  const duplicateDialogue = (fileUid: string, dialogueUid: string) => {
    const newUid = uid();
    mutate((p) => {
      const f = p.files.find((x) => x.uid === fileUid)!;
      const i = f.dialogues.findIndex((d) => d.uid === dialogueUid);
      const src = f.dialogues[i];
      let key = `${src.key}_copie`;
      let n = 2;
      while (f.dialogues.some((d) => d.key === key)) key = `${src.key}_copie_${n++}`;
      f.dialogues.splice(i + 1, 0, { uid: newUid, key, actions: src.actions.map((a) => ({ uid: uid(), raw: structuredClone(a.raw) })) });
    });
    setSelection({ fileUid, dialogueUid: newUid, actionUid: null });
  };

  const deleteDialogue = (fileUid: string, dialogueUid: string) => {
    const file = project?.files.find((f) => f.uid === fileUid);
    const d = file?.dialogues.find((x) => x.uid === dialogueUid);
    if (!d || !window.confirm(`Supprimer le dialogue « ${d.key} » ? (Ctrl+Z pour annuler)`)) return;
    mutate((p) => {
      const f = p.files.find((x) => x.uid === fileUid)!;
      f.dialogues = f.dialogues.filter((x) => x.uid !== dialogueUid);
    });
    if (selection?.dialogueUid === dialogueUid) setSelection(null);
  };

  const deleteFile = (fileUid: string) => {
    const file = project?.files.find((f) => f.uid === fileUid);
    if (!file) return;
    if (!window.confirm(`Retirer ${file.path} du projet ? Le fichier sur le disque n'est pas supprimé. (Ctrl+Z pour annuler)`)) return;
    mutate((p) => void (p.files = p.files.filter((f) => f.uid !== fileUid)));
    if (selection?.fileUid === fileUid) setSelection(null);
  };

  const addFile = () => {
    const newFileUid = uid();
    const newDialogueUid = uid();
    mutate((p) => {
      const ns = current?.file.namespace ?? p.files[0]?.namespace ?? 'mon_datapack';
      let n = p.files.length + 1;
      while (p.files.some((f) => f.namespace === ns && f.path === `dialogues_${n}.json`)) n++;
      p.files.push({ uid: newFileUid, namespace: ns, path: `dialogues_${n}.json`, speakers: [], dialogues: [{ uid: newDialogueUid, key: 'intro', actions: [] }], extras: {} });
    });
    setSelection({ fileUid: newFileUid, dialogueUid: newDialogueUid, actionUid: null });
    setView('dialogue');
  };

  // --- Ouvrir / enregistrer ---------------------------------------------------------------------

  const confirmDiscard = () => dirtyCount === 0 || window.confirm(`${dirtyCount} fichier(s) non enregistré(s) seront perdus. Continuer ?`);

  const openFolder = async () => {
    if (!confirmDiscard()) return;
    if (!canUseFolders()) {
      folderInput.current?.click();
      return;
    }
    try {
      const handle = await pickFolder();
      setBusy(true);
      const loaded = await loadFolder(handle);
      if (loaded.project.files.length === 0) {
        notify('error', 'Aucun fichier data/<namespace>/dialogues/*.json dans ce dossier.');
        return;
      }
      applyLoaded(loaded, handle);
      notify('ok', `${loaded.project.files.length} fichier(s) de dialogues ouverts depuis ${handle.name}.`);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) notify('error', `Ouverture impossible : ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const importFolderFallback = async (list: FileList | null) => {
    if (!list?.length) return;
    const entries = [...list]
      .map((f) => ({ path: f.webkitRelativePath || f.name, read: async () => f as Blob }))
      .filter((e) => isRelevantPath(e.path));
    const loaded = await buildProject(list[0].webkitRelativePath.split('/')[0] || 'Projet', entries);
    if (loaded.project.files.length === 0) {
      notify('error', 'Aucun fichier data/<namespace>/dialogues/*.json dans ce dossier.');
      return;
    }
    applyLoaded(loaded, null);
  };

  const importJsonFiles = async (list: FileList | null) => {
    if (!list?.length || !project) return;
    const ns = window.prompt('Namespace de ces dialogues :', current?.file.namespace ?? project.files[0]?.namespace ?? 'mon_datapack');
    if (!ns) return;
    let firstNew: { fileUid: string; dialogueUid: string } | null = null;
    const added: DialogueFile[] = [];
    for (const f of [...list]) {
      try {
        const parsed = parseDialogueFile(await f.text(), ns.trim().toLowerCase(), f.name);
        added.push(parsed);
        if (!firstNew && parsed.dialogues[0]) firstNew = { fileUid: parsed.uid, dialogueUid: parsed.dialogues[0].uid };
      } catch (e) {
        notify('error', `${f.name} : ${e instanceof Error ? e.message : e}`);
      }
    }
    if (added.length) {
      mutate((p) => void p.files.push(...structuredClone(added)));
      if (firstNew) setSelection({ ...firstNew, actionUid: null });
      setView('dialogue');
      notify('ok', `${added.length} fichier(s) importé(s).`);
    }
  };

  const save = async () => {
    if (!project) return;
    if (!root) {
      await downloadDatapackZip(project, textures);
      setSaved(snapshotOf(project));
      setNewTextures(new Map());
      notify('ok', 'Datapack téléchargé.');
      return;
    }
    if (dirtyCount === 0) {
      notify('ok', 'Tout est déjà enregistré.');
      return;
    }
    try {
      if (!(await ensurePermission(root))) {
        notify('error', 'Accès au dossier refusé par le navigateur.');
        return;
      }
      // saveToFolder complète les chemins d'origine : on travaille sur une copie du projet.
      const next = structuredClone(project);
      const files = next.files.filter((f) => dirty.files.some((d) => d.uid === f.uid));
      const langs = next.langs.filter((l) => dirty.langs.some((d) => d.uid === l.uid));
      const written = await saveToFolder(root, next, files, langs, newTextures);
      setProject(next);
      setSaved(snapshotOf(next));
      setNewTextures(new Map());
      notify('ok', `${written.length} fichier(s) enregistré(s) dans ${root.name}.`);
    } catch (e) {
      notify('error', `Enregistrement impossible : ${e instanceof Error ? e.message : e}`);
    }
  };

  const fixProblem = (fileUid: string, dialogueUid: string, actionUid: string, apply: (r: Record<string, unknown>) => Record<string, unknown>) => {
    mutate((p) => {
      const a = p.files.find((f) => f.uid === fileUid)?.dialogues.find((d) => d.uid === dialogueUid)?.actions.find((x) => x.uid === actionUid);
      if (a) a.raw = apply(a.raw);
    });
  };

  const onStatus = useCallback((s: PlayStatus) => setPlayStatus(s), []);

  if (!project || !ctx || !world) {
    return (
      <div className="loading">
        <Sparkles size={18} /> Chargement…
      </div>
    );
  }

  const locales = localesOf(project);
  const whereOf = (fileUid: string, dUid?: string) => {
    const f = project.files.find((x) => x.uid === fileUid);
    const d = f?.dialogues.find((x) => x.uid === dUid);
    return d ? d.key : (f?.path ?? '');
  };
  const playing =
    playStatus.dialogueId && playStatus.dialogueId === currentId ? { active: new Set(playStatus.active), current: playStatus.current } : null;

  return (
    <EditorCtx.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <MessagesSquare size={18} />
            <span>BlablaLib Editor</span>
          </div>
          <input
            className="project-name"
            aria-label="Nom du projet"
            value={project.name}
            onChange={(e) => mutate((p) => void (p.name = e.target.value), 'project-name')}
          />
          <div className="top-group">
            <button className="btn icon" title="Annuler (Ctrl+Z)" disabled={historyRef.current.past.length === 0} onClick={undo}>
              <Undo2 size={15} />
            </button>
            <button className="btn icon" title="Rétablir (Ctrl+Y)" disabled={historyRef.current.future.length === 0} onClick={redo}>
              <Redo2 size={15} />
            </button>
          </div>
          <span className="spacer" />
          {locales.length > 0 && (
            <select className="locale" aria-label="Langue de la preview" value={locale} onChange={(e) => setLocale(e.target.value)}>
              {locales.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          )}
          <button className={showProblems ? 'problem-counts on' : 'problem-counts'} aria-expanded={showProblems} title="Afficher les remarques" onClick={() => setShowProblems(!showProblems)}>
            <span className="sev error"><XCircle size={14} /> {counts.error}</span>
            <span className="sev warning"><AlertTriangle size={14} /> {counts.warning}</span>
            <span className="sev info"><Info size={14} /> {counts.info}</span>
          </button>
          <button
            className="btn icon"
            title="Nouveau projet vide"
            onClick={() => {
              if (confirmDiscard()) applyLoaded({ project: emptyProject(), textures: new Map(), errors: [] }, null, false);
            }}
          >
            <FilePlus2 size={15} />
          </button>
          <button className="btn" onClick={openFolder} disabled={busy} title="Ouvrir un datapack ou le dossier resources d'un mod">
            <FolderOpen size={15} /> Ouvrir un dossier
          </button>
          <button className="btn icon" title="Importer des fichiers JSON de dialogues" onClick={() => fileInput.current?.click()}>
            <FileUp size={15} />
          </button>
          {current && (
            <button className="btn icon" title={`Télécharger ${current.file.path}`} onClick={() => downloadFile(current.file)}>
              <FileDown size={15} />
            </button>
          )}
          <button className="btn icon" title="Télécharger le datapack complet (.zip)" onClick={() => downloadDatapackZip(project, textures)}>
            <Download size={15} />
          </button>
          <button id="save-button" className="btn primary" onClick={save} title={root ? `Écrire dans ${root.name}` : 'Aucun dossier ouvert : télécharge le datapack'}>
            <Save size={15} />
            {root ? 'Enregistrer' : 'Exporter'}
            {dirtyCount > 0 && <span className="badge">{dirtyCount}</span>}
          </button>
          <input ref={fileInput} type="file" accept=".json,application/json" multiple hidden onChange={(e) => { importJsonFiles(e.target.files); e.target.value = ''; }} />
          <input ref={folderInput} type="file" hidden {...({ webkitdirectory: '' } as object)} onChange={(e) => { importFolderFallback(e.target.files); e.target.value = ''; }} />
        </header>

        <datalist id="dialogue-ids">
          {ctx.dialogueIds.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
        <datalist id="speaker-ids">
          {ctx.speakers.map((s, i) => (
            <option key={i} value={s.id} />
          ))}
        </datalist>
        <datalist id="texture-ids">
          {textureIds.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>

        <div className="workspace">
          <Sidebar
            project={project}
            view={view}
            setView={setView}
            selectedDialogue={selection?.dialogueUid ?? null}
            onSelectDialogue={(fileUid, dialogueUid) => {
              setSelection({ fileUid, dialogueUid, actionUid: null });
              setView('dialogue');
            }}
            problems={problems}
            playingId={playStatus.dialogueId}
            onAddDialogue={addDialogue}
            onRenameDialogue={renameDialogue}
            onDuplicateDialogue={duplicateDialogue}
            onDeleteDialogue={deleteDialogue}
            onAddFile={addFile}
            onDeleteFile={deleteFile}
            onEditFile={(fileUid, patch) => mutate((p) => void Object.assign(p.files.find((f) => f.uid === fileUid)!, patch), `file:${fileUid}`)}
          />

          <main className="editor">
            {view === 'dialogue' &&
              (current ? (
                <Timeline
                  key={current.dialogue.uid}
                  file={current.file}
                  dialogue={current.dialogue}
                  selectedUid={selection?.actionUid ?? null}
                  onSelect={(actionUid) => setSelection((s) => s && { ...s, actionUid })}
                  problems={problems.filter((p) => p.dialogueUid === current.dialogue.uid)}
                  playing={playing}
                  onPlayFrom={(index) => currentId && setPlayRequest({ id: currentId, index, nonce: Date.now() })}
                  mutateDialogue={mutateDialogue}
                />
              ) : (
                <div className="empty big">
                  <p>Sélectionnez un dialogue à gauche, ou ouvrez un dossier.</p>
                </div>
              ))}
            {view === 'speakers' && <SpeakersView project={project} locale={locale} mutate={mutate} />}
            {view === 'lang' && <LangView project={project} mutate={mutate} defaultNamespace={ctx.defaultNamespace} />}
          </main>

          <div className="preview-col">
            <PreviewPanel
              world={world}
              revision={project}
              dialogueId={currentId}
              targetIndex={selectedIndex}
              playRequest={playRequest}
              textures={bitmaps}
              onStatus={onStatus}
              onOpenDialogue={openDialogueById}
            />
            {showProblems && (
              <section className="problems-panel" aria-label="Remarques">
                <h3>Remarques sur le projet</h3>
                {problems.length === 0 && <p className="muted">Rien à signaler.</p>}
                {problems.map((p, i) => (
                  <ProblemRow
                    key={i}
                    problem={p}
                    where={whereOf(p.fileUid, p.dialogueUid)}
                    onGo={() => {
                      if (p.dialogueUid) {
                        setSelection({ fileUid: p.fileUid, dialogueUid: p.dialogueUid, actionUid: p.actionUid ?? null });
                        setView('dialogue');
                      } else setView('speakers');
                    }}
                    onFix={p.fix && p.dialogueUid && p.actionUid ? () => fixProblem(p.fileUid, p.dialogueUid!, p.actionUid!, p.fix!.apply) : undefined}
                  />
                ))}
              </section>
            )}
          </div>
        </div>

        {toast && (
          <div className={`toast ${toast.kind}`} role="status">
            {toast.text}
          </div>
        )}
      </div>
    </EditorCtx.Provider>
  );
}
