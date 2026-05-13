import { App, FileSystemAdapter, Modal, Notice, TFile, requestUrl, setIcon } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import type PseudObsPlugin from '../main';
import type { NerBackend } from '../settings';
import type { DictionaryFile, DictionaryManifest, DictionaryManifestEntry } from '../types';

// Version du package @xenova/transformers embarqué — doit rester synchronisée avec package.json
const TRANSFORMERS_VERSION = '2.17.2';
const WASM_CDN_BASE = `https://cdn.jsdelivr.net/npm/@xenova/transformers@${TRANSFORMERS_VERSION}/dist`;
const DICT_MANIFEST_URL = 'https://raw.githubusercontent.com/core-hn/pseudobsidian-dictionaries/main/index.json';
const WASM_FILES = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd.wasm',
  'ort-wasm-threaded.wasm',
  'ort-wasm.wasm',
] as const;

type Step = 'welcome' | 'ner' | 'dictionaries' | 'summary';

const STEPS: Step[] = ['welcome', 'ner', 'dictionaries', 'summary'];

const STEP_LABELS: Record<Step, string> = {
  welcome:      'Bienvenue',
  ner:          'Détection NER',
  dictionaries: 'Dictionnaires',
  summary:      'Résumé',
};

export class OnboardingModal extends Modal {
  private plugin: PseudObsPlugin;
  private currentStep: Step = 'welcome';

  // État local — sauvegardé étape par étape dans les settings
  private nerBackend: NerBackend;
  private spacyServerUrl: string;
  private importedDicts: string[] = []; // noms des fichiers copiés dans cette session

  constructor(app: App, plugin: PseudObsPlugin) {
    super(app);
    this.plugin = plugin;
    // Pré-remplir depuis les settings actuels
    this.nerBackend = plugin.settings.nerBackend;
    this.spacyServerUrl = plugin.settings.spacyServerUrl;
  }

  onOpen(): void {
    this.modalEl.addClass('pseudobs-onboarding');
    // Différer le premier render pour sortir du cycle d'ouverture du modal
    window.setTimeout(() => this.render(), 0);
  }

  private scheduleRender(): void {
    // Différer le re-render pour éviter de modifier le DOM pendant un cycle de mesure Obsidian
    window.setTimeout(() => this.render(), 0);
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    this.renderStepIndicator(contentEl);

    const body = contentEl.createDiv('pseudobs-onboarding-body');

    if (this.currentStep === 'welcome')      this.renderWelcome(body);
    else if (this.currentStep === 'ner')     this.renderNer(body);
    else if (this.currentStep === 'dictionaries') this.renderDictionaries(body);
    else                                     this.renderSummary(body);

    this.renderNav(contentEl);
  }

  // ---- Indicateur d'étapes ----------------------------------------

  private renderStepIndicator(el: HTMLElement): void {
    const bar = el.createDiv('pseudobs-onboarding-steps');
    for (const step of STEPS) {
      const dot = bar.createDiv('pseudobs-onboarding-step-dot');
      if (step === this.currentStep) dot.addClass('pseudobs-onboarding-step-current');
      else if (STEPS.indexOf(step) < STEPS.indexOf(this.currentStep))
        dot.addClass('pseudobs-onboarding-step-done');
      dot.createSpan({ text: STEP_LABELS[step] });
    }
  }

  // ---- Étape 1 : Bienvenue ----------------------------------------

  private renderWelcome(el: HTMLElement): void {
    el.createEl('h2', { text: 'Pseudonymizer tool' });
    el.createEl('p', {
      text: 'Ce plugin vous aide à corriger et pseudonymiser des transcriptions d\'entretiens et de corpus interactionnels (formats Jefferson, ICOR, .srt, .cha).',
    });
    el.createEl('p', {
      text: 'L\'assistant va vous guider en deux étapes rapides :',
    });
    const list = el.createEl('ul');
    list.createEl('li', { text: 'Choisir un moteur de détection automatique des entités nommées (optionnel).' });
    list.createEl('li', { text: 'Importer des dictionnaires de candidats de remplacement (.dict.json) si vous en avez.' });
    el.createEl('p', {
      text: 'Vous pourrez reconfigurer ces options à tout moment via les paramètres du plugin.',
      cls: 'pseudobs-onboarding-hint',
    });
  }

  // ---- Étape 2 : NER ----------------------------------------------

