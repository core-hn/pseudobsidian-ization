import { App } from 'obsidian';
import type PseudObsPlugin from '../main';
import type {
  DictionaryFile,
  DictionaryEntry,
  DictionaryConfig,
  DictionaryCondition,
  DictionaryPattern,
  Occurrence,
  EntityCategory,
} from '../types';

// Séquence de tokens avec positions dans la ligne d'origine
interface Token { word: string; start: number; end: number; }

// Longueur max des n-grammes testés (couvre "Saint-Martin-de-Ré" en 1 token,
// "Aix-en-Provence" en 1 token, mais aussi "La Roche-sur-Yon" en 4 tokens)
const MAX_NGRAM = 4;

let _dictScanCounter = 0;

interface DetectionHit {
  entry: DictionaryEntry;
  dict: DictionaryFile;
}

export class DictionaryLoader {
  private dictionaries: DictionaryFile[] = [];
  // clé : valeur normalisée → toutes les entrées de détection correspondantes
  private detectionIndex = new Map<string, DetectionHit[]>();

  constructor(private app: App, private plugin: PseudObsPlugin) {}

  // --- Chargement ---

  async load(): Promise<void> {
    this.dictionaries = [];
    this.detectionIndex.clear();

    // Les dictionnaires sont téléchargés par le wizard dans dictionariesFolder
    const loaded = await this.readDictFilesFrom(this.plugin.settings.dictionariesFolder);

    this.dictionaries = loaded;
    this.buildDetectionIndex();
  }

  private async readDictFilesFrom(dir: string): Promise<DictionaryFile[]> {
    const result: DictionaryFile[] = [];
    try {
      const listing = await this.app.vault.adapter.list(dir);
      for (const filePath of listing.files) {
        if (!filePath.endsWith('.dict.json')) continue;
        try {
          const raw = await this.app.vault.adapter.read(filePath);
          const dict = JSON.parse(raw) as DictionaryFile;
          if (dict.dictionaryId && Array.isArray(dict.entries)) {
            result.push(dict);
          }
        } catch {
          // fichier illisible ou mal formé — on ignore
        }
      }
    } catch {
      // dossier inexistant — normal
    }
    return result;
  }

  private buildDetectionIndex(): void {
    for (const dict of this.dictionaries) {
      if (!dict.roles?.detection) continue;
      const cs = dict.config?.caseSensitive ?? false;
      const strip = dict.config?.stripPrefix ?? [];
      for (const entry of dict.entries) {
        const key = this.normalizeKey(entry.value, cs, strip);
        const hits = this.detectionIndex.get(key) ?? [];
        hits.push({ entry, dict });
        this.detectionIndex.set(key, hits);
      }
    }
  }

  private normalizeKey(value: string, caseSensitive: boolean, stripPrefix: string[]): string {
    let v = value;
    for (const prefix of stripPrefix) {
      if (v.startsWith(prefix)) { v = v.slice(prefix.length); break; }
    }
    return caseSensitive ? v : v.toLowerCase();
  }

  // --- Détection ---

  contains(value: string): boolean {
    // teste dans tous les dictionnaires de détection (avec leurs propres options de normalisation)
    for (const dict of this.dictionaries) {
      if (!dict.roles?.detection) continue;
      const cs = dict.config?.caseSensitive ?? false;
      const strip = dict.config?.stripPrefix ?? [];
      const key = this.normalizeKey(value, cs, strip);
      if (this.detectionIndex.has(key)) return true;
    }
    return false;
  }

  getDetectionHits(value: string): DetectionHit[] {
    const all: DetectionHit[] = [];
    for (const dict of this.dictionaries) {
      if (!dict.roles?.detection) continue;
      const cs = dict.config?.caseSensitive ?? false;
      const strip = dict.config?.stripPrefix ?? [];
      const key = this.normalizeKey(value, cs, strip);
      const hits = this.detectionIndex.get(key);
      if (hits) all.push(...hits);
    }
    return all;
  }

  // --- Classification et remplacement ---

  /**
   * Résout la classe d'une entrée selon le classificationMode du dictionnaire.
   * Retourne null si aucune classe n'est trouvée ou si le dictionnaire n'utilise pas les classes.
   */
  resolveClass(entry: DictionaryEntry, dict: DictionaryFile): string | null {
    if (!dict.roles?.classes || !dict.config) return null;
    const { classificationMode, conditions, patterns } = dict.config;

    if (classificationMode === 'conditions' && conditions) {
      return this.resolveByConditions(entry, conditions);
    }
    if (classificationMode === 'regex' && patterns) {
      return this.resolveByRegex(entry.value, patterns, dict.config);
    }
    // word-to-word sans classes : pas de classe à attribuer
    return null;
  }

