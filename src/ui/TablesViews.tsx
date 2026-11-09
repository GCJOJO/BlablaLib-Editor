import { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { parseResourceLocation, type SimSpeaker } from '../engine/sim';
import { t } from '../i18n';
import { localesOf, translate, uid, type DialogueFile, type Project } from '../model/project';
import { ColorField } from './Fields';

interface SpeakersProps {
  project: Project;
  locale: string;
  mutate: (fn: (p: Project) => void, coalesce?: string) => void;
}

function SoundsInput({ sounds, onChange }: { sounds: string[]; onChange: (s: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v) onChange([...sounds, v]);
    setDraft('');
  };
  return (
    <div className="chips">
      {sounds.map((s, i) => (
        <span className="chip mono" key={i}>
          {s}
          <button type="button" aria-label={t('Retirer {name}', { name: s })} onClick={() => onChange(sounds.filter((_, k) => k !== i))}>
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        className="mono"
        value={draft}
        placeholder="block.note_block.banjo"
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
      />
    </div>
  );
}

export function SpeakersView({ project, locale, mutate }: SpeakersProps) {
  const edit = (fileUid: string, index: number, fn: (s: SimSpeaker) => void, coalesce: string) =>
    mutate((p) => fn(p.files.find((f) => f.uid === fileUid)!.speakers[index]), `speaker:${fileUid}:${index}:${coalesce}`);

  const usage = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of project.files) {
      for (const d of f.dialogues) {
        for (const a of d.actions) {
          if (a.raw.action === 'blablalib:message' && typeof a.raw.speaker === 'string') {
            const id = parseResourceLocation(a.raw.speaker) ?? a.raw.speaker;
            map.set(id, (map.get(id) ?? 0) + 1);
          }
        }
      }
    }
    return map;
  }, [project]);

  const addTo = (file: DialogueFile) =>
    mutate((p) => {
      const f = p.files.find((x) => x.uid === file.uid)!;
      const idPrefix = `${f.namespace}:${t('personnage')}_`;
      let n = f.speakers.length + 1;
      while (f.speakers.some((s) => s.id === `${idPrefix}${n}`)) n++;
      f.speakers.push({ id: `${idPrefix}${n}`, name: t('Personnage {n}', { n }), color: '#FFFFFFFF', sounds: [] });
    });

  return (
    <div className="table-view">
      <div className="timeline-head">
        <h2>{t('Personnages')}</h2>
        <span className="muted">{t('Partagés entre tous les fichiers du projet.')}</span>
      </div>
      {project.files.map((file) => (
        <section key={file.uid} className="speaker-file">
          <h3 className="mono">
            {file.namespace} / {file.path}
          </h3>
          {file.speakers.map((s, i) => {
            const n = usage.get(parseResourceLocation(String(s.id)) ?? '') ?? 0;
            return (
              <div className="speaker-card" key={i}>
                <div className="speaker-head">
                  <span className="muted">{n === 0 ? t('Aucune réplique') : n > 1 ? t('{n} répliques', { n }) : t('{n} réplique', { n })}</span>
                  <span className="spacer" />
                  <button className="icon-btn danger" title={t('Supprimer')} onClick={() => mutate((p) => void p.files.find((f) => f.uid === file.uid)!.speakers.splice(i, 1))}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid-form">
                  <div className="field half">
                    <label className="field-label">{t('Identifiant')}</label>
                    <input className="mono" value={s.id ?? ''} spellCheck={false} onChange={(e) => edit(file.uid, i, (x) => void (x.id = e.target.value), 'id')} />
                  </div>
                  <div className="field half">
                    <label className="field-label">{t('Nom')}</label>
                    <input value={s.name ?? ''} onChange={(e) => edit(file.uid, i, (x) => void (x.name = e.target.value), 'name')} />
                    {s.name && translate(project, locale, s.name) !== s.name && <p className="field-hint">{t('Affiché : {name}', { name: translate(project, locale, s.name) })}</p>}
                  </div>
                  <div className="field">
                    <label className="field-label">{t('Couleur du nom')}</label>
                    <ColorField value={s.color} onChange={(v) => edit(file.uid, i, (x) => void (x.color = v ?? ''), 'color')} />
                    <p className="field-hint">{t('Avec le # obligatoire : le format « FFFFFFFF » de la doc donne toujours du blanc.')}</p>
                  </div>
                  <div className="field">
                    <label className="field-label">{t('Sons de frappe')}</label>
                    <SoundsInput sounds={Array.isArray(s.sounds) ? s.sounds : []} onChange={(list) => edit(file.uid, i, (x) => void (x.sounds = list), 'sounds')} />
                    <p className="field-hint">{t('Un son au hasard à chaque lettre. Doit être un son enregistré dans le jeu.')}</p>
                  </div>
                </div>
              </div>
            );
          })}
          <button className="btn ghost" onClick={() => addTo(file)}>
            <Plus size={14} /> {t('Ajouter un personnage')}
          </button>
        </section>
      ))}
    </div>
  );
}

function usedKeys(project: Project): Set<string> {
  const out = new Set<string>();
  for (const f of project.files) {
    for (const s of f.speakers) if (s.name) out.add(s.name);
    for (const d of f.dialogues) {
      for (const a of d.actions) {
        if (typeof a.raw.text === 'string') out.add(a.raw.text);
        if (Array.isArray(a.raw.choices)) for (const c of a.raw.choices as { name?: string }[]) if (c?.name) out.add(c.name);
      }
    }
  }
  return out;
}

export function LangView({ project, mutate, defaultNamespace }: { project: Project; mutate: SpeakersProps['mutate']; defaultNamespace: string }) {
  const [filter, setFilter] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newLocale, setNewLocale] = useState('');
  const locales = localesOf(project);
  const used = useMemo(() => usedKeys(project), [project]);

  const keys = useMemo(() => {
    const set = new Set<string>();
    for (const l of project.langs) for (const k of Object.keys(l.entries)) set.add(k);
    return [...set].sort();
  }, [project.langs]);
  const q = filter.trim().toLowerCase();
  const shown = keys.filter((k) => !q || k.toLowerCase().includes(q) || project.langs.some((l) => l.entries[k]?.toLowerCase().includes(q)));

  const setValue = (key: string, locale: string, value: string) =>
    mutate((p) => {
      const holder = p.langs.find((l) => l.locale === locale && key in l.entries) ?? p.langs.find((l) => l.locale === locale);
      if (holder) holder.entries[key] = value;
      else p.langs.push({ uid: uid(), namespace: defaultNamespace, locale, entries: { [key]: value } });
    }, `lang:${key}:${locale}`);

  const removeKey = (key: string) =>
    mutate((p) => {
      for (const l of p.langs) delete l.entries[key];
    });

  const addKey = () => {
    const k = newKey.trim();
    if (!k) return;
    mutate((p) => {
      if (p.langs.length === 0) p.langs.push({ uid: uid(), namespace: defaultNamespace, locale: 'en_us', entries: {} });
      p.langs[0].entries[k] = '';
    });
    setNewKey('');
  };
  const addLocale = () => {
    const code = newLocale.trim().toLowerCase();
    if (!/^[a-z]{2,3}_[a-z]{2,3}$/.test(code) || locales.includes(code)) return;
    mutate((p) => void p.langs.push({ uid: uid(), namespace: defaultNamespace, locale: code, entries: {} }));
    setNewLocale('');
  };

  return (
    <div className="table-view">
      <div className="timeline-head">
        <h2>{t('Traductions')}</h2>
        <span className="muted">{keys.length > 1 ? t('{n} clés', { n: keys.length }) : t('{n} clé', { n: keys.length })}</span>
        <span className="spacer" />
        <input className="filter" placeholder={t('Filtrer')} aria-label={t('Filtrer les traductions')} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <p className="muted lang-intro">
        {t('Un texte égal à une clé connue est remplacé par sa traduction. Sinon, le jeu affiche le texte tel quel. La traduction se fait côté client, dans la langue du joueur.')}
      </p>
      <div className="lang-add">
        <input className="mono" placeholder={t('nouvelle.cle.de.traduction')} aria-label={t('Nouvelle clé')} value={newKey} spellCheck={false} onChange={(e) => setNewKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addKey()} />
        <button className="btn small" onClick={addKey}>
          <Plus size={14} /> {t('Clé')}
        </button>
        <input className="mono" placeholder="de_de" aria-label={t('Nouvelle langue')} value={newLocale} spellCheck={false} onChange={(e) => setNewLocale(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLocale()} />
        <button className="btn small" onClick={addLocale}>
          <Plus size={14} /> {t('Langue')}
        </button>
      </div>
      {locales.length === 0 && keys.length === 0 ? (
        <div className="empty">
          <p>{t('Aucune traduction. Ajoutez une clé, ou écrivez simplement le texte en clair dans vos dialogues.')}</p>
        </div>
      ) : (
        <div className="lang-table-wrap">
          <table className="lang-table">
            <thead>
              <tr>
                <th>{t('Clé')}</th>
                {locales.map((l) => (
                  <th key={l} className="mono">
                    {l}
                  </th>
                ))}
                <th aria-label={t('Actions')} />
              </tr>
            </thead>
            <tbody>
              {shown.map((k) => (
                <tr key={k}>
                  <td className="mono key" title={k}>
                    {k}
                    {!used.has(k) && !k.startsWith('blablalib.commands') && <span className="tag">{t('non utilisée')}</span>}
                  </td>
                  {locales.map((l) => {
                    const holder = project.langs.find((x) => x.locale === l && k in x.entries);
                    return (
                      <td key={l} className={holder ? '' : 'missing'}>
                        <textarea rows={1} aria-label={t('{key} en {locale}', { key: k, locale: l })} value={holder?.entries[k] ?? ''} placeholder={t('manquant')} onChange={(e) => setValue(k, l, e.target.value)} />
                      </td>
                    );
                  })}
                  <td>
                    <button className="icon-btn danger" title={t('Supprimer cette clé')} onClick={() => removeKey(k)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
