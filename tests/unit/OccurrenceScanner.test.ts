import { scanOccurrences } from '../../src/scanner/OccurrenceScanner';
import type { MappingRule } from '../../src/types';

const FILE = 'entretien_01.md';
const SCOPE = { type: 'file' as const, path: FILE };

function rule(id: string, source: string, replacement: string, priority = 0): MappingRule {
  return {
    id, source, replacement, category: 'first_name', scope: SCOPE,
    status: 'validated', priority, createdBy: 'user', createdAt: '',
  };
}

const TEXT = 'Bonjour Jean, tu habites Saint-Jean-de-Luz. Jean était là.';
const RULES = [
  rule('1', 'Jean', 'Pierre', 0),
  rule('2', 'Saint-Jean-de-Luz', 'Ville littorale', 0),
];

describe('OccurrenceScanner', () => {
  it('trouve toutes les occurrences des sources', () => {
    const occs = scanOccurrences(TEXT, FILE, RULES);
    // Jean×3 + Saint-Jean-de-Luz×1 (dont Jean intérieur, whole-word = true donc Jean dans Saint-Jean-de-Luz est trouvé)
    const sources = occs.map((o) => o.text);
    expect(sources).toContain('Jean');
    expect(sources).toContain('Saint-Jean-de-Luz');
  });

  it('retourne les occurrences triées par position', () => {
    const occs = scanOccurrences(TEXT, FILE, RULES);
    for (let i = 1; i < occs.length; i++) {
      expect(occs[i].start).toBeGreaterThanOrEqual(occs[i - 1].start);
    }
  });

  it('associe chaque occurrence à son mappingId', () => {
    const occs = scanOccurrences(TEXT, FILE, RULES);
    const jeanOcc = occs.find((o) => o.text === 'Jean' && o.start === 8);
    expect(jeanOcc?.mappingId).toBe('1');
    const villOcc = occs.find((o) => o.text === 'Saint-Jean-de-Luz');
    expect(villOcc?.mappingId).toBe('2');
  });

  it('remplit contextBefore et contextAfter', () => {
    const occs = scanOccurrences(TEXT, FILE, RULES);
    const first = occs[0];
    expect(first.contextBefore).toContain('Bonjour');
    expect(first.contextAfter.length).toBeGreaterThan(0);
  });

  it('calcule le numéro de ligne (base 1)', () => {
    const multiline = 'ligne un\nBonjour Jean ici\nligne trois';
    const occs = scanOccurrences(multiline, FILE, [rule('1', 'Jean', 'Pierre')]);
    expect(occs[0].line).toBe(2);
  });

  it('retourne un tableau vide si aucune règle', () => {
    expect(scanOccurrences(TEXT, FILE, [])).toHaveLength(0);
  });

  it('retourne un tableau vide si aucun terme trouvé', () => {
    const occs = scanOccurrences('Aucun terme ici.', FILE, RULES);
    expect(occs).toHaveLength(0);
  });

  it('chaque occurrence a un id unique', () => {
    const occs = scanOccurrences(TEXT, FILE, RULES);
    const ids = occs.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
