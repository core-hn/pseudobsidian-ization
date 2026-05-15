import en from './locales/en.json';
import fr from './locales/fr.json';

type Strings = Record<string, string>;

const LOCALES: Record<string, Strings> = { en, fr };
const FALLBACK = 'en';

let _locale = FALLBACK;

/** Définit la locale active. Appelé au chargement du plugin depuis les settings. */
export function setLocale(lang: string): void {
  _locale = LOCALES[lang] ? lang : FALLBACK;
}

export function getLocale(): string {
  return _locale;
}

/**
 * Retourne la chaîne traduite pour la clé donnée.
 * Les arguments {0}, {1}… sont remplacés par les valeurs correspondantes.
 *
 * @example
 * t('notice.ruleCreated', 'Jean', 'Pierre') // "✓ Règle créée : "Jean" → "Pierre""
 */
export function t(key: string, ...args: (string | number)[]): string {
  const locale = LOCALES[_locale] ?? LOCALES[FALLBACK];
  let s = locale[key] ?? LOCALES[FALLBACK][key] ?? key;
  for (let i = 0; i < args.length; i++) {
    s = s.replace(`{${i}}`, String(args[i]));
  }
  return s;
}

/** Langues disponibles avec leur nom natif. */
export const AVAILABLE_LANGUAGES: Record<string, string> = {
  en: 'English',
  fr: 'Français',
};
