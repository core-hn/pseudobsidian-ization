import type { MappingRule } from '../types';
import {
  buildReplacementPlan,
  DEFAULT_PLANNER_SETTINGS,
  type PlannerSettings,
} from './ReplacementPlanner';
import { resolveSpans, applySpans, type ReplacementMarker } from './SpanProtector';

export class PseudonymizationEngine {
  private settings: PlannerSettings;

  constructor(settings: PlannerSettings = DEFAULT_PLANNER_SETTINGS) {
    this.settings = settings;
  }

  // Applique toutes les règles validées sur le texte et retourne le texte pseudonymisé.
  // Si marker est fourni, chaque remplacement est encadré par marker.open / marker.close.
  pseudonymize(text: string, rules: MappingRule[], marker?: ReplacementMarker): string {
    const validated = rules.filter((r) => r.status === 'validated');
    const candidates = buildReplacementPlan(text, validated, this.settings);
    const resolved = resolveSpans(candidates);
    return applySpans(text, resolved, marker);
  }
}
