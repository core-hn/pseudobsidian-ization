import { Plugin, Notice, TFile, TAbstractFile, Editor, Menu, MarkdownView, requestUrl, WorkspaceLeaf } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { PseudObsSettings, DEFAULT_SETTINGS, PseudObsSettingTab } from './settings';
import { RuleModal } from './ui/RuleModal';
import { QuickPseudonymizeModal } from './ui/QuickPseudonymizeModal';
import { createPseudonymHighlighter, highlightDataChanged, type HighlightData } from './ui/PseudonymHighlighter';
import { EditRuleModal } from './ui/EditRuleModal';
import { OccurrencesModal } from './ui/OccurrencesModal';
import { PseudonymizationView, VIEW_TYPE_PSEUDOBS } from './ui/PseudonymizationView';
import { OnboardingModal } from './ui/OnboardingModal';
import { OnnxNerScanner } from './scanner/OnnxNerScanner';
import { scanOccurrences } from './scanner/OccurrenceScanner';
import { SrtParser } from './parsers/SrtParser';
import { ChatParser } from './parsers/ChatParser';
import { srtToMarkdown, chatToMarkdown } from './parsers/TranscriptConverter';
import { MappingStore } from './mappings/MappingStore';
import { ScopeResolver } from './mappings/ScopeResolver';
import { PseudonymizationEngine } from './pseudonymizer/PseudonymizationEngine';
import { findSpansForRule } from './pseudonymizer/ReplacementPlanner';
import { applySpans } from './pseudonymizer/SpanProtector';
import type { MappingRule, MappingStatus, Occurrence } from './types';

const CONVERTIBLE_EXTS = ['srt', 'cha', 'chat'];

export default class PseudObsPlugin extends Plugin {
  settings!: PseudObsSettings;
  scopeResolver!: ScopeResolver;
  nerScanner!: OnnxNerScanner;
  // Cache synchrone pour le surlignage CM6 (mis à jour de façon asynchrone)
  private highlightData: HighlightData = { sources: [], replacements: [], nerCandidates: [] };
  // Candidats NER par fichier (effacés au changement de fichier ou à un nouveau scan)
  private nerCandidateFile: TFile | null = null;
  private nerCandidates: string[] = [];

