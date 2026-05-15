import { App, Modal, Setting, TFile, Notice } from 'obsidian';
import { t } from '../i18n';
import type PseudObsPlugin from '../main';
import { MappingStore } from '../mappings/MappingStore';
import type { EntityCategory, MappingFile, ScopeType } from '../types';

export class RuleModal extends Modal {
  private plugin: PseudObsPlugin;
  private source: string;
  private replacement: string;
  private category: EntityCategory;
  private scopeType: ScopeType = 'file';
  private priority = 0;

  // Suggestions Coulmont (prénoms équivalents)
  private coulomontSuggestions: string[];

  // Suggestions dictionnaire
  private useClass = false;
  private dictEntryClass: string | null = null;
  private dictId: string | null = null;

  constructor(
    app: App,
    plugin: PseudObsPlugin,
    prefillSource = '',
    prefillReplacement = '',
    coulomontSuggestions: string[] = [],
  ) {
    super(app);
    this.plugin = plugin;
    this.source = prefillSource;
    this.replacement = prefillReplacement;
    this.coulomontSuggestions = coulomontSuggestions;
    this.category = coulomontSuggestions.length > 0 ? 'first_name' : 'custom';

    // Suggestions dictionnaire uniquement si pas de suggestions Coulmont
    // (Coulmont = prénoms uniquement, pas de lieux)
    if (prefillSource && coulomontSuggestions.length === 0) {
      this.resolveDictSuggestion(prefillSource);
    }
  }

  private resolveDictSuggestion(value: string): void {
    const loader = this.plugin.dictionaryLoader;
    if (!loader) return;
    const hits = loader.getDetectionHits(value);
    for (const { entry, dict } of hits) {
      if (!dict.roles?.replacement) continue;
      const cls = loader.resolveClass(entry, dict);
      if (cls) {
        this.dictEntryClass = cls;
        this.dictId = dict.dictionaryId;
        // Pré-régler la catégorie si l'entrée est un lieu
        if (this.category === 'custom' && dict.type === 'place') {
          this.category = 'place';
        }
        return;
      }
      // word-to-word avec remplacement fixe
      if (entry.replacement) {
        this.replacement = entry.replacement;
        this.dictId = dict.dictionaryId;
        if (this.category === 'custom' && dict.type === 'place') {
          this.category = 'place';
        }
        return;
      }
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: t('ruleModal.title') });

    new Setting(contentEl)
      .setName(t('ruleModal.source'))
      .setDesc(t('ruleModal.sourceDesc'))
      .addText((tx) =>
        tx.setValue(this.source).onChange((v) => { this.source = v; })
      );

    // --- Suggestions Coulmont ---
    let replacementInput: HTMLInputElement | undefined;
    if (this.coulomontSuggestions.length > 0) {
      const box = contentEl.createDiv();
      box.addClass('pseudobs-suggestions-box');
      box.createEl('small', { text: t('ruleModal.coulomontLabel') })
        .addClass('pseudobs-suggestions-label');
      const tags = box.createDiv();
      tags.addClass('pseudobs-suggestions-tags');
      const btnEls: HTMLElement[] = [];
      for (const name of this.coulomontSuggestions) {
        const btn = tags.createEl('button', { text: name });
        btn.addClass('pseudobs-suggestion-btn');
        btn.addEventListener('click', () => {
          this.replacement = name;
          this.useClass = false;
          if (replacementInput) replacementInput.value = name;
          btnEls.forEach((b) => b.removeClass('pseudobs-suggestion-btn-selected'));
          btn.addClass('pseudobs-suggestion-btn-selected');
        });
        btnEls.push(btn);
      }
    }