  private renderNer(el: HTMLElement): void {
    el.createEl('h2', { text: 'Détection automatique des entités' });
    el.createEl('p', {
      text: 'Un modèle NER (reconnaissance d\'entités nommées) peut détecter automatiquement les prénoms, noms, lieux et institutions dans vos transcriptions — sans liste exhaustive, directement dans Obsidian.',
    });

    // --- Carte transformers.js ---
    const cardTfjs = el.createDiv('pseudobs-onboarding-ner-card');
    if (this.nerBackend === 'transformers-js') cardTfjs.addClass('pseudobs-onboarding-ner-card-selected');

    const tfjsHeader = cardTfjs.createDiv('pseudobs-onboarding-ner-card-header');
    tfjsHeader.createEl('strong', { text: 'transformers.js — modèle ONNX embarqué' });
    tfjsHeader.createEl('span', { text: 'Python n\'est pas requis', cls: 'pseudobs-onboarding-badge' });

    cardTfjs.createEl('p', {
      text: 'Modèle NER multilingue exécuté localement dans le vault. Les fichiers .wasm (~19 Mo) sont téléchargés une seule fois ici. Le modèle (~66 Mo) est téléchargé au premier scan.',
    });

    const wasmRow = cardTfjs.createDiv('pseudobs-onboarding-url-row');
    const wasmStatus = wasmRow.createSpan({ cls: 'pseudobs-onboarding-test-status' });

    const wasmAlreadyPresent = this.checkWasmFiles();
    if (wasmAlreadyPresent) {
      wasmStatus.setText('Fichiers .wasm déjà installés');
      wasmStatus.classList.add('pseudobs-onboarding-test-ok');
    }

    const selectTfjs = cardTfjs.createEl('button', {
      text: this.nerBackend === 'transformers-js' ? 'Sélectionné' : 'Installer et utiliser transformers.js',
      cls: 'pseudobs-onboarding-select-btn',
    });
    if (this.nerBackend === 'transformers-js') selectTfjs.addClass('pseudobs-onboarding-select-btn-active');

    selectTfjs.addEventListener('click', () => { void (async () => {
      this.nerBackend = 'transformers-js';
      await this.saveNerSettings();

      if (!this.checkWasmFiles()) {
        const ok = await this.downloadWasmFiles(wasmStatus, selectTfjs);
        if (!ok) return;
      }

      this.scheduleRender();
    })(); });

    // --- Désactiver ---
    const noneRow = el.createDiv('pseudobs-onboarding-none-row');
    const noneBtn = noneRow.createEl('button', {
      text: this.nerBackend === 'none' ? 'Désactivé (règles manuelles uniquement)' : 'Passer — je travaillerai manuellement',
      cls: 'pseudobs-onboarding-none-btn',
    });
    if (this.nerBackend === 'none') noneBtn.addClass('pseudobs-onboarding-none-btn-active');
    noneBtn.addEventListener('click', () => { void (async () => {
      this.nerBackend = 'none';
      await this.saveNerSettings();
      this.scheduleRender();
    })(); });
  }

  // ---- Utilitaires WASM -----------------------------------------

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

  private checkWasmFiles(): boolean {
    const dir = this.getPluginDir();
    if (!dir) return false;
    return WASM_FILES.every((f) => fs.existsSync(path.join(dir, f)));
  }

  private async downloadWasmFiles(
    statusEl: HTMLElement,
    btn: HTMLElement
  ): Promise<boolean> {
    const dir = this.getPluginDir();
    if (!dir) {
      statusEl.setText('Impossible de localiser le dossier du plugin');
      statusEl.className = 'pseudobs-onboarding-test-status pseudobs-onboarding-test-err';
      return false;
    }

    btn.setAttr('disabled', 'true');

    for (let i = 0; i < WASM_FILES.length; i++) {
      const f = WASM_FILES[i];
      statusEl.className = 'pseudobs-onboarding-test-status';
      statusEl.setText(`Téléchargement ${i + 1}/${WASM_FILES.length} : ${f}…`);

      try {
        const response = await requestUrl({ url: `${WASM_CDN_BASE}/${f}`, method: 'GET' });
        fs.writeFileSync(path.join(dir, f), Buffer.from(response.arrayBuffer));
      } catch {
        statusEl.setText(`Échec pour ${f} — vérifiez votre connexion`);
        statusEl.classList.add('pseudobs-onboarding-test-err');
        btn.removeAttribute('disabled');
        return false;
      }
    }

    statusEl.setText('Fichiers .wasm installés');
    statusEl.classList.add('pseudobs-onboarding-test-ok');
    btn.removeAttribute('disabled');
    return true;
  }

