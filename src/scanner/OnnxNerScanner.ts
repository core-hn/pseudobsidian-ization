import { App, FileSystemAdapter, Notice } from 'obsidian';
import * as path from 'path';
import * as os from 'os';
import type { EntityCategory, Occurrence } from '../types';

// Modèle multilingue BERT-NER pré-converti en ONNX via Xenova.
// Supporte le français. Téléchargement unique ~66 Mo, mis en cache dans
// ~/.cache/huggingface/hub (ou env.cacheDir si redéfini).
const MODEL_ID = 'Xenova/bert-base-multilingual-cased-ner-hrl';

// Tags CoNLL → catégorie interne
const TAG_TO_CATEGORY: Record<string, EntityCategory> = {
  PER:  'full_name',
  LOC:  'place',
  ORG:  'institution',
  MISC: 'custom',
};

const MIN_ENTITY_LENGTH = 2;

type NerResult = {
  entity_group: string;
  score: number;
  word: string;
  start: number;
  end: number;
};

// Pipeline chargé une seule fois pour toute la session
let _pipeline: ((text: string, opts?: object) => Promise<NerResult[]>) | null = null;
let _loading = false;
let _loadError: string | null = null;

let _counter = 0;

export class OnnxNerScanner {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  private getPluginDir(): string | null {
    const { adapter } = this.app.vault;
    if (!(adapter instanceof FileSystemAdapter)) return null;
    return path.join(
      adapter.getBasePath(),
      this.app.vault.configDir,
      'plugins',
      'pseudonymizer-tool'
    );
  }

  // Charge le pipeline NER (une seule fois, avec notice de progression).
  async loadPipeline(): Promise<void> {
    if (_pipeline) return;
    if (_loadError) throw new Error(_loadError);
    if (_loading) {
      // Attendre la fin du chargement en cours
      await new Promise<void>((resolve, reject) => {
        const timer = window.setInterval(() => {
          if (_pipeline) { window.clearInterval(timer); resolve(); }
          if (_loadError) { window.clearInterval(timer); reject(new Error(_loadError)); }
        }, 300);
      });
      return;
    }

    _loading = true;
    const notice = new Notice('Chargement du modèle NER (première utilisation — ~66 Mo)…', 0);

    try {
      // Import dynamique pour éviter de charger transformers au démarrage du plugin
      type TransformersModule = {
        env: typeof import('@xenova/transformers')['env'];
        pipeline: typeof import('@xenova/transformers')['pipeline'];
        executionProviders: string[];
      };
      const t = await import('@xenova/transformers') as unknown as TransformersModule;
      const { env, pipeline } = t;

      // En Electron, process.release.name === 'node' ajoute 'cpu' en tête des providers.
      // Le provider CPU nécessite des binaires natifs non disponibles — on le retire.
      if (Array.isArray(t.executionProviders)) {
        const cpuIdx = t.executionProviders.indexOf('cpu');
        if (cpuIdx !== -1) t.executionProviders.splice(cpuIdx, 1);
      }

      // Avec platform:browser, RUNNING_LOCALLY=false → env.cacheDir=null.
      // On doit le fixer avant tout appel à pipeline() sinon FileCache(null)
      // appelle path.join(null, ...) et lève une TypeError.
      const pluginDir = this.getPluginDir();
      env.cacheDir = pluginDir
        ? path.join(pluginDir, '.ner-cache')
        : path.join(os.homedir(), '.cache', 'huggingface', 'hub');

      if (pluginDir) {
        // ort-web.node.js charge le WASM via fs.readFileSync(wasmPaths + filename).
        // On pointe vers le dossier plugin où les WASM sont copiés au déploiement.
        env.backends.onnx.wasm.wasmPaths = pluginDir + path.sep;
        // numThreads=1 : SharedArrayBuffer non disponible dans Electron renderer
        // sans COOP/COEP → pas de WASM threadé.
        env.backends.onnx.wasm.numThreads = 1;
      }

      // Autoriser le téléchargement depuis HuggingFace Hub
      env.allowRemoteModels = true;
      env.allowLocalModels = false;

      _pipeline = (await pipeline('token-classification', MODEL_ID) as unknown) as
        (text: string, opts?: object) => Promise<NerResult[]>;

      notice.hide();
      new Notice('✓ Modèle NER chargé', 3000);
    } catch (e) {
      notice.hide();
      const err = e as Error;
      // Stack trace complète dans la console pour diagnostiquer
      console.error('[PseudObs NER] Erreur complète :', err.stack ?? err.message);
      _loadError = err.message;
      _loading = false;
      throw e;
    }

    _loading = false;
  }

  // Retourne true si le pipeline est déjà chargé.
  isReady(): boolean {
    return _pipeline !== null;
  }

  // Scanne un texte et retourne les entités détectées sous forme d'Occurrence[].
  async scan(
    text: string,
    filePath: string,
    options: { minScore?: number; functionWords?: Set<string> } = {}
  ): Promise<Occurrence[]> {
    await this.loadPipeline();
    if (!_pipeline) throw new Error('Pipeline NER non disponible.');

    const minScore = options.minScore ?? 0.75;
    const functionWords = options.functionWords ?? new Set<string>();

    // Le modèle a une limite de tokens : traiter tour par tour (séparation par \n)
    const lines = text.split('\n');
    const results: Occurrence[] = [];
    let offset = 0;

    for (const line of lines) {
      if (line.trim().length > 2) {
        try {
          const entities: NerResult[] = await _pipeline(line, { aggregation_strategy: 'simple' });
          for (const ent of entities) {
            if (ent.score < minScore) continue;
            const word = ent.word.trim().replace(/^#+/, ''); // supprimer les ## de sous-mots
            // Filtrer les artefacts de tokenisation BERT (mots fonctionnels, tokens trop courts)
            if (word.length < MIN_ENTITY_LENGTH) continue;
            if (functionWords.has(word.toLowerCase())) continue;
            const category = TAG_TO_CATEGORY[ent.entity_group] ?? 'custom';
            const start = offset + ent.start;
            const end = offset + ent.end;
            const ctxLen = 45;
            results.push({
              id: `ner_${Date.now()}_${++_counter}`,
              file: filePath,
              line: text.slice(0, start).split('\n').length,
              start,
              end,
              text: word,
              contextBefore: text.slice(Math.max(0, start - ctxLen), start),
              contextAfter: text.slice(end, Math.min(text.length, end + ctxLen)),
              category,
              status: 'needs_review',
            });
          }
        } catch {
          // Ignorer silencieusement les lignes qui échouent (trop longues, etc.)
        }
      }
      offset += line.length + 1; // +1 pour le \n
    }

    return results;
  }

  // Réinitialise le pipeline (utile pour changer de modèle ou libérer la mémoire).
  static reset(): void {
    _pipeline = null;
    _loading = false;
    _loadError = null;
  }
}
