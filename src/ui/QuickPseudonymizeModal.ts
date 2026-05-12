import { App, Editor, EditorPosition, Modal, Notice, Setting, TFile } from 'obsidian';
import type PseudObsPlugin from '../main';
import { MappingStore } from '../mappings/MappingStore';
import { PseudonymizationEngine } from '../pseudonymizer/PseudonymizationEngine';
import type { EntityCategory, MappingFile } from '../types';

type ApplyScope = 'occurrence' | 'file';

export class QuickPseudonymizeModal extends Modal {
  private plugin: PseudObsPlugin;
  private editor: Editor;
  private source: string;
  private from: EditorPosition;
  private to: EditorPosition;

  private replacement = '';
  private category: EntityCategory = 'custom';
  private applyScope: ApplyScope = 'file';
  private suggestions: string[];

  constructor(
    app: App,
    plugin: PseudObsPlugin,
    editor: Editor,
    prefillReplacement = '',
    suggestions: string[] = []
  ) {
    super(app);
    this.plugin = plugin;
    this.editor = editor;
    this.source = editor.getSelection();
    this.replacement = prefillReplacement;
    this.suggestions = suggestions;
    // Coulmont ne traite que des prénoms
    if (suggestions.length > 0) this.category = 'first_name';
    this.from = editor.getCursor('from');
    this.to = editor.getCursor('to');
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Pseudonymiser' });

    // Source en lecture seule
    new Setting(contentEl)
      .setName('Expression sélectionnée')
      .setDesc('Terme à remplacer — non modifiable')
      .addText((t) => {
        t.setValue(this.source).setDisabled(true);
        t.inputEl.addClass('pseudobs-disabled-input');
      });

    // Suggestions Coulmont : boutons cliquables qui remplissent le champ
    let replacementInput: HTMLInputElement;
    if (this.suggestions.length > 0) {
      const suggBox = contentEl.createDiv();
      suggBox.addClass('pseudobs-suggestions-box');
      suggBox.createEl('small', { text: 'Suggestions de prénoms équivalents (m/f non différenciés) :' })
        .addClass('pseudobs-suggestions-label');
      const tags = suggBox.createDiv();
      tags.addClass('pseudobs-suggestions-tags');
      const btnEls: HTMLElement[] = [];
      for (const name of this.suggestions) {
        const btn = tags.createEl('button', { text: name });
        btn.addClass('pseudobs-suggestion-btn');
        btn.addEventListener('click', () => {
          this.replacement = name;
          if (replacementInput) {
            replacementInput.value = name;
            replacementInput.dispatchEvent(new Event('input'));
          }
          btnEls.forEach((b) => b.removeClass('pseudobs-suggestion-btn-selected'));
          btn.addClass('pseudobs-suggestion-btn-selected');
        });
        btnEls.push(btn);
      }
    }

    // Champ de remplacement — pré-rempli si un prénom a déjà été sélectionné
    new Setting(contentEl)
      .setName('Remplacer par')
      .addText((t) => {
        t.setPlaceholder('Pseudonyme ou catégorie analytique');
        t.setValue(this.replacement);
        t.onChange((v) => (this.replacement = v));
        replacementInput = t.inputEl;
      });

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
        d.setValue('custom');
        d.onChange((v) => (this.category = v as EntityCategory));
      });

    new Setting(contentEl)
      .setName('Portée du remplacement')
      .addDropdown((d) => {
        d.addOption('file', 'Toutes les occurrences dans ce fichier');
        d.addOption('occurrence', 'Cette occurrence uniquement');
        d.setValue('file');
        d.onChange((v) => (this.applyScope = v as ApplyScope));
      });

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText('Pseudonymiser')
        .setCta()
        .onClick(() => this.apply())
    );

    // Focus sur le champ de remplacement à l'ouverture
    setTimeout(() => replacementInput?.focus(), 50);
  }

  private async apply(): Promise<void> {
    const replacement = this.replacement.trim();
    if (!replacement) {
      new Notice('Le remplacement est obligatoire.');
      return;
    }

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('Aucun fichier actif.');
      return;
    }

    // 1. Sauvegarder la règle dans le mapping JSON
    await this.saveRule(activeFile, replacement);

    // 2. Appliquer dans le fichier
    if (this.applyScope === 'occurrence') {
      // Remplacer uniquement la sélection courante dans l'éditeur
      this.editor.replaceRange(replacement, this.from, this.to);
      new Notice(`✓ "${this.source}" → "${replacement}" (cette occurrence)`);
    } else {
      // Remplacer toutes les occurrences dans le fichier courant
      const count = await this.plugin.applyRuleToFile(activeFile, this.source, replacement);
      new Notice(`✓ "${this.source}" → "${replacement}" (${count} occurrence${count > 1 ? 's' : ''})`);
    }

    // Rafraîchir le surlignage immédiatement
    void this.plugin.refreshHighlightData();
    this.close();
  }

  private async saveRule(activeFile: TFile, replacement: string): Promise<void> {
    const mappingPath = `${this.plugin.settings.mappingFolder}/${activeFile.basename}.mapping.json`;
    let store: MappingStore;

    const mappingTFile = this.app.vault.getAbstractFileByPath(mappingPath);
    if (mappingTFile instanceof TFile) {
      const data: MappingFile = JSON.parse(await this.app.vault.read(mappingTFile));
      store = MappingStore.fromJSON(data);
    } else {
      await this.plugin.ensureFolder(this.plugin.settings.mappingFolder);
      store = new MappingStore({ type: 'file', path: activeFile.path });
    }

    store.add({
      source: this.source,
      replacement,
      category: this.category,
      scope: { type: 'file', path: activeFile.path },
      status: 'validated',
      priority: 0,
      createdBy: 'user',
    });

    const json = JSON.stringify(store.toJSON(), null, 2);
    if (mappingTFile instanceof TFile) {
      await this.app.vault.modify(mappingTFile, json);
    } else {
      await this.app.vault.create(mappingPath, json);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
