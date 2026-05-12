import { App, Modal, Notice, Setting } from 'obsidian';
import type PseudObsPlugin from '../main';
import type { EntityCategory, MappingRule, ScopeType } from '../types';
import type { RuleLocation } from '../mappings/ScopeResolver';

export class EditRuleModal extends Modal {
  private plugin: PseudObsPlugin;
  private location: RuleLocation;

  // Valeurs éditables — initialisées depuis la règle existante
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
    contentEl.createEl('h2', { text: 'Modifier la règle' });

    new Setting(contentEl)
      .setName('Source')
      .setDesc('Non modifiable — créez une nouvelle règle pour changer la source')
      .addText((t) => {
        t.setValue(rule.source).setDisabled(true);
        t.inputEl.addClass('pseudobs-disabled-input');
      });

    new Setting(contentEl)
      .setName('Remplacement')
      .addText((t) =>
        t.setValue(this.replacement).onChange((v) => (this.replacement = v))
      );

    new Setting(contentEl)
      .setName('Catégorie')
      .addDropdown((d) => {
        const options: Record<EntityCategory, string> = {
          first_name: 'Prénom', last_name: 'Nom de famille', full_name: 'Nom complet',
          place: 'Lieu', institution: 'Institution', date: 'Date',
          age: 'Âge', profession: 'Profession', custom: 'Autre',
        };
        for (const [value, label] of Object.entries(options)) d.addOption(value, label);
        d.setValue(this.category);
        d.onChange((v) => (this.category = v as EntityCategory));
      });

    new Setting(contentEl)
      .setName('Portée')
      .addDropdown((d) => {
        d.addOption('file', 'Ce fichier uniquement');
        d.addOption('folder', 'Ce dossier');
        d.addOption('vault', 'Tout le vault');
        d.setValue(this.scopeType);
        d.onChange((v) => (this.scopeType = v as ScopeType));
      });

    new Setting(contentEl)
      .setName('Priorité')
      .setDesc('Entier libre, comme un z-index CSS — défaut 0')
      .addText((t) =>
        t.setValue(String(this.priority)).onChange((v) => (this.priority = parseInt(v, 10) || 0))
      );

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText('Enregistrer').setCta().onClick(() => this.save())
      )
      .addButton((btn) =>
        btn
          .setButtonText('Supprimer la règle')
          .setWarning()
          .onClick(() => this.delete())
      );
  }

  private async save(): Promise<void> {
    if (!this.replacement.trim()) {
      new Notice('Le remplacement est obligatoire.');
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
    new Notice(`✓ Règle mise à jour : "${rule.source}" → "${this.replacement.trim()}"`);
    void this.plugin.refreshHighlightData();
    this.close();
  }

  private async delete(): Promise<void> {
    const { store, filePath, rule } = this.location;
    store.remove(rule.id);
    await this.plugin.scopeResolver.saveStore(store, filePath);
    new Notice(`✓ Règle supprimée : "${rule.source}"`);
    void this.plugin.refreshHighlightData();
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
