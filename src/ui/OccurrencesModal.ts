import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import type PseudObsPlugin from '../main';
import type { MappingRule, Occurrence, MappingStatus } from '../types';
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
    legend.style.cssText = 'display:flex;gap:16px;font-size:.8em;opacity:.65;margin-bottom:8px;flex-wrap:wrap;';
    for (const [icon, label, color] of [
      ['✓', 'Valider le remplacement', 'rgba(50,205,90,.7)'],
      ['✗', 'Conserver l\'original',   'rgba(150,150,150,.7)'],
      ['⚠', 'Faux positif — exclure', 'rgba(255,80,80,.6)'],
    ] as [string, string, string][]) {
      const item = legend.createSpan();
      item.style.cssText = `display:inline-flex;align-items:center;gap:4px;`;
      const badge = item.createSpan({ text: icon });
      badge.style.cssText = `background:${color};border-radius:3px;padding:0 5px;font-weight:700;`;
      item.createSpan({ text: ` ${label}` });
    }

    // Boutons globaux
    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText('✓ Tout valider').onClick(() => {
          for (const occ of this.occurrences) this.decisions.set(occ.id, 'validated');
          this.updateAllCards();
        })
      )
      .addButton((b) =>
        b.setButtonText('✗ Tout ignorer').onClick(() => {
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
      }).style.cssText = 'font-weight:600;font-size:.9em;padding:4px 8px;background:var(--background-secondary);border-radius:4px;margin:12px 0 6px;';

      for (const occ of occs) {
        this.buildCard(group, occ, rule);
      }
    }
  }

  private buildCard(container: HTMLElement, occ: Occurrence, rule: MappingRule): void {
    const decision = this.decisions.get(occ.id) ?? 'validated';

    const card = container.createDiv();
    this.applyCardStyle(card, decision);

    // Ligne source : terme surligné en jaune
    const srcLine = card.createDiv();
    srcLine.style.cssText = 'font-family:var(--font-monospace);font-size:.85em;line-height:1.7;white-space:pre-wrap;word-break:break-word;';
    this.ctxSpan(srcLine, occ.contextBefore);
    const termSpan = srcLine.createSpan({ text: occ.text });
    termSpan.style.cssText = 'background:rgba(255,210,0,.6);border-radius:3px;padding:1px 5px;font-weight:700;';
    this.ctxSpan(srcLine, occ.contextAfter);

    // Flèche + ligne résultat (masquées si ignoré ou faux positif)
    const arrow = card.createDiv();
    arrow.style.cssText = 'font-size:.75em;opacity:.35;line-height:1.2;margin:1px 0;user-select:none;';
    arrow.setText('↓');

    const resLine = card.createDiv();
    resLine.style.cssText = 'font-family:var(--font-monospace);font-size:.85em;line-height:1.7;white-space:pre-wrap;word-break:break-word;opacity:.8;';
    this.ctxSpan(resLine, occ.contextBefore);
    const replSpan = resLine.createSpan({ text: rule.replacement });
    replSpan.style.cssText = 'background:rgba(50,205,90,.55);border-radius:3px;padding:1px 5px;font-weight:700;';
    this.ctxSpan(resLine, occ.contextAfter);

    // Label contextuel affiché quand la ligne résultat est masquée
    const statusLabel = card.createDiv();
    statusLabel.style.cssText = 'font-size:.8em;font-style:italic;opacity:.55;margin:2px 0 4px;display:none;';

    // Méta
    const meta = card.createEl('small');
    meta.style.cssText = 'display:block;font-size:.75em;opacity:.45;margin-top:4px;';
    meta.setText(`ligne ${occ.line}`);

    // Boutons — créés une seule fois, mis à jour via updateCard()
    const actions = card.createDiv();
    actions.style.cssText = 'display:flex;gap:6px;margin-top:6px;';

    const btnRefs = new Map<Decision, HTMLElement>();
    for (const [label, value, title] of [
      ['✓', 'validated', 'Valider'],
      ['✗', 'ignored', 'Ignorer'],
      ['⚠', 'false_positive', 'Faux positif'],
    ] as [string, Decision, string][]) {
      const btn = actions.createEl('button', { text: label });
      btn.title = title;
      this.applyBtnStyle(btn, value === decision);
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

    this.applyCardStyle(ref.card, decision);

    for (const [value, btn] of ref.buttons) {
      this.applyBtnStyle(btn, value === decision);
    }

    // Afficher la ligne résultat seulement si l'occurrence est validée
    const show = decision === 'validated';
    ref.arrow.style.display = show ? '' : 'none';
    ref.resLine.style.display = show ? '' : 'none';

    // Label contextuel pour les cas ignoré / faux positif
    const labels: Record<Decision, string> = {
      validated:      '',
      ignored:        'Conservé tel quel dans ce fichier',
      false_positive: 'Faux positif — exclu du remplacement',
    };
    ref.statusLabel.style.display = show ? 'none' : '';
    ref.statusLabel.setText(labels[decision]);
  }

  // Met à jour TOUTES les cartes
  private updateAllCards(): void {
    for (const occId of this.cardRefs.keys()) {
      this.updateCard(occId);
    }
  }

  private applyCardStyle(card: HTMLElement, decision: Decision): void {
    const borders: Record<Decision, string> = {
      validated:     'rgba(60,200,100,.7)',
      ignored:       'rgba(150,150,150,.4)',
      false_positive:'rgba(255,80,80,.6)',
    };
    const opacity = decision === 'validated' ? '1' : '0.55';
    card.style.cssText = `border:1px solid var(--background-modifier-border);border-left:3px solid ${borders[decision]};border-radius:6px;padding:8px 10px;margin:4px 0;opacity:${opacity};`;
  }

  private applyBtnStyle(btn: HTMLElement, active: boolean): void {
    btn.style.cssText = `padding:2px 10px;border-radius:4px;cursor:pointer;font-size:.85em;border:1px solid var(--background-modifier-border);background:${active ? 'var(--interactive-accent)' : 'var(--background-primary)'};color:${active ? 'var(--text-on-accent)' : 'var(--text-normal)'};`;
  }

  private ctxSpan(parent: HTMLElement, text: string): void {
    const s = parent.createSpan({ text });
    s.style.opacity = '0.5';
  }

  private async apply(): Promise<void> {
    const validated = this.occurrences.filter((o) => this.decisions.get(o.id) === 'validated');
    const ignored   = this.occurrences.filter((o) => this.decisions.get(o.id) === 'ignored');

    const spans: ReplacementSpan[] = validated.map((occ) => {
      const rule = this.rules.find((r) => r.id === occ.mappingId)!;
      return { start: occ.start, end: occ.end, source: occ.text, replacement: rule.replacement, mappingId: occ.mappingId ?? '', priority: rule.priority };
    });

    const updated = applySpans(this.content, resolveSpans(spans));
    await this.app.vault.modify(this.file, updated);

    await this.plugin.updateMappingStatuses(this.file.path, this.rules, this.occurrences, this.decisions);

    const nv = validated.length, ni = ignored.length;
    new Notice(`✓ ${nv} remplacement${nv > 1 ? 's' : ''} appliqué${nv > 1 ? 's' : ''}` + (ni > 0 ? `, ${ni} ignoré${ni > 1 ? 's' : ''}` : ''));

    this.plugin.refreshHighlightData();
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
