import { useState } from 'react';
import { Copy, FileJson, FilePlus2, Languages, MessagesSquare, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { dialogueId, type DialogueFile, type Project } from '../model/project';
import type { Problem } from '../model/validate';

export type View = 'dialogue' | 'speakers' | 'lang';

interface Props {
  project: Project;
  view: View;
  setView: (v: View) => void;
  selectedDialogue: string | null;
  onSelectDialogue: (fileUid: string, dialogueUid: string) => void;
  problems: Problem[];
  playingId: string | null;
  onAddDialogue: (fileUid: string) => void;
  onRenameDialogue: (fileUid: string, dialogueUid: string, key: string) => void;
  onDuplicateDialogue: (fileUid: string, dialogueUid: string) => void;
  onDeleteDialogue: (fileUid: string, dialogueUid: string) => void;
  onAddFile: () => void;
  onDeleteFile: (fileUid: string) => void;
  onEditFile: (fileUid: string, patch: Partial<Pick<DialogueFile, 'namespace' | 'path'>>) => void;
}

export function Sidebar(p: Props) {
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const q = query.trim().toLowerCase();

  const counts = new Map<string, { error: number; warning: number }>();
  for (const pr of p.problems) {
    if (!pr.dialogueUid) continue;
    const c = counts.get(pr.dialogueUid) ?? { error: 0, warning: 0 };
    if (pr.severity === 'error') c.error++;
    if (pr.severity === 'warning') c.warning++;
    counts.set(pr.dialogueUid, c);
  }

  return (
    <nav className="sidebar" aria-label="Projet">
      <div className="side-tabs" role="tablist">
        <button role="tab" aria-selected={p.view === 'dialogue'} className={p.view === 'dialogue' ? 'on' : ''} onClick={() => p.setView('dialogue')}>
          <MessagesSquare size={15} /> Dialogues
        </button>
        <button role="tab" aria-selected={p.view === 'speakers'} className={p.view === 'speakers' ? 'on' : ''} onClick={() => p.setView('speakers')}>
          <Users size={15} /> Personnages
        </button>
        <button role="tab" aria-selected={p.view === 'lang'} className={p.view === 'lang' ? 'on' : ''} onClick={() => p.setView('lang')}>
          <Languages size={15} /> Traductions
        </button>
      </div>

      <div className="side-search">
        <Search size={14} />
        <input placeholder="Rechercher un dialogue" aria-label="Rechercher un dialogue" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="tree">
        {p.project.files.map((file) => {
          const list = file.dialogues.filter((d) => !q || dialogueId(file, d).toLowerCase().includes(q));
          if (q && list.length === 0) return null;
          return (
            <div className="tree-file" key={file.uid}>
              <div className="tree-file-head">
                <FileJson size={14} />
                <div className="tree-file-name" title={`data/${file.namespace}/dialogues/${file.path}`}>
                  <span className="ns">{file.namespace}</span>
                  <span>{file.path}</span>
                </div>
                <span className="row-tools">
                  <button className="icon-btn" title="Modifier le namespace et le chemin" onClick={() => setEditingFile(editingFile === file.uid ? null : file.uid)}>
                    <Pencil size={13} />
                  </button>
                  <button className="icon-btn" title="Nouveau dialogue" onClick={() => p.onAddDialogue(file.uid)}>
                    <Plus size={14} />
                  </button>
                  <button className="icon-btn danger" title="Retirer ce fichier du projet" onClick={() => p.onDeleteFile(file.uid)}>
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>
              {editingFile === file.uid && (
                <div className="file-edit">
                  <label>
                    Namespace
                    <input className="mono" value={file.namespace} spellCheck={false} onChange={(e) => p.onEditFile(file.uid, { namespace: e.target.value })} />
                  </label>
                  <label>
                    Chemin
                    <input className="mono" value={file.path} spellCheck={false} onChange={(e) => p.onEditFile(file.uid, { path: e.target.value })} />
                  </label>
                </div>
              )}
              {list.map((d) => {
                const c = counts.get(d.uid);
                const id = dialogueId(file, d);
                return (
                  <div key={d.uid} className={p.view === 'dialogue' && p.selectedDialogue === d.uid ? 'tree-item selected' : 'tree-item'}>
                    {renaming === d.uid ? (
                      <input
                        className="mono rename"
                        autoFocus
                        defaultValue={d.key}
                        spellCheck={false}
                        aria-label="Nouveau nom"
                        onBlur={(e) => {
                          p.onRenameDialogue(file.uid, d.uid, e.target.value.trim());
                          setRenaming(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                      />
                    ) : (
                      <>
                        <button className="tree-link mono" onClick={() => p.onSelectDialogue(file.uid, d.uid)} onDoubleClick={() => setRenaming(d.uid)} title={id}>
                          {p.playingId === id && <span className="live-dot" aria-label="En lecture" />}
                          <span className="tree-label">{d.key}</span>
                        </button>
                        {c?.error ? <span className="count error">{c.error}</span> : c?.warning ? <span className="count warning">{c.warning}</span> : null}
                        <span className="row-tools">
                          <button className="icon-btn" title="Renommer" onClick={() => setRenaming(d.uid)}>
                            <Pencil size={13} />
                          </button>
                          <button className="icon-btn" title="Dupliquer" onClick={() => p.onDuplicateDialogue(file.uid, d.uid)}>
                            <Copy size={13} />
                          </button>
                          <button className="icon-btn danger" title="Supprimer" onClick={() => p.onDeleteDialogue(file.uid, d.uid)}>
                            <Trash2 size={13} />
                          </button>
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {p.project.files.length === 0 && <p className="muted pad">Aucun fichier de dialogues.</p>}
      </div>

      <button className="btn ghost side-add" onClick={p.onAddFile}>
        <FilePlus2 size={14} /> Nouveau fichier
      </button>
    </nav>
  );
}
