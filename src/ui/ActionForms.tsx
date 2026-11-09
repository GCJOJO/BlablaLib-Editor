import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';
import type { RawAction } from '../engine/sim';
import { N_, t } from '../i18n';
import { actionDef, RAW_ACTIONS } from '../model/schema';
import { ColorField, DialogueField, EasingSelect, Field, JsonField, NumberInput, SchemaField, TranslatableText } from './Fields';

type Patch = (fn: (raw: RawAction) => void, coalesce?: string) => void;

function setKey(target: RawAction, key: string, value: unknown) {
  if (value === undefined) delete target[key];
  else target[key] = value;
}

// --- Choix -------------------------------------------------------------------------------------

function ChoiceForm({ raw, patch }: { raw: RawAction; patch: Patch }) {
  const legacy = ['option1', 'next1', 'save1', 'action1', 'option2', 'next2', 'save2', 'action2'].some((k) => k in raw);
  const choices = (Array.isArray(raw.choices) ? raw.choices : []) as RawAction[];
  const edit = (fn: (list: RawAction[]) => void, coalesce?: string) =>
    patch((r) => {
      const list = (Array.isArray(r.choices) ? r.choices : []) as RawAction[];
      fn(list);
      r.choices = list;
    }, coalesce);

  const convertLegacy = () =>
    patch((r) => {
      const list: RawAction[] = [];
      for (const n of [1, 2]) {
        if (!(`option${n}` in r)) continue;
        const c: RawAction = { name: r[`option${n}`] };
        if (r[`next${n}`]) c.next = r[`next${n}`];
        if (r[`save${n}`]) c.save = r[`save${n}`];
        if (r[`action${n}`] && r[`action${n}`] !== 'none') c.action = r[`action${n}`];
        list.push(c);
      }
      for (const k of ['option', 'next', 'save', 'action']) for (const n of [1, 2]) delete r[`${k}${n}`];
      r.choices = [...list, ...((r.choices as RawAction[]) ?? [])];
    });

  return (
    <div className="choices">
      {legacy && (
        <div className="notice">
          {t("Ce choix utilise l'ancien format (option1, next1…), encore accepté par le mod.")}
          <button type="button" className="link" onClick={convertLegacy}>
            {t('Convertir au format « choices »')}
          </button>
        </div>
      )}
      {choices.map((c, i) => (
        <div className="choice-card" key={i}>
          <div className="choice-head">
            <span>{t('Option {n}', { n: i + 1 })}</span>
            <span className="spacer" />
            <button type="button" className="icon-btn" title={t('Monter')} disabled={i === 0} onClick={() => edit((l) => l.splice(i - 1, 0, l.splice(i, 1)[0]))}>
              <ChevronUp size={14} />
            </button>
            <button type="button" className="icon-btn" title={t('Descendre')} disabled={i === choices.length - 1} onClick={() => edit((l) => l.splice(i + 1, 0, l.splice(i, 1)[0]))}>
              <ChevronDown size={14} />
            </button>
            <button type="button" className="icon-btn" title={t('Supprimer')} onClick={() => edit((l) => void l.splice(i, 1))}>
              <Trash2 size={14} />
            </button>
          </div>
          <Field label={t('Libellé')}>
            <TranslatableText value={typeof c.name === 'string' ? c.name : ''} onChange={(v) => edit((l) => void (l[i].name = v ?? ''), `choice-name-${i}`)} />
          </Field>
          <Field label={t('Dialogue suivant')}>
            <DialogueField
              value={c.next}
              onChange={(v) =>
                edit((l) => {
                  // « save » suit « next » tant qu'on ne l'a pas personnalisé : le mod exige les deux.
                  const followsNext = !l[i].save || l[i].save === l[i].next;
                  setKey(l[i], 'next', v);
                  if (followsNext) setKey(l[i], 'save', v);
                }, `choice-next-${i}`)
              }
            />
          </Field>
          <Field label={t('Dialogue sauvegardé')} hint={t('Celui que /dialogue play rouvrira. Requis, sinon le clic ferme seulement le dialogue.')}>
            <DialogueField value={c.save} onChange={(v) => edit((l) => setKey(l[i], 'save', v), `choice-save-${i}`)} />
          </Field>
          <Field label={t('Action serveur')} hint={t("Texte libre, transmis à l'événement DIALOGUE_CHOICE_MADE.")}>
            <input value={typeof c.action === 'string' ? c.action : ''} spellCheck={false} onChange={(e) => edit((l) => setKey(l[i], 'action', e.target.value || undefined), `choice-action-${i}`)} />
          </Field>
        </div>
      ))}
      <button type="button" className="btn ghost" onClick={() => edit((l) => void l.push({ name: `Option ${l.length + 1}` }))}>
        <Plus size={14} /> {t('Ajouter une option')}
      </button>
    </div>
  );
}

