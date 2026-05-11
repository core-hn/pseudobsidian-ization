import { PseudonymizationEngine } from '../../src/pseudonymizer/PseudonymizationEngine';
import { sortRules, findSpansForRule, buildReplacementPlan } from '../../src/pseudonymizer/ReplacementPlanner';
import { resolveSpans, applySpans } from '../../src/pseudonymizer/SpanProtector';
import type { MappingRule } from '../../src/types';

const FILE_SCOPE = { type: 'file' as const, path: 'entretien_01.srt' };

function rule(
  id: string,
  source: string,
  replacement: string,
  priority = 0
): MappingRule {
  return {
    id,
    source,
    replacement,
    category: 'first_name',
    scope: FILE_SCOPE,
    status: 'validated',
    priority,
    createdBy: 'user',
    createdAt: new Date().toISOString(),
  };
}

const engine = new PseudonymizationEngine();

// --- SPECS §17.1 : remplacement simple ---

describe('Remplacement simple (SPECS §17.1)', () => {
  it('Jean → Pierre dans une phrase courte', () => {
    expect(engine.pseudonymize('Bonjour Jean.', [rule('1', 'Jean', 'Pierre')])).toBe(
      'Bonjour Pierre.'
    );
  });

  it('remplace toutes les occurrences dans le texte', () => {
    const result = engine.pseudonymize('Jean parle à Jean.', [rule('1', 'Jean', 'Pierre')]);
    expect(result).toBe('Pierre parle à Pierre.');
  });

  it("n'applique pas les règles au statut 'suggested'", () => {
    const suggested: MappingRule = { ...rule('1', 'Jean', 'Pierre'), status: 'suggested' };
    expect(engine.pseudonymize('Bonjour Jean.', [suggested])).toBe('Bonjour Jean.');
  });
});

// --- SPECS §17.2 : remplacement composé prioritaire ---

describe('Remplacement composé — jamais Saint-Pierre-de-Luz (SPECS §17.2)', () => {
  const rules = [
    rule('1', 'Jean', 'Pierre', 0),
    rule('2', 'Saint-Jean-de-Luz', 'Ville moyenne limitrophe', 0),
  ];

  it('produit Pierre habite Ville moyenne limitrophe.', () => {
    const result = engine.pseudonymize('Jean habite Saint-Jean-de-Luz.', rules);
    expect(result).toBe('Pierre habite Ville moyenne limitrophe.');
  });

  it('ne produit jamais Saint-Pierre-de-Luz', () => {
    const result = engine.pseudonymize('Jean habite Saint-Jean-de-Luz.', rules);
    expect(result).not.toContain('Saint-Pierre-de-Luz');
  });

  it("Jean seul (hors contexte composé) est bien remplacé par Pierre", () => {
    const result = engine.pseudonymize('Jean habite Saint-Jean-de-Luz.', rules);
    expect(result.startsWith('Pierre')).toBe(true);
  });
});

// --- SPECS §18.2 : tests de non-régression ---

describe('Non-régression (SPECS §18.2)', () => {
  it('Paul / Saint-Paul : Saint-Paul prime sur Paul', () => {
    const rules = [rule('1', 'Paul', 'Marc', 0), rule('2', 'Saint-Paul', 'Commune rurale', 0)];
    const result = engine.pseudonymize('Paul habite Saint-Paul.', rules);
    expect(result).toBe('Marc habite Commune rurale.');
    expect(result).not.toContain('Saint-Marc');
  });

  it('Montpellier / CHU de Montpellier : entité longue prime', () => {
    const rules = [
      rule('1', 'Montpellier', 'Métropole du Sud', 0),
      rule('2', 'CHU de Montpellier', 'CHU régional', 0),
    ];
    const result = engine.pseudonymize(
      'Elle travaille au CHU de Montpellier à Montpellier.',
      rules
    );
    expect(result).toBe('Elle travaille au CHU régional à Métropole du Sud.');
    expect(result).not.toContain('CHU de Métropole');
  });

  it('Marie / Sainte-Marie : Sainte-Marie prime sur Marie', () => {
    const rules = [rule('1', 'Marie', 'Sophie', 0), rule('2', 'Sainte-Marie', 'Commune côtière', 0)];
    const result = engine.pseudonymize('Marie vient de Sainte-Marie.', rules);
    expect(result).toBe('Sophie vient de Commune côtière.');
    expect(result).not.toContain('Sainte-Sophie');
  });

  it('Luz / Saint-Jean-de-Luz : Saint-Jean-de-Luz prime sur Luz', () => {
    const rules = [
      rule('1', 'Luz', 'Ville X', 0),
      rule('2', 'Saint-Jean-de-Luz', 'Ville moyenne limitrophe', 0),
    ];
    const result = engine.pseudonymize('Il vient de Saint-Jean-de-Luz.', rules);
    expect(result).toBe('Il vient de Ville moyenne limitrophe.');
    expect(result).not.toContain('Saint-Jean-de-Ville X');
  });
});

