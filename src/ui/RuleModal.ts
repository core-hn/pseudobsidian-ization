import { App, Modal, Setting, TFile, Notice } from 'obsidian';
import type PseudObsPlugin from '../main';
import { MappingStore } from '../mappings/MappingStore';
import type { EntityCategory, MappingFile, MappingRule, ScopeType } from '../types';

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
    contentEl.createEl('h2', { text: 'Créer une règle de remplacement' });

    new Setting(contentEl)
      .setName('Source')
      .setDesc('Terme original à remplacer')
      .addText((t) =>
        t.setValue(this.source).onChange((v) => {
          this.source = v;
        })
      );

    // --- Suggestions Coulmont ---
    let replacementInput: HTMLInputElement | undefined;
    if (this.coulomontSuggestions.length > 0) {
      const box = contentEl.createDiv();
      box.addClass('pseudobs-suggestions-box');
      box.createEl('small', { text: 'Suggestions de prénoms équivalents — choisissez :' })
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
      label.setText(`Dictionnaire : "${this.source}" → classe ${this.dictEntryClass}`);

      const row = box.createDiv();
      row.addClass('pseudobs-suggestions-tags');

      const classBtn = row.createEl('button', { text: `Utiliser "${preview}" (portée : ${scope})` });
      classBtn.addClass('pseudobs-suggestion-btn');
      classBtn.addEventListener('click', () => {
        this.useClass = true;
        if (replacementInput) replacementInput.value = preview;
        classBtn.addClass('pseudobs-suggestion-btn-selected');
      });

      // Pré-sélectionner automatiquement si aucune suggestion Coulmont
      if (this.coulomontSuggestions.length === 0) {
        this.useClass = true;
        if (replacementInput) replacementInput.value = preview;
        classBtn.addClass('pseudobs-suggestion-btn-selected');
      }
    }

    new Setting(contentEl)
      .setName('Remplacement')
      .setDesc(
        this.dictEntryClass
          ? 'L\'index exact sera calculé à la création selon les règles existantes dans la portée.'
          : 'Pseudonyme ou catégorie analytique'
      )
      .addText((t) => {
        const preview = this.dictEntryClass
          ? (this.plugin.dictionaryLoader?.getById(this.dictId ?? '')?.config?.replacementPattern ?? '{class}_{index}')
              .replace('{class}', this.dictEntryClass)
              .replace('{index}', 'N')
          : this.replacement;
        t.setValue(preview).onChange((v) => {
          this.replacement = v;
          this.useClass = false; // saisie manuelle désactive le mode classe
        });
        replacementInput = t.inputEl;
      });

    // Catégorie — masquée si Coulmont impose 'first_name'
    new Setting(contentEl)
      .setName('Catégorie')
      .addDropdown((d) => {
        const options: Record<EntityCategory, string> = {
          first_name: 'Prénom',
          last_name: 'Nom de famille',
          full_name: 'Nom complet',
          place: 'Lieu',
          institution: 'Institution',
          date: 'Date',
          age: 'Âge',
          profession: 'Profession',
          custom: 'Autre',
        };
        for (const [value, label] of Object.entries(options)) {
          d.addOption(value, label);
        }
        d.setValue(this.category);
        d.onChange((v) => { this.category = v as EntityCategory; });
        if (this.coulomontSuggestions.length > 0) {
          const settingItem = d.selectEl.closest('.setting-item');
          if (settingItem instanceof HTMLElement) settingItem.hide();
        }
      });

    new Setting(contentEl)
      .setName('Portée')
      .addDropdown((d) => {
        d.addOption('file', 'Ce fichier uniquement');
        d.addOption('folder', 'Ce dossier');
        d.addOption('vault', 'Tout le vault');
        d.setValue('file');
        d.onChange((v) => { this.scopeType = v as ScopeType; });
      });

    new Setting(contentEl)
      .setName('Priorité')
      .setDesc('Entier libre, comme un z-index CSS — défaut 0, plus grand = appliqué en premier')
      .addText((t) =>
        t.setValue('0').onChange((v) => { this.priority = parseInt(v, 10) || 0; })
      );

    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText('Créer la règle').setCta().onClick(() => void this.createRule())
    );
  }

  private async createRule(): Promise<void> {
    if (!this.source.trim()) {
      new Notice('La source est obligatoire.');
      return;
    }

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('Aucun fichier actif.');
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
      new Notice('Le remplacement est obligatoire.');
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

    new Notice(`✓ Règle créée : "${this.source.trim()}" → "${this.replacement.trim()}"`);
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
