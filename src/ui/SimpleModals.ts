import { App, Modal, Setting } from 'obsidian';
import { t } from '../i18n';

export class ConfirmModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private message: string,
    private onConfirm: () => void | Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.createEl('p', { text: this.message });
    new Setting(this.contentEl)
      .addButton((btn) =>
        btn.setButtonText(t('common.cancel')).onClick(() => {
          this.resolved = true;
          this.close();
        })
      )
      .addButton((btn) =>
        btn.setButtonText(t('common.confirm')).setWarning().setCta().onClick(() => {
          this.resolved = true;
          this.close();
          void (async () => this.onConfirm())();
        })
      );
  }

  onClose(): void {
    if (!this.resolved) this.resolved = true;
    this.contentEl.empty();
  }
}

export class TextInputModal extends Modal {
  private input!: HTMLInputElement;

  constructor(
    app: App,
    private label: string,
    private onSubmit: (value: string) => void | Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.createEl('p', { text: this.label });
    this.input = this.contentEl.createEl('input', { type: 'text' });
    this.input.addClass('pseudobs-text-input-field');
    this.input.focus();
    this.input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.submit();
      else if (e.key === 'Escape') this.close();
    });
    new Setting(this.contentEl)
      .addButton((btn) =>
        btn.setButtonText(t('common.cancel')).onClick(() => this.close())
      )
      .addButton((btn) =>
        btn.setButtonText(t('common.confirm')).setCta().onClick(() => this.submit())
      );
  }

  private submit(): void {
    const value = this.input.value.trim();
    this.close();
    void (async () => this.onSubmit(value))();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
