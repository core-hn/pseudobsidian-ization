import type { MappingRule, Occurrence } from '../types';
import { findSpansForRule, sortRules, type PlannerSettings } from '../pseudonymizer/ReplacementPlanner';
import { DEFAULT_PLANNER_SETTINGS } from '../pseudonymizer/ReplacementPlanner';

const CONTEXT_LEN = 45;
let _counter = 0;

function lineOf(text: string, pos: number): number {
  return text.slice(0, pos).split('\n').length;
}

function context(text: string, start: number, end: number) {
  return {
    before: text.slice(Math.max(0, start - CONTEXT_LEN), start),
    after: text.slice(end, Math.min(text.length, end + CONTEXT_LEN)),
  };
}

// Retourne toutes les occurrences des sources des règles dans le contenu,
// triées par position, avec contexte gauche/droite et numéro de ligne.
export function scanOccurrences(
  content: string,
  filePath: string,
  rules: MappingRule[],
  settings: PlannerSettings = DEFAULT_PLANNER_SETTINGS
): Occurrence[] {
  const occurrences: Occurrence[] = [];

  for (const rule of sortRules(rules)) {
    for (const span of findSpansForRule(content, rule, settings)) {
      const { before, after } = context(content, span.start, span.end);
      occurrences.push({
        id: `occ_${Date.now()}_${++_counter}`,
        file: filePath,
        line: lineOf(content, span.start),
        start: span.start,
        end: span.end,
        text: span.source,
        contextBefore: before,
        contextAfter: after,
        category: rule.category,
        mappingId: rule.id,
        status: 'suggested',
      });
    }
  }

  return occurrences.sort((a, b) => a.start - b.start);
}
