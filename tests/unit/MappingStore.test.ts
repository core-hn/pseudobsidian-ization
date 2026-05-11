import { MappingStore, DEFAULT_FILE_SETTINGS } from '../../src/mappings/MappingStore';
import type { MappingFile } from '../../src/types';

const FILE_SCOPE = { type: 'file' as const, path: 'entretien_01.srt' };

function makeRule(source: string, replacement: string) {
  return {
    source,
    replacement,
    category: 'first_name' as const,
    scope: FILE_SCOPE,
    status: 'validated' as const,
    priority: 0,
    createdBy: 'user' as const,
  };
}

describe('MappingStore', () => {
  // --- CRUD ---

  it('add retourne une règle avec un id unique', () => {
    const store = new MappingStore(FILE_SCOPE);
    const rule = store.add(makeRule('Jean', 'Pierre'));
    expect(rule.id).toMatch(/^map_/);
    expect(rule.source).toBe('Jean');
    expect(rule.createdAt).toBeTruthy();
  });

  it('deux règles ajoutées ont des ids distincts', () => {
    const store = new MappingStore(FILE_SCOPE);
    const r1 = store.add(makeRule('Jean', 'Pierre'));
    const r2 = store.add(makeRule('Marie', 'Sophie'));
    expect(r1.id).not.toBe(r2.id);
  });

  it('getAll retourne toutes les règles ajoutées', () => {
    const store = new MappingStore(FILE_SCOPE);
    store.add(makeRule('Jean', 'Pierre'));
    store.add(makeRule('Marie', 'Sophie'));
    expect(store.getAll()).toHaveLength(2);
  });

  it('get retourne la règle par son id', () => {
    const store = new MappingStore(FILE_SCOPE);
    const rule = store.add(makeRule('Jean', 'Pierre'));
    expect(store.get(rule.id)?.source).toBe('Jean');
  });

  it('get retourne undefined pour un id inexistant', () => {
    const store = new MappingStore(FILE_SCOPE);
    expect(store.get('inexistant')).toBeUndefined();
  });

  it('update modifie le remplacement', () => {
    const store = new MappingStore(FILE_SCOPE);
    const rule = store.add(makeRule('Jean', 'Pierre'));
    store.update(rule.id, { replacement: 'Paul' });
    expect(store.get(rule.id)?.replacement).toBe('Paul');
  });

  it('update retourne false si la règle est introuvable', () => {
    const store = new MappingStore(FILE_SCOPE);
    expect(store.update('inexistant', { replacement: 'X' })).toBe(false);
  });

  it('remove supprime la règle', () => {
    const store = new MappingStore(FILE_SCOPE);
    const rule = store.add(makeRule('Jean', 'Pierre'));
    expect(store.remove(rule.id)).toBe(true);
    expect(store.getAll()).toHaveLength(0);
  });

  it('remove retourne false si la règle est introuvable', () => {
    const store = new MappingStore(FILE_SCOPE);
    expect(store.remove('inexistant')).toBe(false);
  });

  // --- Filtrage par portée ---

  it('getValidatedFor retourne les règles validées pour un fichier donné', () => {
    const store = new MappingStore({ type: 'vault' });
    store.add(makeRule('Jean', 'Pierre'));
    store.add({ ...makeRule('Marie', 'Sophie'), scope: { type: 'file', path: 'autre.cha' } });
    const results = store.getValidatedFor('entretien_01.srt');
    expect(results).toHaveLength(1); // seule la règle vault s'applique
    expect(results[0].source).toBe('Jean');
  });

  it('getValidatedFor exclut les règles non validées', () => {
    const store = new MappingStore(FILE_SCOPE);
    store.add({ ...makeRule('Jean', 'Pierre'), status: 'suggested' });
    expect(store.getValidatedFor('entretien_01.srt')).toHaveLength(0);
  });

  it('getValidatedFor inclut les règles de dossier parent', () => {
    const store = new MappingStore({ type: 'vault' });
    store.add({
      ...makeRule('Jean', 'Pierre'),
      scope: { type: 'folder', path: 'Transcriptions/UJAA' },
    });
    expect(store.getValidatedFor('Transcriptions/UJAA/entretien_01.cha')).toHaveLength(1);
    expect(store.getValidatedFor('Transcriptions/LIIPPS/entretien_02.cha')).toHaveLength(0);
  });

  // --- Sérialisation JSON ---

  it('toJSON produit un MappingFile valide', () => {
    const store = new MappingStore(FILE_SCOPE, 'UJAA-2026');
    store.add(makeRule('Jean', 'Pierre'));
    const json = store.toJSON();
    expect(json.schemaVersion).toBe('1.0.0');
    expect(json.project).toBe('UJAA-2026');
    expect(json.mappings).toHaveLength(1);
    expect(json.settings).toEqual(DEFAULT_FILE_SETTINGS);
  });

  it('fromJSON reconstruit un store identique', () => {
    const store = new MappingStore(FILE_SCOPE, 'UJAA-2026');
    const rule = store.add(makeRule('Jean', 'Pierre'));
    const json = store.toJSON();

    const restored = MappingStore.fromJSON(json);
    expect(restored.getAll()).toHaveLength(1);
    expect(restored.get(rule.id)?.source).toBe('Jean');
    expect(restored.project).toBe('UJAA-2026');
  });

  it('round-trip JSON : toJSON puis fromJSON puis toJSON est stable', () => {
    const store = new MappingStore(FILE_SCOPE);
    store.add(makeRule('Jean', 'Pierre'));
    store.add(makeRule('Marie', 'Sophie'));
    const json1 = store.toJSON();
    const json2 = MappingStore.fromJSON(json1).toJSON();
    expect(json2.mappings).toHaveLength(json1.mappings.length);
    expect(json2.mappings.map((r) => r.source).sort()).toEqual(
      json1.mappings.map((r) => r.source).sort()
    );
  });

  it('toJSON peut être sérialisé en JSON.stringify sans erreur', () => {
    const store = new MappingStore(FILE_SCOPE);
    store.add(makeRule('Jean', 'Pierre'));
    const serialized = JSON.stringify(store.toJSON());
    const parsed: MappingFile = JSON.parse(serialized);
    expect(parsed.mappings[0].source).toBe('Jean');
  });
});