    // --- Suggestion dictionnaire (classes) ---
    if (this.dictEntryClass && this.dictId) {
      const dict = this.plugin.dictionaryLoader?.getById(this.dictId);
      const pattern = dict?.config?.replacementPattern ?? '{class}_{index}';
      const preview = pattern.replace('{class}', this.dictEntryClass).replace('{index}', 'N');
      const scope = dict?.config?.incrementScope ?? 'file';

      const box = contentEl.createDiv();
      box.addClass('pseudobs-suggestions-box');
      const label = box.createEl('small');
      label.addClass('pseudobs-suggestions-label');
      label.setText(t('ruleModal.dictLabel', this.source, this.dictEntryClass));

      const row = box.createDiv();
      row.addClass('pseudobs-suggestions-tags');

      const classBtn = row.createEl('button', { text: t('ruleModal.dictUseClass', preview, scope) });
      classBtn.addClass('pseudobs-suggestion-btn');
      classBtn.addEventListener('click', () => {
        this.useClass = true;
        if (replacementInput) replacementInput.value = preview;
        classBtn.addClass('pseudobs-suggestion-btn-selected');
      });

      if (this.coulomontSuggestions.length === 0) {
        this.useClass = true;
        if (replacementInput) replacementInput.value = preview;
        classBtn.addClass('pseudobs-suggestion-btn-selected');
      }
    }

    new Setting(contentEl)
      .setName(t('ruleModal.replacement'))
      .setDesc(this.dictEntryClass ? t('ruleModal.replacementDescClass') : t('ruleModal.replacementDesc'))
      .addText((tx) => {
        const preview = this.dictEntryClass
          ? (this.plugin.dictionaryLoader?.getById(this.dictId ?? '')?.config?.replacementPattern ?? '{class}_{index}')
              .replace('{class}', this.dictEntryClass)
              .replace('{index}', 'N')
          : this.replacement;
        tx.setValue(preview).onChange((v) => {
          this.replacement = v;
          this.useClass = false;
        });
        replacementInput = tx.inputEl;
      });

    new Setting(contentEl)
      .setName(t('ruleModal.category'))
      .addDropdown((d) => {
        const cats: EntityCategory[] = ['first_name','last_name','full_name','place','institution','date','age','profession','custom'];
        for (const cat of cats) {
          d.addOption(cat, t(`category.${cat}`));
        }
        d.setValue(this.category);
        d.onChange((v) => {
          this.category = v as EntityCategory;
          updateBroadScopeWarning();
        });
        if (this.coulomontSuggestions.length > 0) {
          const settingItem = d.selectEl.closest('.setting-item');
          if (settingItem instanceof HTMLElement) settingItem.hide();
        }
      });

    new Setting(contentEl)
      .setName(t('ruleModal.scope'))
      .addDropdown((d) => {
        d.addOption('file',   t('ruleModal.scopeFile'));
        d.addOption('folder', t('ruleModal.scopeFolder'));
        d.addOption('vault',  t('ruleModal.scopeVault'));
        d.setValue('file');
        d.onChange((v) => {
          this.scopeType = v as ScopeType;
          updateBroadScopeWarning();
        });
      });

    // Callout dynamique — visible uniquement pour les catégories noms/prénoms
    const calloutEl = contentEl.createDiv();
    calloutEl.hide();
    const isNameCategory = () => ['first_name', 'last_name', 'full_name'].includes(this.category);
    const isBroadScope   = () => this.scopeType !== 'file';
    const updateBroadScopeWarning = () => {
      if (!isNameCategory()) { calloutEl.hide(); return; }
      calloutEl.empty();
      calloutEl.show();
      if (isBroadScope()) {
        calloutEl.setAttribute('data-callout', 'warning');
        calloutEl.className = 'callout pseudobs-rule-callout';
        calloutEl.createDiv('callout-title').createSpan({ text: t('ruleModal.scopeWarnTitle') });
        calloutEl.createDiv('callout-content').createEl('p', { text: t('panel.mappings.warnBroadName') });
      } else {
        calloutEl.setAttribute('data-callout', 'success');
        calloutEl.className = 'callout pseudobs-rule-callout';
        calloutEl.createDiv('callout-title').createSpan({ text: t('ruleModal.scopeOkTitle') });
        calloutEl.createDiv('callout-content').createEl('p', { text: t('ruleModal.scopeOk') });
      }
    };

