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
  gender?: 'masculine' | 'feminine' | 'mixed';
  decade?: number;                    // décennie de pic de popularité (ex. 1980)
  socialClass?: 'populaire' | 'intermédiaire' | 'supérieur';
  origin?: string;                    // 'fr' | 'maghreb' | 'afrique-sub' | 'anglo' | …
  sizeClass?: string;                 // pour les villes : 'village' | 'petite-ville' | …
  frequencyRank?: number;
  replacementCandidates?: string[];
  ambiguous?: string[];               // types alternatifs possibles (ex. ['place'] pour 'Florence')
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
  entries: DictionaryEntry[];
}
