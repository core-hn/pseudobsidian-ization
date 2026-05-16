export const REDACTION_CHAR = '🀫';

/**
 * Compte les syllabes d'un texte par heuristique de groupes de voyelles.
 * Fonctionne pour le français et les principales langues romanes/germaniques.
 * Minimum 1 syllabe retourné.
 */
export function countSyllables(text: string): number {
  const groups = text.match(/[aeiouyàâäéèêëîïôùûüœæAEIOUYÀÂÄÉÈÊËÎÏÔÙÛÜŒÆ]+/g);
  return Math.max(1, groups?.length ?? 1);
}

/**
 * Génère un remplacement caviardé : 1 🀫 par syllabe de chaque mot.
 * Les espaces entre mots sont préservés.
 * Ex : "Marie Dupont" → "🀫🀫 🀫🀫🀫" · "Saint-Jean" → "🀫🀫🀫"
 */
export function generateRedaction(text: string): string {
  return text
    .split(/( +)/)  // séparer sur les espaces en les conservant
    .map((part) => {
      if (/^ +$/.test(part)) return part; // préserver les espaces tels quels
      return REDACTION_CHAR.repeat(countSyllables(part));
    })
    .join('');
}

/** Retourne true si un remplacement est un caviardage (commence par 🀫). */
export function isRedaction(replacement: string): boolean {
  return replacement.startsWith(REDACTION_CHAR);
}
