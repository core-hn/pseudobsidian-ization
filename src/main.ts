import { Plugin, Notice, TFile, TFolder, TAbstractFile, Editor, Menu, MarkdownView, requestUrl, WorkspaceLeaf } from 'obsidian';
import { t, setLocale } from './i18n';
import { EditorView } from '@codemirror/view';
import { PseudObsSettings, DEFAULT_SETTINGS, PseudObsSettingTab } from './settings';
import { RuleModal } from './ui/RuleModal';
import { QuickPseudonymizeModal } from './ui/QuickPseudonymizeModal';
import { createPseudonymHighlighter, highlightDataChanged, type HighlightData } from './ui/PseudonymHighlighter';
import { EditRuleModal } from './ui/EditRuleModal';
import { PseudonymizationView, VIEW_TYPE_PSEUDOBS } from './ui/PseudonymizationView';
import { OnboardingModal } from './ui/OnboardingModal';
import { OnnxNerScanner } from './scanner/OnnxNerScanner';
import { DictionaryLoader } from './dictionaries/DictionaryLoader';
import { DictScanReviewModal } from './ui/DictScanReviewModal';
import { generateRedaction } from './pseudonymizer/Redaction';
import { CorpusModal, ClassSelectModal, getCorpusClasses } from './ui/CorpusModal';
import type { DictScanResultItem } from './ui/DictScanReviewModal';
import { MappingScanReviewModal } from './ui/MappingScanReviewModal';
import type { MappingRuleResult } from './ui/MappingScanReviewModal';
import { scanOccurrences } from './scanner/OccurrenceScanner';
import { SrtParser } from './parsers/SrtParser';
import { ChatParser } from './parsers/ChatParser';
import { VttParser } from './parsers/VttParser';
import { NoScribeHtmlParser } from './parsers/NoScribeHtmlParser';
import { NoScribeVttParser } from './parsers/NoScribeVttParser';
import { srtToMarkdown, chatToMarkdown, vttToMarkdown, noScribeHtmlToMarkdown, extractWordData, markdownToVtt, type VttCueData } from './parsers/TranscriptConverter';
import { MappingStore } from './mappings/MappingStore';
import { ScopeResolver } from './mappings/ScopeResolver';
import { PseudonymizationEngine } from './pseudonymizer/PseudonymizationEngine';
import { findSpansForRule } from './pseudonymizer/ReplacementPlanner';
import { applySpans } from './pseudonymizer/SpanProtector';
import type { MappingRule, MappingStatus, Occurrence } from './types';

const CONVERTIBLE_EXTS = ['srt', 'cha', 'chat', 'vtt', 'html'];

export default class PseudObsPlugin extends Plugin {
  settings!: PseudObsSettings;
  scopeResolver!: ScopeResolver;
  nerScanner!: OnnxNerScanner;
  dictionaryLoader!: DictionaryLoader;
  // Cache synchrone pour le surlignage CM6 (mis à jour de façon asynchrone)
  private highlightData: HighlightData = { sources: [], replacements: [], nerCandidates: [], ignoredTerms: [] };
  // Candidats NER par fichier (effacés au changement de fichier ou à un nouveau scan)
  private nerCandidateFile: TFile | null = null;
  private nerCandidates: string[] = [];
  // Dernière MarkdownView connue — pour mettre à jour le surlignage même
  // quand le panneau latéral a le focus (getActiveViewOfType retourne null dans ce cas)
  private lastMarkdownView: MarkdownView | null = null;
  private _viewRefreshTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    setLocale(this.settings.language);
    this.scopeResolver = new ScopeResolver(this.app.vault, this.settings.mappingFolder);
    this.nerScanner = new OnnxNerScanner(this.app);
    this.dictionaryLoader = new DictionaryLoader(this.app, this);
    // Chargement différé : le dossier plugin est accessible après layout ready
    this.app.workspace.onLayoutReady(() => { void this.dictionaryLoader.load(); });
    this.addSettingTab(new PseudObsSettingTab(this.app, this));

    this.registerView(VIEW_TYPE_PSEUDOBS, (leaf: WorkspaceLeaf) => new PseudonymizationView(leaf, this));
    this.addRibbonIcon('eye-off', 'PseudObsidianization', () => void this.activateView());

