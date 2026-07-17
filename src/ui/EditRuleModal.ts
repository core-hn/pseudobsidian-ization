import { App, Modal, Notice, Setting } from 'obsidian';
import type PseudObsPlugin from '../main';
import type { EntityCategory, ScopeType } from '../types';
import type { RuleLocation } from '../mappings/ScopeResolver';
import { t } from '../i18n';

export class EditRuleModal extends Modal {
  private plugin: PseudObsPlugin;
  private location: RuleLocation;

  private replacement: string;
  private category: EntityCategory;
  private scopeType: ScopeType;
  private priority: number;

  constructor(app: App, plugin: PseudObsPlugin, location: RuleLocation) {
    super(app);
    this.plugin = plugin;
    this.location = location;
    const { rule } = location;
    this.replacement = rule.replacement;
    this.category = rule.category;
    this.scopeType = rule.scope.type;
    this.priority = rule.priority;
  }

  onOpen(): void {
    const { contentEl } = this;
    const { rule } = this.location;
    contentEl.createEl('h2', { text: t('ruleModal.title') });

    new Setting(contentEl)
      .setName(t('ruleModal.source'))
      .setDesc('Non modifiable — créez une nouvelle règle pour changer la source')
      .addText((tx) => {
        tx.setValue(rule.source).setDisabled(true);
        tx.inputEl.addClass('pseudobs-disabled-input');
      });

    new Setting(contentEl)
      .setName(t('ruleModal.replacement'))
      .addText((tx) =>
        tx.setValue(this.replacement).onChange((v) => (this.replacement = v))
      );

    new Setting(contentEl)
      .setName(t('ruleModal.category'))
      .addDropdown((d) => {
        const cats: EntityCategory[] = ['first_name','last_name','full_name','place','institution','date','age','profession','custom'];
        for (const cat of cats) d.addOption(cat, t(`category.${cat}`));
        d.setValue(this.category);
        d.onChange((v) => {
          this.category = v as EntityCategory;
          updateWarn();
        });
      });

    new Setting(contentEl)
      .setName(t('ruleModal.scope'))
      .addDropdown((d) => {
        d.addOption('file',   t('ruleModal.scopeFile'));
        d.addOption('folder', t('ruleModal.scopeFolder'));
        d.addOption('vault',  t('ruleModal.scopeVault'));
        d.setValue(this.scopeType);
        d.onChange((v) => {
          this.scopeType = v as ScopeType;
          updateWarn();
        });
      });

    // Callout dynamique
    const calloutEl = contentEl.createDiv();
    const isNameCat = () => ['first_name', 'last_name', 'full_name'].includes(this.category);
    const isBroad   = () => this.scopeType !== 'file';
    const updateWarn = () => {
      if (!isNameCat()) { calloutEl.hide(); return; }
      calloutEl.empty();
      calloutEl.show();
      if (isBroad()) {
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
    // État initial
    if (isNameCat()) {
      calloutEl.show();
      updateWarn();
    } else {
      calloutEl.hide();
    }

    new Setting(contentEl)
      .setName(t('ruleModal.priority'))
      .setDesc(t('ruleModal.priorityDesc'))
      .addText((tx) =>
        tx.setValue(String(this.priority)).onChange((v) => (this.priority = parseInt(v, 10) || 0))
      );

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText(t('panel.ner.save')).setCta().onClick(() => void this.save())
      )
      .addButton((btn) =>
        btn.setButtonText(t('ruleModal.delete')).setWarning().onClick(() => void this.delete())
      );
  }

  private async save(): Promise<void> {
    if (!this.replacement.trim()) {
      new Notice(t('ruleModal.errorMissing'));
      return;
    }

    const { store, filePath, rule } = this.location;
    store.update(rule.id, {
      replacement: this.replacement.trim(),
      category: this.category,
      scope: { ...rule.scope, type: this.scopeType },
      priority: this.priority,
    });

    await this.plugin.scopeResolver.saveStore(store, filePath);
    new Notice(t('notice.ruleCreated', rule.source, this.replacement.trim()));
    void this.plugin.refresh();
    this.close();
  }

  private async delete(): Promise<void> {
    const { store, filePath, rule } = this.location;
    store.remove(rule.id);
    await this.plugin.scopeResolver.saveStore(store, filePath);
    // Rétablir le texte original dans le fichier actif
    await this.plugin.revertRuleInFile(rule.source, rule.replacement);
    new Notice(t('notice.ruleDeleted', rule.source));
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