  private resolveByConditions(entry: DictionaryEntry, conditions: DictionaryCondition[]): string | null {
    for (const cond of conditions) {
      const v = entry[cond.field];
      if (v == null) continue;
      if (this.applyOp(v as string | number, cond.op, cond.value)) return cond.class;
    }
    return null;
  }

  private resolveByRegex(value: string, patterns: DictionaryPattern[], config: DictionaryConfig): string | null {
    for (const p of patterns) {
      const flags = p.flags ?? (config.caseSensitive === false ? 'i' : '');
      try {
        if (new RegExp(p.pattern, flags).test(value)) return p.class;
      } catch {
        // regex invalide — ignorée
      }
    }
    return null;
  }

  private applyOp(entryVal: string | number, op: DictionaryCondition['op'], condVal: string | number): boolean {
    switch (op) {
      case 'lt':       return (entryVal as number) <  (condVal as number);
      case 'lte':      return (entryVal as number) <= (condVal as number);
      case 'gt':       return (entryVal as number) >  (condVal as number);
      case 'gte':      return (entryVal as number) >= (condVal as number);
      case 'eq':       return entryVal === condVal;
      case 'neq':      return entryVal !== condVal;
      case 'contains': return String(entryVal).includes(String(condVal));
    }
  }

  /**
   * Génère le prochain remplacement pour une classe donnée.
   * existingReplacements : liste des remplacements déjà utilisés dans la portée concernée.
   * Format résultant : '{class}_{index}' ou le pattern configuré dans dict.config.
   */
  nextReplacement(dict: DictionaryFile, entryClass: string, existingReplacements: string[]): string {
    const pattern = dict.config?.replacementPattern ?? '{class}_{index}';
    // Trouver le plus grand index déjà utilisé pour cette classe dans la portée
    const prefix = pattern.replace('{class}', entryClass).replace('_{index}', '_');
    let maxIndex = 0;
    for (const r of existingReplacements) {
      if (r.startsWith(prefix)) {
        const suffix = r.slice(prefix.length);
        const n = parseInt(suffix, 10);
        if (!isNaN(n) && n > maxIndex) maxIndex = n;
      }
    }
    const nextIndex = maxIndex + 1;
    return pattern.replace('{class}', entryClass).replace('{index}', String(nextIndex));
  }

  /**
   * Résout le remplacement d'une valeur source depuis un dictionnaire de remplacement.
   * - Si word-to-word et entry.replacement présent → retourne entry.replacement directement.
   * - Si classes → génère via nextReplacement.
   * - Si word-to-word sans remplacement fixe → retourne null (l'utilisateur saisit manuellement).
   */
  resolveReplacement(
    sourceValue: string,
    existingReplacements: string[],
  ): { replacement: string; dictionaryId: string; entryClass: string | null } | null {
    for (const dict of this.dictionaries) {
      if (!dict.roles?.replacement) continue;
      const cs = dict.config?.caseSensitive ?? false;
      const strip = dict.config?.stripPrefix ?? [];
      const key = this.normalizeKey(sourceValue, cs, strip);
      const hits = this.detectionIndex.get(key) ?? [];
      const hit = hits.find((h) => h.dict.dictionaryId === dict.dictionaryId);
      if (!hit) continue;

      const entryClass = this.resolveClass(hit.entry, dict);

      if (entryClass) {
        const replacement = this.nextReplacement(dict, entryClass, existingReplacements);
        return { replacement, dictionaryId: dict.dictionaryId, entryClass };
      }

      if (hit.entry.replacement) {
        return { replacement: hit.entry.replacement, dictionaryId: dict.dictionaryId, entryClass: null };
      }
    }
    return null;
  }

