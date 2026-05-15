import { App, Modal, Notice, TFile, requestUrl, setIcon } from 'obsidian';
import type PseudObsPlugin from '../main';
import type { NerBackend } from '../settings';
import type { DictionaryFile, DictionaryManifest, DictionaryManifestEntry } from '../types';
import { t, setLocale, AVAILABLE_LANGUAGES } from '../i18n';

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

type Step = 'welcome' | 'language' | 'storage' | 'ner' | 'dictionaries' | 'summary';

const STEPS: Step[] = ['welcome', 'language', 'storage', 'ner', 'dictionaries', 'summary'];

function stepLabels(): Record<Step, string> {
  return {
    welcome:      t('onboarding.step.welcome'),
    language:     t('onboarding.step.language'),
    storage:      t('onboarding.step.storage'),
    ner:          t('onboarding.step.ner'),
    dictionaries: t('onboarding.step.dictionaries'),
    summary:      t('onboarding.step.summary'),
  };
}

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

    if (this.currentStep === 'welcome')           this.renderWelcome(body);
    else if (this.currentStep === 'language')     this.renderLanguage(body);
    else if (this.currentStep === 'storage')      this.renderStorage(body);
    else if (this.currentStep === 'ner')          this.renderNer(body);
    else if (this.currentStep === 'dictionaries') this.renderDictionaries(body);
    else                                          this.renderSummary(body);

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
      dot.createSpan({ text: stepLabels()[step] });
    }
  }

  // ---- Étape 1 : Bienvenue ----------------------------------------

  private renderWelcome(el: HTMLElement): void {
    el.createEl('h2', { text: t('onboarding.welcome.title') });
    el.createEl('p', { text: t('onboarding.welcome.desc') });
    el.createEl('p', { text: t('onboarding.welcome.steps') });
    const list = el.createEl('ul');
    list.createEl('li', { text: t('onboarding.welcome.step1') });
    list.createEl('li', { text: t('onboarding.welcome.step2') });
    list.createEl('li', { text: t('onboarding.welcome.step3') });
    el.createEl('p', { text: t('onboarding.welcome.hint'), cls: 'pseudobs-onboarding-hint' });
  }

  // ---- Étape 2 : Langue -------------------------------------------

  private renderLanguage(el: HTMLElement): void {
    // Titre toujours bilingue — l'utilisateur n'a pas encore choisi de langue
    el.createEl('h2', { text: 'Interface language / Langue de l\'interface' });
    el.createEl('p', {
      text: 'The interface language does not affect transcript analysis. / La langue de l\'interface n\'affecte pas l\'analyse des transcriptions.',
      cls: 'pseudobs-onboarding-hint',
    });

    const currentLang = this.plugin.settings.language;

    for (const [code, name] of Object.entries(AVAILABLE_LANGUAGES)) {
      const card = el.createDiv('pseudobs-onboarding-ner-card');
      if (currentLang === code) card.addClass('pseudobs-onboarding-ner-card-selected');

      card.createEl('strong', { text: name });

      const btn = card.createEl('button', {
        text: currentLang === code ? 'Selected' : 'Select',
        cls: 'pseudobs-onboarding-select-btn',
      });
      if (currentLang === code) btn.addClass('pseudobs-onboarding-select-btn-active');

      btn.addEventListener('click', () => { void (async () => {
        this.plugin.settings.language = code;
        await this.plugin.saveSettings();
        setLocale(code);
        this.scheduleRender();
      })(); });
    }
  }

  // ---- Étape 3 : Stockage -----------------------------------------

  private renderStorage(el: HTMLElement): void {
    el.createEl('h2', { text: t('onboarding.storage.title') });

    // Recommandation 1 vault / corpus
    const rec = el.createDiv('pseudobs-onboarding-ner-card pseudobs-onboarding-ner-card-selected');
    const recHeader = rec.createDiv('pseudobs-onboarding-ner-card-header');
    recHeader.createEl('strong', { text: t('onboarding.storage.vaultPerCorpus') });
    rec.createEl('p', { text: t('onboarding.storage.vaultPerCorpusDesc') });

    el.createEl('hr');
    el.createEl('p', { text: t('onboarding.storage.hint'), cls: 'pseudobs-onboarding-hint' });

    const fields: [string, keyof typeof this.plugin.settings][] = [
      [t('onboarding.storage.transcriptionsFolder'), 'transcriptionsFolder'],
      [t('onboarding.storage.mappingFolder'),        'mappingFolder'],
      [t('onboarding.storage.dictionariesFolder'),   'dictionariesFolder'],
      [t('onboarding.storage.exportsFolder'),        'exportsFolder'],
    ];

    for (const [label, key] of fields) {
      const row = el.createDiv('pseudobs-onboarding-url-row');
      row.createEl('small', { text: label });
      const input = row.createEl('input');
      input.type = 'text';
      input.value = String(this.plugin.settings[key]);
      input.addEventListener('change', () => { void (async () => {
        (this.plugin.settings as unknown as Record<string, unknown>)[key] = input.value.trim() || String(this.plugin.settings[key]);
        await this.plugin.saveSettings();
      })(); });
    }
  }

  // ---- Étape 4 : NER ----------------------------------------------

  private renderNer(el: HTMLElement): void {
    el.createEl('h2', { text: t('onboarding.step.ner') });
    el.createEl('p', { text: t('onboarding.ner.desc') });

    const cardTfjs = el.createDiv('pseudobs-onboarding-ner-card');
    if (this.nerBackend === 'transformers-js') cardTfjs.addClass('pseudobs-onboarding-ner-card-selected');

    const tfjsHeader = cardTfjs.createDiv('pseudobs-onboarding-ner-card-header');
    tfjsHeader.createEl('strong', { text: t('onboarding.ner.tfjsTitle') });
    tfjsHeader.createEl('span', { text: t('onboarding.ner.tfjsBadge'), cls: 'pseudobs-onboarding-badge' });

    cardTfjs.createEl('p', { text: t('onboarding.ner.tfjsDesc') });

    const wasmRow = cardTfjs.createDiv('pseudobs-onboarding-url-row');
    const wasmStatus = wasmRow.createSpan({ cls: 'pseudobs-onboarding-test-status' });

    void this.checkWasmFiles().then((present) => {
      if (present) {
        wasmStatus.setText(t('onboarding.ner.wasmReady'));
        wasmStatus.classList.add('pseudobs-onboarding-test-ok');
      }
    });

    const selectTfjs = cardTfjs.createEl('button', {
      text: this.nerBackend === 'transformers-js' ? t('onboarding.ner.selectedBtn') : t('onboarding.ner.installBtn'),
      cls: 'pseudobs-onboarding-select-btn',
    });
    if (this.nerBackend === 'transformers-js') selectTfjs.addClass('pseudobs-onboarding-select-btn-active');

    selectTfjs.addEventListener('click', () => { void (async () => {
      this.nerBackend = 'transformers-js';
      await this.saveNerSettings();
      if (!await this.checkWasmFiles()) {
        const ok = await this.downloadWasmFiles(wasmStatus, selectTfjs);
        if (!ok) return;
      }
      this.scheduleRender();
    })(); });

    const noneRow = el.createDiv('pseudobs-onboarding-none-row');
    const noneBtn = noneRow.createEl('button', {
      text: this.nerBackend === 'none' ? t('onboarding.ner.noneActive') : t('onboarding.ner.noneSkip'),
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

  // Chemin vault-relatif du dossier plugin — évite toute dépendance à fs/path
  private getPluginRelDir(): string {
    return `${this.app.vault.configDir}/plugins/pseudonymizer-tool`;
  }

  private async checkWasmFiles(): Promise<boolean> {
    const dir = this.getPluginRelDir();
    for (const f of WASM_FILES) {
      if (!await this.app.vault.adapter.exists(`${dir}/${f}`)) return false;
    }
    return true;
  }

  private async downloadWasmFiles(
    statusEl: HTMLElement,
    btn: HTMLElement
  ): Promise<boolean> {
    const dir = this.getPluginRelDir();
    btn.setAttr('disabled', 'true');

    for (let i = 0; i < WASM_FILES.length; i++) {
      const f = WASM_FILES[i];
      statusEl.className = 'pseudobs-onboarding-test-status';
      statusEl.setText(`${i + 1}/${WASM_FILES.length} : ${f}…`);

      try {
        const response = await requestUrl({ url: `${WASM_CDN_BASE}/${f}`, method: 'GET' });
        await this.app.vault.adapter.writeBinary(`${dir}/${f}`, response.arrayBuffer);
      } catch {
        statusEl.setText(`${f} — check your connection`);
        statusEl.classList.add('pseudobs-onboarding-test-err');
        btn.removeAttribute('disabled');
        return false;
      }
    }

    statusEl.setText(t('onboarding.ner.wasmReady'));
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
    el.createEl('h2', { text: t('onboarding.dict.title') });
    el.createEl('p', { text: t('onboarding.dict.desc') });

    const catalogueEl = el.createDiv('pseudobs-onboarding-catalogue');
    catalogueEl.createEl('p', { text: t('onboarding.dict.catalogueLoading'), cls: 'pseudobs-onboarding-hint' });
    void this.renderCatalogue(catalogueEl);

    el.createEl('hr');

    const manualRow = el.createDiv('pseudobs-onboarding-import-row');
    manualRow.createEl('small', { text: t('onboarding.dict.manualHint'), cls: 'pseudobs-onboarding-hint' });
    const importBtn = manualRow.createEl('button', {
      text: t('onboarding.dict.importBtn'),
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
      container.createEl('p', { text: t('onboarding.dict.catalogueError'), cls: 'pseudobs-onboarding-hint' });
      return;
    }

    container.empty();

    const scroll = container.createDiv('pseudobs-onboarding-catalogue-scroll');
    const table = scroll.createEl('table', { cls: 'pseudobs-onboarding-dict-table' });

    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    [t('onboarding.dict.col.dict'), t('onboarding.dict.col.lang'), t('onboarding.dict.col.roles'), t('onboarding.dict.col.size'), ''].forEach((h) =>
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
      nameCell.createEl('span', { text: t('onboarding.dict.recommended'), cls: 'pseudobs-onboarding-badge' });
    }

    tr.createEl('td', { text: entry.language.toUpperCase() });

    const roles: string[] = [];
    if (entry.roles.detection)   roles.push(t('onboarding.dict.role.detection'));
    if (entry.roles.replacement) roles.push(t('onboarding.dict.role.replacement'));
    if (entry.roles.classes)     roles.push(t('onboarding.dict.role.classes'));
    tr.createEl('td', { text: roles.join(' · '), cls: 'pseudobs-onboarding-dict-roles' });

    tr.createEl('td', { text: this.formatSize(entry.size), cls: 'pseudobs-onboarding-dict-size' });

    const actionCell = tr.createEl('td', { cls: 'pseudobs-onboarding-dict-action' });
    const btn = actionCell.createEl('button', { cls: 'pseudobs-onboarding-icon-btn' });
    btn.setAttribute('aria-label', alreadyInstalled ? t('onboarding.dict.reinstall') : t('onboarding.dict.install'));
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
        new Notice(t('onboarding.dict.importError', f.name));
      }
    }

    if (ok > 0) {
      statusEl.setText(ok > 1 ? t('onboarding.dict.importOkMany', String(ok)) : t('onboarding.dict.importOk', String(ok)));
      statusEl.addClass('pseudobs-onboarding-test-ok');
      void this.plugin.dictionaryLoader.load();
    }
    if (err > 0) {
      statusEl.setText(err > 1 ? t('onboarding.dict.importErrMany', String(err)) : t('onboarding.dict.importErr', String(err)));
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
      text: t('onboarding.dict.listTitle', String(files.length)),
      cls: 'pseudobs-onboarding-dict-count',
    });

    const list = el.createEl('ul', { cls: 'pseudobs-onboarding-dict-list' });
    for (const f of files) {
      const li = list.createEl('li');
      li.createSpan({ text: f.name });
      const removeBtn = li.createEl('button', { text: '✕', cls: 'pseudobs-onboarding-dict-remove' });
      removeBtn.title = t('onboarding.dict.remove');
      removeBtn.addEventListener('click', () => { void (async () => {
        await this.app.fileManager.trashFile(f);
        void this.plugin.dictionaryLoader.load();
        this.scheduleRender();
      })(); });
    }
  }

  // ---- Étape 4 : Résumé ------------------------------------------

  private renderSummary(el: HTMLElement): void {
    el.createEl('h2', { text: t('onboarding.summary.title') });

    const NER_LABELS: Record<NerBackend, string> = {
      none:              t('onboarding.summary.ner.none'),
      spacy:             `spaCy local (${this.plugin.settings.spacyServerUrl})`,
      'transformers-js': t('onboarding.summary.ner.tfjs'),
    };

    el.createEl('p', { text: t('onboarding.summary.intro') });

    const table = el.createEl('table', { cls: 'pseudobs-onboarding-summary-table' });

    const rows: [string, string][] = [
      [t('onboarding.summary.ner'), NER_LABELS[this.plugin.settings.nerBackend]],
    ];

    const folder = this.app.vault.getAbstractFileByPath(this.plugin.settings.dictionariesFolder);
    let dictCount = 0;
    if (folder && 'children' in folder) {
      for (const child of (folder as { children: unknown[] }).children) {
        if (child instanceof TFile && child.name.endsWith('.json')) dictCount++;
      }
    }
    rows.push([t('onboarding.summary.dicts'), t('onboarding.summary.dicts.count', String(dictCount))]);

    for (const [label, value] of rows) {
      const tr = table.createEl('tr');
      tr.createEl('td', { text: label, cls: 'pseudobs-onboarding-summary-label' });
      tr.createEl('td', { text: value });
    }

    el.createEl('p', { text: t('onboarding.summary.hint'), cls: 'pseudobs-onboarding-hint' });
  }

  // ---- Navigation ------------------------------------------------

  private renderNav(el: HTMLElement): void {
    const nav = el.createDiv('pseudobs-onboarding-nav');
    const idx = STEPS.indexOf(this.currentStep);

    // Bouton Annuler — toujours présent sauf à l'étape Résumé
    if (this.currentStep !== 'summary') {
      nav.createEl('button', { text: t('onboarding.nav.cancel'), cls: 'pseudobs-onboarding-cancel-btn' })
        .addEventListener('click', () => this.close());
    }

    const rightBtns = nav.createDiv('pseudobs-onboarding-nav-right');

    if (idx > 0) {
      rightBtns.createEl('button', { text: t('onboarding.nav.back'), cls: 'pseudobs-onboarding-back-btn' })
        .addEventListener('click', () => {
          this.currentStep = STEPS[idx - 1];
          this.scheduleRender();
        });
    }

    if (this.currentStep === 'welcome') {
      rightBtns.createEl('button', { text: t('onboarding.nav.start'), cls: 'pseudobs-onboarding-next-btn mod-cta' })
        .addEventListener('click', () => {
          this.currentStep = STEPS[idx + 1];
          this.scheduleRender();
        });

    } else if (this.currentStep === 'summary') {
      rightBtns.createEl('button', { text: t('onboarding.nav.finish'), cls: 'pseudobs-onboarding-next-btn mod-cta' })
        .addEventListener('click', () => { void (async () => {
          this.plugin.settings.onboardingCompleted = true;
          await this.plugin.saveSettings();
          this.close();
        })(); });

    } else {
      rightBtns.createEl('button', { text: t('onboarding.nav.skip'), cls: 'pseudobs-onboarding-skip-btn' })
        .addEventListener('click', () => {
          this.currentStep = STEPS[idx + 1];
          this.scheduleRender();
        });
      rightBtns.createEl('button', { text: t('onboarding.nav.next'), cls: 'pseudobs-onboarding-next-btn mod-cta' })
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
