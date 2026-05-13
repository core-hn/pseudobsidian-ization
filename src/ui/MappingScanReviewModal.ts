import { App, Modal, Notice, TFile } from 'obsidian';
import type PseudObsPlugin from '../main';
import type { MappingRule } from '../types';
import { findSpansForRule } from '../pseudonymizer/ReplacementPlanner';
import { resolveSpans, applySpans } from '../pseudonymizer/SpanProtector';

export interface MappingRuleResult {
  rule: MappingRule;
  matchCount: number;
}

export class MappingScanReviewModal extends Modal {
  private plugin: PseudObsPlugin;
  private file: TFile;
  private content: string;
  private ruleResults: MappingRuleResult[];
  private checked: boolean[];
  private applyBtn!: HTMLButtonElement;

  constructor(
    app: App,
    plugin: PseudObsPlugin,
    file: TFile,
    content: string,
    ruleResults: MappingRuleResult[],
  ) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.content = content;
    this.ruleResults = ruleResults;
    this.checked = ruleResults.map(() => true);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('pseudobs-dict-review-modal');

    contentEl.createEl('h2', { text: 'Révision du scan — mappings' });
    contentEl.createEl('p', {
      text: `${this.ruleResults.length} règle${this.ruleResults.length > 1 ? 's' : ''} active${this.ruleResults.length > 1 ? 's' : ''} avec des occurrences dans "${this.file.name}"`,
      cls: 'pseudobs-scan-summary',
    });
    contentEl.createEl('p', {
      text: 'Décochez les règles à ne pas appliquer. Les remplacements seront écrits dans le fichier source.',
      cls: 'pseudobs-view-hint',
    });

    const scroll = contentEl.createDiv('pseudobs-dict-review-scroll');
    const table = scroll.createEl('table', { cls: 'pseudobs-dict-review-table' });

    const thead = table.createEl('thead');
    const hr = thead.createEl('tr');
    ['', 'Source', '', 'Remplacement', 'Occ.'].forEach((h) =>
      hr.createEl('th', { text: h })
    );

    const tbody = table.createEl('tbody');
    this.ruleResults.forEach(({ rule, matchCount }, i) => {
      const tr = tbody.createEl('tr', { cls: 'pseudobs-dict-review-row' });

      // Checkbox
      const cb = tr.createEl('td').createEl('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.addClass('pseudobs-dict-review-cb');
      cb.addEventListener('change', () => {
        this.checked[i] = cb.checked;
        tr.toggleClass('pseudobs-dict-review-row-off', !cb.checked);
        this.updateApplyLabel();
      });

      // Source
      tr.createEl('td', { text: rule.source, cls: 'pseudobs-dict-review-term' });

      // Flèche
      tr.createEl('td', { text: '→', cls: 'pseudobs-dict-review-arrow' });

      // Remplacement (lecture seule — déjà défini dans la règle)
      const repCell = tr.createEl('td');
      const s = this.plugin.settings;
      const displayRep = s.useMarkerInExport
        ? `${s.markerOpen}${rule.replacement}${s.markerClose}`
        : rule.replacement;
      repCell.createEl('span', { text: displayRep, cls: 'pseudobs-dict-review-rep-static' });

      // Occurrences
      tr.createEl('td', { text: String(matchCount), cls: 'pseudobs-dict-review-count' });
    });

    const footer = contentEl.createDiv('pseudobs-dict-review-footer');
    footer.createEl('button', { text: 'Annuler' })
      .addEventListener('click', () => this.close());

    this.applyBtn = footer.createEl('button', { cls: 'mod-cta' }) as HTMLButtonElement;
    this.applyBtn.addEventListener('click', () => void this.apply());
    this.updateApplyLabel();
  }

  private updateApplyLabel(): void {
    const n = this.checked.filter(Boolean).length;
    const total = this.ruleResults
      .filter((_, i) => this.checked[i])
      .reduce((sum, r) => sum + r.matchCount, 0);
    this.applyBtn.textContent = n === 0
      ? 'Aucune règle à appliquer'
      : `Pseudonymiser (${n} règle${n > 1 ? 's' : ''}, ${total} occurrence${total > 1 ? 's' : ''})`;
    this.applyBtn.toggleClass('pseudobs-dict-review-btn-empty', n === 0);
  }

  private async apply(): Promise<void> {
    const checkedRules = this.ruleResults
      .filter((_, i) => this.checked[i])
      .map((r) => r.rule);
    if (checkedRules.length === 0) { this.close(); return; }

    this.applyBtn.setAttr('disabled', 'true');

    const s = this.plugin.settings;
    const marker = s.useMarkerInExport
      ? { open: s.markerOpen, close: s.markerClose }
      : undefined;

    // Collecter tous les spans (toutes règles cochées), résoudre les chevauchements,
    // appliquer de droite à gauche comme le moteur principal
    const allSpans = checkedRules.flatMap((rule) =>
      findSpansForRule(this.content, rule, {
        caseSensitive: s.caseSensitive,
        wholeWordOnly: s.wholeWordOnly,
      }).map((span) =>
        marker
          ? { ...span, replacement: `${marker.open}${span.replacement}${marker.close}` }
          : span
      )
    );

    const resolved = resolveSpans(allSpans);
    if (resolved.length === 0) {
      new Notice('Aucune occurrence à remplacer.');
      this.close();
      return;
    }

    const modified = applySpans(this.content, resolved);
    await this.app.vault.modify(this.file, modified);
    void this.plugin.refreshHighlightData();

    const total = resolved.length;
    new Notice(`✓ ${total} occurrence${total > 1 ? 's' : ''} pseudonymisée${total > 1 ? 's' : ''} dans "${this.file.name}"`);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