// --- Animation d'image -------------------------------------------------------------------------

type Track = { key: string; label: string; defaults: RawAction; fields: { key: string; label: string; color?: boolean; step?: number }[] };

const TRACKS: Track[] = [
  {
    key: 'position',
    label: N_('Position'),
    defaults: { time: 20, x_start: 50, x_end: 50 },
    fields: [
      { key: 'x_start', label: N_('X début (%)') },
      { key: 'x_end', label: N_('X fin (%)') },
      { key: 'y_start', label: N_('Y début (%)') },
      { key: 'y_end', label: N_('Y fin (%)') },
    ],
  },
  {
    key: 'rotation',
    label: N_('Rotation'),
    defaults: { time: 20, from: 0, to: 360 },
    fields: [
      { key: 'from', label: N_('De (°)') },
      { key: 'to', label: N_('À (°)') },
    ],
  },
  {
    key: 'scale',
    label: N_('Échelle'),
    defaults: { time: 20, from: 1, to: 2 },
    fields: [
      { key: 'from', label: N_('De'), step: 0.1 },
      { key: 'to', label: N_('À'), step: 0.1 },
    ],
  },
  {
    key: 'color',
    label: N_('Couleur'),
    defaults: { time: 20, from: '#FFFFFF00', to: '#FFFFFFFF' },
    fields: [
      { key: 'from', label: N_('De'), color: true },
      { key: 'to', label: N_('À'), color: true },
    ],
  },
];

