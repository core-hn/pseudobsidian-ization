import type {
  MappingRule,
  MappingStatus,
  EntityCategory,
  ScopeType,
  Occurrence,
  ReplacementSpan,
  DictionaryEntry,
  MappingFile,
} from '../../src/types';

// Smoke test Phase 0 : les types sont cohérents et les valeurs par défaut correctes

describe('Types partagés', () => {
  it('MappingRule accepte priority = 0 par défaut (z-index)', () => {
    const rule: MappingRule = {
      id: 'map_000001',
      source: 'Jean',
      replacement: 'Pierre',
      category: 'first_name',
      scope: { type: 'file', path: 'entretien_01.srt' },
      status: 'validated',
      priority: 0,
      createdBy: 'user',
      createdAt: new Date().toISOString(),
    };
    expect(rule.priority).toBe(0);
    expect(rule.source).toBe('Jean');
  });

  it('MappingRule avec priority élevée passe avant priority basse', () => {
    const rules: MappingRule[] = [
      { id: '1', source: 'Jean', replacement: 'Pierre', category: 'first_name',
        scope: { type: 'file' }, status: 'validated', priority: 0,
        createdBy: 'user', createdAt: '' },
      { id: '2', source: 'Saint-Jean-de-Luz', replacement: 'Ville moyenne littorale',
        category: 'place', scope: { type: 'file' }, status: 'validated', priority: 10,
        createdBy: 'user', createdAt: '' },
    ];
    const sorted = [...rules].sort((a, b) => b.priority - a.priority);
    expect(sorted[0].source).toBe('Saint-Jean-de-Luz');
  });

  it('ScopeType couvre les trois portées', () => {
    const portées: ScopeType[] = ['file', 'folder', 'vault'];
    expect(portées).toHaveLength(3);
  });

  it('MappingStatus couvre tous les statuts définis dans SPECS §5.4', () => {
    const statuts: MappingStatus[] = [
      'suggested', 'validated', 'ignored', 'partial',
      'conflict', 'disabled', 'needs_review',
    ];
    expect(statuts).toHaveLength(7);
  });

  it('EntityCategory couvre toutes les catégories', () => {
    const catégories: EntityCategory[] = [
      'first_name', 'last_name', 'full_name', 'place',
      'institution', 'date', 'age', 'profession', 'custom',
    ];
    expect(catégories).toHaveLength(9);
  });

  it('ReplacementSpan positionne correctement un remplacement', () => {
    const span: ReplacementSpan = {
      start: 8,
      end: 12,
      source: 'Jean',
      replacement: 'Pierre',
      mappingId: 'map_000001',
      priority: 0,
    };
    expect(span.end - span.start).toBe(span.source.length);
  });

  it('DictionaryEntry Coulmont contient les métadonnées sociologiques', () => {
    const entry: DictionaryEntry = {
      value: 'Thibault',
      type: 'first_name',
      gender: 'masculine',
      decade: 1989,
      socialClass: 'supérieur',
      origin: 'fr',
      replacementCandidates: ['Édouard', 'Gauthier', 'Clément'],
    };
    expect(entry.socialClass).toBe('supérieur');
    expect(entry.decade).toBe(1989);
  });

  it('MappingFile respecte le schéma SPECS §5.2', () => {
    const table: MappingFile = {
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      project: 'UJAA-2026',
      scope: { type: 'folder', path: 'Transcriptions/UJAA' },
      mappings: [],
    };
    expect(table.schemaVersion).toBe('1.0.0');
    expect(table.scope.type).toBe('folder');
  });

  it('cas non-régression : Jean ne doit jamais remplacer Saint-Jean-de-Luz avant lui', () => {
    // Le span le plus long avec priority >= span court doit être appliqué en premier
    const spans: ReplacementSpan[] = [
      { start: 14, end: 31, source: 'Saint-Jean-de-Luz', replacement: 'Ville moyenne littorale', mappingId: '2', priority: 10 },
      { start: 21, end: 25, source: 'Jean', replacement: 'Pierre', mappingId: '1', priority: 0 },
    ];
    // Après résolution, seul le span englobant doit être retenu
    const sorted = [...spans].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return (b.end - b.start) - (a.end - a.start);
    });
    const accepted: ReplacementSpan[] = [];
    for (const candidate of sorted) {
      const overlaps = accepted.some(
        (s) => candidate.start < s.end && candidate.end > s.start
      );
      if (!overlaps) accepted.push(candidate);
    }
    expect(accepted).toHaveLength(1);
    expect(accepted[0].source).toBe('Saint-Jean-de-Luz');
  });
});
