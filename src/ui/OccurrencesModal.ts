import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import type PseudObsPlugin from '../main';
import type { MappingRule, Occurrence } from '../types';
import { resolveSpans, applySpans } from '../pseudonymizer/SpanProtector';
import type { ReplacementSpan } from '../types';

type Decision = 'validated' | 'ignored' | 'false_positive';

interface CardRef {
  card: HTMLElement;
  buttons: Map<Decision, HTMLElement>;
  arrow: HTMLElement;
  resLine: HTMLElement;
  statusLabel: HTMLElement;
}

export class OccurrencesModal extends Modal {
  private plugin: PseudObsPlugin;
  private file: TFile;
  private content: string;
  private occurrences: Occurrence[];
  private rules: MappingRule[];
  private decisions: Map<string, Decision> = new Map();
  // Références stables — on ne recrée jamais les cartes
  private cardRefs: Map<string, CardRef> = new Map();

  constructor(
    app: App,
    plugin: PseudObsPlugin,
    file: TFile,
    content: string,
    occurrences: Occurrence[],
    rules: MappingRule[]
  ) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.content = content;
    this.occurrences = occurrences;
    this.rules = rules;
    for (const occ of occurrences) this.decisions.set(occ.id, 'validated');
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: `Scanner — ${this.file.name}` });

    const n = this.occurrences.length;
    contentEl.createEl('p', {
      text: `${n} occurrence${n > 1 ? 's' : ''} trouvée${n > 1 ? 's' : ''} pour ${this.countRules()} règle${this.countRules() > 1 ? 's' : ''}.`,
    });

    // Légende
    const legend = contentEl.createDiv();
    legend.addClass('pseudobs-legend');
    for (const [icon, label, cls] of [
      ['✓', 'Valider le remplacement', 'pseudobs-legend-badge-validate'],
      ['✗', "Conserver l'original",    'pseudobs-legend-badge-ignore'],
      ['⚠', 'Faux positif — exclure', 'pseudobs-legend-badge-fp'],
    ] as [string, string, string][]) {
      const item = legend.createSpan();
      item.addClass('pseudobs-legend-item');
      const badge = item.createSpan({ text: icon });
      badge.addClass('pseudobs-legend-badge', cls);
      item.createSpan({ text: ` ${label}` });
    }

    // Boutons globaux
    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText('Tout valider').setClass('pseudobs-btn-validate-all').onClick(() => {
          for (const occ of this.occurrences) this.decisions.set(occ.id, 'validated');
          this.updateAllCards();
        })
      )
      .addButton((b) =>
        b.setButtonText('Tout ignorer').setClass('pseudobs-btn-ignore-all').onClick(() => {
          for (const occ of this.occurrences) this.decisions.set(occ.id, 'ignored');
          this.updateAllCards();
        })
      );

    // Rendre les cartes une seule fois
    this.renderAllCards(contentEl);

    contentEl.createEl('hr');

    new Setting(contentEl).addButton((b) =>
      b.setButtonText('Appliquer').setCta().onClick(() => this.apply())
    );
  }

  private countRules(): number {
    return new Set(this.occurrences.map((o) => o.mappingId)).size;
  }

  // Construit toutes les cartes une seule fois — ne sera plus jamais appelé après
  private renderAllCards(container: HTMLElement): void {
    const byRule = new Map<string, Occurrence[]>();
    for (const occ of this.occurrences) {
      const key = occ.mappingId ?? '';
      if (!byRule.has(key)) byRule.set(key, []);
      byRule.get(key)!.push(occ);
    }

    for (const [mappingId, occs] of byRule) {
      const rule = this.rules.find((r) => r.id === mappingId);
      if (!rule) continue;

      const group = container.createDiv();
      group.createEl('div', {
        text: `${rule.source}  →  ${rule.replacement}`,
        cls: 'pseudobs-occ-rule-header',
      });

      for (const occ of occs) {
        this.buildCard(group, occ, rule);
      }
    }
  }

  private buildCard(container: HTMLElement, occ: Occurrence, rule: MappingRule): void {
    const card = container.createDiv();
    card.addClass('pseudobs-occ-card');

    // Ligne source : terme surligné en jaune
    const srcLine = card.createDiv();
    srcLine.addClass('pseudobs-occ-line');
    this.ctxSpan(srcLine, occ.contextBefore);
    const termSpan = srcLine.createSpan({ text: occ.text });
    termSpan.addClass('pseudobs-occ-term');
    this.ctxSpan(srcLine, occ.contextAfter);

    // Flèche + ligne résultat (masquées si ignoré ou faux positif)
    const arrow = card.createDiv();
    arrow.addClass('pseudobs-occ-arrow');
    arrow.setText('↓');

    const resLine = card.createDiv();
    resLine.addClass('pseudobs-occ-line', 'pseudobs-occ-result-line');
    this.ctxSpan(resLine, occ.contextBefore);
    const replSpan = resLine.createSpan({ text: rule.replacement });
    replSpan.addClass('pseudobs-occ-replacement');
    this.ctxSpan(resLine, occ.contextAfter);

    // Label contextuel affiché quand la ligne résultat est masquée
    const statusLabel = card.createDiv();
    statusLabel.addClass('pseudobs-occ-status-label');

    // Méta
    const meta = card.createEl('small');
    meta.addClass('pseudobs-occ-meta');
    meta.setText(`ligne ${occ.line}`);

    // Boutons — créés une seule fois, mis à jour via updateCard()
    const actions = card.createDiv();
    actions.addClass('pseudobs-occ-actions');

    const btnRefs = new Map<Decision, HTMLElement>();
    for (const [label, value, title] of [
      ['✓', 'validated', 'Valider'],
      ['✗', 'ignored', 'Ignorer'],
      ['⚠', 'false_positive', 'Faux positif'],
    ] as [string, Decision, string][]) {
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
    // Appliquer l'état initial
    this.updateCard(occ.id);
  }

  // Met à jour UNE carte sans toucher au DOM — styles + résultat en direct
  private updateCard(occId: string): void {
    const ref = this.cardRefs.get(occId);
    if (!ref) return;
    const decision = this.decisions.get(occId) ?? 'validated';

    ref.card.removeClass('pseudobs-occ-validated', 'pseudobs-occ-ignored', 'pseudobs-occ-false_positive');
    ref.card.addClass(`pseudobs-occ-${decision}`);

    for (const [value, btn] of ref.buttons) {
      btn.toggleClass('pseudobs-occ-btn-active', value === decision);
    }

    // Afficher la ligne résultat seulement si l'occurrence est validée
    const show = decision === 'validated';
    ref.arrow.toggle(show);
    ref.resLine.toggle(show);
    ref.statusLabel.toggle(!show);

    // Label contextuel pour les cas ignoré / faux positif
    const labels: Record<Decision, string> = {
      validated:      '',
      ignored:        'Conservé tel quel dans ce fichier',
      false_positive: 'Faux positif — exclu du remplacement',
    };
    ref.statusLabel.setText(labels[decision]);
  }

  // Met à jour TOUTES les cartes
  private updateAllCards(): void {
    for (const occId of this.cardRefs.keys()) {
      this.updateCard(occId);
    }
  }

  private ctxSpan(parent: HTMLElement, text: string): void {
    parent.createSpan({ text, cls: 'pseudobs-ctx-side' });
  }

  private async apply(): Promise<void> {
    const validated = this.occurrences.filter((o) => this.decisions.get(o.id) === 'validated');
    const ignored   = this.occurrences.filter((o) => this.decisions.get(o.id) === 'ignored');

    const s = this.plugin.settings;
    const wrap = (r: string) => s.useMarkerInExport
      ? `${s.markerOpen}${r}${s.markerClose}`
      : r;

    const spans: ReplacementSpan[] = validated.map((occ) => {
      const rule = this.rules.find((r) => r.id === occ.mappingId)!;
      return { start: occ.start, end: occ.end, source: occ.text, replacement: wrap(rule.replacement), mappingId: occ.mappingId ?? '', priority: rule.priority };
    });

    const updated = applySpans(this.content, resolveSpans(spans));
    await this.app.vault.modify(this.file, updated);

    await this.plugin.updateMappingStatuses(this.file.path, this.rules, this.occurrences, this.decisions);

    const nv = validated.length, ni = ignored.length;
    new Notice(`✓ ${nv} remplacement${nv > 1 ? 's' : ''} appliqué${nv > 1 ? 's' : ''}` + (ni > 0 ? `, ${ni} ignoré${ni > 1 ? 's' : ''}` : ''));

    void this.plugin.refreshHighlightData();
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