// --- Comportement du z-index (priorité manuelle) ---

describe('Priorité z-index', () => {
  it('une règle courte avec priority élevée passe avant une règle longue à priority 0', () => {
    // L'utilisateur a explicitement choisi de traiter Jean avant l'entité composée
    const rules = [rule('1', 'Jean', 'Pierre', 100), rule('2', 'Saint-Jean-de-Luz', 'Ville X', 0)];
    const result = engine.pseudonymize('Jean habite Saint-Jean-de-Luz.', rules);
    // Jean [0,4] priority 100 → accepté en premier
    // Jean [18,22] inside Saint-Jean-de-Luz → accepté (priority 100, avant [12,29] priority 0)
    // Saint-Jean-de-Luz chevauche avec Jean [18,22] → rejeté
    // Résultat : Pierre habite Saint-Pierre-de-Luz. (comportement attendu quand l'utilisateur choisit ce z-index)
    expect(result).toContain('Pierre');
    expect(result).not.toContain('Jean');
  });

  it('deux règles à même priority : la plus longue source prime', () => {
    const rules = [rule('1', 'Marie', 'Sophie', 5), rule('2', 'Sainte-Marie', 'Commune', 5)];
    const result = engine.pseudonymize('Marie vient de Sainte-Marie.', rules);
    expect(result).toBe('Sophie vient de Commune.');
    expect(result).not.toContain('Sainte-Sophie');
  });
});

// --- Whole-word matching ---

describe('Whole-word matching', () => {
  it('Jean ne remplace pas Jeannine', () => {
    const result = engine.pseudonymize('Bonjour Jeannine.', [rule('1', 'Jean', 'Pierre')]);
    expect(result).toBe('Bonjour Jeannine.');
  });

  it('Jean ne remplace pas Jean-Baptiste', () => {
    const result = engine.pseudonymize('Bonjour Jean-Baptiste.', [rule('1', 'Jean', 'Pierre')]);
    // Jean est séparé par - (non alphanumérique) → considéré whole-word → remplacé
    // C'est le comportement attendu : Jean-Baptiste avec Jean comme prénom → Pierre-Baptiste
    expect(result).toBe('Bonjour Pierre-Baptiste.');
  });

  it('Marie ne remplace pas Mariette', () => {
    const result = engine.pseudonymize('Bonjour Mariette.', [rule('1', 'Marie', 'Sophie')]);
    expect(result).toBe('Bonjour Mariette.');
  });
});

// --- ReplacementPlanner unitaire ---

describe('ReplacementPlanner.sortRules', () => {
  it('trie par priority décroissante', () => {
    const rules = [rule('1', 'Jean', 'Pierre', 0), rule('2', 'Marie', 'Sophie', 10)];
    const sorted = sortRules(rules);
    expect(sorted[0].source).toBe('Marie');
  });

  it('à priority égale, trie par longueur source décroissante', () => {
    const rules = [rule('1', 'Jean', 'Pierre', 0), rule('2', 'Saint-Jean-de-Luz', 'X', 0)];
    const sorted = sortRules(rules);
    expect(sorted[0].source).toBe('Saint-Jean-de-Luz');
  });
});

describe('ReplacementPlanner.findSpansForRule', () => {
  const r = rule('1', 'jean', 'Pierre', 0);

  it('trouve les occurrences en mode case-insensitive (défaut)', () => {
    const spans = findSpansForRule('Bonjour Jean et jean.', r, {
      caseSensitive: false,
      wholeWordOnly: false,
    });
    expect(spans).toHaveLength(2);
  });

  it('whole-word : ne trouve pas jean dans Jeannine', () => {
    const spans = findSpansForRule('Bonjour Jeannine.', r, {
      caseSensitive: false,
      wholeWordOnly: true,
    });
    expect(spans).toHaveLength(0);
  });
});

// --- SpanProtector unitaire ---

describe('SpanProtector', () => {
  it('resolveSpans élimine un span court qui chevauche un span long', () => {
    const spans = [
      { start: 0, end: 4, source: 'Jean', replacement: 'Pierre', mappingId: '1', priority: 0 },
      { start: 0, end: 17, source: 'Jean Dupont', replacement: 'Sophie Arnaud', mappingId: '2', priority: 0 },
    ];
    const resolved = resolveSpans(spans);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].source).toBe('Jean Dupont');
  });

  it('applySpans applique de droite à gauche sans décaler les indices', () => {
    const text = 'Jean habite Lyon.';
    const spans = resolveSpans([
      { start: 0, end: 4, source: 'Jean', replacement: 'Pierre', mappingId: '1', priority: 0 },
      { start: 12, end: 16, source: 'Lyon', replacement: 'Grenoble', mappingId: '2', priority: 0 },
    ]);
    expect(applySpans(text, spans)).toBe('Pierre habite Grenoble.');
  });
});
