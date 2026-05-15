import { App, Modal, Notice, TFolder } from 'obsidian';
import type PseudObsPlugin from '../main';
import { t } from '../i18n';

/**
 * Retourne les sous-dossiers directs d'un dossier du vault.
 * Ce sont les "classes" de l'organisation du corpus.
 */
export function getCorpusClasses(app: App, transcriptionsFolder: string): string[] {
  const folder = app.vault.getAbstractFileByPath(transcriptionsFolder);
  if (!(folder instanceof TFolder)) return [];
  return folder.children
    .filter((c): c is TFolder => c instanceof TFolder)
    .map((c) => c.name)
    .sort();
}

/**
 * Modale de gestion de l'organisation du corpus par classes (sous-dossiers).
 * Créer une classe = créer le sous-dossier dans Transcriptions/ + miroir dans mappings/ et exports/.
 */
export class CorpusModal extends Modal {
  private plugin: PseudObsPlugin;

  constructor(app: App, plugin: PseudObsPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('pseudobs-corpus-modal');

    contentEl.createEl('h2', { text: t('corpus.modal.title') });
    contentEl.createEl('p', { text: t('corpus.modal.hint'), cls: 'pseudobs-view-hint' });

    const classes = getCorpusClasses(this.app, this.plugin.settings.transcriptionsFolder);

    if (classes.length === 0) {
      contentEl.createEl('p', { text: t('corpus.modal.noClasses'), cls: 'pseudobs-view-hint' });
    } else {
      const list = contentEl.createEl('ul', { cls: 'pseudobs-corpus-class-list' });
      for (const cls of classes) {
        this.renderClassRow(list, cls);
      }
    }

    // Bouton ajouter
    const addRow = contentEl.createDiv('pseudobs-corpus-add-row');
    const input = addRow.createEl('input');
    input.type = 'text';
    input.placeholder = t('corpus.modal.classNamePlaceholder');
    input.addClass('pseudobs-corpus-add-input');

    const addBtn = addRow.createEl('button', {
      text: t('corpus.modal.addClass'),
      cls: 'pseudobs-view-add-btn mod-cta',
    });
    addBtn.addEventListener('click', () => void this.addClass(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.addClass(input.value);
    });

    // Bouton fermer
    contentEl.createEl('hr');
    contentEl.createEl('button', { text: t('corpus.modal.close'), cls: 'pseudobs-view-action-btn' })
      .addEventListener('click', () => this.close());
  }

  private renderClassRow(list: HTMLElement, cls: string): void {
    const s = this.plugin.settings;
    const transcPath = `${s.transcriptionsFolder}/${cls}`;

    // Compter les fichiers dans le dossier transcriptions
    const folder = this.app.vault.getAbstractFileByPath(transcPath);
    const fileCount = folder instanceof TFolder
      ? folder.children.filter((c) => !(c instanceof TFolder)).length
      : 0;

    const li = list.createEl('li', { cls: 'pseudobs-corpus-class-item' });

    const nameWrap = li.createDiv('pseudobs-corpus-class-name');
    nameWrap.createEl('strong', { text: cls });
    nameWrap.createEl('small', {
      text: t('corpus.modal.files', String(fileCount)),
      cls: 'pseudobs-corpus-class-count',
    });

    // Miroir : indiquer les dossiers associés
    const mirrorPaths = [
      `${s.mappingFolder}/${cls}`,
      `${s.exportsFolder}/${cls}`,
    ];
    const mirrorEl = li.createEl('small', { cls: 'pseudobs-corpus-class-mirror' });
    mirrorEl.setText(mirrorPaths.join(' · '));

    // Bouton supprimer
    const delBtn = li.createEl('button', { cls: 'pseudobs-dict-card-remove' });
    delBtn.setText('✕');
    delBtn.title = t('corpus.modal.deleteConfirm', cls);
    delBtn.addEventListener('click', () => void this.deleteClass(cls));
  }

  private async addClass(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      new Notice(t('corpus.modal.classNameEmpty'));
      return;
    }

    const existing = getCorpusClasses(this.app, this.plugin.settings.transcriptionsFolder);
    if (existing.includes(trimmed)) {
      new Notice(t('corpus.modal.classExists'));
      return;
    }

    const s = this.plugin.settings;
    await this.plugin.ensureFolder(`${s.transcriptionsFolder}/${trimmed}`);
    await this.plugin.ensureFolder(`${s.mappingFolder}/${trimmed}`);
    await this.plugin.ensureFolder(`${s.exportsFolder}/${trimmed}`);

    this.render();
  }

  private async deleteClass(name: string): Promise<void> {
    const s = this.plugin.settings;
    const paths = [
      `${s.transcriptionsFolder}/${name}`,
      `${s.mappingFolder}/${name}`,
      `${s.exportsFolder}/${name}`,
    ];

    for (const p of paths) {
      const item = this.app.vault.getAbstractFileByPath(p);
      if (item) await this.app.fileManager.trashFile(item);
    }

    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Modal de sélection de classe à l'import d'une transcription.
 * Retourne le nom de la classe choisie, ou null si l'utilisateur choisit "sans classe".
 * Retourne undefined si l'utilisateur annule.
 */
export class ClassSelectModal extends Modal {
  private plugin: PseudObsPlugin;
  private classes: string[];
  private resolve!: (value: string | null | undefined) => void;

  constructor(app: App, plugin: PseudObsPlugin, classes: string[]) {
    super(app);
    this.plugin = plugin;
    this.classes = classes;
  }

  open(): this {
    super.open();
    return this;
  }

  prompt(): Promise<string | null | undefined> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      super.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: t('corpus.select.title') });
    contentEl.createEl('p', { text: t('corpus.select.hint'), cls: 'pseudobs-view-hint' });

    let selected: string | null = null;

    const list = contentEl.createEl('ul', { cls: 'pseudobs-corpus-class-list' });

    // Option "sans classe"
    const noneItem = list.createEl('li', { cls: 'pseudobs-corpus-select-item' });
    const noneBtn = noneItem.createEl('button', {
      text: t('corpus.select.none'),
      cls: 'pseudobs-onboarding-none-btn',
    });
    noneBtn.addEventListener('click', () => {
      selected = null;
      list.querySelectorAll('.pseudobs-corpus-select-item-active').forEach((el) =>
        el.removeClass('pseudobs-corpus-select-item-active')
      );
      noneItem.addClass('pseudobs-corpus-select-item-active');
    });

    for (const cls of this.classes) {
      const item = list.createEl('li', { cls: 'pseudobs-corpus-select-item' });
      const btn = item.createEl('button', { text: cls, cls: 'pseudobs-onboarding-select-btn' });
      btn.addEventListener('click', () => {
        selected = cls;
        list.querySelectorAll('.pseudobs-corpus-select-item-active').forEach((el) =>
          el.removeClass('pseudobs-corpus-select-item-active')
        );
        item.addClass('pseudobs-corpus-select-item-active');
        btn.addClass('pseudobs-onboarding-select-btn-active');
      });
    }

    const footer = contentEl.createDiv('pseudobs-dict-review-footer');
    footer.createEl('button', { text: t('corpus.modal.close') })
      .addEventListener('click', () => { this.resolve(undefined); this.close(); });
    footer.createEl('button', { text: t('corpus.select.confirm'), cls: 'mod-cta' })
      .addEventListener('click', () => { this.resolve(selected); this.close(); });
  }

  onClose(): void {
    this.contentEl.empty();
    // Si fermé sans confirmation (croix), résoudre avec undefined
    if (this.resolve) this.resolve(undefined);
  }
}