    new Setting(contentEl)
      .setName(t('ruleModal.priority'))
      .setDesc(t('ruleModal.priorityDesc'))
      .addText((tx) =>
        tx.setValue('0').onChange((v) => { this.priority = parseInt(v, 10) || 0; })
      );

    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText(t('ruleModal.submit')).setCta().onClick(() => void this.createRule())
    );
  }

  private async createRule(): Promise<void> {
    if (!this.source.trim()) {
      new Notice(t('ruleModal.errorMissing'));
      return;
    }

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice(t('ruleModal.errorNoFile'));
      return;
    }

    // Résoudre le remplacement si mode classe activé
    if (this.useClass && this.dictEntryClass && this.dictId) {
      const dict = this.plugin.dictionaryLoader?.getById(this.dictId);
      if (dict) {
        const incrementScope = dict.config?.incrementScope ?? 'file';
        const existingReplacements = await this.collectExistingReplacements(activeFile, incrementScope);
        this.replacement = this.plugin.dictionaryLoader.nextReplacement(
          dict, this.dictEntryClass, existingReplacements
        );
      }
    }

    if (!this.replacement.trim()) {
      new Notice(t('ruleModal.errorMissing'));
      return;
    }

    const mappingPath = `${this.plugin.settings.mappingFolder}/${activeFile.basename}.mapping.json`;
    let store: MappingStore;

    const mappingFile = this.app.vault.getAbstractFileByPath(mappingPath);
    if (mappingFile instanceof TFile) {
      const data = JSON.parse(await this.app.vault.read(mappingFile)) as MappingFile;
      store = MappingStore.fromJSON(data);
    } else {
      await this.plugin.ensureFolder(this.plugin.settings.mappingFolder);
      store = new MappingStore({ type: 'file', path: activeFile.path });
    }

    const scopePath =
      this.scopeType === 'file'
        ? activeFile.path
        : this.scopeType === 'folder'
        ? (activeFile.parent?.path ?? '')
        : undefined;

    store.add({
      source: this.source.trim(),
      replacement: this.replacement.trim(),
      category: this.category,
      scope: { type: this.scopeType, path: scopePath },
      status: 'validated',
      priority: this.priority,
      createdBy: 'dictionary',
      sourceDictionary: this.dictId ?? undefined,
    });

    const json = JSON.stringify(store.toJSON(), null, 2);
    if (mappingFile instanceof TFile) {
      await this.app.vault.modify(mappingFile, json);
    } else {
      await this.app.vault.create(mappingPath, json);
    }

    new Notice(t('notice.ruleCreated', this.source.trim(), this.replacement.trim()));
    void this.plugin.refreshHighlightData();
    this.close();
  }

  /**
   * Collecte les remplacements déjà utilisés dans la portée d'incrémentation du dictionnaire.
   * Utilisé pour calculer le prochain index de classe ({class}_{N}).
   */
  private async collectExistingReplacements(
    activeFile: TFile,
    incrementScope: ScopeType,
  ): Promise<string[]> {
    const mappingFolder = this.plugin.settings.mappingFolder;
    let mappingPaths: string[] = [];

    if (incrementScope === 'file') {
      mappingPaths = [`${mappingFolder}/${activeFile.basename}.mapping.json`];
    } else if (incrementScope === 'folder') {
      const folderName = activeFile.parent?.name ?? 'folder';
      mappingPaths = [`${mappingFolder}/${folderName}.mapping.json`];
    } else {
      mappingPaths = [`${mappingFolder}/vault.mapping.json`];
    }

    const replacements: string[] = [];
    for (const p of mappingPaths) {
      const f = this.app.vault.getAbstractFileByPath(p);
      if (!(f instanceof TFile)) continue;
      try {
        const data = JSON.parse(await this.app.vault.read(f)) as MappingFile;
        for (const rule of data.mappings) {
          if (rule.sourceDictionary === this.dictId && rule.replacement) {
            replacements.push(rule.replacement);
          }
        }
      } catch { /* mapping illisible — ignoré */ }
    }
    return replacements;
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