  async onload(): Promise<void> {
    await this.loadSettings();
    this.scopeResolver = new ScopeResolver(this.app.vault, this.settings.mappingFolder);
    this.nerScanner = new OnnxNerScanner(this.app);
    this.addSettingTab(new PseudObsSettingTab(this.app, this));

    this.registerView(VIEW_TYPE_PSEUDOBS, (leaf: WorkspaceLeaf) => new PseudonymizationView(leaf, this));
    this.addRibbonIcon('eye-off', 'PseudObsidianization', () => void this.activateView());

    // Extension CM6 : surlignage des termes sources (orange) et remplacements (vert)
    this.registerEditorExtension(
      createPseudonymHighlighter(() => this.highlightData)
    );

    // Rafraîchir le cache de surlignage à chaque changement de fichier actif
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => { void this.refreshHighlightData(); })
    );
    // Premier chargement au démarrage
    void this.refreshHighlightData();

    // Onboarding au premier lancement
    if (!this.settings.onboardingCompleted) {
      this.app.workspace.onLayoutReady(() => {
        new OnboardingModal(this.app, this).open();
      });
    }

    // Watcher : convertir automatiquement tout .srt/.cha/.chat ajouté au vault
    // (drag-and-drop, copie externe, commande "Ajouter une transcription")
    this.registerEvent(
      this.app.vault.on('create', (file: TAbstractFile) => {
        if (!(file instanceof TFile)) return;
        if (!CONVERTIBLE_EXTS.includes(file.extension.toLowerCase())) return;
        // Délai court pour laisser Obsidian finir l'écriture du fichier
        window.setTimeout(() => { void this.autoConvert(file); }, 300);
      })
    );

    this.addCommand({
      id: 'add-transcription',
      name: 'Ajouter une transcription',
      callback: () => this.openFilePicker(),
    });

    this.addCommand({
      id: 'pseudonymize-current-file',
      name: 'Pseudonymiser le fichier courant',
      callback: () => this.pseudonymizeActiveFile(),
    });

    this.addCommand({
      id: 'create-rule',
      name: 'Créer une règle de remplacement',
      editorCallback: (editor) => {
        new RuleModal(this.app, this, editor.getSelection()).open();
      },
    });

    this.addCommand({
      id: 'scan-current-file',
      name: 'Scanner le fichier courant',
      callback: () => this.scanCurrentFile(),
    });

    this.addCommand({
      id: 'scan-ner',
      name: 'Scanner le fichier avec détection NER',
      callback: () => void this.scanCurrentFileNer(),
    });

    this.addCommand({
      id: 'pseudonymize-selection',
      name: 'Pseudonymiser la sélection',
      editorCheckCallback: (checking, editor) => {
        if (!editor.getSelection()) return false;
        if (!checking) new QuickPseudonymizeModal(this.app, this, editor).open();
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor) => {
        const selection = editor.getSelection().trim();
        if (!selection) return;
        menu.addSeparator();

        // Extraire le terme brut : si la sélection inclut les marqueurs, les retirer
        const { markerOpen: mOpen, markerClose: mClose, useMarkerInExport } = this.settings;
        const bare = useMarkerInExport && selection.startsWith(mOpen) && selection.endsWith(mClose)
          ? selection.slice(mOpen.length, selection.length - mClose.length)
          : selection;
        const bareLower = bare.toLowerCase();

        const isSource      = this.highlightData.sources.some((s) => s.toLowerCase() === bareLower);
        const isReplacement = this.highlightData.replacements.some((r) => r.toLowerCase() === bareLower);
        const isKnown       = isSource || isReplacement;

        if (isReplacement) {
          // Terme déjà pseudonymisé : proposer l'annulation en premier
          menu.addItem((item) =>
            item
              .setTitle(`Annuler la pseudonymisation de "${bare.slice(0, 25)}${bare.length > 25 ? '…' : ''}"`)
              .setIcon('undo')
              .onClick(async () => {
                const location = await this.scopeResolver.findRuleByTerm(bare);
                if (!location) { new Notice('Règle introuvable dans les mappings.'); return; }
                // Remplacer la sélection (avec ou sans marqueurs) par la source originale
                editor.replaceSelection(location.rule.source);
                void this.refreshHighlightData();
              })
          );
        }

        if (isKnown) {
          menu.addItem((item) =>
            item
              .setTitle(`Modifier la règle pour "${bare.slice(0, 25)}${bare.length > 25 ? '…' : ''}"`)
              .setIcon('settings')
              .onClick(async () => {
                const location = await this.scopeResolver.findRuleByTerm(bare);
                if (location) {
                  new EditRuleModal(this.app, this, location).open();
                } else {
                  new Notice('Règle introuvable dans les mappings.');
                }
              })
          );
        }

        menu.addItem((item) =>
          item
            .setTitle(`Pseudonymiser "${selection.slice(0, 25)}${selection.length > 25 ? '…' : ''}"`)
            .setIcon('eye-off')
            .onClick(() => new QuickPseudonymizeModal(this.app, this, editor).open())
        );

        menu.addItem((item) =>
          item
            .setTitle(`Pseudonymiser avec Pr Baptiste Coulmont`)
            .setIcon('book-user')
            .onClick(async () => {
              const notice = new Notice('Recherche sur coulmont.com…', 0);
              const suggestions = await this.fetchCoulmont(selection);
              notice.hide();
              if (suggestions.length === 0) {
                new Notice(`Aucun résultat Coulmont pour "${selection}".`);
                return;
              }
              new RuleModal(this.app, this, selection, '', suggestions).open();
            })
        );
        menu.addItem((item) =>
          item
            .setTitle('Créer une règle de remplacement…')
            .setIcon('pencil')
            .onClick(() => new RuleModal(this.app, this, selection).open())
        );
      })
    );
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_PSEUDOBS);
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_PSEUDOBS)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_PSEUDOBS, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  // --- Coulmont ---

  // Interroge l'outil de Baptiste Coulmont pour suggérer un prénom équivalent.
  // Le prénom source est envoyé à coulmont.com — ne pas utiliser pour des données
  // déjà sensibles (utiliser un prénom de substitution neutre si besoin).
  // Retourne tous les prénoms équivalents proposés par l'outil Coulmont.
  // Le jeu de données ne différencie pas M/F — l'utilisateur choisit dans la liste.
  async fetchCoulmont(prenom: string): Promise<string[]> {
    try {
      const url = `https://coulmont.com/bac/results.php?search=${encodeURIComponent(prenom)}`;
      const response = await requestUrl({ url, method: 'GET' });
      const doc = new DOMParser().parseFromString(response.text, 'text/html');

      // Récupérer tous les liens dans les deux blocs de résultats (M et F)
      const els = doc.querySelectorAll(
        '#hero > div > div > div > div > p.mb-1.mb-md-1 > a'
      );
      const names = Array.from(els)
        .map((el) => el.textContent?.trim() ?? '')
        .filter((n) => n.length > 0);

      // Dédoublonner en préservant l'ordre
      return [...new Set(names)];
    } catch {
      return [];
    }
  }

  // --- Surlignage ---

  async refreshHighlightData(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      this.highlightData = { sources: [], replacements: [], nerCandidates: [] };
    } else {
      // Candidats NER : uniquement si le fichier actif est celui du dernier scan
      const nerCandidates = file === this.nerCandidateFile ? this.nerCandidates : [];

      try {
        // Pour les fichiers exportés (*.pseudonymized.*), charger les règles directement
        // depuis le fichier de mapping de la source : le scope.path ne correspondrait pas
        // au chemin de l'export, rendant getRulesFor() inutile pour les règles fichier.
        let rules: MappingRule[];
        if (file.basename.endsWith('.pseudonymized')) {
          const originalBasename = file.basename.slice(0, -'.pseudonymized'.length);
          // Vault/dossier + règles fichier de la source (sans filtre de scope path)
          const vaultFolderRules = await this.scopeResolver.getRulesFor(file.path);
          const fileRules = await this.scopeResolver.getRulesFromMappingFile(
            `${originalBasename}.mapping.json`
          );
          const seen = new Set<string>();
          rules = [...vaultFolderRules, ...fileRules].filter((r) => {
            const k = `${r.source}||${r.replacement}`;
            return seen.has(k) ? false : (seen.add(k), true);
          });
        } else {
          rules = await this.scopeResolver.getRulesFor(file.path);
        }
        this.highlightData = {
          sources: rules.map((r) => r.source).filter(Boolean),
          replacements: rules.map((r) => r.replacement).filter(Boolean),
          nerCandidates,
        };
      } catch {
        this.highlightData = { sources: [], replacements: [], nerCandidates };
      }
    }

    // Dispatcher le StateEffect sur l'éditeur actif pour déclencher
    // la reconstruction des décorations CM6 (le ViewPlugin ne se déclenche
    // pas sur un changement de données externe sans ce signal)
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const cm = view?.editor && ((view.editor as unknown as { cm?: EditorView }).cm);
    cm?.dispatch({ effects: highlightDataChanged.of(undefined) });
  }

  // --- Conversion automatique ---

  private async autoConvert(file: TFile): Promise<void> {
    try {
      const raw = await this.app.vault.read(file);
      const ext = file.extension.toLowerCase();
      const basename = file.basename;
      const folder = file.parent?.path ?? '';
      const mdPath = folder ? `${folder}/${basename}.md` : `${basename}.md`;

      let mdContent: string;
      if (ext === 'srt') {
        mdContent = srtToMarkdown(new SrtParser().parse(raw), file.name);
      } else {
        mdContent = chatToMarkdown(new ChatParser().parse(raw), file.name);
      }

      // Si un .md du même nom existe déjà, ne pas écraser
      if (this.app.vault.getAbstractFileByPath(mdPath) instanceof TFile) {
        new Notice(`⚠ ${basename}.md existe déjà — conversion ignorée pour ${file.name}`);
        return;
      }

      await this.app.vault.create(mdPath, mdContent);

      // Mapping JSON vide
      const mappingPath = `${this.settings.mappingFolder}/${basename}.mapping.json`;
      if (!this.app.vault.getAbstractFileByPath(mappingPath)) {
        await this.ensureFolder(this.settings.mappingFolder);
        const store = new MappingStore({ type: 'file', path: mdPath });
        await this.app.vault.create(mappingPath, JSON.stringify(store.toJSON(), null, 2));
      }

      // Supprimer le fichier source non-Markdown maintenant remplacé par le .md
      await this.app.fileManager.trashFile(file);

      // Ouvrir le .md
      const mdFile = this.app.vault.getAbstractFileByPath(mdPath);
      if (mdFile instanceof TFile) {
        await this.app.workspace.getLeaf().openFile(mdFile);
      }

      new Notice(`✓ ${file.name} → ${basename}.md`);
    } catch (e) {
      new Notice(`Erreur de conversion de ${file.name} : ${(e as Error).message}`);
    }
  }

  // --- Commande "Ajouter une transcription" ---

  private openFilePicker(): void {
    const input = activeDocument.createElement('input');
    input.type = 'file';
    input.accept = '.srt,.cha,.chat,.txt,.md';
    input.multiple = true;
    // Pas de display:none — bloque le change event dans certaines versions d'Electron
    input.classList.add('pseudobs-hidden-input');
    activeDocument.body.appendChild(input);

    input.addEventListener('change', () => { void this.processFilePicker(input); });

    input.click();
  }

  private async processFilePicker(input: HTMLInputElement): Promise<void> {
    const files = Array.from(input.files ?? []);
    input.remove();
    for (const file of files) {
      await this.copyToVault(file);
    }
  }

  private async copyToVault(browserFile: File): Promise<void> {
    const raw = await browserFile.text();
    const destFolder = this.settings.transcriptionsFolder;
    await this.ensureFolder(destFolder);
    const destPath = `${destFolder}/${browserFile.name}`;

    if (this.app.vault.getAbstractFileByPath(destPath) instanceof TFile) {
      new Notice(`Le fichier existe déjà dans le vault : ${browserFile.name}`);
      return;
    }

    // Créer le fichier brut dans le vault — le watcher vault.on('create') prendra le relai
    // pour les formats convertibles (.srt, .cha, .chat)
    await this.app.vault.create(destPath, raw);
  }

  // --- Pseudonymisation ---

  async pseudonymizeActiveFile(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice('Aucun fichier actif.'); return; }

    const ext = file.extension.toLowerCase();
    if (!['srt', 'cha', 'chat', 'md', 'txt'].includes(ext)) {
      new Notice(`Format non pris en charge : .${ext}`);
      return;
    }

    const content = await this.app.vault.read(file);
    // Charger les règles depuis les trois niveaux (fichier + dossier + vault)
    const rules = await this.scopeResolver.getRulesFor(file.path);
    if (rules.length === 0) {
      new Notice(
        `Aucune règle validée.\nCréez des règles via Ctrl+P → "Créer une règle".\nMapping attendu : ${this.settings.mappingFolder}/${file.basename}.mapping.json`
      );
      return;
    }

    const marker = this.settings.useMarkerInExport
      ? { open: this.settings.markerOpen, close: this.settings.markerClose }
      : undefined;

    const engine = new PseudonymizationEngine({
      caseSensitive: this.settings.caseSensitive,
      wholeWordOnly: this.settings.wholeWordOnly,
    });

    let pseudonymized: string;
    if (ext === 'srt') {
      const parser = new SrtParser();
      const doc = parser.parse(content);
      for (const block of doc.blocks) {
        block.lines = block.lines.map((l) => engine.pseudonymize(l, rules, marker));
      }
      pseudonymized = parser.reconstruct(doc);
    } else if (ext === 'cha' || ext === 'chat') {
      const parser = new ChatParser();
      const doc = parser.parse(content);
      for (const line of doc.lines) {
        if (line.type === 'turn' && line.content !== undefined) {
          line.content = engine.pseudonymize(line.content, rules, marker);
        }
      }
      pseudonymized = parser.reconstruct(doc);
    } else {
      pseudonymized = engine.pseudonymize(content, rules, marker);
    }

    await this.ensureFolder(this.settings.exportsFolder);
    const outputPath = `${this.settings.exportsFolder}/${file.basename}.pseudonymized.${ext}`;
    const existing = this.app.vault.getAbstractFileByPath(outputPath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, pseudonymized);
    } else {
      await this.app.vault.create(outputPath, pseudonymized);
    }

    new Notice(`✓ ${rules.length} règle(s) appliquée(s)\n→ ${outputPath}`);
  }

  async scanCurrentFileNer(): Promise<void> {
    if (this.settings.nerBackend !== 'transformers-js') {
      new Notice('La détection NER transformers.js n\'est pas activée.\nActivez-la dans Paramètres → Pseudonymizer Tool.');
      return;
    }

    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice('Aucun fichier actif.'); return; }

    const ext = file.extension.toLowerCase();
    if (!['srt', 'cha', 'chat', 'md', 'txt'].includes(ext)) {
      new Notice(`Format non pris en charge : .${ext}`);
      return;
    }

    try {
      const content = await this.app.vault.read(file);
      const occurrences = await this.nerScanner.scan(content, file.path, {
        minScore: this.settings.nerMinScore,
        functionWords: new Set(this.settings.nerFunctionWords.map((w) => w.toLowerCase())),
      });

      if (occurrences.length === 0) {
        new Notice('Aucune entité détectée par le NER.');
        return;
      }

      // Dédoublonner — un terme peut apparaître plusieurs fois dans le texte
      const unique = [...new Set(occurrences.map((o) => o.text).filter(Boolean))];

      this.nerCandidateFile = file;
      this.nerCandidates = unique;

      void this.refreshHighlightData();

      new Notice(
        `✓ ${unique.length} entité${unique.length > 1 ? 's' : ''} détectée${unique.length > 1 ? 's' : ''} — surlignée${unique.length > 1 ? 's' : ''} en bleu.\nClic droit sur un terme pour créer une règle.`,
        6000
      );
    } catch (e) {
      new Notice(`Erreur NER : ${(e as Error).message}`);
    }
  }

  // Efface les candidats NER pour le fichier courant (appelé après création de règle si besoin)
  clearNerCandidates(): void {
    this.nerCandidates = [];
    this.nerCandidateFile = null;
    void this.refreshHighlightData();
  }

  async exportMappingForFile(file: TFile): Promise<void> {
    const mappingPath = `${this.settings.mappingFolder}/${file.basename}.mapping.json`;
    const mappingFile = this.app.vault.getAbstractFileByPath(mappingPath);

    if (!(mappingFile instanceof TFile)) {
      new Notice(`Aucun mapping trouvé pour ${file.name}`);
      return;
    }

    const content = await this.app.vault.read(mappingFile);
    await this.ensureFolder(this.settings.exportsFolder);
    const destPath = `${this.settings.exportsFolder}/${file.basename}.mapping.json`;
    const existing = this.app.vault.getAbstractFileByPath(destPath);

    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(destPath, content);
    }

    new Notice(`✓ Mapping exporté → ${destPath}`);
  }

  private async scanCurrentFile(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice('Aucun fichier actif.'); return; }

    const rules = await this.scopeResolver.getRulesFor(file.path);
    if (rules.length === 0) {
      new Notice('Aucune règle pour ce fichier.\nCréez des règles via Ctrl+P → "Créer une règle".');
      return;
    }

    const content = await this.app.vault.read(file);
    const occurrences = scanOccurrences(content, file.path, rules, {
      caseSensitive: this.settings.caseSensitive,
      wholeWordOnly: this.settings.wholeWordOnly,
    });

    if (occurrences.length === 0) {
      new Notice('Aucune occurrence trouvée pour les règles actives.');
      return;
    }

    new OccurrencesModal(this.app, this, file, content, occurrences, rules).open();
  }

  // Appelé par OccurrencesModal après application — met à jour les statuts des règles.
  async updateMappingStatuses(
    filePath: string,
    rules: MappingRule[],
    occurrences: Occurrence[],
    decisions: Map<string, 'validated' | 'ignored' | 'false_positive'>
  ): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(this.settings.mappingFolder);
    if (!folder) return;

    // Pour chaque règle concernée, calculer le statut global
    for (const rule of rules) {
      const ruleOccs = occurrences.filter((o) => o.mappingId === rule.id);
      if (ruleOccs.length === 0) continue;

      const validated = ruleOccs.filter((o) => decisions.get(o.id) === 'validated').length;
      const ignored = ruleOccs.filter((o) => decisions.get(o.id) === 'ignored').length;
      const fp = ruleOccs.filter((o) => decisions.get(o.id) === 'false_positive').length;

      let newStatus: MappingStatus;
      if (validated > 0 && (ignored + fp) > 0) newStatus = 'partial';
      else if (validated === ruleOccs.length) newStatus = 'validated';
      else newStatus = 'ignored';

      // Trouver et mettre à jour dans le mapping JSON
      const location = await this.scopeResolver.findRuleByTerm(rule.source);
      if (location) {
        location.store.update(rule.id, { status: newStatus });
        await this.scopeResolver.saveStore(location.store, location.filePath);
      }
    }
  }

  async applyRuleToFile(file: TFile, source: string, replacement: string): Promise<number> {
    const content = await this.app.vault.read(file);
    const fakeRule: MappingRule = {
      id: '_quick', source, replacement, category: 'custom',
      scope: { type: 'file', path: file.path }, status: 'validated',
      priority: 0, createdBy: 'user', createdAt: new Date().toISOString(),
    };
    const spans = findSpansForRule(content, fakeRule, {
      caseSensitive: this.settings.caseSensitive,
      wholeWordOnly: this.settings.wholeWordOnly,
    });
    if (spans.length === 0) return 0;
    spans.sort((a, b) => b.start - a.start);
    await this.app.vault.modify(file, applySpans(content, spans));
    return spans.length;
  }

  // --- Utilitaires ---

  async ensureFolder(folderPath: string): Promise<void> {
    const parts = folderPath.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as PseudObsSettings;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