    // Extension CM6 : surlignage des termes sources (orange) et remplacements (vert)
    this.registerEditorExtension(
      createPseudonymHighlighter(() => this.highlightData)
    );

    // Tracker la dernière MarkdownView pour garder le surlignage actif
    // même quand le panneau latéral prend le focus
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        const v = leaf?.view;
        if (v instanceof MarkdownView) this.lastMarkdownView = v;
        void this.refresh();
      })
    );

    // Rafraîchir panneau + surlignage quand le FICHIER TRANSCRIPT actif est modifié.
    // Les fichiers .mapping.json sont exclus — leurs changements sont déjà gérés
    // par les appels explicites à refresh() dans les modales, évitant le double rendu.
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile
            && !file.name.endsWith('.mapping.json')
            && file === this.app.workspace.getActiveFile()) {
          void this.refresh();
        }
      })
    );

    // Premier chargement au démarrage
    void this.refresh();

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
      id: 'organize-corpus',
      name: t('command.organizeCorpus'),
      callback: () => new CorpusModal(this.app, this).open(),
    });

    this.addCommand({
      id: 'add-transcription',
      name: t('command.addTranscription'),
      callback: () => this.openFilePicker(),
    });

    this.addCommand({
      id: 'pseudonymize-current-file',
      name: t('command.pseudonymizeFile'),
      callback: () => this.pseudonymizeActiveFile(),
    });

    this.addCommand({
      id: 'create-rule',
      name: t('command.createRule'),
      editorCallback: (editor) => {
        new RuleModal(this.app, this, editor.getSelection()).open();
      },
    });

    this.addCommand({
      id: 'scan-current-file',
      name: t('command.scanFile'),
      callback: () => this.scanCurrentFile(),
    });

    this.addCommand({
      id: 'scan-ner',
      name: t('command.scanNer'),
      callback: () => void this.scanCurrentFileNer(),
    });

    this.addCommand({
      id: 'scan-dictionaries',
      name: t('command.scanDictionaries'),
      callback: () => void this.scanCurrentFileWithDictionaries(),
    });

    this.addCommand({
      id: 'export-as-vtt',
      name: t('command.exportAsVtt'),
      callback: () => void this.exportCurrentFileAsVtt(),
    });

    this.addCommand({
      id: 'pseudonymize-selection',
      name: t('command.pseudonymizeSelection'),
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

        const truncate = (s: string) => s.slice(0, 25) + (s.length > 25 ? '…' : '');

        if (isReplacement) {
          menu.addItem((item) =>
            item
              .setTitle(t('contextMenu.cancelPseudonymization', truncate(bare)))
              .setIcon('undo')
              .onClick(async () => {
                const location = await this.scopeResolver.findRuleByTerm(bare);
                if (!location) { new Notice(t('notice.ruleNotFound')); return; }
                editor.replaceSelection(location.rule.source);
                void this.refresh();
              })
          );
        }

        if (isKnown) {
          menu.addItem((item) =>
            item
              .setTitle(t('contextMenu.editRule', truncate(bare)))
              .setIcon('settings')
              .onClick(async () => {
                const location = await this.scopeResolver.findRuleByTerm(bare);
                if (location) {
                  new EditRuleModal(this.app, this, location).open();
                } else {
                  new Notice(t('notice.ruleNotFound'));
                }
              })
          );
        }

        menu.addItem((item) =>
          item
            .setTitle(t('contextMenu.pseudonymize', truncate(selection)))
            .setIcon('eye-off')
            .onClick(() => new QuickPseudonymizeModal(this.app, this, editor).open())
        );

        menu.addItem((item) =>
          item
            .setTitle(t('contextMenu.redact', truncate(selection)))
            .setIcon('square')
            .onClick(() => new QuickPseudonymizeModal(this.app, this, editor, generateRedaction(selection), [], true).open())
        );

        menu.addItem((item) =>
          item
            .setTitle(t('contextMenu.coulmont'))
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
            .setTitle(t('contextMenu.createRule'))
            .setIcon('pencil')
            .onClick(() => new RuleModal(this.app, this, selection).open())
        );
      })
    );
  }

  onunload(): void {}

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_PSEUDOBS)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_PSEUDOBS, active: true });
    }
    void workspace.revealLeaf(leaf);
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
      this.highlightData = { sources: [], replacements: [], nerCandidates: [], ignoredTerms: [] };
    } else {
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
        // Termes ignorés : extraits des ignoredOccurrences de chaque règle
        const ignoredTerms = rules.flatMap((r) =>
          (r.ignoredOccurrences ?? []).map((o) => o.text)
        );
        this.highlightData = {
          sources: rules.map((r) => r.source).filter(Boolean),
          replacements: rules.map((r) => r.replacement).filter(Boolean),
          nerCandidates,
          ignoredTerms,
        };
      } catch {
        this.highlightData = { sources: [], replacements: [], nerCandidates, ignoredTerms: [] };
      }
    }

    // Dispatcher le StateEffect — utiliser lastMarkdownView si le panneau a le focus
    const view = this.app.workspace.getActiveViewOfType(MarkdownView) ?? this.lastMarkdownView;
    const cm = view?.editor && ((view.editor as unknown as { cm?: EditorView }).cm);
    cm?.dispatch({ effects: highlightDataChanged.of(undefined) });
  }

  /**
   * Rafraîchit à la fois le surlignage CM6 ET le panneau latéral.
   * À appeler après toute action qui crée, modifie ou supprime une règle.
   */
  async refresh(): Promise<void> {
    await this.refreshHighlightData();
    this.refreshView();
  }

  /**
   * Demande au panneau latéral ouvert de re-rendre son onglet actif.
   * Debounce 80 ms pour coalescer les appels multiples rapides
   * (vault watcher + appel explicite dans la même action).
   */
  refreshView(): void {
    if (this._viewRefreshTimer !== null) {
      window.clearTimeout(this._viewRefreshTimer);
    }
    this._viewRefreshTimer = window.setTimeout(() => {
      this._viewRefreshTimer = null;
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PSEUDOBS);
      for (const leaf of leaves) {
        const view = leaf.view;
        if (view instanceof PseudonymizationView) {
          void view.refreshActiveTab();
        }
      }
    }, 80);
  }

  // --- Conversion automatique ---

  private async autoConvert(file: TFile): Promise<void> {
    try {
      const raw = await this.app.vault.read(file);
      const ext = file.extension.toLowerCase();
      const basename = file.basename;
      const folder = file.parent?.path ?? '';
      const mdPath = folder ? `${folder}/${basename}.md` : `${basename}.md`;

      // Ne pas écraser un .md existant
      if (this.app.vault.getAbstractFileByPath(mdPath) instanceof TFile) {
        new Notice(t('notice.conversionSkipped', basename, file.name));
        return;
      }

      // Chercher un fichier audio déjà présent dans le même dossier du vault
      let audioFilename = this.findAudioInVaultFolder(folder);

      // Conversion
      let mdContent: string;
      let wordData: ReturnType<typeof extractWordData> | null = null;

      if (ext === 'srt') {
        mdContent = srtToMarkdown(new SrtParser().parse(raw), file.name);
      } else if (ext === 'vtt') {
        const doc = NoScribeVttParser.isNoScribeVtt(raw)
          ? new NoScribeVttParser().parse(raw)
          : new VttParser().parse(raw);
        wordData = extractWordData(doc);
        // Pour les VTT noScribe, chercher aussi l'audio via NOTE media
        if (!audioFilename && NoScribeVttParser.isNoScribeVtt(raw)) {
          const audioSource = NoScribeVttParser.extractAudioSource(raw);
          if (audioSource) audioFilename = await this.importAudioFromPath(audioSource, folder || this.settings.transcriptionsFolder);
        }
        const toMd = NoScribeVttParser.isNoScribeVtt(raw) ? noScribeHtmlToMarkdown : vttToMarkdown;
        mdContent = toMd(doc, file.name, audioFilename ?? undefined);
      } else if (ext === 'html') {
        if (!NoScribeHtmlParser.isNoScribeHtml(raw)) return;
        const doc = new NoScribeHtmlParser().parse(raw);
        wordData = extractWordData(doc);
        // Importer l'audio depuis le chemin absolu dans la meta tag si pas encore dans le vault
        if (!audioFilename) {
          const audioSource = NoScribeHtmlParser.extractAudioSource(raw);
          if (audioSource) {
            audioFilename = await this.importAudioFromPath(audioSource, folder || this.settings.transcriptionsFolder);
          }
        }
        mdContent = noScribeHtmlToMarkdown(doc, file.name, audioFilename ?? undefined);
      } else {
        mdContent = chatToMarkdown(new ChatParser().parse(raw), file.name);
      }

      await this.app.vault.create(mdPath, mdContent);

      // Structure miroir pour les mappings
      const transcRoot = this.settings.transcriptionsFolder;
      const fileFolder = file.parent?.path ?? '';
      const relSubFolder = fileFolder.startsWith(transcRoot)
        ? fileFolder.slice(transcRoot.length).replace(/^\//, '')
        : '';
      const mappingDir = relSubFolder
        ? `${this.settings.mappingFolder}/${relSubFolder}`
        : this.settings.mappingFolder;
      await this.ensureFolder(mappingDir);

      const mappingPath = `${mappingDir}/${basename}.mapping.json`;
      if (!this.app.vault.getAbstractFileByPath(mappingPath)) {
        const store = new MappingStore({ type: 'file', path: mdPath });
        await this.app.vault.create(mappingPath, JSON.stringify(store.toJSON(), null, 2));
      }

      // Écrire les timestamps word-level dans un fichier auxiliaire
      if (wordData && wordData.length > 0) {
        const wordsPath = `${mappingDir}/${basename}.words.json`;
        if (!this.app.vault.getAbstractFileByPath(wordsPath)) {
          await this.app.vault.create(wordsPath, JSON.stringify(wordData, null, 2));
        }
      }

      await this.app.fileManager.trashFile(file);

      const mdFile = this.app.vault.getAbstractFileByPath(mdPath);
      if (mdFile instanceof TFile) {
        await this.app.workspace.getLeaf().openFile(mdFile);
      }

      new Notice(t('notice.converted', file.name, `${basename}.md`));
    } catch (e) {
      new Notice(t('notice.conversionError', file.name, (e as Error).message));
    }
  }

  /** Retourne le nom du premier fichier audio trouvé dans un dossier du vault. */
  private findAudioInVaultFolder(folderPath: string): string | null {
    const AUDIO_EXTS = new Set(['m4a', 'mp3', 'wav', 'ogg', 'flac', 'mp4', 'aac', 'aiff']);
    const folder = this.app.vault.getAbstractFileByPath(folderPath || '/');
    if (!(folder instanceof TFolder)) return null;
    const audioFile = folder.children.find(
      (f) => f instanceof TFile && AUDIO_EXTS.has((f as TFile).extension.toLowerCase())
    ) as TFile | undefined;
    return audioFile?.name ?? null;
  }

  /**
   * Copie un fichier audio externe (chemin absolu sur disque) dans le vault.
   * Utilise l'API Node.js fs — desktop uniquement.
   * Retourne le nom du fichier importé, ou null en cas d'échec.
   */
  private async importAudioFromPath(sourcePath: string, targetFolder: string): Promise<string | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodeFs = require('fs') as typeof import('fs');
      if (!nodeFs.existsSync(sourcePath)) return null;

      const audioFilename = sourcePath.replace(/\\/g, '/').split('/').pop()!;
      const destPath = targetFolder ? `${targetFolder}/${audioFilename}` : audioFilename;

      if (this.app.vault.getAbstractFileByPath(destPath) instanceof TFile) {
        return audioFilename; // déjà présent
      }

      const buffer: Buffer = await nodeFs.promises.readFile(sourcePath);
      await this.ensureFolder(targetFolder);
      const arrayBuf = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
      await this.app.vault.createBinary(destPath, arrayBuf);
      new Notice(`Audio importé : ${audioFilename}`);
      return audioFilename;
    } catch {
      return null;
    }
  }

  // --- Commande "Ajouter une transcription" ---

  private openFilePicker(): void {
    const input = activeDocument.createElement('input');
    input.type = 'file';
    input.accept = '.srt,.vtt,.cha,.chat,.html,.txt,.md';
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
    const ext = browserFile.name.split('.').pop()?.toLowerCase() ?? '';

    // Sélection de classe si le corpus est organisé en sous-dossiers
    const classes = getCorpusClasses(this.app, this.settings.transcriptionsFolder);
    let targetFolder = this.settings.transcriptionsFolder;

    if (classes.length > 0) {
      const modal = new ClassSelectModal(this.app, this, classes);
      const chosen = await modal.prompt();
      if (chosen === undefined) return; // annulé
      if (chosen !== null) targetFolder = `${this.settings.transcriptionsFolder}/${chosen}`;
    }

    await this.ensureFolder(targetFolder);
    const destPath = `${targetFolder}/${browserFile.name}`;

    if (this.app.vault.getAbstractFileByPath(destPath) instanceof TFile) {
      new Notice(t('notice.fileExists', browserFile.name));
      return;
    }

    await this.app.vault.create(destPath, raw);

    // Pour VTT : chercher un fichier audio dans le dossier source (Electron expose le chemin complet)
    if (ext === 'vtt') {
      const sourcePath = (browserFile as unknown as { path?: string }).path;
      if (sourcePath) {
        const sourceDir = sourcePath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
        const audioPath = await this.findAudioInSourceFolder(sourceDir);
        if (audioPath) await this.importAudioFromPath(audioPath, targetFolder);
      }
    }
    // Pour HTML : l'audio sera importé par autoConvert via la meta tag audio_source
  }

  /**
   * Cherche un fichier audio dans un dossier sur le disque (hors vault).
   * Retourne le chemin absolu du seul fichier audio trouvé, ou null si 0 ou >1.
   */
  private async findAudioInSourceFolder(folderPath: string): Promise<string | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodeFs = require('fs') as typeof import('fs');
      const AUDIO_EXTS = new Set(['m4a', 'mp3', 'wav', 'ogg', 'flac', 'mp4', 'aac', 'aiff']);
      const entries = await nodeFs.promises.readdir(folderPath);
      const audioFiles = entries.filter((f) => {
        const ext = f.split('.').pop()?.toLowerCase() ?? '';
        return AUDIO_EXTS.has(ext);
      });
      // Import uniquement s'il y a exactement un fichier audio (évite l'ambiguïté)
      if (audioFiles.length === 1) return `${folderPath}/${audioFiles[0]}`;
      return null;
    } catch {
      return null;
    }
  }

  // --- Pseudonymisation ---

  async pseudonymizeActiveFile(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice(t('notice.noActiveFile')); return; }

    const ext = file.extension.toLowerCase();
    if (!['srt', 'cha', 'chat', 'md', 'txt'].includes(ext)) {
      new Notice(t('notice.formatUnsupported', ext));
      return;
    }

    const content = await this.app.vault.read(file);
    const rules = await this.scopeResolver.getRulesFor(file.path);
    if (rules.length === 0) {
      new Notice(t('notice.noRules'));
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

    new Notice(t('notice.exportDone', String(rules.length), outputPath));
  }

  async scanCurrentFileNer(): Promise<void> {
    if (this.settings.nerBackend !== 'transformers-js') {
      new Notice('La détection NER transformers.js n\'est pas activée.\nActivez-la dans Paramètres → Pseudonymizer Tool.');
      return;
    }

    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice(t('notice.noActiveFile')); return; }

    const ext = file.extension.toLowerCase();
    if (!['srt', 'cha', 'chat', 'md', 'txt'].includes(ext)) {
      new Notice(t('notice.formatUnsupported', ext));
      return;
    }

    try {
      const content = await this.app.vault.read(file);
      const occurrences = await this.nerScanner.scan(content, file.path, {
        minScore: this.settings.nerMinScore,
        functionWords: new Set(this.settings.nerFunctionWords.map((w) => w.toLowerCase())),
      });

      if (occurrences.length === 0) {
        new Notice(t('notice.noNerEntities'));
        return;
      }

      const unique = [...new Set(occurrences.map((o) => o.text).filter(Boolean))];
      this.nerCandidateFile = file;
      this.nerCandidates = unique;
      void this.refresh();

      new Notice(t('notice.nerEntitiesFound', String(unique.length), unique.length > 1 ? t('notice.nerEntitiesFound.entities') : t('notice.nerEntitiesFound.entity')), 6000);
    } catch (e) {
      new Notice(`NER error: ${(e as Error).message}`);
    }
  }

  async scanCurrentFileWithDictionaries(dictIds?: string[]): Promise<void> {
    if (!this.dictionaryLoader.hasDetection()) {
      new Notice(t('notice.noDictDetection'));
      return;
    }

    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice(t('notice.noActiveFile')); return; }

    const ext = file.extension.toLowerCase();
    if (!['srt', 'cha', 'chat', 'md', 'txt'].includes(ext)) {
      new Notice(t('notice.formatUnsupported', ext));
      return;
    }

    const content = await this.app.vault.read(file);
    const rules = await this.scopeResolver.getRulesFor(file.path);
    const existingSources = new Set(rules.map((r) => r.source.toLowerCase()));

    const occurrences = this.dictionaryLoader.scanText(content, file.path, existingSources, dictIds);

    if (occurrences.length === 0) {
      new Notice(t('notice.noDictEntities'));
      return;
    }

    // Grouper par terme (ordre d'apparition dans le texte, déjà garanti par scanText)
    const seenTerms = new Map<string, { occ: typeof occurrences[0]; count: number }>();
    for (const occ of occurrences) {
      const key = occ.text.toLowerCase();
      const existing = seenTerms.get(key);
      if (existing) { existing.count++; }
      else { seenTerms.set(key, { occ, count: 1 }); }
    }

    // Pré-calculer les remplacements en séquence dans l'ordre d'apparition
    // (garantit Ville_1 → Ville_2 dans l'ordre du texte, pas aléatoire)
    const existingReplacements = rules.map((r) => r.replacement);
    const usedReplacements = [...existingReplacements];

    const results: DictScanResultItem[] = [];
    for (const [, { occ, count }] of seenTerms) {
      const hits = this.dictionaryLoader.getDetectionHits(occ.text);
      if (!hits.length) continue;
      const { entry, dict } = hits.find((h) => !dictIds || dictIds.includes(h.dict.dictionaryId)) ?? hits[0];
      const entryClass = this.dictionaryLoader.resolveClass(entry, dict);

      let proposedReplacement: string;
      if (entryClass) {
        proposedReplacement = this.dictionaryLoader.nextReplacement(dict, entryClass, usedReplacements);
        usedReplacements.push(proposedReplacement);
      } else if (entry.replacement) {
        proposedReplacement = entry.replacement;
      } else {
        continue;
      }

      results.push({
        term: occ.text,
        dictId: dict.dictionaryId,
        dictLabel: dict.label,
        entryClass,
        proposedReplacement,
        occurrenceCount: count,
        category: occ.category ?? dict.type ?? 'place',
        contextBefore: occ.contextBefore,
        contextAfter: occ.contextAfter,
      });
    }

    if (results.length === 0) {
      new Notice('Aucun remplacement disponible pour les entités trouvées.');
      return;
    }

    // Surlignage bleu préventif (aperçu pendant que la modale est ouverte)
    this.nerCandidateFile = file;
    this.nerCandidates = results.map((r) => r.term);
    void this.refresh();

    new DictScanReviewModal(this.app, this, file, results, existingReplacements).open();
  }

  // Efface les candidats NER pour le fichier courant (appelé après création de règle si besoin)
  clearNerCandidates(): void {
    this.nerCandidates = [];
    this.nerCandidateFile = null;
    void this.refresh();
  }


  async exportMappingForFile(file: TFile): Promise<void> {
    const mappingPath = `${this.settings.mappingFolder}/${file.basename}.mapping.json`;
    const mappingFile = this.app.vault.getAbstractFileByPath(mappingPath);

    if (!(mappingFile instanceof TFile)) {
      new Notice(t('notice.noMapping', file.name));
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

    new Notice(t('notice.mappingExported', destPath));
  }

  /**
   * Exporte le fichier Markdown noScribe actif en WebVTT pseudonymisé.
   * Lit le .words.json correspondant pour les timestamps précis.
   */
  async exportCurrentFileAsVtt(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== 'md') {
      new Notice(t('notice.noActiveFile'));
      return;
    }

    const content = await this.app.vault.read(file);

    // Vérifier que c'est bien un fichier noScribe converti
    const formatMatch = /^pseudobs-format:\s*(\w+)/m.exec(content);
    const format = formatMatch?.[1];
    if (format !== 'vtt' && format !== 'html') {
      new Notice(t('notice.notNoScribeFormat'));
      return;
    }

    // Trouver le .words.json : même basename, dans le dossier mappings
    // Le basename peut être "juste-leblanc" ou "juste-leblanc.pseudonymized"
    const rawBasename = file.basename.replace(/\.pseudonymized$/, '');
    const wordsJson = await this.findWordsJson(rawBasename);
    if (!wordsJson) {
      new Notice(t('notice.wordsJsonMissing', rawBasename));
      return;
    }

    const wordData = JSON.parse(wordsJson) as VttCueData[];
    const { vtt, mismatch } = markdownToVtt(content, wordData);

    if (mismatch) {
      new Notice(t('notice.vttMismatch'));
    }

    await this.ensureFolder(this.settings.exportsFolder);
    const outputPath = `${this.settings.exportsFolder}/${rawBasename}.pseudonymized.vtt`;
    const existing = this.app.vault.getAbstractFileByPath(outputPath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, vtt);
    } else {
      await this.app.vault.create(outputPath, vtt);
    }

    new Notice(t('notice.vttExported', outputPath));
  }

  /** Cherche <basename>.words.json dans le dossier mappings et ses sous-dossiers. */
  private async findWordsJson(basename: string): Promise<string | null> {
    const filename = `${basename}.words.json`;
    // Chercher dans l'ensemble du dossier mappings
    const search = (folder: TFolder): TFile | null => {
      for (const child of folder.children) {
        if (child instanceof TFile && child.name === filename) return child;
        if (child instanceof TFolder) {
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    };

    const mappingRoot = this.app.vault.getAbstractFileByPath(this.settings.mappingFolder);
    if (!(mappingRoot instanceof TFolder)) return null;

    const wordsFile = search(mappingRoot);
    return wordsFile ? this.app.vault.read(wordsFile) : null;
  }

  private async scanCurrentFile(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice(t('notice.noActiveFile')); return; }

    const rules = await this.scopeResolver.getRulesFor(file.path);
    if (rules.length === 0) {
      new Notice(t('notice.noRules'));
      return;
    }

    const content = await this.app.vault.read(file);
    const occurrences = scanOccurrences(content, file.path, rules, {
      caseSensitive: this.settings.caseSensitive,
      wholeWordOnly: this.settings.wholeWordOnly,
    });

    if (occurrences.length === 0) {
      new Notice(t('notice.noOccurrences'));
      return;
    }

    const occsByRule = new Map<string, Occurrence[]>();
    for (const occ of occurrences) {
      const id = occ.mappingId ?? '';
      if (!occsByRule.has(id)) occsByRule.set(id, []);
      occsByRule.get(id)!.push(occ);
    }
    const ruleResults: MappingRuleResult[] = rules
      .filter((r) => occsByRule.has(r.id))
      .map((r) => ({
        rule: r,
        matchCount: occsByRule.get(r.id)!.length,
        occurrences: occsByRule.get(r.id)!,
      }));

    new MappingScanReviewModal(this.app, this, file, content, ruleResults).open();
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

  /**
   * Annule l'application d'une règle dans le fichier actif :
   * cherche le remplacement (avec ou sans marqueurs) et le réécrit avec la source.
   * Appelé automatiquement à la suppression d'une règle dans EditRuleModal.
   */
  async revertRuleInFile(source: string, replacement: string): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) return;

    const s = this.settings;
    // Chercher la version avec marqueurs EN PREMIER — sinon on trouve le texte
    // à l'intérieur des marqueurs et on obtient {{source}} au lieu de source.
    const variants: string[] = [];
    if (s.useMarkerInExport) {
      variants.push(`${s.markerOpen}${replacement}${s.markerClose}`);
    }
    variants.push(replacement); // version sans marqueurs en dernier

    let content = await this.app.vault.read(file);
    let changed = false;

    for (const variant of variants) {
      const fakeRule: MappingRule = {
        id: '_revert', source: variant, replacement: source, category: 'custom',
        scope: { type: 'file', path: file.path }, status: 'validated',
        priority: 0, createdBy: 'user', createdAt: new Date().toISOString(),
      };
      const spans = findSpansForRule(content, fakeRule, {
        caseSensitive: false,
        wholeWordOnly: false,  // le remplacement peut contenir des 🀫 ou marqueurs
      });
      if (spans.length > 0) {
        spans.sort((a, b) => b.start - a.start);
        content = applySpans(content, spans);
        changed = true;
      }
    }

    if (changed) {
      await this.app.vault.modify(file, content);
      void this.refresh();
    }
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