  /**
   * Retourne des suggestions de remplacement (pour l'UI de RuleModal).
   * Pour les dictionnaires avec classes : liste les classes disponibles + exemples.
   * Pour word-to-word : retourne les replacementCandidates de l'entrée correspondante.
   */
  getSuggestions(
    sourceValue: string,
    count = 8,
  ): { label: string; value: string; fromClass: boolean }[] {
    const results: { label: string; value: string; fromClass: boolean }[] = [];

    for (const dict of this.dictionaries) {
      if (!dict.roles?.replacement) continue;
      const cs = dict.config?.caseSensitive ?? false;
      const strip = dict.config?.stripPrefix ?? [];
      const key = this.normalizeKey(sourceValue, cs, strip);
      const hits = this.detectionIndex.get(key) ?? [];
      const hit = hits.find((h) => h.dict.dictionaryId === dict.dictionaryId);

      if (hit) {
        const entryClass = this.resolveClass(hit.entry, dict);
        if (entryClass) {
          // Mode classes : afficher la classe comme suggestion principale
          results.push({
            label: `${entryClass}_N (${dict.label})`,
            value: entryClass,
            fromClass: true,
          });
        }
        if (hit.entry.replacementCandidates) {
          for (const c of hit.entry.replacementCandidates.slice(0, count)) {
            results.push({ label: c, value: c, fromClass: false });
          }
        }
      }

      if (results.length >= count) break;
    }

    return results.slice(0, count);
  }

  // --- Accès aux dictionnaires chargés ---

  getAll(): DictionaryFile[] {
    return this.dictionaries;
  }

  getById(id: string): DictionaryFile | undefined {
    return this.dictionaries.find((d) => d.dictionaryId === id);
  }

  /** Retourne vrai si au moins un dictionnaire de détection est chargé. */
  hasDetection(): boolean {
    return this.dictionaries.some((d) => d.roles?.detection);
  }

  /** Retourne vrai si au moins un dictionnaire de remplacement est chargé. */
  hasReplacement(): boolean {
    return this.dictionaries.some((d) => d.roles?.replacement);
  }

  get size(): number {
    return this.dictionaries.length;
  }

  // --- Scan de texte ---

  /**
   * Scanne un texte complet et retourne les entités trouvées dans les dictionnaires
   * dont `roles.detection = true`. Fenêtre glissante de n-grammes (1..MAX_NGRAM tokens)
   * pour couvrir les noms composés ("La Rochelle", "Le Puy-en-Velay"…).
   * Les entités déjà couvertes par `existingSources` sont exclues (déjà en orange).
   */
  scanText(
    text: string,
    filePath: string,
    existingSources: Set<string> = new Set(),
    dictIds?: string[],   // si fourni, limite le scan à ces dictionnaires
  ): Occurrence[] {
    if (!this.hasDetection()) return [];

    const results: Occurrence[] = [];
    const seen = new Set<string>(); // dédoublonnage par valeur normalisée
    const lines = text.split('\n');
    let lineOffset = 0;

    for (const line of lines) {
      const tokens = this.tokenize(line);

      for (let i = 0; i < tokens.length; i++) {
        let matched = false;

        // Du plus long au plus court pour préférer "La Rochelle" à "La"
        for (let n = Math.min(MAX_NGRAM, tokens.length - i); n >= 1; n--) {
          const phrase = tokens.slice(i, i + n).map((t) => t.word).join(' ');
          const allHits = this.getDetectionHits(phrase);
          const hits = dictIds
            ? allHits.filter((h) => dictIds.includes(h.dict.dictionaryId))
            : allHits;
          if (hits.length === 0) continue;

          const hit = hits[0];
          const valueNorm = (hit.dict.config?.caseSensitive ?? false)
            ? phrase : phrase.toLowerCase();

          // Ignorer si déjà une règle source pour ce terme
          if (existingSources.has(valueNorm)) { matched = true; break; }
          // Ignorer les doublons dans ce scan
          if (seen.has(valueNorm)) { matched = true; break; }
          seen.add(valueNorm);

          const startInLine = tokens[i].start;
          const endInLine   = tokens[i + n - 1].end;
          const start = lineOffset + startInLine;
          const end   = lineOffset + endInLine;
          const ctxLen = 45;

          results.push({
            id: `dict_${Date.now()}_${++_dictScanCounter}`,
            file: filePath,
            line: lines.indexOf(line) + 1,
            start,
            end,
            text: phrase,
            contextBefore: text.slice(Math.max(0, start - ctxLen), start),
            contextAfter:  text.slice(end, Math.min(text.length, end + ctxLen)),
            category: (hit.dict.type ?? 'place') as EntityCategory,
            status: 'needs_review',
          });

          i += n - 1; // sauter les tokens déjà consommés
          matched = true;
          break;
        }
        void matched;
      }

      lineOffset += line.length + 1; // +1 pour le \n
    }

    return results;
  }

  private tokenize(line: string): Token[] {
    const tokens: Token[] = [];
    // Séparation sur les espaces — les tirets restent attachés au mot ("Saint-Jean")
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      tokens.push({ word: m[0], start: m.index, end: m.index + m[0].length });
    }
    return tokens;
  }
}
