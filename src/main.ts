import { Plugin, Notice, TFile, TAbstractFile, Editor, Menu, MarkdownView, requestUrl } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { PseudObsSettings, DEFAULT_SETTINGS, PseudObsSettingTab } from './settings';
import { RuleModal } from './ui/RuleModal';
import { QuickPseudonymizeModal } from './ui/QuickPseudonymizeModal';
import { createPseudonymHighlighter, highlightDataChanged, type HighlightData } from './ui/PseudonymHighlighter';
import { EditRuleModal } from './ui/EditRuleModal';
import { OccurrencesModal } from './ui/OccurrencesModal';
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
  // Cache synchrone pour le surlignage CM6 (mis à jour de façon asynchrone)
  private highlightData: HighlightData = { sources: [], replacements: [] };

  async onload(): Promise<void> {
    await this.loadSettings();
    this.scopeResolver = new ScopeResolver(this.app.vault, this.settings.mappingFolder);
    this.addSettingTab(new PseudObsSettingTab(this.app, this));

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

        const selLower = selection.toLowerCase();
        const isKnown =
          this.highlightData.sources.some((s) => s.toLowerCase() === selLower) ||
          this.highlightData.replacements.some((r) => r.toLowerCase() === selLower);

        if (isKnown) {
          // Terme connu : proposer la modification en priorité
          menu.addItem((item) =>
            item
              .setTitle(`Modifier la règle pour "${selection.slice(0, 25)}${selection.length > 25 ? '…' : ''}"`)
              .setIcon('settings')
              .onClick(async () => {
                const location = await this.scopeResolver.findRuleByTerm(selection);
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

  onunload(): void {}

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
      this.highlightData = { sources: [], replacements: [] };
    } else {
      try {
        const rules = await this.scopeResolver.getRulesFor(file.path);
        this.highlightData = {
          sources: rules.map((r) => r.source).filter(Boolean),
          replacements: rules.map((r) => r.replacement).filter(Boolean),
        };
      } catch {
        this.highlightData = { sources: [], replacements: [] };
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

  private async pseudonymizeActiveFile(): Promise<void> {
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