  private async saveNerSettings(): Promise<void> {
    this.plugin.settings.nerBackend = this.nerBackend;
    this.plugin.settings.spacyServerUrl = this.spacyServerUrl;
    await this.plugin.saveSettings();
  }

  // ---- Étape 3 : Dictionnaires ------------------------------------

  private renderDictionaries(el: HTMLElement): void {
    el.createEl('h2', { text: 'Dictionnaires de candidats' });
    el.createEl('p', {
      text: 'Les dictionnaires proposent des candidats de remplacement (villes, prénoms…) et alimentent la détection. Ils sont hébergés dans un dépôt dédié et téléchargés dans votre vault — aucune donnée ne quitte Obsidian.',
    });

    // Zone catalogue (remplie de façon asynchrone)
    const catalogueEl = el.createDiv('pseudobs-onboarding-catalogue');
    catalogueEl.createEl('p', { text: 'Chargement du catalogue…', cls: 'pseudobs-onboarding-hint' });
    void this.renderCatalogue(catalogueEl);

    // Séparateur
    el.createEl('hr');

    // Import manuel (fallback offline)
    const manualRow = el.createDiv('pseudobs-onboarding-import-row');
    manualRow.createEl('small', {
      text: 'Vous avez déjà un fichier .dict.json ? Importez-le manuellement :',
      cls: 'pseudobs-onboarding-hint',
    });
    const importBtn = manualRow.createEl('button', {
      text: 'Importer un fichier local (.dict.json)',
      cls: 'pseudobs-onboarding-import-btn',
    });
    const importStatus = manualRow.createSpan({ cls: 'pseudobs-onboarding-test-status' });
    importBtn.addEventListener('click', () => {
      const input = activeDocument.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.multiple = true;
      input.classList.add('pseudobs-hidden-input');
      activeDocument.body.appendChild(input);
      input.addEventListener('change', () => void this.processDictFiles(input, importStatus));
      input.click();
    });

    // Liste des dictionnaires déjà présents dans le vault
    void this.renderInstalledDictList(el);
  }

  private async renderCatalogue(container: HTMLElement): Promise<void> {
    let manifest: DictionaryManifest;
    try {
      const res = await requestUrl({ url: DICT_MANIFEST_URL, method: 'GET' });
      manifest = res.json as DictionaryManifest;
    } catch {
      container.empty();
      container.createEl('p', {
        text: 'Impossible de contacter le catalogue en ligne. Vérifiez votre connexion ou importez un fichier local ci-dessous.',
        cls: 'pseudobs-onboarding-hint',
      });
      return;
    }

    container.empty();

    const scroll = container.createDiv('pseudobs-onboarding-catalogue-scroll');
    const table = scroll.createEl('table', { cls: 'pseudobs-onboarding-dict-table' });

    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    ['Dictionnaire', 'Langue', 'Rôles', 'Taille', ''].forEach((h) =>
      headerRow.createEl('th', { text: h })
    );

    const tbody = table.createEl('tbody');
    for (const entry of manifest.dictionaries) {
      this.renderCatalogueRow(tbody, entry);
    }
  }

  private renderCatalogueRow(tbody: HTMLElement, entry: DictionaryManifestEntry): void {
    const alreadyInstalled = this.isDictInstalled(entry.id);
    const tr = tbody.createEl('tr');
    if (alreadyInstalled) tr.addClass('pseudobs-onboarding-dict-row-installed');

    // Nom + badge
    const nameCell = tr.createEl('td', { cls: 'pseudobs-onboarding-dict-name-cell' });
    nameCell.createEl('span', { text: entry.label });
    if (entry.recommended) {
      nameCell.createEl('span', { text: 'Recommandé', cls: 'pseudobs-onboarding-badge' });
    }

    // Langue
    tr.createEl('td', { text: entry.language.toUpperCase() });

    // Rôles
    const roles: string[] = [];
    if (entry.roles.detection)   roles.push('détection');
    if (entry.roles.replacement) roles.push('remplacement');
    if (entry.roles.classes)     roles.push('classes');
    tr.createEl('td', { text: roles.join(' · '), cls: 'pseudobs-onboarding-dict-roles' });

    // Taille
    tr.createEl('td', { text: this.formatSize(entry.size), cls: 'pseudobs-onboarding-dict-size' });

    // Bouton icône uniquement
    const actionCell = tr.createEl('td', { cls: 'pseudobs-onboarding-dict-action' });
    const btn = actionCell.createEl('button', { cls: 'pseudobs-onboarding-icon-btn' });
    btn.setAttribute('aria-label', alreadyInstalled ? 'Réinstaller' : 'Installer');
    setIcon(btn, alreadyInstalled ? 'cloud-check' : 'cloud-download');
    if (alreadyInstalled) btn.addClass('pseudobs-onboarding-icon-btn-done');

    btn.addEventListener('click', () => { void (async () => {
      btn.setAttr('disabled', 'true');
      btn.removeClass('pseudobs-onboarding-icon-btn-done');
      setIcon(btn, 'refresh-cw');
      btn.addClass('pseudobs-onboarding-icon-btn-loading');

      const ok = await this.downloadDict(entry);

      btn.removeAttribute('disabled');
      btn.removeClass('pseudobs-onboarding-icon-btn-loading');
      if (ok) {
        setIcon(btn, 'cloud-check');
        btn.addClass('pseudobs-onboarding-icon-btn-done');
        tr.addClass('pseudobs-onboarding-dict-row-installed');
        void this.plugin.dictionaryLoader.load();
      } else {
        setIcon(btn, 'cloud-download');
      }
    })(); });
  }

