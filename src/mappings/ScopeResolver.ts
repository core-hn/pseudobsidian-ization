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

  /** Collecte récursivement tous les fichiers .mapping.json dans un dossier. */
  private collectMappingFiles(folder: TFolder): TFile[] {
    const files: TFile[] = [];
    for (const child of folder.children) {
      if (child instanceof TFile && child.name.endsWith('.mapping.json')) {
        files.push(child);
      } else if (child instanceof TFolder) {
        files.push(...this.collectMappingFiles(child));
      }
    }
    return files;
  }

  async getRulesFor(filePath: string): Promise<MappingRule[]> {
    const folder = this.vault.getAbstractFileByPath(this.mappingFolder);
    if (!(folder instanceof TFolder)) return [];

    const allRules: MappingRule[] = [];

    for (const child of this.collectMappingFiles(folder)) {
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

    for (const child of this.collectMappingFiles(folder)) {
      try {
        const data = JSON.parse(await this.vault.read(child)) as MappingFile;
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

  // Retourne toutes les règles (tous statuts) applicables à un fichier, avec leur emplacement.
  // Utilisé par l'onglet Mappings du panneau latéral pour l'édition et la suppression.
  async getRulesWithLocation(filePath: string): Promise<RuleLocation[]> {
    const folder = this.vault.getAbstractFileByPath(this.mappingFolder);
    if (!(folder instanceof TFolder)) return [];

    const result: RuleLocation[] = [];

    for (const child of this.collectMappingFiles(folder)) {
      try {
        const data = JSON.parse(await this.vault.read(child)) as MappingFile;
        const store = MappingStore.fromJSON(data);
        const applicable = store.getAll().filter((r) => {
          if (r.scope.type === 'vault') return true;
          if (r.scope.type === 'folder') return filePath.startsWith(r.scope.path ?? '');
          return r.scope.path === filePath;
        });
        for (const rule of applicable) {
          result.push({ rule, store, filePath: child.path });
        }
      } catch {
        // ignorer les fichiers de mapping malformés
      }
    }

    return result;
  }

  // Retourne TOUTES les règles de TOUS les fichiers de mapping, sans filtre de scope.
  // Utilisé par l'onglet Mappings en mode "toutes les règles".
  async getAllRulesWithLocation(): Promise<RuleLocation[]> {
    const folder = this.vault.getAbstractFileByPath(this.mappingFolder);
    if (!(folder instanceof TFolder)) return [];

    const result: RuleLocation[] = [];

    for (const child of this.collectMappingFiles(folder)) {
      try {
        const data = JSON.parse(await this.vault.read(child)) as MappingFile;
        const store = MappingStore.fromJSON(data);
        for (const rule of store.getAll()) {
          result.push({ rule, store, filePath: child.path });
        }
      } catch {
        // ignorer les fichiers malformés
      }
    }

    return result;
  }

  // Charge les règles validées d'un fichier de mapping spécifique, sans filtre de scope.
  // Utilisé pour les fichiers exportés (*.pseudonymized.*) dont le scope path ne correspond pas.
  async getRulesFromMappingFile(mappingFilename: string): Promise<MappingRule[]> {
    const path = `${this.mappingFolder}/${mappingFilename}`;
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return [];
    try {
      const data = JSON.parse(await this.vault.read(file)) as MappingFile;
      const store = MappingStore.fromJSON(data);
      return store.getAll().filter((r) => r.status === 'validated');
    } catch {
      return [];
    }
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
