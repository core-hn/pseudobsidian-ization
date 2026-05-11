import { App, Modal, Setting, TFile, Notice } from 'obsidian';
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
  private suggestions: string[];

  constructor(
    app: App,
    plugin: PseudObsPlugin,
    prefillSource = '',
    prefillReplacement = '',
    suggestions: string[] = []
  ) {
    super(app);
    this.plugin = plugin;
    this.source = prefillSource;
    this.replacement = prefillReplacement;
    this.suggestions = suggestions;
    // Coulmont ne fournit que des prénoms
    this.category = suggestions.length > 0 ? 'first_name' : 'custom';
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

    // Suggestions Coulmont : boutons cliquables (présents uniquement si fournis)
    let replacementInput: HTMLInputElement | undefined;
    if (this.suggestions.length > 0) {
      const box = contentEl.createDiv();
      box.style.cssText = 'margin-bottom:6px;';
      box.createEl('small', { text: 'Suggestions Coulmont (M/F non différencié — choisissez) :' })
        .style.cssText = 'display:block;opacity:.6;margin-bottom:4px;font-size:.8em;';
      const tags = box.createDiv();
      tags.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;';
      for (const name of this.suggestions) {
        const btn = tags.createEl('button', { text: name });
        btn.style.cssText = 'padding:2px 10px;border-radius:12px;border:1px solid var(--background-modifier-border);cursor:pointer;font-size:.85em;background:var(--background-secondary);';
        btn.addEventListener('click', () => {
          this.replacement = name;
          if (replacementInput) replacementInput.value = name;
          tags.querySelectorAll('button').forEach((b) => {
            (b as HTMLElement).style.cssText = 'padding:2px 10px;border-radius:12px;border:1px solid var(--background-modifier-border);cursor:pointer;font-size:.85em;background:var(--background-secondary);';
          });
          btn.style.cssText = 'padding:2px 10px;border-radius:12px;border:1px solid var(--interactive-accent);cursor:pointer;font-size:.85em;background:var(--interactive-accent);color:var(--text-on-accent);font-weight:600;';
        });
      }
    }

    new Setting(contentEl)
      .setName('Remplacement')
      .setDesc('Pseudonyme ou catégorie analytique')
      .addText((t) => {
        t.setValue(this.replacement).onChange((v) => { this.replacement = v; });
        replacementInput = t.inputEl;
      });

    // Catégorie — masquée et fixée à "Prénom" si suggestions Coulmont
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
        // Masquer le dropdown si la catégorie est imposée par Coulmont
        if (this.suggestions.length > 0) {
          d.selectEl.closest('.setting-item')?.setAttribute('style', 'display:none');
        }
      });

    new Setting(contentEl)
      .setName('Portée')
      .addDropdown((d) => {
        d.addOption('file', 'Ce fichier uniquement');
        d.addOption('folder', 'Ce dossier');
        d.addOption('vault', 'Tout le vault');
        d.setValue('file');
        d.onChange((v) => {
          this.scopeType = v as ScopeType;
        });
      });

    new Setting(contentEl)
      .setName('Priorité')
      .setDesc('Entier libre, comme un z-index CSS — défaut 0, plus grand = appliqué en premier')
      .addText((t) =>
        t.setValue('0').onChange((v) => {
          this.priority = parseInt(v, 10) || 0;
        })
      );

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText('Créer la règle')
        .setCta()
        .onClick(() => this.createRule())
    );
  }

  private async createRule(): Promise<void> {
    if (!this.source.trim() || !this.replacement.trim()) {
      new Notice('La source et le remplacement sont obligatoires.');
      return;
    }

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('Aucun fichier actif.');
      return;
    }

    const mappingPath = `${this.plugin.settings.mappingFolder}/${activeFile.basename}.mapping.json`;
    let store: MappingStore;

    const mappingFile = this.app.vault.getAbstractFileByPath(mappingPath);
    if (mappingFile instanceof TFile) {
      const data: MappingFile = JSON.parse(await this.app.vault.read(mappingFile));
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
      createdBy: 'user',
    });

    const json = JSON.stringify(store.toJSON(), null, 2);
    if (mappingFile instanceof TFile) {
      await this.app.vault.modify(mappingFile, json);
    } else {
      await this.app.vault.create(mappingPath, json);
    }

    new Notice(`✓ Règle créée : "${this.source.trim()}" → "${this.replacement.trim()}"`);
    // Rafraîchir le surlignage immédiatement sans attendre un changement de fichier
    this.plugin.refreshHighlightData();
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