function ImageMoveForm({ raw, patch }: { raw: RawAction; patch: Patch }) {
  return (
    <div className="tracks">
      <p className="field-hint">{t("Seule l'opacité de la couleur est appliquée à l'image par le mod. La teinte est ignorée.")}</p>
      {TRACKS.map((track) => {
        const data = raw[track.key] as RawAction | undefined;
        const on = !!data;
        return (
          <div className={on ? 'track on' : 'track'} key={track.key}>
            <label className="track-head">
              <input type="checkbox" checked={on} onChange={(e) => patch((r) => setKey(r, track.key, e.target.checked ? { ...track.defaults } : undefined))} />
              {t(track.label)}
            </label>
            {on && (
              <div className="grid-form">
                <Field label={t('Durée (ticks)')} half>
                  <NumberInput value={data.time} onChange={(v) => patch((r) => setKey(r[track.key] as RawAction, 'time', v), `${track.key}-time`)} />
                </Field>
                <Field label={t('Easing')} half>
                  <EasingSelect value={data.easing} onChange={(v) => patch((r) => setKey(r[track.key] as RawAction, 'easing', v))} />
                </Field>
                {track.fields.map((f) => (
                  <Field key={f.key} label={t(f.label)} half={!f.color}>
                    {f.color ? (
                      <ColorField value={data[f.key]} onChange={(v) => patch((r) => setKey(r[track.key] as RawAction, f.key, v), `${track.key}-${f.key}`)} />
                    ) : (
                      <NumberInput value={data[f.key]} step={f.step} placeholder={t('inchangé')} onChange={(v) => patch((r) => setKey(r[track.key] as RawAction, f.key, v), `${track.key}-${f.key}`)} />
                    )}
                  </Field>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- PNJ ---------------------------------------------------------------------------------------

function NpcForm({ raw, patch }: { raw: RawAction; patch: Patch }) {
  const type = typeof raw.type === 'string' ? raw.type : 'bool';
  const defaultFor: Record<string, unknown> = { bool: true, number: 0, string: '', resource_location: 'minecraft:stone' };
  return (
    <div className="grid-form">
      <Field label={t('PNJ')} half hint={t('Numéro donné par BlablaLib.setPlayerNPC.')}>
        <NumberInput value={raw.npc} step={1} placeholder="-1" onChange={(v) => patch((r) => setKey(r, 'npc', v), 'npc')} />
      </Field>
      <Field label={t('Type')} half>
        <select value={type} onChange={(e) => patch((r) => { r.type = e.target.value; r.value = defaultFor[e.target.value]; })}>
          {Object.keys(defaultFor).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('Variable')} half>
        <input value={typeof raw.variable === 'string' ? raw.variable : ''} spellCheck={false} onChange={(e) => patch((r) => void (r.variable = e.target.value), 'npc-var')} />
      </Field>
      <Field label={t('Valeur')} half>
        {type === 'bool' ? (
          <select value={String(raw.value)} onChange={(e) => patch((r) => void (r.value = e.target.value === 'true'))}>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : type === 'number' ? (
          <NumberInput value={raw.value} onChange={(v) => patch((r) => void (r.value = v ?? 0), 'npc-value')} />
        ) : (
          <input value={typeof raw.value === 'string' ? raw.value : ''} spellCheck={false} onChange={(e) => patch((r) => void (r.value = e.target.value), 'npc-value')} />
        )}
      </Field>
    </div>
  );
}

// --- Formulaire d'une action ---------------------------------------------------------------------

const CUSTOM_KEYS: Record<string, string[]> = {
  choice: ['choices', 'option1', 'next1', 'save1', 'action1', 'option2', 'next2', 'save2', 'action2'],
  image_move: ['position', 'rotation', 'scale', 'color'],
  npc: ['npc', 'variable', 'type', 'value'],
};

export function ActionForm({ raw, patch }: { raw: RawAction; patch: Patch }) {
  const def = actionDef(raw);
  if (!def) {
    const rawDef = RAW_ACTIONS.find((r) => r.id === String(raw.action).replace('blablalib:', ''));
    if (rawDef) return <p className="field-hint">{t(rawDef.description)} {t('Aucun réglage.')}</p>;
    return (
      <div className="grid-form">
        <Field label={t("Nom de l'action")} hint={t("Inconnue de BlablaLib. Elle peut venir d'un autre mod (registerCustomAction) : la preview la passe.")}>
          <input className="mono" value={String(raw.action ?? '')} spellCheck={false} onChange={(e) => patch((r) => void (r.action = e.target.value), 'unknown-name')} />
        </Field>
        <Field label={t('JSON complet')}>
          <JsonField
            key={String(raw.action)}
            value={raw}
            onChange={(v) =>
              patch((r) => {
                for (const k of Object.keys(r)) delete r[k];
                Object.assign(r, v);
              }, 'unknown-json')
            }
          />
        </Field>
      </div>
    );
  }

  const known = new Set(['action', ...def.fields.map((f) => f.key), ...(def.custom ? CUSTOM_KEYS[def.custom] : [])]);
  if (def.id === 'blablalib:next_dialogue') known.add('set');
  const stray = Object.keys(raw).filter((k) => !known.has(k));

  return (
    <div className="form">
      {def.fields.length > 0 && (
        <div className="grid-form">
          {def.fields.map((f) => (
            <SchemaField
              key={f.key}
              def={f}
              value={raw[f.key]}
              onChange={(v) => patch((r) => setKey(r, f.key, v), f.key)}
              setMany={(values) => patch((r) => Object.assign(r, values))}
            />
          ))}
        </div>
      )}
      {def.custom === 'choice' && <ChoiceForm raw={raw} patch={patch} />}
      {def.custom === 'image_move' && <ImageMoveForm raw={raw} patch={patch} />}
      {def.custom === 'npc' && <NpcForm raw={raw} patch={patch} />}
      {stray.length > 0 && (
        <div className="stray">
          <span>{t('Champs que le mod ne lit pas :')}</span>
          {stray.map((k) => (
            <button key={k} type="button" className="stray-chip" title={t('Retirer ce champ')} onClick={() => patch((r) => void delete r[k])}>
              {k} <X size={12} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
