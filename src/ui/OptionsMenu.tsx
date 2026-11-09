import { useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { LANGUAGES, setLang, t, useLang, type Lang } from '../i18n';

export function OptionsMenu() {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="options" ref={root}>
      <button
        ref={button}
        className={open ? 'btn icon toggled' : 'btn icon'}
        title={t('Options')}
        aria-label={t('Options')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Settings size={15} />
      </button>
      {open && (
        <div className="options-menu" role="dialog" aria-label={t('Options')}>
          <h3>{t('Options')}</h3>
          <label className="field-label" htmlFor="site-language">
            {t('Langue du site')}
          </label>
          <select id="site-language" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <p className="field-hint">{t('Ne change pas le texte de vos dialogues : leur langue se choisit dans la barre du haut.')}</p>
        </div>
      )}
    </div>
  );
}
