import type { MappingRule, MappingFile, MappingFileSettings, Scope } from '../types';

function generateId(): string {
  return `map_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const DEFAULT_FILE_SETTINGS: MappingFileSettings = {
  caseSensitive: false,
  accentSensitive: false,
  wholeWordOnly: true,
  preserveCase: true,
  preserveGender: true,
  preserveAnalyticNotation: true,
};

export class MappingStore {
  private rules: Map<string, MappingRule> = new Map();
  private fileSettings: MappingFileSettings;
  readonly scope: Scope;
  readonly project?: string;
  readonly createdAt: string;
  private updatedAt: string;

  constructor(scope: Scope, project?: string, settings?: Partial<MappingFileSettings>) {
    this.scope = scope;
    this.project = project;
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
    this.fileSettings = { ...DEFAULT_FILE_SETTINGS, ...settings };
  }

  add(partial: Omit<MappingRule, 'id' | 'createdAt'>): MappingRule {
    const rule: MappingRule = {
      ...partial,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    this.rules.set(rule.id, rule);
    this.touch();
    return rule;
  }

  get(id: string): MappingRule | undefined {
    return this.rules.get(id);
  }

  update(id: string, changes: Partial<Omit<MappingRule, 'id' | 'createdAt'>>): boolean {
    const rule = this.rules.get(id);
    if (!rule) return false;
    this.rules.set(id, { ...rule, ...changes, updatedAt: new Date().toISOString() });
    this.touch();
    return true;
  }

  remove(id: string): boolean {
    const deleted = this.rules.delete(id);
    if (deleted) this.touch();
    return deleted;
  }

  getAll(): MappingRule[] {
    return Array.from(this.rules.values());
  }

  // Règles validées applicables à un fichier donné (cascade file → folder → vault)
  getValidatedFor(filePath: string): MappingRule[] {
    // 'validated' et 'partial' sont des règles actives.
    // 'ignored' = l'utilisateur a ignoré toutes les occurrences au dernier scan
    //             → la règle reste définie mais désactivée.
    // 'suggested' = non encore confirmée → inactive.
    const ACTIVE: Set<string> = new Set(['validated', 'partial']);
    return this.getAll().filter((r) => {
      if (!ACTIVE.has(r.status)) return false;
      if (r.scope.type === 'vault') return true;
      if (r.scope.type === 'folder') return filePath.startsWith(r.scope.path ?? '');
      return r.scope.path === filePath;
    });
  }

  get settings(): MappingFileSettings {
    return this.fileSettings;
  }

  toJSON(): MappingFile {
    return {
      schemaVersion: '1.0.0',
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      project: this.project,
      scope: this.scope,
      settings: this.fileSettings,
      mappings: this.getAll(),
    };
  }

  static fromJSON(data: MappingFile): MappingStore {
    const store = new MappingStore(data.scope, data.project, data.settings);
    for (const rule of data.mappings) {
      store.rules.set(rule.id, rule);
    }
    return store;
  }

  private touch(): void {
    this.updatedAt = new Date().toISOString();
  }
}
