import type { MappingRule, ReplacementSpan, Scope } from '../types';

export interface PlannerSettings {
  caseSensitive: boolean;
  wholeWordOnly: boolean;
}

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  caseSensitive: false,
  wholeWordOnly: true,
};

// Tri des règles : priority desc → longueur source desc → portée locale desc (SPECS §12.3)
export function sortRules(rules: MappingRule[]): MappingRule[] {
  return [...rules].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.source.length !== a.source.length) return b.source.length - a.source.length;
    return scopeWeight(b.scope) - scopeWeight(a.scope);
  });
}

function scopeWeight(scope: Scope): number {
  if (scope.type === 'file') return 3;
  if (scope.type === 'folder') return 2;
  return 1;
}

// Inclut les lettres latines accentuées pour ne pas couper les mots français
const WORD_CHAR = /[\wÀ-ɏ]/;

function isWholeWord(text: string, start: number, end: number): boolean {
  if (start > 0 && WORD_CHAR.test(text[start - 1])) return false;
  if (end < text.length && WORD_CHAR.test(text[end])) return false;
  return true;
}

// Trouve toutes les occurrences d'une règle dans le texte
export function findSpansForRule(
  text: string,
  rule: MappingRule,
  settings: PlannerSettings
): ReplacementSpan[] {
  const spans: ReplacementSpan[] = [];
  const needle = settings.caseSensitive ? rule.source : rule.source.toLowerCase();
  const haystack = settings.caseSensitive ? text : text.toLowerCase();
  const sourceLen = needle.length;

  let pos = 0;
  while (pos <= haystack.length - sourceLen) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;

    if (!settings.wholeWordOnly || isWholeWord(text, idx, idx + sourceLen)) {
      spans.push({
        start: idx,
        end: idx + sourceLen,
        source: text.slice(idx, idx + sourceLen),
        replacement: rule.replacement,
        mappingId: rule.id,
        priority: rule.priority,
      });
    }

    pos = idx + 1;
  }

  return spans;
}

// Construit le plan de remplacement complet pour un texte (SPECS §12.2)
export function buildReplacementPlan(
  text: string,
  rules: MappingRule[],
  settings: PlannerSettings = DEFAULT_PLANNER_SETTINGS
): ReplacementSpan[] {
  const allSpans: ReplacementSpan[] = [];
  for (const rule of sortRules(rules)) {
    allSpans.push(...findSpansForRule(text, rule, settings));
  }
  return allSpans;
}
