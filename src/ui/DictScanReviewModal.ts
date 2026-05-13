import { App, Modal, Notice, TFile } from 'obsidian';
import type PseudObsPlugin from '../main';
import { MappingStore } from '../mappings/MappingStore';
import type { EntityCategory, MappingFile } from '../types';

export interface DictScanResultItem {
  term: string;
  dictId: string;
  dictLabel: string;
  entryClass: string | null;
  proposedReplacement: string;
  occurrenceCount: number;
  category: EntityCategory;
  contextBefore?: string;
  contextAfter?: string;
}

export class DictScanReviewModal extends Modal {
  private plugin: PseudObsPlugin;
  private file: TFile;
  private results: DictScanResultItem[];
  private existingReplacements: string[];  // règles déjà dans le mapping

  // État mutable
  private checked: boolean[];
  private prefixes: string[];      // préfixe éditable (ex: "Ville")
  private fixedReps: string[];     // remplacement fixe pour les entrées word-to-word

  // Références DOM pour les mises à jour dynamiques
  private indexSpans: (HTMLElement | null)[] = [];
  private applyBtn!: HTMLButtonElement;

  constructor(
    app: App,
    plugin: PseudObsPlugin,
    file: TFile,
    results: DictScanResultItem[],
    existingReplacements: string[],
  ) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.results = results;
    this.existingReplacements = existingReplacements;
    this.checked = results.map(() => true);
    this.prefixes  = results.map((r) => r.entryClass ?? r.proposedReplacement);
    this.fixedReps = results.map((r) => r.proposedReplacement);
    this.indexSpans = results.map(() => null);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('pseudobs-dict-review-modal');

    contentEl.createEl('h2', { text: 'Révision du scan — dictionnaires' });

    const dicts = [...new Set(this.results.map((r) => r.dictLabel))];
    contentEl.createEl('p', {
      text: `${this.results.length} entité${this.results.length > 1 ? 's' : ''} détectée${this.results.length > 1 ? 's' : ''} · ${dicts.join(', ')}`,
      cls: 'pseudobs-scan-summary',
    });

    const scroll = contentEl.createDiv('pseudobs-dict-review-scroll');

    this.results.forEach((item, i) => {
      const card = scroll.createDiv('pseudobs-dict-review-card');

      // En-tête : terme + catégorie + count + checkbox
      const header = card.createDiv('pseudobs-dict-review-card-header');

      const termWrap = header.createDiv('pseudobs-dict-review-card-term-wrap');
      termWrap.createEl('span', { text: item.term, cls: 'pseudobs-dict-review-term' });
      termWrap.createEl('span', {
        text: item.category.replace('_', ' '),
        cls: 'pseudobs-dict-review-cat',
      });

      const meta = header.createDiv('pseudobs-dict-review-card-meta');
      meta.createEl('span', {
        text: `${item.occurrenceCount}×`,
        cls: 'pseudobs-dict-review-count',
      });

      const cb = meta.createEl('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.addClass('pseudobs-dict-review-cb');

      // Contexte (avant ··· terme ··· après)
      if (item.contextBefore !== undefined || item.contextAfter !== undefined) {
        const ctx = card.createDiv('pseudobs-dict-review-ctx');
        ctx.createEl('span', {
          text: (item.contextBefore ?? '').slice(-50),
          cls: 'pseudobs-dict-review-ctx-side',
        });
        ctx.createEl('mark', { text: item.term, cls: 'pseudobs-dict-review-ctx-term' });
        ctx.createEl('span', {
          text: (item.contextAfter ?? '').slice(0, 50),
          cls: 'pseudobs-dict-review-ctx-side',
        });
      }

      // Remplacement
      const repRow = card.createDiv('pseudobs-dict-review-rep-row');
      repRow.createEl('span', { text: '→', cls: 'pseudobs-dict-review-arrow' });
      const repCell = repRow.createDiv('pseudobs-dict-review-rep-cell');

      if (item.entryClass) {
        const prefixInput = repCell.createEl('input');
        prefixInput.type = 'text';
        prefixInput.value = item.entryClass;
        prefixInput.addClass('pseudobs-dict-review-prefix');
        prefixInput.addEventListener('input', () => {
          this.prefixes[i] = prefixInput.value.trim() || item.entryClass!;
          this.recomputeIndices();
        });
        const indexSpan = repCell.createEl('span', { cls: 'pseudobs-dict-review-index' });
        this.indexSpans[i] = indexSpan;
      } else {
        const inp = repCell.createEl('input');
        inp.type = 'text';
        inp.value = item.proposedReplacement;
        inp.addClass('pseudobs-dict-review-prefix');
        inp.addEventListener('input', () => { this.fixedReps[i] = inp.value; });
      }

      // Checkbox → dimmer la card + désactiver les inputs
      cb.addEventListener('change', () => {
        this.checked[i] = cb.checked;
        card.toggleClass('pseudobs-dict-review-card-off', !cb.checked);
        card.querySelectorAll('input[type="text"]').forEach((el) => {
          (el as HTMLInputElement).disabled = !cb.checked;
        });
        this.recomputeIndices();
        this.updateApplyLabel();
      });
    });

    // Pied de page
    const footer = contentEl.createDiv('pseudobs-dict-review-footer');
    footer.createEl('button', { text: 'Annuler' })
      .addEventListener('click', () => this.close());

    this.applyBtn = footer.createEl('button', { cls: 'mod-cta' }) as HTMLButtonElement;
    this.applyBtn.addEventListener('click', () => void this.apply());

    this.recomputeIndices();
    this.updateApplyLabel();
  }