  private isDictInstalled(id: string): boolean {
    const folder = this.plugin.settings.dictionariesFolder;
    const path = `${folder}/${id}.dict.json`;
    return this.app.vault.getAbstractFileByPath(path) instanceof TFile;
  }

  private async downloadDict(entry: DictionaryManifestEntry): Promise<boolean> {
    try {
      const res = await requestUrl({ url: entry.url, method: 'GET' });
      const text = res.text;
      const parsed = JSON.parse(text) as DictionaryFile;
      if (!Array.isArray(parsed.entries)) throw new Error('Format invalide');

      await this.plugin.ensureFolder(this.plugin.settings.dictionariesFolder);
      const dest = `${this.plugin.settings.dictionariesFolder}/${entry.id}.dict.json`;
      const existing = this.app.vault.getAbstractFileByPath(dest);
      if (existing instanceof TFile) {
        await this.app.vault.modify(existing, text);
      } else {
        await this.app.vault.create(dest, text);
      }
      this.importedDicts.push(`${entry.id}.dict.json`);
      return true;
    } catch (e) {
      new Notice(`Échec du téléchargement de ${entry.label} : ${(e as Error).message}`);
      return false;
    }
  }

  private formatSize(bytes: number): string {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} Mo`;
    if (bytes >= 1_000)     return `${(bytes / 1_000).toFixed(0)} Ko`;
    return `${bytes} o`;
  }

  private async processDictFiles(input: HTMLInputElement, statusEl: HTMLElement): Promise<void> {
    const files = Array.from(input.files ?? []);
    input.remove();
    if (files.length === 0) return;

    await this.plugin.ensureFolder(this.plugin.settings.dictionariesFolder);

    let ok = 0;
    let err = 0;
    for (const f of files) {
      try {
        const text = await f.text();
        const parsed = JSON.parse(text) as DictionaryFile;
        if (!parsed.entries || !Array.isArray(parsed.entries)) throw new Error('Format invalide');

        const dest = `${this.plugin.settings.dictionariesFolder}/${f.name}`;
        const existing = this.app.vault.getAbstractFileByPath(dest);
        if (existing instanceof TFile) {
          await this.app.vault.modify(existing, text);
        } else {
          await this.app.vault.create(dest, text);
        }
        this.importedDicts.push(f.name);
        ok++;
      } catch {
        err++;
        new Notice(`Erreur lors de l'import de ${f.name} — vérifiez le format .dict.json`);
      }
    }

    if (ok > 0) {
      statusEl.setText(`${ok} dictionnaire${ok > 1 ? 's' : ''} importé${ok > 1 ? 's' : ''}`);
      statusEl.addClass('pseudobs-onboarding-test-ok');
      void this.plugin.dictionaryLoader.load();
    }
    if (err > 0) {
      statusEl.setText(`${err} fichier${err > 1 ? 's' : ''} rejeté${err > 1 ? 's' : ''}`);
      statusEl.addClass('pseudobs-onboarding-test-err');
    }

    this.scheduleRender();
  }

  private async renderInstalledDictList(el: HTMLElement): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(this.plugin.settings.dictionariesFolder);
    const files: TFile[] = [];

    if (folder && 'children' in folder) {
      for (const child of (folder as { children: unknown[] }).children) {
        if (child instanceof TFile && child.name.endsWith('.json')) {
          files.push(child);
        }
      }
    }

    if (files.length === 0) return;

    el.createEl('p', {
      text: `Dictionnaires installés dans ce vault (${files.length}) :`,
      cls: 'pseudobs-onboarding-dict-count',
    });

    const list = el.createEl('ul', { cls: 'pseudobs-onboarding-dict-list' });
    for (const f of files) {
      const li = list.createEl('li');
      li.createSpan({ text: f.name });
      const removeBtn = li.createEl('button', { text: '✕', cls: 'pseudobs-onboarding-dict-remove' });
      removeBtn.title = 'Retirer ce dictionnaire du vault';
      removeBtn.addEventListener('click', () => { void (async () => {
        await this.app.fileManager.trashFile(f);
        void this.plugin.dictionaryLoader.load();
        this.scheduleRender();
      })(); });
    }
  }

  // ---- Étape 4 : Résumé ------------------------------------------

  private renderSummary(el: HTMLElement): void {
    el.createEl('h2', { text: 'Configuration terminée' });

    const NER_LABELS: Record<NerBackend, string> = {
      none:               'Désactivé — règles manuelles uniquement',
      spacy:              `spaCy local (${this.plugin.settings.spacyServerUrl})`,
      'transformers-js':  'transformers.js — modèle ONNX (téléchargement au premier scan)',
    };

    el.createEl('p', { text: 'Voici ce qui a été configuré :' });

    const table = el.createEl('table', { cls: 'pseudobs-onboarding-summary-table' });

    const rows: [string, string][] = [
      ['Détection NER', NER_LABELS[this.plugin.settings.nerBackend]],
    ];

    const folder = this.app.vault.getAbstractFileByPath(this.plugin.settings.dictionariesFolder);
    let dictCount = 0;
    if (folder && 'children' in folder) {
      for (const child of (folder as { children: unknown[] }).children) {
        if (child instanceof TFile && child.name.endsWith('.json')) dictCount++;
      }
    }
    rows.push(['Dictionnaires', `${dictCount} fichier${dictCount > 1 ? 's' : ''} dans le vault`]);

    for (const [label, value] of rows) {
      const tr = table.createEl('tr');
      tr.createEl('td', { text: label, cls: 'pseudobs-onboarding-summary-label' });
      tr.createEl('td', { text: value });
    }

    el.createEl('p', {
      text: 'Ces paramètres sont modifiables à tout moment via les paramètres du plugin : Reconfigurer.',
      cls: 'pseudobs-onboarding-hint',
    });
  }

  // ---- Navigation ------------------------------------------------

  private renderNav(el: HTMLElement): void {
    const nav = el.createDiv('pseudobs-onboarding-nav');
    const idx = STEPS.indexOf(this.currentStep);

    // Bouton Annuler — toujours présent sauf à l'étape Résumé
    if (this.currentStep !== 'summary') {
      nav.createEl('button', { text: 'Annuler', cls: 'pseudobs-onboarding-cancel-btn' })
        .addEventListener('click', () => this.close());
    }

    const rightBtns = nav.createDiv('pseudobs-onboarding-nav-right');

    // Bouton Retour
    if (idx > 0) {
      rightBtns.createEl('button', { text: 'Retour', cls: 'pseudobs-onboarding-back-btn' })
        .addEventListener('click', () => {
          this.currentStep = STEPS[idx - 1];
          this.scheduleRender();
        });
    }

    // Bouton principal
    if (this.currentStep === 'welcome') {
      rightBtns.createEl('button', { text: 'Commencer', cls: 'pseudobs-onboarding-next-btn mod-cta' })
        .addEventListener('click', () => {
          this.currentStep = STEPS[idx + 1];
          this.scheduleRender();
        });

    } else if (this.currentStep === 'summary') {
      rightBtns.createEl('button', { text: 'Commencer à travailler', cls: 'pseudobs-onboarding-next-btn mod-cta' })
        .addEventListener('click', () => { void (async () => {
          this.plugin.settings.onboardingCompleted = true;
          await this.plugin.saveSettings();
          this.close();
        })(); });

    } else {
      // Étapes intermédiaires : Passer + Suivant
      rightBtns.createEl('button', { text: 'Passer cette étape', cls: 'pseudobs-onboarding-skip-btn' })
        .addEventListener('click', () => {
          this.currentStep = STEPS[idx + 1];
          this.scheduleRender();
        });
      rightBtns.createEl('button', { text: 'Suivant', cls: 'pseudobs-onboarding-next-btn mod-cta' })
        .addEventListener('click', () => {
          this.currentStep = STEPS[idx + 1];
          this.scheduleRender();
        });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
