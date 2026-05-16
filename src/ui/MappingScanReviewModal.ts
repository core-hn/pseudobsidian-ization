import { App, Modal, Notice, TFile } from 'obsidian';
import { t } from '../i18n';
import type PseudObsPlugin from '../main';
import type { MappingRule, Occurrence } from '../types';
import { resolveSpans, applySpans } from '../pseudonymizer/SpanProtector';
import type { ReplacementSpan } from '../types';
import { OccurrencesContextModal, type OccurrenceDecision } from './OccurrencesContextModal';
import type { IgnoredOccurrence } from '../types';

export interface MappingRuleResult {
  rule: MappingRule;
  matchCount: number;
  occurrences: Occurrence[];
}

export class MappingScanReviewModal extends Modal {
  private plugin: PseudObsPlugin;
  private file: TFile;
  private content: string;
  private ruleResults: MappingRuleResult[];
  private checked: boolean[];
  // Décisions par règle : ruleId → occId → decision
  private decisionsMap = new Map<string, Map<string, OccurrenceDecision>>();
  private applyBtn!: HTMLButtonElement;
  // Cellules de comptage — pour mise à jour live
  private countCells: HTMLElement[] = [];

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

    // Décisions initiales : toutes les occurrences validées
    for (const { rule, occurrences } of ruleResults) {
      const map = new Map<string, OccurrenceDecision>();
      for (const occ of occurrences) map.set(occ.id, 'validated');
      this.decisionsMap.set(rule.id, map);
    }
  }

  onOpen(): void {
    this.modalEl.addClass('pseudobs-modal-review-outer');
    const { contentEl } = this;
    contentEl.addClass('pseudobs-dict-review-modal');

    contentEl.createEl('h2', { text: t('mappingScanModal.title') });
    const nr = this.ruleResults.length;
    contentEl.createEl('p', {
      text: t('mappingScanModal.summary', String(nr),
        nr > 1 ? t('mappingScanModal.summary.rules') : t('mappingScanModal.summary.rule'),
        this.file.name),
      cls: 'pseudobs-scan-summary',
    });
    contentEl.createEl('p', { text: t('mappingScanModal.hint'), cls: 'pseudobs-view-hint' });

    const scroll = contentEl.createDiv('pseudobs-dict-review-scroll');
    const table = scroll.createEl('table', { cls: 'pseudobs-dict-review-table' });

    const thead = table.createEl('thead');
    const hr = thead.createEl('tr');
    ['', 'Source', '', t('mappingScanModal.col.replacement'), t('mappingScanModal.col.occurrences')].forEach((h) =>
      hr.createEl('th', { text: h })
    );

    const tbody = table.createEl('tbody');
    this.ruleResults.forEach(({ rule, occurrences }, i) => {
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
      tr.createEl('td', { text: '→', cls: 'pseudobs-dict-review-arrow' });

      // Remplacement
      const repCell = tr.createEl('td');
      const s = this.plugin.settings;
      const displayRep = s.useMarkerInExport
        ? `${s.markerOpen}${rule.replacement}${s.markerClose}`
        : rule.replacement;
      repCell.createEl('span', { text: displayRep, cls: 'pseudobs-dict-review-rep-static' });

      // Occurrences — bouton cliquable qui ouvre la modale de contexte
      const countCell = tr.createEl('td', { cls: 'pseudobs-dict-review-count' });
      this.countCells.push(countCell);
      this.renderCountCell(countCell, rule, occurrences, i);
    });

    const footer = contentEl.createDiv('pseudobs-dict-review-footer');
    footer.createEl('button', { text: t('mappingScanModal.cancel') })
      .addEventListener('click', () => this.close());

    footer.createEl('button', { text: t('mappingScanModal.saveExceptions'), cls: 'pseudobs-save-exceptions-btn' })
      .addEventListener('click', () => void this.saveExceptions());

    this.applyBtn = footer.createEl('button', { cls: 'mod-cta' });
    this.applyBtn.addEventListener('click', () => void this.apply());
    this.updateApplyLabel();
  }

  private renderCountCell(
    cell: HTMLElement,
    rule: MappingRule,
    occurrences: Occurrence[],
    ruleIndex: number
  ): void {
    cell.empty();
    const decisions = this.decisionsMap.get(rule.id)!;
    const validated = occurrences.filter((o) => decisions.get(o.id) === 'validated').length;
    const total     = occurrences.length;

    if (total === 0) {
      cell.createSpan({ text: '0' });
      return;
    }

    const btn = cell.createEl('button', { cls: 'pseudobs-count-btn' });
    // Afficher "N / total" si des occurrences ont été ignorées, "N" sinon
    btn.setText(validated < total ? `${validated} / ${total}` : String(total));
    btn.title = 'Voir et sélectionner les candidats';

    btn.addEventListener('click', () => {
      new OccurrencesContextModal(
        this.app,
        rule,
        occurrences,
        decisions,
        (newDecisions) => {
          this.decisionsMap.set(rule.id, newDecisions);
          this.renderCountCell(cell, rule, occurrences, ruleIndex);
          this.updateApplyLabel();
        }
      ).open();
    });
  }

  private countValidated(): number {
    return this.ruleResults.reduce((sum, { rule, occurrences }, i) => {
      if (!this.checked[i]) return sum;
      const decisions = this.decisionsMap.get(rule.id)!;
      return sum + occurrences.filter((o) => decisions.get(o.id) === 'validated').length;
    }, 0);
  }

  private updateApplyLabel(): void {
    const rules = this.checked.filter(Boolean).length;
    const total = this.countValidated();
    this.applyBtn.textContent = rules === 0
      ? t('mappingScanModal.noRules')
      : t('mappingScanModal.apply',
          String(rules), rules > 1 ? t('mappingScanModal.apply.rules') : t('mappingScanModal.apply.rule'),
          String(total), total > 1 ? t('mappingScanModal.apply.occurrences') : t('mappingScanModal.apply.occurrence'));
    this.applyBtn.toggleClass('pseudobs-dict-review-btn-empty', rules === 0);
  }

  /** Enregistre les exceptions dans le mapping sans appliquer de remplacements. */
  private async saveExceptions(): Promise<void> {
    await this.persistIgnoredOccurrences();
    new Notice(t('mappingScanModal.exceptionsSaved'));
    this.close();
  }

  /**
   * Persiste les occurrences ignorées (✗ et ⚠) dans le mapping.json de chaque règle.
   * S'appuie sur findRuleByTerm pour localiser le bon mapping file.
   * Les nouvelles exceptions sont fusionnées avec les existantes (déduplication par texte).
   */
  private async persistIgnoredOccurrences(): Promise<void> {
    for (let i = 0; i < this.ruleResults.length; i++) {
      const { rule, occurrences } = this.ruleResults[i];
      const decisions = this.decisionsMap.get(rule.id)!;

      const newIgnored: IgnoredOccurrence[] = occurrences
        .filter((occ) => {
          const d = decisions.get(occ.id) ?? 'validated';
          return d === 'ignored' || d === 'false_positive';
        })
        .map((occ) => ({ text: occ.text, contextBefore: occ.contextBefore, contextAfter: occ.contextAfter }));

      if (newIgnored.length === 0) continue;

      const location = await this.plugin.scopeResolver.findRuleByTerm(rule.source);
      if (!location) continue;

      const existing = location.rule.ignoredOccurrences ?? [];
      const existingTexts = new Set(existing.map((o) => o.text));
      const merged = [...existing, ...newIgnored.filter((o) => !existingTexts.has(o.text))];

      location.store.update(rule.id, { ignoredOccurrences: merged });
      await this.plugin.scopeResolver.saveStore(location.store, location.filePath);
    }
    void this.plugin.refresh();
  }

  private async apply(): Promise<void> {
    const s = this.plugin.settings;
    const wrap = (r: string) => s.useMarkerInExport
      ? `${s.markerOpen}${r}${s.markerClose}` : r;

    const spans: ReplacementSpan[] = [];
    for (let i = 0; i < this.ruleResults.length; i++) {
      if (!this.checked[i]) continue;
      const { rule, occurrences } = this.ruleResults[i];
      const decisions = this.decisionsMap.get(rule.id)!;

      for (const occ of occurrences) {
        if ((decisions.get(occ.id) ?? 'validated') !== 'validated') continue;
        spans.push({
          start: occ.start,
          end: occ.end,
          source: occ.text,
          replacement: wrap(rule.replacement),
          mappingId: rule.id,
          priority: rule.priority,
        });
      }
    }

    if (spans.length === 0) {
      new Notice(t('notice.noOccurrences'));
      this.close();
      return;
    }

    this.applyBtn.setAttr('disabled', 'true');

    const resolved = resolveSpans(spans);
    const modified = applySpans(this.content, resolved);
    await this.app.vault.modify(this.file, modified);

    // Persister les exceptions ignorées dans le mapping
    await this.persistIgnoredOccurrences();

    const total = resolved.length;
    new Notice(t('notice.occurrencesPseudonymized',
      String(total),
      total > 1 ? t('notice.occurrencesPseudonymized.occurrences') : t('notice.occurrencesPseudonymized.occurrence'),
      this.file.name));
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
