// Langue de l'interface. Le texte français sert de clé : t('Enregistrer') cherche sa traduction dans le
// dictionnaire de la langue active. i18n.test.ts vérifie que chaque clé du code est traduite.

import { useSyncExternalStore } from 'react';
import { en } from './en';

export type Lang = 'fr' | 'en';

/** Chaque langue est écrite dans sa propre langue, pour rester lisible quelle que soit celle active. */
export const LANGUAGES: { id: Lang; name: string }[] = [
  { id: 'fr', name: 'Français' },
  { id: 'en', name: 'English' },
];

const STORAGE_KEY = 'blablalib-editor.lang';
const DICTIONARIES: Record<Exclude<Lang, 'fr'>, Record<string, string>> = { en };

function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.some((l) => l.id === stored)) return stored as Lang;
  } catch {
    // Stockage bloqué : on se rabat sur la langue du navigateur.
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

let current: Lang = detectLang();
const listeners = new Set<() => void>();

function applyToDocument() {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
applyToDocument();

export const getLang = () => current;

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  applyToDocument();
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Choix valable pour cette session seulement.
  }
  listeners.forEach((l) => l());
}

/** Fait suivre la langue à un composant. Le faire dans App suffit : ses enfants ne sont pas mémoïsés. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLang,
  );
}

/** Traduit une clé. `{nom}` est remplacé par params.nom. Une clé sans traduction reste en français. */
export function t(key: string, params?: Record<string, string | number>): string {
  const text = current === 'fr' ? key : (DICTIONARIES[current][key] ?? key);
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in params ? String(params[name]) : all));
}

/** Marque un texte stocké dans une constante, traduit plus tard avec t(variable). */
export const N_ = (key: string) => key;
