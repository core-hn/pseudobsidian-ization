import { App, Editor, EditorPosition, Modal, Notice, Setting, TFile } from 'obsidian';
import type PseudObsPlugin from '../main';
import { MappingStore } from '../mappings/MappingStore';
import type { EntityCategory, MappingFile } from '../types';
import { t } from '../i18n';

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
    if (suggestions.length > 0) this.category = 'first_name';
    this.from = editor.getCursor('from');
    this.to = editor.getCursor('to');
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: t('quickModal.title') });

    new Setting(contentEl)
      .setName(t('quickModal.source'))
      .setDesc(t('quickModal.sourceDesc'))
      .addText((tx) => {
        tx.setValue(this.source).setDisabled(true);
        tx.inputEl.addClass('pseudobs-disabled-input');
      });

    let replacementInput: HTMLInputElement;

    if (this.suggestions.length > 0) {
      const suggBox = contentEl.createDiv('pseudobs-suggestions-box');
      suggBox.createEl('small', { text: t('ruleModal.coulomontLabel') })
        .addClass('pseudobs-suggestions-label');
      const tags = suggBox.createDiv('pseudobs-suggestions-tags');
      const btnEls: HTMLElement[] = [];
      for (const name of this.suggestions) {
        const btn = tags.createEl('button', { text: name, cls: 'pseudobs-suggestion-btn' });
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

    new Setting(contentEl)
      .setName(t('quickModal.replaceBy'))
      .addText((tx) => {
        tx.setPlaceholder(t('quickModal.replacementPlaceholder'));
        tx.setValue(this.replacement);
        tx.onChange((v) => (this.replacement = v));
        replacementInput = tx.inputEl;
      });

    new Setting(contentEl)
      .setName(t('ruleModal.category'))
      .addDropdown((d) => {
        const cats: EntityCategory[] = ['first_name','last_name','full_name','place','institution','date','age','profession','custom'];
        for (const cat of cats) d.addOption(cat, t(`category.${cat}`));
        d.setValue('custom');
        d.onChange((v) => (this.category = v as EntityCategory));
      });

    new Setting(contentEl)
      .setName(t('quickModal.scope'))
      .addDropdown((d) => {
        d.addOption('file',       t('quickModal.scopeFile'));
        d.addOption('occurrence', t('quickModal.scopeOccurrence'));
        d.setValue('file');
        d.onChange((v) => (this.applyScope = v as ApplyScope));
      });

    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText(t('quickModal.submit')).setCta().onClick(() => void this.apply())
    );

    window.setTimeout(() => replacementInput?.focus(), 50);
  }

  private async apply(): Promise<void> {
    const replacement = this.replacement.trim();
    if (!replacement) {
      new Notice(t('ruleModal.errorMissing'));
      return;
    }

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice(t('notice.noActiveFile'));
      return;
    }

    await this.saveRule(activeFile, replacement);

    const s = this.plugin.settings;
    const marked = s.useMarkerInExport
      ? `${s.markerOpen}${replacement}${s.markerClose}`
      : replacement;

    if (this.applyScope === 'occurrence') {
      this.editor.replaceRange(marked, this.from, this.to);
      new Notice(t('notice.appliedOccurrence', this.source, marked));
    } else {
      const count = await this.plugin.applyRuleToFile(activeFile, this.source, marked);
      new Notice(t('notice.appliedFile', this.source, marked, String(count), count > 1 ? 's' : ''));
    }

    void this.plugin.refreshHighlightData();
    this.close();
  }

  private async saveRule(activeFile: TFile, replacement: string): Promise<void> {
    const mappingPath = `${this.plugin.settings.mappingFolder}/${activeFile.basename}.mapping.json`;
    let store: MappingStore;

    const mappingTFile = this.app.vault.getAbstractFileByPath(mappingPath);
    if (mappingTFile instanceof TFile) {
      const data = JSON.parse(await this.app.vault.read(mappingTFile)) as MappingFile;
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
