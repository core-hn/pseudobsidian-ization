// Types partagés — SPECS §11.3

export type ScopeType = 'file' | 'folder' | 'vault';

export type MappingStatus =
  | 'suggested'
  | 'validated'
  | 'ignored'
  | 'partial'
  | 'conflict'
  | 'disabled'
  | 'needs_review';

export type EntityCategory =
  | 'first_name'
  | 'last_name'
  | 'full_name'
  | 'place'
  | 'institution'
  | 'date'
  | 'age'
  | 'profession'
  | 'custom';

export interface Scope {
  type: ScopeType;
  path?: string;
}

export interface OccurrenceRef {
  file: string;
  line: number;
  start: number;
  end: number;
  status: MappingStatus;
}

export interface MappingRule {
  id: string;
  source: string;
  replacement: string;
  category: EntityCategory;
  scope: Scope;
  status: MappingStatus;
  // Entier libre, comme un z-index CSS. Défaut 0. Plus élevé = appliqué en premier.
  priority: number;
  sourceDictionary?: string;
  createdBy: 'user' | 'dictionary' | 'scanner';
  createdAt: string;       // ISO 8601
  updatedAt?: string;
  notes?: string;
  occurrences?: OccurrenceRef[];
}

export interface Occurrence {
  id: string;
  file: string;
  line: number;
  start: number;
  end: number;
  text: string;
  contextBefore: string;
  contextAfter: string;
  category?: EntityCategory;
  mappingId?: string;
  status: MappingStatus;
}

export interface ReplacementSpan {
  start: number;
  end: number;
  source: string;
  replacement: string;
  mappingId: string;
  priority: number;
}

// Format d'un fichier de table de correspondance (SPECS §5.2)
export interface MappingFile {
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
  project?: string;
  scope: Scope;
  settings?: MappingFileSettings;
  mappings: MappingRule[];
}

export interface MappingFileSettings {
  caseSensitive: boolean;
  accentSensitive: boolean;
  wholeWordOnly: boolean;
  preserveCase: boolean;
  preserveGender: boolean;
  preserveAnalyticNotation: boolean;
}

// Format d'une entrée de dictionnaire (SPECS §6.3)
export interface DictionaryEntry {
  value: string;
  type: EntityCategory;
  replacement?: string;               // remplacement fixe (mode word-to-word sans classes)
  gender?: 'masculine' | 'feminine' | 'mixed';
  decade?: number;                    // décennie de pic de popularité (ex. 1980)
  socialClass?: 'populaire' | 'intermédiaire' | 'supérieur';
  origin?: string;                    // 'fr' | 'maghreb' | 'afrique-sub' | 'anglo' | …
  frequencyRank?: number;
  replacementCandidates?: string[];
  ambiguous?: boolean;                // true si le token est aussi un autre type (Florence = prénom + lieu)
  [key: string]: unknown;             // champs libres utilisés par les conditions (population, platform…)
}

// --- Types pour le système de dictionnaires structurés ---

export interface DictionaryRoles {
  detection: boolean;   // sert à identifier des entités dans le texte
  replacement: boolean; // sert à proposer des candidats de substitution
  classes: boolean;     // utilise un système de classes avec incrémentation
}

export type ConfigFieldType = 'enum' | 'string' | 'boolean' | 'number';

export interface ConfigSchemaField {
  key: string;
  label: string;
  type: ConfigFieldType;
  values?: (string | number | boolean)[];   // valeurs possibles pour enum et boolean
  default: string | number | boolean;
  recommended?: string | number | boolean;
  description?: string;
}

export interface DictionaryCondition {
  field: string;                            // champ d'une entrée : "population", "platform"…
  op: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq' | 'contains';
  value: string | number;
  class: string;                            // classe attribuée si la condition est vraie
}

export interface DictionaryPattern {
  pattern: string;                          // expression régulière appliquée à entry.value
  flags?: string;                           // ex: 'i' pour case-insensitive
  class: string;
}

export interface DictionaryConfig {
  classificationMode: 'word-to-word' | 'regex' | 'conditions';
  conditions?: DictionaryCondition[];       // actif si classificationMode = 'conditions'
  patterns?: DictionaryPattern[];           // actif si classificationMode = 'regex'
  incrementScope?: ScopeType;              // portée de l'index — défaut 'file'
  replacementPattern?: string;             // ex: '{class}_{index}' — défaut '{class}_{index}'
  caseSensitive?: boolean;
  stripPrefix?: string[];                  // préfixes à retirer avant correspondance ex: ['@', '#']
}

// Manifeste du repo de dictionnaires
export interface DictionaryManifestEntry {
  id: string;
  label: string;
  description: string;
  type: EntityCategory;
  language: string;
  roles: DictionaryRoles;
  size: number;        // octets
  url: string;        // URL de téléchargement du .dict.json
  recommended?: boolean;
}

export interface DictionaryManifest {
  version: string;
  dictionaries: DictionaryManifestEntry[];
}

// Format d'un fichier dictionnaire (SPECS §6.3)
export interface DictionaryFile {
  schemaVersion: string;
  dictionaryId: string;
  label: string;
  type: EntityCategory;
  language: string;
  source: string;
  license?: string;
  author?: string;
  doi?: string | null;
  roles: DictionaryRoles;
  configSchema?: ConfigSchemaField[];      // décrit les variables configurables et leurs valeurs possibles
  config?: DictionaryConfig;              // valeurs actives (écrase les defaults du configSchema)
  entries: DictionaryEntry[];
}
