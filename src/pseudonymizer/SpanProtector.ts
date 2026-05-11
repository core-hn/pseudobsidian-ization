import type { ReplacementSpan } from '../types';

// Résout les chevauchements : garde les spans les plus prioritaires / les plus longs,
// rejette ceux qui chevauchent un span déjà accepté. (SPECS §12.4)
export function resolveSpans(candidates: ReplacementSpan[]): ReplacementSpan[] {
  const sorted = [...candidates].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const lenB = b.end - b.start;
    const lenA = a.end - a.start;
    if (lenB !== lenA) return lenB - lenA;
    return a.start - b.start; // à priorité et longueur égales : position croissante
  });

  const accepted: ReplacementSpan[] = [];
  for (const candidate of sorted) {
    const overlaps = accepted.some(
      (s) => candidate.start < s.end && candidate.end > s.start
    );
    if (!overlaps) accepted.push(candidate);
  }

  // Trier de droite à gauche pour que l'application ne décale pas les indices
  return accepted.sort((a, b) => b.start - a.start);
}

export interface ReplacementMarker {
  open: string;
  close: string;
}

// Applique les spans résolus sur le texte de droite à gauche. (SPECS §12.5)
// Si marker est fourni, chaque remplacement est encadré par marker.open / marker.close.
export function applySpans(
  text: string,
  spans: ReplacementSpan[],
  marker?: ReplacementMarker
): string {
  let output = text;
  for (const span of spans) {
    const value = marker
      ? `${marker.open}${span.replacement}${marker.close}`
      : span.replacement;
    output = output.slice(0, span.start) + value + output.slice(span.end);
  }
  return output;
}
