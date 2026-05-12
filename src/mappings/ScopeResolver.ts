import { TFile, TFolder, Vault } from 'obsidian';
import { MappingStore } from './MappingStore';
import type { MappingFile, MappingRule } from '../types';

export interface RuleLocation {
  rule: MappingRule;
  store: MappingStore;
  filePath: string; // chemin du .mapping.json qui contient la règle
}

// Parcourt le dossier de mappings, charge tous les fichiers JSON valides
// et retourne les règles validées applicables au fichier demandé.
// La cascade file → folder → vault est gérée par le tri sortRules (scopeWeight).
export class ScopeResolver {
  constructor(
    private vault: Vault,
    private mappingFolder: string
  ) {}

  async getRulesFor(filePath: string): Promise<MappingRule[]> {
    const folder = this.vault.getAbstractFileByPath(this.mappingFolder);
    if (!(folder instanceof TFolder)) return [];

    const allRules: MappingRule[] = [];

    for (const child of folder.children) {
      if (!(child instanceof TFile)) continue;
      if (!child.name.endsWith('.mapping.json')) continue;

      try {
        const raw = await this.vault.read(child);
        const data = JSON.parse(raw) as MappingFile;
        const store = MappingStore.fromJSON(data);
        allRules.push(...store.getValidatedFor(filePath));
      } catch {
        // Ignorer silencieusement les fichiers de mapping malformés
      }
    }

    // Dédoublonner par (source, replacement) — la même règle peut apparaître
    // dans plusieurs fichiers si elle a été copiée à plusieurs niveaux
    const seen = new Set<string>();
    return allRules.filter((r) => {
      const key = `${r.source}||${r.replacement}||${r.scope.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Retrouve la première règle dont la source OU le remplacement correspond au terme.
  // Retourne aussi le store et le chemin JSON pour permettre la modification.
  async findRuleByTerm(term: string): Promise<RuleLocation | null> {
    const folder = this.vault.getAbstractFileByPath(this.mappingFolder);
    if (!(folder instanceof TFolder)) return null;

    const needle = term.toLowerCase();

    for (const child of folder.children) {
      if (!(child instanceof TFile) || !child.name.endsWith('.mapping.json')) continue;
      try {
        const data: MappingFile = JSON.parse(await this.vault.read(child));
        const store = MappingStore.fromJSON(data);
        const rule = store.getAll().find(
          (r) =>
            r.source.toLowerCase() === needle ||
            r.replacement.toLowerCase() === needle
        );
        if (rule) return { rule, store, filePath: child.path };
      } catch {
        // ignorer les fichiers malformés
      }
    }
    return null;
  }

  // Sauvegarde un store modifié dans son fichier JSON.
  async saveStore(store: MappingStore, filePath: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(filePath);
    const json = JSON.stringify(store.toJSON(), null, 2);
    if (file instanceof TFile) {
      await this.vault.modify(file, json);
    }
  }
}
