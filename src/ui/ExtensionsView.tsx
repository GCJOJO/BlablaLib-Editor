import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Braces, ChevronDown, ChevronRight, ChevronUp, Copy, Download, FileUp, Plus, Puzzle, RotateCcw, ScrollText, Trash2, XCircle } from 'lucide-react';
import { parseResourceLocation, type RawAction } from '../engine/sim';
import { getLang, LANGUAGES, N_, t } from '../i18n';
import {
  checkExtension,
  countUsage,
  defaultsOf,
  EXT_FIELD_TYPES,
  EXTENSION_FOLDER,
  EXTENSION_ICONS,
  extensionFileName,
  extensionToJson,
  localize,
  newAction,
  newExtension,
  newField,
  parseExtension,
  PREVIEW_MODES,
  RESERVED_ACTION_IDS,
  serializeExtension,
  toFieldDef,
  type Extension,
  type ExtensionAction,
  type ExtensionField,
  type ExtensionIssue,
  type ExtFieldType,
  type Localized,
  type PreviewMode,
} from '../model/extensions';
import { downloadBlob } from '../model/io';
import { parseLenientJson, uid, type Project } from '../model/project';
import { ColorField, Field, JsonField, NumberInput, SchemaField } from './Fields';
import { EXTENSION_ICON_MAP } from './icons';

type Mutate = (fn: (p: Project) => void, coalesce?: string) => void;

interface Props {
  project: Project;
  mutate: Mutate;
  notify: (kind: 'ok' | 'error', text: string) => void;
}

const MODE_LABELS: Record<PreviewMode, string> = {
  instant: N_('Passe aussitôt'),
  ticks: N_('Dure un nombre de ticks'),
  input: N_('Attend un clic ou une touche'),
};

const TYPE_LABELS: Record<ExtFieldType, string> = {
  text: N_('Texte'),
  multiline: N_('Texte multiligne'),
  number: N_('Nombre'),
  bool: N_('Case à cocher'),
  select: N_('Liste de choix'),
  color: N_('Couleur'),
  dialogue: N_('Dialogue'),
  speaker: N_('Personnage'),
  texture: N_('Texture'),
  json: N_('JSON libre'),
};

/** Champ validé à la sortie (Entrée ou perte du focus), pour les identifiants qui entraînent un renommage. */
function CommitInput({ value, onCommit, className, placeholder, ariaLabel }: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; ariaLabel?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={className}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const v = draft.trim();
        if (v !== value) onCommit(v);
        else setDraft(value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(value);
          requestAnimationFrame(() => e.currentTarget?.blur());
        }
      }}
    />
  );
}

/** Un texte par langue du site. Une simple chaîne est montrée dans toutes les langues jusqu'à ce qu'on la traduise. */
function LocalizedInputs({ value, onChange, placeholder }: { value: Localized | undefined; onChange: (v: Localized | undefined) => void; placeholder?: string }) {
  const get = (lang: string) => (typeof value === 'string' ? value : (value?.[lang] ?? ''));
  const set = (lang: string, v: string) => {
    const next: Record<string, string> = typeof value === 'string' ? Object.fromEntries(LANGUAGES.map((l) => [l.id, value])) : { ...(value ?? {}) };
    next[lang] = v;
    onChange(Object.values(next).some((x) => x) ? next : undefined);
  };
  return (
    <div className="localized">
      {LANGUAGES.map((l) => (
        <label key={l.id}>
          <span className="lang-tag" title={l.name}>
            {l.id.toUpperCase()}
          </span>
          <input value={get(l.id)} placeholder={placeholder} onChange={(e) => set(l.id, e.target.value)} />
        </label>
      ))}
    </div>
  );
}