  /**
   * Recalcule les index de chaque item coché dans l'ordre d'apparition.
   * Les items décochés n'incrémentent pas le compteur — si Village_2 est
   * décoché, le Village suivant devient Village_2, pas Village_3.
   */
  private recomputeIndices(): void {
    // Compter les remplacements déjà utilisés dans le mapping existant
    const usedCounts: Record<string, number> = {};
    for (const r of this.existingReplacements) {
      const m = /^(.+?)_(\d+)$/.exec(r);
      if (m) {
        const prefix = m[1];
        const idx = parseInt(m[2], 10);
        usedCounts[prefix] = Math.max(usedCounts[prefix] ?? 0, idx);
      }
    }

    // Compteur courant par préfixe (dans cette session de scan)
    const sessionCounts: Record<string, number> = {};

    for (let i = 0; i < this.results.length; i++) {
      const span = this.indexSpans[i];
      if (!span) continue; // word-to-word — pas d'index

      if (!this.checked[i]) {
        span.setText('');
        continue;
      }

      const prefix = this.prefixes[i];
      sessionCounts[prefix] = (sessionCounts[prefix] ?? 0) + 1;
      const base = usedCounts[prefix] ?? 0;
      const idx = base + sessionCounts[prefix];
      span.setText(`_${idx}`);
    }
  }

  /** Replacement final pour l'item i (préfixe + index calculé ou mot-à-mot). */
  private getFinalReplacement(i: number): string {
    if (this.results[i].entryClass && this.indexSpans[i]) {
      const indexText = this.indexSpans[i]!.getText();
      return (this.prefixes[i] || this.results[i].entryClass!) + indexText;
    }
    return this.fixedReps[i];
  }

  private updateApplyLabel(): void {
    const n = this.checked.filter(Boolean).length;
    this.applyBtn.textContent = n === 0
      ? 'Aucune règle à appliquer'
      : `Créer ${n} règle${n > 1 ? 's' : ''}`;
    this.applyBtn.toggleClass('pseudobs-dict-review-btn-empty', n === 0);
  }

  private async apply(): Promise<void> {
    const toCreate = this.results.filter((_, i) => this.checked[i]);
    if (toCreate.length === 0) { this.close(); return; }

    this.applyBtn.setAttr('disabled', 'true');

    const mappingPath = `${this.plugin.settings.mappingFolder}/${this.file.basename}.mapping.json`;
    let store: MappingStore;
    const mappingFile = this.app.vault.getAbstractFileByPath(mappingPath);
    if (mappingFile instanceof TFile) {
      const data = JSON.parse(await this.app.vault.read(mappingFile)) as MappingFile;
      store = MappingStore.fromJSON(data);
    } else {
      await this.plugin.ensureFolder(this.plugin.settings.mappingFolder);
      store = new MappingStore({ type: 'file', path: this.file.path });
    }

    for (let i = 0; i < this.results.length; i++) {
      if (!this.checked[i]) continue;
      const replacement = this.getFinalReplacement(i);
      if (!replacement.trim()) continue;
      const item = this.results[i];
      store.add({
        source: item.term,
        replacement: replacement.trim(),
        category: item.category,
        scope: { type: 'file', path: this.file.path },
        status: 'validated',
        priority: 0,
        createdBy: 'dictionary',
        sourceDictionary: item.dictId,
      });
    }

    const json = JSON.stringify(store.toJSON(), null, 2);
    if (mappingFile instanceof TFile) {
      await this.app.vault.modify(mappingFile, json);
    } else {
      await this.app.vault.create(mappingPath, json);
    }

    const n = toCreate.length;
    new Notice(`✓ ${n} règle${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}`);
    void this.plugin.refreshHighlightData();
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
