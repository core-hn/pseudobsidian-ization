/**
 * Modale de contexte légère — affiche les candidats (occurrences) d'une règle
 * et retourne les décisions sans appliquer immédiatement.
 *
 * Utilisée depuis MappingScanReviewModal pour permettre une sélection fine
 * occurrence par occurrence (ex : valider "Juste" nom propre, ignorer "juste" adjectif).
 */

import { App, Modal, Setting } from 'obsidian';
import type { MappingRule, Occurrence } from '../types';

export type OccurrenceDecision = 'validated' | 'ignored' | 'false_positive';

interface CardRef {
  card: HTMLElement;
  buttons: Map<OccurrenceDecision, HTMLElement>;
  arrow: HTMLElement;
  resLine: HTMLElement;
  statusLabel: HTMLElement;
}

export class OccurrencesContextModal extends Modal {
  private rule: MappingRule;
  private occurrences: Occurrence[];
  private decisions: Map<string, OccurrenceDecision>;
  private onConfirm: (decisions: Map<string, OccurrenceDecision>) => void;
  private cardRefs = new Map<string, CardRef>();

  constructor(
    app: App,
    rule: MappingRule,
    occurrences: Occurrence[],
    existingDecisions: Map<string, OccurrenceDecision>,
    onConfirm: (decisions: Map<string, OccurrenceDecision>) => void
  ) {
    super(app);
    this.rule = rule;
    this.occurrences = occurrences;
    this.decisions = new Map(existingDecisions);
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('pseudobs-ctx-modal');

    contentEl.createEl('h3', {
      text: `${this.rule.source}  →  ${this.rule.replacement}`,
      cls: 'pseudobs-ctx-modal-title',
    });
    contentEl.createEl('p', {
      text: `${this.occurrences.length} occurrence${this.occurrences.length > 1 ? 's' : ''} — sélectionnez celles à remplacer.`,
      cls: 'pseudobs-view-hint',
    });

    // Boutons globaux
    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText('Tout valider').onClick(() => {
          for (const occ of this.occurrences) this.decisions.set(occ.id, 'validated');
          this.updateAllCards();
        })
      )
      .addButton((b) =>
        b.setButtonText('Tout ignorer').onClick(() => {
          for (const occ of this.occurrences) this.decisions.set(occ.id, 'ignored');
          this.updateAllCards();
        })
      );

    // Cartes
    const scroll = contentEl.createDiv('pseudobs-ctx-modal-scroll');
    for (const occ of this.occurrences) {
      this.buildCard(scroll, occ);
    }

    contentEl.createEl('hr');

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText('Annuler').onClick(() => this.close())
      )
      .addButton((b) =>
        b.setButtonText('Confirmer la sélection').setCta().onClick(() => {
          this.onConfirm(new Map(this.decisions));
          this.close();
        })
      );
  }

  private buildCard(container: HTMLElement, occ: Occurrence): void {
    const card = container.createDiv('pseudobs-occ-card');

    // Ligne source
    const srcLine = card.createDiv('pseudobs-occ-line');
    srcLine.createSpan({ text: occ.contextBefore, cls: 'pseudobs-ctx-side' });
    srcLine.createSpan({ text: occ.text, cls: 'pseudobs-occ-term' });
    srcLine.createSpan({ text: occ.contextAfter, cls: 'pseudobs-ctx-side' });

    // Flèche + ligne résultat
    const arrow = card.createDiv('pseudobs-occ-arrow');
    arrow.setText('↓');

    const resLine = card.createDiv('pseudobs-occ-line pseudobs-occ-result-line');
    resLine.createSpan({ text: occ.contextBefore, cls: 'pseudobs-ctx-side' });
    resLine.createSpan({ text: this.rule.replacement, cls: 'pseudobs-occ-replacement' });
    resLine.createSpan({ text: occ.contextAfter, cls: 'pseudobs-ctx-side' });

    const statusLabel = card.createDiv('pseudobs-occ-status-label');
    card.createEl('small', { text: `ligne ${occ.line}`, cls: 'pseudobs-occ-meta' });

    // Boutons décision
    const actions = card.createDiv('pseudobs-occ-actions');
    const btnRefs = new Map<OccurrenceDecision, HTMLElement>();

    for (const [label, value, title] of [
      ['✓', 'validated',     'Valider'],
      ['✗', 'ignored',       'Ignorer'],
      ['⚠', 'false_positive', 'Faux positif'],
    ] as [string, OccurrenceDecision, string][]) {
      const btn = actions.createEl('button', { text: label });
      btn.title = title;
      btn.addClass('pseudobs-occ-btn');
      btn.addEventListener('click', () => {
        this.decisions.set(occ.id, value);
        this.updateCard(occ.id);
      });
      btnRefs.set(value, btn);
    }

    this.cardRefs.set(occ.id, { card, buttons: btnRefs, arrow, resLine, statusLabel });
    this.updateCard(occ.id);
  }

  private updateCard(occId: string): void {
    const ref = this.cardRefs.get(occId);
    if (!ref) return;
    const decision = this.decisions.get(occId) ?? 'validated';

    ref.card.removeClass('pseudobs-occ-validated', 'pseudobs-occ-ignored', 'pseudobs-occ-false_positive');
    ref.card.addClass(`pseudobs-occ-${decision}`);

    for (const [value, btn] of ref.buttons) {
      btn.toggleClass('pseudobs-occ-btn-active', value === decision);
    }

    const show = decision === 'validated';
    ref.arrow.toggle(show);
    ref.resLine.toggle(show);
    ref.statusLabel.toggle(!show);
    ref.statusLabel.setText(
      decision === 'ignored' ? 'Conservé tel quel' : decision === 'false_positive' ? 'Faux positif — exclu' : ''
    );
  }

  private updateAllCards(): void {
    for (const occId of this.cardRefs.keys()) this.updateCard(occId);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