function IssueList({ issues }: { issues: ExtensionIssue[] }) {
  return (
    <>
      {issues.map((issue, i) => {
        const Icon = issue.severity === 'error' ? XCircle : AlertTriangle;
        return (
          <div key={i} className={`problem ${issue.severity}`}>
            <Icon size={14} />
            <div className="problem-text">
              <span>{issue.message}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

const dialoguesOf = (p: Project) => p.files.flatMap((f) => f.dialogues);

export function ExtensionsView({ project, mutate, notify }: Props) {
  const [open, setOpen] = useState<string | null>(project.extensions[0]?.uid ?? null);
  const fileInput = useRef<HTMLInputElement>(null);

  const create = () => {
    const ext = newExtension(project.extensions, uid());
    mutate((p) => void p.extensions.push(ext));
    setOpen(ext.uid);
  };

  const importFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    let working = structuredClone(project.extensions);
    let imported = 0;
    let lastUid: string | null = null;
    for (const file of [...list]) {
      let parsed: ReturnType<typeof parseExtension>;
      try {
        parsed = parseExtension(parseLenientJson(await file.text()), uid());
      } catch (e) {
        notify('error', t('{file} : {error}', { file: file.name, error: e instanceof Error ? e.message : String(e) }));
        continue;
      }
      const ext = parsed.extension;
      if (!ext) {
        notify('error', t('{file} : {error}', { file: file.name, error: parsed.errors.slice(0, 3).join(' ') }));
        continue;
      }
      const reserved = ext.actions.map((a) => parseResourceLocation(a.id)).filter((id): id is string => !!id && RESERVED_ACTION_IDS.has(id));
      if (reserved.length) {
        notify('error', t('{file} : {list} existe déjà dans BlablaLib, registerCustomAction refuserait ce nom.', { file: file.name, list: reserved.join(', ') }));
        continue;
      }
      const same = working.find((e) => e.id === ext.id);
      if (same) {
        if (!window.confirm(t('L’extension « {id} » existe déjà. La remplacer par {file} ?', { id: ext.id, file: file.name }))) continue;
        ext.originPath = same.originPath;
        working = working.filter((e) => e !== same);
      }
      const ids = new Set(ext.actions.map((a) => parseResourceLocation(a.id)));
      const clashes = working.flatMap((e) => e.actions.filter((a) => ids.has(parseResourceLocation(a.id))).map((a) => `${a.id} (${e.name})`));
      if (clashes.length) {
        if (!window.confirm(t('Ces actions sont déjà définies par une autre extension : {list}. Les retirer de cette extension et garder celles de {file} ?', { list: clashes.join(', '), file: file.name }))) continue;
        working = working.map((e) => ({ ...e, actions: e.actions.filter((a) => !ids.has(parseResourceLocation(a.id))) }));
      }
      working.push(ext);
      imported++;
      lastUid = ext.uid;
    }
    if (!imported) return;
    mutate((p) => void (p.extensions = working));
    setOpen(lastUid);
    notify('ok', t('{n} extension(s) importée(s).', { n: imported }));
  };

  return (
    <div className="table-view extensions-view">
      <div className="timeline-head">
        <h2>{t('Extensions')}</h2>
        <span className="muted">{project.extensions.length > 1 ? t('{n} extensions', { n: project.extensions.length }) : t('{n} extension', { n: project.extensions.length })}</span>
        <span className="spacer" />
        <button className="btn small" onClick={() => fileInput.current?.click()}>
          <FileUp size={14} /> {t('Importer')}
        </button>
        <button className="btn small" onClick={create}>
          <Plus size={14} /> {t('Nouvelle extension')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          multiple
          hidden
          onChange={(e) => {
            importFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <p className="muted lang-intro">
        {t('Une extension décrit les actions custom d’un mod (registerCustomAction) : leurs champs, et si elles bloquent le dialogue. L’éditeur en tire les formulaires et les vérifications. La preview reproduit seulement leur durée : leur effet en jeu n’est pas simulé.')}{' '}
        {t('Avec un dossier ouvert, elles sont enregistrées dans {folder}/.', { folder: EXTENSION_FOLDER })}
      </p>
      {project.extensions.length === 0 && (
        <div className="empty">
          <p>{t('Aucune extension. Créez-en une, ou importez le fichier JSON fourni avec un mod.')}</p>
        </div>
      )}
      {project.extensions.map((ext) => (
        <ExtensionCard key={ext.uid} ext={ext} project={project} mutate={mutate} open={open === ext.uid} onToggle={() => setOpen(open === ext.uid ? null : ext.uid)} />
      ))}
    </div>
  );
}

function ExtensionCard({ ext, project, mutate, open, onToggle }: { ext: Extension; project: Project; mutate: Mutate; open: boolean; onToggle: () => void }) {
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [openAction, setOpenAction] = useState<number | null>(null);
  const issues = useMemo(() => checkExtension(ext, project.extensions), [ext, project.extensions]);
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;

  const edit = (fn: (e: Extension, p: Project) => void, coalesce?: string) =>
    mutate((p) => {
      const e = p.extensions.find((x) => x.uid === ext.uid);
      if (e) fn(e, p);
    }, coalesce ? `ext:${ext.uid}:${coalesce}` : undefined);

  const remove = () => {
    const used = ext.actions.reduce((n, a) => n + countUsage(dialoguesOf(project), a.id), 0);
    const message =
      used > 0
        ? t('Supprimer l’extension « {name} » ? {n} action(s) des dialogues l’utilisent : elles sont conservées mais deviendront inconnues. (Ctrl+Z pour annuler)', { name: ext.name, n: used })
        : t('Supprimer l’extension « {name} » ? (Ctrl+Z pour annuler)', { name: ext.name });
    if (!window.confirm(message)) return;
    mutate((p) => void (p.extensions = p.extensions.filter((e) => e.uid !== ext.uid)));
  };

  const exportFile = () => downloadBlob(new Blob([serializeExtension(ext)], { type: 'application/json' }), extensionFileName(ext));

  return (
    <section className={open ? 'ext-card open' : 'ext-card'}>
      <div className="ext-head">
        <button className="ext-toggle" aria-expanded={open} onClick={onToggle}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <Puzzle size={15} />
          <span className="ext-name">{ext.name}</span>
          <span className="muted mono">{ext.id}</span>
          {ext.version && <span className="tag">v{ext.version}</span>}
          <span className="muted">{ext.actions.length > 1 ? t('{n} actions', { n: ext.actions.length }) : t('{n} action', { n: ext.actions.length })}</span>
          {errors > 0 && <span className="count error">{errors}</span>}
          {errors === 0 && warnings > 0 && <span className="count warning">{warnings}</span>}
        </button>
        <span className="row-tools always">
          <button className="icon-btn" title={t('Exporter {file}', { file: extensionFileName(ext) })} onClick={exportFile}>
            <Download size={14} />
          </button>
          <button className="icon-btn danger" title={t('Supprimer')} onClick={remove}>
            <Trash2 size={14} />
          </button>
        </span>
      </div>
      {open && (
        <div className="ext-body">
          <div className="ext-toolbar">
            {ext.originPath && <span className="muted mono">{ext.originPath}</span>}
            <span className="spacer" />
            <div className="segmented" role="tablist">
              <button role="tab" aria-selected={mode === 'form'} className={mode === 'form' ? 'on' : ''} onClick={() => setMode('form')}>
                <ScrollText size={14} /> {t('Formulaire')}
              </button>
              <button role="tab" aria-selected={mode === 'json'} className={mode === 'json' ? 'on' : ''} onClick={() => setMode('json')}>
                <Braces size={14} /> JSON
              </button>
            </div>
          </div>
          {mode === 'json' ? (
            <ExtensionJson ext={ext} edit={edit} />
          ) : (
            <>
              <div className="grid-form">
                <Field label={t('Identifiant')} half hint={t('Le namespace du mod, en minuscules.')}>
                  <input className="mono" value={ext.id} spellCheck={false} onChange={(e) => edit((x) => void (x.id = e.target.value), 'id')} />
                </Field>
                <Field label={t('Version')} half>
                  <input value={ext.version ?? ''} placeholder="1.0.0" onChange={(e) => edit((x) => void (x.version = e.target.value || undefined), 'version')} />
                </Field>
                <Field label={t('Nom')}>
                  <input value={ext.name} onChange={(e) => edit((x) => void (x.name = e.target.value), 'name')} />
                </Field>
              </div>
              <IssueList issues={issues.filter((i) => i.action === undefined)} />
              <h3 className="ext-section">{t('Actions')}</h3>
              <div className="ext-actions">
                {ext.actions.map((a, i) => (
                  <ActionCard
                    key={i}
                    ext={ext}
                    action={a}
                    index={i}
                    project={project}
                    edit={edit}
                    issues={issues.filter((x) => x.action === i)}
                    open={openAction === i}
                    onToggle={() => setOpenAction(openAction === i ? null : i)}
                    onMoved={setOpenAction}
                  />
                ))}
                <button
                  className="btn ghost"
                  onClick={() => {
                    edit((x) => void x.actions.push(newAction(x)));
                    setOpenAction(ext.actions.length);
                  }}
                >
                  <Plus size={14} /> {t('Ajouter une action')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ExtensionJson({ ext, edit }: { ext: Extension; edit: (fn: (e: Extension) => void, coalesce?: string) => void }) {
  const serialized = useMemo(() => JSON.stringify(extensionToJson(ext), null, 2), [ext]);
  const [text, setText] = useState(serialized);
  const [errors, setErrors] = useState<string[]>([]);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(serialized);
  }, [serialized]);
  return (
    <div className="raw-json">
      <textarea
        className="mono"
        spellCheck={false}
        value={text}
        onFocus={() => (editing.current = true)}
        onBlur={() => {
          editing.current = false;
          if (!errors.length) setText(serialized);
        }}
        onChange={(e) => {
          setText(e.target.value);
          let json: unknown;
          try {
            json = JSON.parse(e.target.value);
          } catch (err) {
            setErrors([err instanceof Error ? err.message : t('JSON invalide')]);
            return;
          }
          const parsed = parseExtension(json, ext.uid, ext.originPath);
          setErrors(parsed.errors);
          if (parsed.extension) {
            const next = parsed.extension;
            edit((x) => void Object.assign(x, next), 'json');
          }
        }}
      />
      {errors.map((err, i) => (
        <p key={i} className="field-error">
          {err}
        </p>
      ))}
    </div>
  );
}

function ActionCard({
  ext,
  action,
  index,
  project,
  edit,
  issues,
  open,
  onToggle,
  onMoved,
}: {
  ext: Extension;
  action: ExtensionAction;
  index: number;
  project: Project;
  edit: (fn: (e: Extension, p: Project) => void, coalesce?: string) => void;
  issues: ExtensionIssue[];
  open: boolean;
  onToggle: () => void;
  onMoved: (index: number | null) => void;
}) {
  const lang = getLang();
  const used = countUsage(dialoguesOf(project), action.id);
  const Icon = EXTENSION_ICON_MAP[action.icon ?? ''] ?? Puzzle;
  const editAction = (fn: (a: ExtensionAction, p: Project) => void, coalesce?: string) =>
    edit((e, p) => fn(e.actions[index], p), coalesce ? `action:${index}:${coalesce}` : undefined);
  const worst = issues.find((i) => i.severity === 'error') ?? issues[0];

  const rename = (next: string) => {
    if (!next) return;
    const target = parseResourceLocation(action.id);
    const update = used > 0 && window.confirm(t('{n} action(s) des dialogues utilisent « {old} ». Les renommer aussi en « {id} » ?', { n: used, old: action.id, id: next }));
    edit((e, p) => {
      e.actions[index].id = next;
      if (!update) return;
      for (const d of dialoguesOf(p)) for (const a of d.actions) if (typeof a.raw.action === 'string' && parseResourceLocation(a.raw.action) === target) a.raw.action = next;
    });
  };

  const move = (to: number) => {
    if (to < 0 || to >= ext.actions.length) return;
    edit((e) => void e.actions.splice(to, 0, e.actions.splice(index, 1)[0]));
    onMoved(open ? to : null);
  };

  const remove = () => {
    const message =
      used > 0
        ? t('Supprimer l’action « {id} » ? {n} action(s) des dialogues l’utilisent : elles sont conservées mais deviendront inconnues.', { id: action.id, n: used })
        : t('Supprimer l’action « {id} » ?', { id: action.id });
    if (!window.confirm(message)) return;
    edit((e) => void e.actions.splice(index, 1));
    onMoved(null);
  };

  const numberFields = action.fields.filter((f) => f.type === 'number');
  const preview = action.preview ?? { mode: 'instant' as PreviewMode };

  return (
    <div className={open ? 'ext-action open' : 'ext-action'}>
      <div className="ext-action-head" onClick={onToggle}>
        <span className="action-icon">
          <Icon size={14} />
        </span>
        <span className="action-main">
          <span className="action-label">{localize(action.label, lang) || action.id}</span>
          <span className="action-summary mono">{action.id}</span>
        </span>
        <span className={action.blocking ? 'tag on' : 'tag'}>{action.blocking ? t('Bloquante') : t('Non bloquante')}</span>
        <span className="muted used">{used > 1 ? t('utilisée {n} fois', { n: used }) : used === 1 ? t('utilisée 1 fois') : t('inutilisée')}</span>
        {worst && (worst.severity === 'error' ? <XCircle className="sev error" size={14} /> : <AlertTriangle className="sev warning" size={14} />)}
        <span className="row-tools" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" title={t('Monter')} disabled={index === 0} onClick={() => move(index - 1)}>
            <ChevronUp size={14} />
          </button>
          <button className="icon-btn" title={t('Descendre')} disabled={index === ext.actions.length - 1} onClick={() => move(index + 1)}>
            <ChevronDown size={14} />
          </button>
          <button
            className="icon-btn"
            title={t('Dupliquer')}
            onClick={() =>
              edit((e) => {
                const copy = structuredClone(e.actions[index]);
                copy.id = `${copy.id}_${t('copie')}`;
                e.actions.splice(index + 1, 0, copy);
              })
            }
          >
            <Copy size={14} />
          </button>
          <button className="icon-btn danger" title={t('Supprimer')} onClick={remove}>
            <Trash2 size={14} />
          </button>
        </span>
      </div>
      {open && (
        <div className="ext-action-body">
          <IssueList issues={issues} />
          <div className="grid-form">
            <Field label={t('Identifiant')} half hint={t('Le nom passé à registerCustomAction : namespace:nom.')}>
              <CommitInput className="mono" value={action.id} onCommit={rename} />
            </Field>
            <Field label={t('Icône')} half>
              <div className="icon-picker" role="radiogroup" aria-label={t('Icône')}>
                {EXTENSION_ICONS.map((name) => {
                  const I = EXTENSION_ICON_MAP[name];
                  const on = (action.icon ?? 'puzzle') === name;
                  return (
                    <button key={name} type="button" role="radio" aria-checked={on} className={on ? 'on' : ''} title={name} onClick={() => editAction((a) => void (a.icon = name))}>
                      <I size={14} />
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label={t('Libellé')}>
              <LocalizedInputs value={action.label} onChange={(v) => editAction((a) => void (a.label = v ?? ''), 'label')} />
            </Field>
            <Field label={t('Description')}>
              <LocalizedInputs value={action.description} onChange={(v) => editAction((a) => void (a.description = v), 'description')} />
            </Field>
            <Field label={t('Bloquante')} half hint={t('isBlocking() : le dialogue attend la fin de l’action avant de continuer.')}>
              <label className="check">
                <input type="checkbox" checked={action.blocking} onChange={(e) => editAction((a) => void (a.blocking = e.target.checked))} /> {t('Oui')}
              </label>
            </Field>
            <Field label={t('Passable (Échap)')} half hint={t('isSkippable() : Échap peut la passer.')}>
              <label className="check">
                <input type="checkbox" checked={action.skippable} onChange={(e) => editAction((a) => void (a.skippable = e.target.checked))} /> {t('Oui')}
              </label>
            </Field>
          </div>

          <h4 className="ext-section">{t('Dans la preview')}</h4>
          <div className="grid-form">
            <Field label={t('Durée de l’action')} half hint={action.blocking ? undefined : t('Sans effet : une action non bloquante ne retient pas le dialogue.')}>
              <select value={preview.mode} onChange={(e) => editAction((a) => void (a.preview = { ...preview, mode: e.target.value as PreviewMode }))}>
                {PREVIEW_MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(MODE_LABELS[m])}
                  </option>
                ))}
              </select>
            </Field>
            {preview.mode === 'ticks' && (
              <>
                <Field label={t('Durée lue dans le champ')} half>
                  <select value={preview.ticksField ?? ''} onChange={(e) => editAction((a) => void (a.preview = { ...preview, ticksField: e.target.value || undefined }))}>
                    <option value="">{t('Aucun : durée fixe')}</option>
                    {preview.ticksField && !numberFields.some((f) => f.key === preview.ticksField) && <option value={preview.ticksField}>{preview.ticksField}</option>}
                    {numberFields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.key}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={preview.ticksField ? t('Durée si le champ est absent') : t('Durée fixe')} half hint={t('En ticks (20 ticks = 1 seconde).')}>
                  <NumberInput value={preview.ticks} min={0} step={1} placeholder="0" onChange={(v) => editAction((a) => void (a.preview = { ...preview, ticks: v }), 'ticks')} />
                </Field>
              </>
            )}
            <Field label={t('Texte du journal')} hint={t('Un nom de champ entre accolades, comme {intensity}, est remplacé par sa valeur. Vide : le libellé de l’action.')}>
              <input value={preview.log ?? ''} placeholder={t('Secousse de {intensity}')} onChange={(e) => editAction((a) => void (a.preview = { ...preview, log: e.target.value || undefined }), 'log')} />
            </Field>
          </div>

          <h4 className="ext-section">{t('Champs')}</h4>
          <div className="ext-fields">
            {action.fields.map((f, i) => (
              <FieldCard key={i} action={action} field={f} index={i} editAction={editAction} />
            ))}
            {action.fields.length === 0 && <p className="muted">{t('Aucun champ : l’action ne contient que « action ».')}</p>}
            <button className="btn ghost" onClick={() => editAction((a) => void a.fields.push(newField(a)))}>
              <Plus size={14} /> {t('Ajouter un champ')}
            </button>
          </div>

          <FormPreview action={action} />
        </div>
      )}
    </div>
  );
}

function DefaultValue({ field, onChange }: { field: ExtensionField; onChange: (v: unknown) => void }) {
  const v = field.default;
  switch (field.type) {
    case 'number':
      return <NumberInput value={v} placeholder={t('aucune')} onChange={onChange} />;
    case 'bool':
      return (
        <select value={v === undefined ? '' : String(v)} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'true')}>
          <option value="">{t('aucune')}</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    case 'select':
      return (
        <select value={typeof v === 'string' ? v : ''} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">{t('aucune')}</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case 'color':
      return <ColorField value={v} onChange={onChange} />;
    case 'json':
      return <JsonField key={field.key} value={v ?? null} onChange={(x) => onChange(x === null ? undefined : x)} />;
    default:
      return <input value={typeof v === 'string' ? v : ''} placeholder={t('aucune')} spellCheck={false} onChange={(e) => onChange(e.target.value || undefined)} />;
  }
}

function FieldCard({
  action,
  field,
  index,
  editAction,
}: {
  action: ExtensionAction;
  field: ExtensionField;
  index: number;
  editAction: (fn: (a: ExtensionAction, p: Project) => void, coalesce?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const editField = (fn: (f: ExtensionField) => void, coalesce?: string) => editAction((a) => fn(a.fields[index]), coalesce ? `field:${index}:${coalesce}` : undefined);
  const set = <K extends keyof ExtensionField>(key: K, value: ExtensionField[K] | undefined, coalesce?: string) =>
    editField((f) => {
      if (value === undefined) delete f[key];
      else f[key] = value as ExtensionField[K];
    }, coalesce);

  const renameKey = (next: string) => {
    if (!next) return;
    editAction((a, p) => {
      const old = a.fields[index].key;
      a.fields[index].key = next;
      if (a.preview?.ticksField === old) a.preview.ticksField = next;
      const target = parseResourceLocation(a.id);
      // Les dialogues gardent leurs valeurs sous le nouveau nom.
      for (const d of dialoguesOf(p)) {
        for (const x of d.actions) {
          if (typeof x.raw.action === 'string' && parseResourceLocation(x.raw.action) === target && old in x.raw && !(next in x.raw)) {
            x.raw[next] = x.raw[old];
            delete x.raw[old];
          }
        }
      }
    });
  };

  const isText = field.type === 'text' || field.type === 'multiline';
  return (
    <div className="choice-card ext-field">
      <div className="choice-head">
        <button className="ext-toggle small" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="mono">{field.key}</span>
          <span className="muted">{t(TYPE_LABELS[field.type])}</span>
          {field.required && <span className="tag">{t('obligatoire')}</span>}
        </button>
        <span className="spacer" />
        <button type="button" className="icon-btn" title={t('Monter')} disabled={index === 0} onClick={() => editAction((a) => void a.fields.splice(index - 1, 0, a.fields.splice(index, 1)[0]))}>
          <ChevronUp size={14} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t('Descendre')}
          disabled={index === action.fields.length - 1}
          onClick={() => editAction((a) => void a.fields.splice(index + 1, 0, a.fields.splice(index, 1)[0]))}
        >
          <ChevronDown size={14} />
        </button>
        <button type="button" className="icon-btn danger" title={t('Supprimer')} onClick={() => editAction((a) => void a.fields.splice(index, 1))}>
          <Trash2 size={14} />
        </button>
      </div>
      {open && (
        <div className="grid-form">
          <Field label={t('Clé JSON')} half hint={t('Renommer met à jour les dialogues qui utilisent cette action.')}>
            <CommitInput className="mono" value={field.key} onCommit={renameKey} />
          </Field>
          <Field label={t('Type')} half>
            <select
              value={field.type}
              onChange={(e) =>
                editField((f) => {
                  f.type = e.target.value as ExtFieldType;
                  delete f.default;
                  if (f.type === 'select' && !f.options?.length) f.options = ['a', 'b'];
                })
              }
            >
              {EXT_FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(TYPE_LABELS[type])}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Libellé')}>
            <LocalizedInputs value={field.label} onChange={(v) => set('label', v ?? field.key, 'label')} />
          </Field>
          <Field label={t('Aide')}>
            <LocalizedInputs value={field.hint} onChange={(v) => set('hint', v, 'hint')} />
          </Field>
          <Field label={t('Obligatoire')} half hint={t('Sinon, la vérification le signale.')}>
            <label className="check">
              <input type="checkbox" checked={field.required === true} onChange={(e) => set('required', e.target.checked || undefined)} /> {t('Oui')}
            </label>
          </Field>
          <Field label={t('Valeur par défaut')} half hint={t('Écrite à l’ajout de l’action.')}>
            <DefaultValue field={field} onChange={(v) => set('default', v, 'default')} />
          </Field>
          {field.type === 'select' && (
            <Field label={t('Options')} hint={t('Séparées par des virgules.')}>
              <CommitInput
                value={(field.options ?? []).join(', ')}
                onCommit={(v) =>
                  set(
                    'options',
                    v
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean),
                  )
                }
              />
            </Field>
          )}
          {field.type === 'number' && (
            <>
              <Field label={t('Minimum')} half>
                <NumberInput value={field.min} onChange={(v) => set('min', v, 'min')} />
              </Field>
              <Field label={t('Maximum')} half>
                <NumberInput value={field.max} onChange={(v) => set('max', v, 'max')} />
              </Field>
              <Field label={t('Pas')} half>
                <NumberInput value={field.step} onChange={(v) => set('step', v, 'step')} />
              </Field>
              <Field label={t('Curseur')} half hint={t('Avec un minimum et un maximum.')}>
                <label className="check">
                  <input type="checkbox" checked={field.slider === true} onChange={(e) => set('slider', e.target.checked || undefined)} /> {t('Oui')}
                </label>
              </Field>
            </>
          )}
          {(isText || field.type === 'number' || field.type === 'texture') && (
            <Field label={t('Texte indicatif')} half>
              <input value={field.placeholder ?? ''} onChange={(e) => set('placeholder', e.target.value || undefined, 'placeholder')} />
            </Field>
          )}
          {isText && (
            <Field label={t('Clé de traduction possible')} half hint={t('Le texte peut être une clé des fichiers lang.')}>
              <label className="check">
                <input type="checkbox" checked={field.translatable === true} onChange={(e) => set('translatable', e.target.checked || undefined)} /> {t('Oui')}
              </label>
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

/** Le formulaire tel qu'il apparaîtra dans un dialogue, avec le JSON qu'il produit. */
function FormPreview({ action }: { action: ExtensionAction }) {
  const lang = getLang();
  const defaults = useMemo(() => defaultsOf(action), [action]);
  const [raw, setRaw] = useState<RawAction>(defaults);
  const schemaKey = JSON.stringify(action.fields.map((f) => [f.key, f.type, f.default]));
  useEffect(() => setRaw(defaultsOf(action)), [schemaKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="form-preview">
      <div className="form-preview-head">
        <h4 className="ext-section">{t('Aperçu du formulaire')}</h4>
        <span className="spacer" />
        <button className="icon-btn" title={t('Revenir aux valeurs par défaut')} onClick={() => setRaw(defaultsOf(action))}>
          <RotateCcw size={14} />
        </button>
      </div>
      {action.fields.length > 0 ? (
        <div className="grid-form">
          {action.fields.map((f) => (
            <SchemaField
              key={f.key}
              def={toFieldDef(f, lang)}
              value={raw[f.key]}
              onChange={(v) =>
                setRaw((r) => {
                  const next = { ...r };
                  if (v === undefined) delete next[f.key];
                  else next[f.key] = v;
                  return next;
                })
              }
            />
          ))}
        </div>
      ) : (
        <p className="muted">{t('Aucun réglage.')}</p>
      )}
      <pre className="mono form-preview-json">{JSON.stringify(raw, null, 2)}</pre>
    </div>
  );
}
