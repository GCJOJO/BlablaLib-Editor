import { useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Upload } from 'lucide-react';
import { colorFromString, cssColor, encodeColor, rgba } from '../engine/color';
import { EASINGS, EASING_NAMES } from '../engine/easing';
import { parseResourceLocation } from '../engine/sim';
import { N_, t } from '../i18n';
import { hasTranslation, translate } from '../model/project';
import { clearableIds, label as uiText, type FieldDef } from '../model/schema';
import { messageLines, MESSAGE_MAX_LINES, MESSAGE_MAX_WIDTH } from '../model/validate';
import { useEditor } from './context';

export function Field({ label, hint, children, half }: { label: string; hint?: string; children: ReactNode; half?: boolean }) {
  return (
    <div className={half ? 'field half' : 'field'}>
      <label className="field-label">{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function NumberInput({ value, onChange, placeholder, step, min, max }: { value: unknown; onChange: (v: number | undefined) => void; placeholder?: string; step?: number; min?: number; max?: number }) {
  return (
    <input
      type="number"
      value={typeof value === 'number' ? value : value === undefined ? '' : String(value)}
      placeholder={placeholder}
      step={step ?? 'any'}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    />
  );
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0');

export function ColorField({ value, onChange }: { value: unknown; onChange: (v: string | undefined) => void }) {
  const str = typeof value === 'string' ? value : '';
  const c = str ? colorFromString(str) : null;
  const shown = c ?? rgba(255, 255, 255, 255);
  const set = (next: { r?: number; g?: number; b?: number; a?: number }) => onChange(encodeColor({ ...shown, ...next }));
  return (
    <div className="color-field">
      <span className="swatch">
        <span style={{ background: c ? cssColor(c) : 'transparent' }} />
        <input
          type="color"
          aria-label={t('Choisir la couleur')}
          value={`#${hex2(shown.r)}${hex2(shown.g)}${hex2(shown.b)}`}
          onChange={(e) => {
            const n = parseInt(e.target.value.slice(1), 16);
            set({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 });
          }}
        />
      </span>
      <input
        className="mono"
        value={str}
        placeholder="#RRGGBBAA"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
      <input
        className="alpha"
        type="range"
        min={0}
        max={255}
        value={shown.a}
        aria-label={t('Opacité')}
        title={t('Opacité {n} %', { n: Math.round((shown.a / 255) * 100) })}
        onChange={(e) => set({ a: Number(e.target.value) })}
      />
    </div>
  );
}

export function DialogueField({ value, onChange, placeholder }: { value: unknown; onChange: (v: string | undefined) => void; placeholder?: string }) {
  const { dialogueIds, openDialogueById } = useEditor();
  const str = typeof value === 'string' ? value : '';
  const exists = dialogueIds.includes(str);
  return (
    <div className="with-action">
      <input className="mono" list="dialogue-ids" value={str} placeholder={placeholder ?? 'namespace:dialogue'} spellCheck={false} onChange={(e) => onChange(e.target.value || undefined)} />
      <button className="icon-btn" type="button" title={t('Ouvrir ce dialogue')} disabled={!exists} onClick={() => openDialogueById(str)}>
        <ArrowUpRight size={15} />
      </button>
    </div>
  );
}

const BB_BUTTONS: { label: string; title: string; open: string; close: string; cls?: string }[] = [
  { label: N_('G'), title: N_('Gras [b]'), open: '[b]', close: '[/b]', cls: 'b' },
  { label: N_('I'), title: N_('Italique [i]'), open: '[i]', close: '[/i]', cls: 'i' },
  { label: N_('S'), title: N_('Souligné [u]'), open: '[u]', close: '[/u]', cls: 'u' },
  { label: N_('B'), title: N_('Barré [s]'), open: '[s]', close: '[/s]', cls: 's' },
  { label: N_('Couleur'), title: '[color value=#RRGGBBAA]', open: '[color value=#FF5555FF]', close: '[/color]' },
  { label: N_('Tremble'), title: '[shake intensity=2 speed=1]', open: '[shake]', close: '[/shake]' },
  { label: N_('Vague'), title: '[wave amplitude=3 frequency=0.3 speed=5]', open: '[wave]', close: '[/wave]' },
  { label: N_('Tornade'), title: '[tornado radius=3 speed=4]', open: '[tornado]', close: '[/tornado]' },
  { label: N_('Arc-en-ciel'), title: '[rainbow speed=0.3 saturation=0.8 brightness=1]', open: '[rainbow]', close: '[/rainbow]' },
  { label: N_('Dégradé'), title: '[gradient from=#RRGGBBAA to=#RRGGBBAA]', open: '[gradient from=#FFFFFFFF to=#55AAFFFF]', close: '[/gradient]' },
];

export function RichTextArea({ value, onChange, placeholder, measure }: { value: string; onChange: (v: string) => void; placeholder?: string; measure?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrap = (open: string, close: string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    onChange(value.slice(0, a) + open + value.slice(a, b) + close + value.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + open.length, b + open.length);
    });
  };
  const lines = measure ? messageLines(value) : [];
  const widest = lines.length ? Math.max(...lines) : 0;
  return (
    <div className="rich">
      <div className="rich-tools">
        {BB_BUTTONS.map((b) => (
          <button key={b.label} type="button" className={b.cls ? `bb ${b.cls}` : 'bb'} title={t(b.title)} onClick={() => wrap(b.open, b.close)}>
            {t(b.label)}
          </button>
        ))}
      </div>
      <textarea ref={ref} rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {measure && (
        <div className="rich-meter">
          <span className={widest > MESSAGE_MAX_WIDTH ? 'over' : ''}>
            {widest > MESSAGE_MAX_WIDTH ? t('Un mot déborde : {n} / {max} px', { n: widest, max: MESSAGE_MAX_WIDTH }) : t('Retour à la ligne automatique')}
          </span>
          <span className={lines.length > MESSAGE_MAX_LINES ? 'over' : ''}>
            {t('{n} / {max} lignes', { n: lines.length, max: MESSAGE_MAX_LINES })}
          </span>
        </div>
      )}
    </div>
  );
}

/** Texte brut ou clé de traduction : si c'est une clé connue, on édite la traduction juste en dessous. */
export function TranslatableText({ value, onChange, multiline, placeholder, measure = true }: { value: string; onChange: (v: string | undefined) => void; multiline?: boolean; placeholder?: string; measure?: boolean }) {
  const { project, locale, setTranslation } = useEditor();
  const isKey = !!value && hasTranslation(project, value);
  if (!isKey) {
    return multiline ? (
      <RichTextArea value={value} placeholder={placeholder} measure={measure} onChange={(v) => onChange(v || undefined)} />
    ) : (
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value || undefined)} />
    );
  }
  const translated = translate(project, locale, value);
  return (
    <div className="translated">
      <input className="mono" value={value} spellCheck={false} onChange={(e) => onChange(e.target.value || undefined)} />
      <div className="translated-tag">{t('Clé de traduction · {locale}', { locale })}</div>
      {multiline ? (
        <RichTextArea value={translated} measure={measure} onChange={(v) => setTranslation(value, locale, v)} />
      ) : (
        <input value={translated} onChange={(e) => setTranslation(value, locale, e.target.value)} />
      )}
    </div>
  );
}

function TextureField({ value, onChange, onDims }: { value: unknown; onChange: (v: string | undefined) => void; onDims?: (w: number, h: number) => void }) {
  const { textureBitmaps, addTexture, defaultNamespace } = useEditor();
  const str = typeof value === 'string' ? value : '';
  const input = useRef<HTMLInputElement>(null);
  const bmp = textureBitmaps.get(str);
  return (
    <div className="texture-field">
      <div className="with-action">
        <input className="mono" list="texture-ids" value={str} spellCheck={false} placeholder="namespace:textures/gui/image.png" onChange={(e) => onChange(e.target.value || undefined)} />
        <button className="icon-btn" type="button" title={t('Importer une image')} onClick={() => input.current?.click()}>
          <Upload size={15} />
        </button>
        <input
          ref={input}
          type="file"
          accept="image/png"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
            const rl = `${defaultNamespace}:textures/gui/${safe}`;
            const dims = await addTexture(rl, file);
            onChange(rl);
            onDims?.(dims.width, dims.height);
            e.target.value = '';
          }}
        />
      </div>
      {bmp && (
        <div className="texture-info">
          <span className="thumb">
            <TextureThumb bitmap={bmp} />
          </span>
          <span>{t('Fichier : {w} × {h} px', { w: bmp.width, h: bmp.height })}</span>
          {onDims && (
            <button type="button" className="link" onClick={() => onDims(bmp.width, bmp.height)}>
              {t('Utiliser cette taille')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TextureThumb({ bitmap }: { bitmap: ImageBitmap }) {
  return (
    <canvas
      width={36}
      height={36}
      ref={(c) => {
        const g = c?.getContext('2d');
        if (g) {
          g.clearRect(0, 0, 36, 36);
          g.drawImage(bitmap, 0, 0, 36, 36);
        }
      }}
    />
  );
}

export function EasingSelect({ value, onChange }: { value: unknown; onChange: (v: string | undefined) => void }) {
  const name = typeof value === 'string' ? value : 'linear';
  const fn = EASINGS[name] as ((t: number) => number) | undefined;
  const points = fn
    ? Array.from({ length: 33 }, (_, i) => {
        const t = i / 32;
        return `${(t * 40).toFixed(1)},${(26 - fn(t) * 20).toFixed(1)}`;
      }).join(' ')
    : '';
  return (
    <div className="with-action">
      <select value={fn ? name : ''} onChange={(e) => onChange(e.target.value === 'linear' ? undefined : e.target.value)}>
        {!fn && <option value="">{t('{name} (inconnu)', { name })}</option>}
        {EASING_NAMES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <svg className="ease-curve" viewBox="-1 -1 42 32" aria-hidden="true">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

export function SchemaField({ def, value, onChange, setMany }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void; setMany?: (patch: Record<string, unknown>) => void }) {
  const { customActions } = useEditor();
  const [, force] = useState(0);
  const text = (s: string) => uiText(s, def.literal);
  const placeholder = def.placeholder ? text(def.placeholder) : undefined;
  const clearable = clearableIds(customActions);
  const body = (() => {
    switch (def.type) {
      case 'text':
        return def.translatable ? (
          <TranslatableText value={typeof value === 'string' ? value : ''} placeholder={placeholder} onChange={onChange} />
        ) : (
          <input value={typeof value === 'string' ? value : value === undefined ? '' : String(value)} placeholder={placeholder} spellCheck={false} onChange={(e) => onChange(e.target.value || undefined)} />
        );
      case 'multiline':
        return <TranslatableText multiline measure={def.measure !== false} value={typeof value === 'string' ? value : ''} placeholder={placeholder} onChange={onChange} />;
      case 'number':
        return (
          <div className="number-row">
            <NumberInput value={value} placeholder={placeholder} step={def.step} min={def.min} max={def.max} onChange={onChange} />
            {def.slider && (
              <input type="range" min={def.min} max={def.max} step={def.step ?? 1} value={typeof value === 'number' ? value : 0} aria-label={text(def.label)} onChange={(e) => onChange(Number(e.target.value))} />
            )}
          </div>
        );
      case 'bool':
        return (
          <label className="check">
            <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked ? true : undefined)} /> {t('Oui')}
          </label>
        );
      case 'select':
        return (
          <select value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)}>
            {def.options!.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );
      case 'color':
        return <ColorField value={value} onChange={onChange} />;
      case 'dialogue':
        return <DialogueField value={value} onChange={onChange} />;
      case 'speaker':
        return (
          <SpeakerSelect value={value} onChange={onChange} />
        );
      case 'texture':
        return <TextureField value={value} onChange={onChange} onDims={setMany ? (width, height) => setMany({ width, height }) : undefined} />;
      case 'actionClass':
        return (
          <select value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">{t('Tout effacer')}</option>
            {typeof value === 'string' && value && !clearable.includes(value) && <option value={value}>{value}</option>}
            {clearable.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        );
      case 'json':
        return <JsonField value={value} onChange={(v) => { onChange(v); force((n) => n + 1); }} />;
    }
  })();
  return (
    <Field label={def.required ? `${text(def.label)} *` : text(def.label)} hint={def.hint ? text(def.hint) : undefined} half={def.half}>
      {body}
    </Field>
  );
}

/** Personnages de tous les fichiers du projet. Une valeur inconnue reste choisie pour ne pas la perdre. */
function SpeakerSelect({ value, onChange }: { value: unknown; onChange: (v: string | undefined) => void }) {
  const { speakers, project, locale } = useEditor();
  const str = typeof value === 'string' ? value : '';
  // Le mod compare des ResourceLocation : « dog » et « minecraft:dog » désignent le même personnage.
  const unique = speakers.filter((s, i) => speakers.findIndex((o) => o.id === s.id) === i);
  const target = str ? parseResourceLocation(str) : null;
  const match = target ? unique.find((s) => parseResourceLocation(String(s.id)) === target) : undefined;
  const color = match ? colorFromString(String(match.color ?? '')) : null;
  return (
    <div className="with-action">
      <span className="speaker-dot" style={{ background: color ? cssColor({ ...color, a: 255 }) : 'transparent' }} aria-hidden="true" />
      <select value={match ? String(match.id) : str} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{t('Aucun personnage')}</option>
        {str && !match && <option value={str}>{t('{id} (introuvable)', { id: str })}</option>}
        {unique.map((s) => (
          <option key={String(s.id)} value={String(s.id)}>
            {translate(project, locale, String(s.name ?? ''))} · {String(s.id)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function JsonField({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState('');
  return (
    <>
      <textarea
        className="mono"
        rows={Math.min(14, text.split('\n').length + 1)}
        value={text}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setError('');
          } catch (err) {
            setError(err instanceof Error ? err.message : t('JSON invalide'));
          }
        }}
      />
      {error && <p className="field-error">{error}</p>}
    </>
  );
}
