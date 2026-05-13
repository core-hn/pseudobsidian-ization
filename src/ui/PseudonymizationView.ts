import { ItemView, Notice, Setting, TFile, WorkspaceLeaf } from 'obsidian';
import type PseudObsPlugin from '../main';
import type { MappingRule, Occurrence } from '../types';
import { scanOccurrences } from '../scanner/OccurrenceScanner';
import { resolveSpans, applySpans } from '../pseudonymizer/SpanProtector';
import type { ReplacementSpan } from '../types';
import { EditRuleModal } from './EditRuleModal';
import { RuleModal } from './RuleModal';

export const VIEW_TYPE_PSEUDOBS = 'pseudonymization-view';

type Tab = 'occurrences' | 'mappings' | 'dictionaries' | 'exports' | 'ner';
type Decision = 'validated' | 'ignored' | 'false_positive';

interface CardRef {
  card: HTMLElement;
  buttons: Map<Decision, HTMLElement>;
  arrow: HTMLElement;
  resLine: HTMLElement;
  statusLabel: HTMLElement;
}

const CATEGORY_LABELS: Record<string, string> = {
  first_name: 'Prénom', last_name: 'Nom', full_name: 'Nom complet',
  place: 'Lieu', institution: 'Institution', date: 'Date',
  age: 'Âge', profession: 'Profession', custom: 'Autre',
};

const SCOPE_LABELS: Record<string, string> = {
  file: 'Fichier', folder: 'Dossier', vault: 'Vault',
};

const STATUS_LABELS: Record<string, string> = {
  validated: '✓', ignored: '✗', partial: '◑',
  suggested: '?', conflict: '⚠', disabled: '–', needs_review: '👁',
};

export class PseudonymizationView extends ItemView {
  private plugin: PseudObsPlugin;
  private activeTab: Tab = 'occurrences';
  private panes!: Record<Tab, HTMLElement>;
  private tabBtns!: Record<Tab, HTMLElement>;

  // Dernier fichier markdown connu (survit au focus du panneau)
  private lastFile: TFile | null = null;
  // Garde contre la réentrance de onFileChange (le panneau lui-même peut devenir feuille active)
  private _renderingTab = false;

  // État de l'onglet Occurrences
  private occScanned = false;
  private occFile: TFile | null = null;
  private occContent = '';
  private occurrences: Occurrence[] = [];
  private occRules: MappingRule[] = [];
  private occDecisions: Map<string, Decision> = new Map();
  private occCardRefs: Map<string, CardRef> = new Map();

  constructor(leaf: WorkspaceLeaf, plugin: PseudObsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_PSEUDOBS; }
  getDisplayText(): string { return 'Pseudonymisation'; }
  getIcon(): string { return 'eye-off'; }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('pseudobs-view');

    const tabBar = root.createDiv('pseudobs-view-tabs');
    const content = root.createDiv('pseudobs-view-content');

    const tabs: [Tab, string][] = [
      ['occurrences', 'Candidats'],
      ['mappings', 'Mappings'],
      ['dictionaries', 'Dictionnaires'],
      ['exports', 'Exports'],
    ];
    if (this.plugin.settings.nerBackend !== 'none') {
      tabs.push(['ner', 'NER']);
    }

    this.panes = {} as Record<Tab, HTMLElement>;
    this.tabBtns = {} as Record<Tab, HTMLElement>;

    for (const [id, label] of tabs) {
      const pane = content.createDiv('pseudobs-view-pane');
      this.panes[id] = pane;

      const btn = tabBar.createEl('button', { text: label, cls: 'pseudobs-view-tab' });
      btn.addEventListener('click', () => void this.switchTab(id));
      this.tabBtns[id] = btn;
    }

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => void this.onFileChange())
    );

    const f = this.app.workspace.getActiveFile();
    if (f) this.lastFile = f;

    await this.switchTab('occurrences');
  }

  private async switchTab(tab: Tab): Promise<void> {
    this.activeTab = tab;

    for (const [id, btn] of Object.entries(this.tabBtns) as [Tab, HTMLElement][]) {
      btn.toggleClass('pseudobs-view-tab-active', id === tab);
    }
    for (const [id, pane] of Object.entries(this.panes) as [Tab, HTMLElement][]) {
      // style.display direct — évite le passage par collapse() d'Obsidian qui
      // déclenche des mesures de layout en cascade ("Measure loop")
      pane.style.display = id === tab ? '' : 'none';
    }

    await this.renderTab(tab);
  }

  private async renderTab(tab: Tab): Promise<void> {
    const pane = this.panes[tab];
    pane.empty();
    if (tab === 'occurrences')        await this.renderOccurrencesTab(pane);
    else if (tab === 'mappings')      await this.renderMappingsTab(pane);
    else if (tab === 'dictionaries')  this.renderDictionariesTab(pane);
    else if (tab === 'ner')           await this.renderNerTab(pane);
    else                              this.renderExportsTab(pane);
  }

  private async onFileChange(): Promise<void> {
    // Le panneau lui-même peut devenir la feuille active sans changement de fichier
    // → éviter une boucle render ↔ active-leaf-change
    if (this._renderingTab) return;
    if (this.app.workspace.getActiveViewOfType(ItemView) === this) return;

    const f = this.app.workspace.getActiveFile();
    if (f && f !== this.lastFile) {
      this.lastFile = f;
      this.occScanned = false;
      this.occurrences = [];
      this.occDecisions = new Map();
      this.occCardRefs = new Map();
    } else if (f) {
      this.lastFile = f;
    }

    this._renderingTab = true;
    try {
      await this.renderTab(this.activeTab);
    } finally {
      this._renderingTab = false;
    }
  }

  private getFile(): TFile | null {
    return this.app.workspace.getActiveFile() ?? this.lastFile;
  }

  // ---- Onglet Occurrences ----------------------------------------

  private async renderOccurrencesTab(el: HTMLElement): Promise<void> {
    const file = this.getFile();
    if (!file) {
      el.createEl('p', { text: 'Aucun fichier actif.', cls: 'pseudobs-view-hint' });
      return;
    }

    const ext = file.extension.toLowerCase();
    if (!['srt', 'cha', 'chat', 'md', 'txt'].includes(ext)) {
      el.createEl('p', {
        text: `Format non pris en charge : .${ext}`,
        cls: 'pseudobs-view-hint',
      });
      return;
    }

    const toolbar = el.createDiv('pseudobs-view-toolbar');
    const scanBtn = toolbar.createEl('button', {
      text: 'Scanner le fichier',
      cls: 'pseudobs-view-action-btn',
    });

    if (this.plugin.settings.nerBackend !== 'none') {
      const nerBtn = toolbar.createEl('button', {
        text: 'Identifier des candidats',
        cls: 'pseudobs-view-action-btn',
      });
      nerBtn.title = 'Détecter les entités nommées identifiantes (NER) et les surligner en bleu';
      nerBtn.addEventListener('click', () => void this.plugin.scanCurrentFileNer());
    }

    const resultsEl = el.createDiv('pseudobs-view-results');

    if (this.occScanned && this.occFile === file) {
      // Reconstruire les refs sur les nouveaux éléments DOM
      this.occCardRefs = new Map();
      this.renderOccurrenceCards(resultsEl);
    } else {
      resultsEl.createEl('p', { text: `Fichier : ${file.name}`, cls: 'pseudobs-view-filename' });
      resultsEl.createEl('p', {
        text: 'Cliquez sur "scanner le fichier" pour détecter les occurrences des règles actives.',
        cls: 'pseudobs-view-hint',
      });
    }

    scanBtn.addEventListener('click', () => { void (async () => {
      scanBtn.setAttr('disabled', 'true');
      scanBtn.setText('Scan en cours…');
      try {
        const content = await this.app.vault.read(file);
        const rules = await this.plugin.scopeResolver.getRulesFor(file.path);

        resultsEl.empty();

        if (rules.length === 0) {
          resultsEl.createEl('p', {
            text: 'Aucune règle active pour ce fichier. Créez des règles via le menu contextuel ou la commande "créer une règle".',
            cls: 'pseudobs-view-hint',
          });
        } else {
          const occs = scanOccurrences(content, file.path, rules, {
            caseSensitive: this.plugin.settings.caseSensitive,
            wholeWordOnly: this.plugin.settings.wholeWordOnly,
          });

          this.occFile = file;
          this.occContent = content;
          this.occurrences = occs;
          this.occRules = rules;
          this.occDecisions = new Map();
          this.occCardRefs = new Map();
          for (const occ of occs) this.occDecisions.set(occ.id, 'validated');
          this.occScanned = true;

          this.renderOccurrenceCards(resultsEl);
        }
      } finally {
        scanBtn.removeAttribute('disabled');
        scanBtn.setText('Scanner le fichier');
      }
    })(); });
  }

  private renderOccurrenceCards(el: HTMLElement): void {
    if (this.occurrences.length === 0) {
      el.createEl('p', {
        text: 'Aucune occurrence trouvée avec les règles actives.',
        cls: 'pseudobs-view-hint',
      });
      return;
    }

    const n = this.occurrences.length;
    const nR = new Set(this.occurrences.map((o) => o.mappingId)).size;
    el.createEl('p', {
      text: `${n} occurrence${n > 1 ? 's' : ''} — ${nR} règle${nR > 1 ? 's' : ''}`,
      cls: 'pseudobs-view-count',
    });

    const legend = el.createDiv();
    legend.addClass('pseudobs-legend');
    for (const [icon, label, cls] of [
      ['✓', 'Valider', 'pseudobs-legend-badge-validate'],
      ['✗', 'Conserver', 'pseudobs-legend-badge-ignore'],
      ['⚠', 'Faux positif', 'pseudobs-legend-badge-fp'],
    ] as [string, string, string][]) {
      const item = legend.createSpan();
      item.addClass('pseudobs-legend-item');
      item.createSpan({ text: icon }).addClass('pseudobs-legend-badge', cls);
      item.createSpan({ text: ` ${label}` });
    }

    const globalBtns = el.createDiv('pseudobs-view-global-btns');
    globalBtns.createEl('button', { text: 'Tout valider', cls: 'pseudobs-btn-validate-all' }).addEventListener('click', () => {
      for (const occ of this.occurrences) this.occDecisions.set(occ.id, 'validated');
      for (const id of this.occCardRefs.keys()) this.updateCard(id);
    });
    globalBtns.createEl('button', { text: 'Tout ignorer', cls: 'pseudobs-btn-ignore-all' }).addEventListener('click', () => {
      for (const occ of this.occurrences) this.occDecisions.set(occ.id, 'ignored');
      for (const id of this.occCardRefs.keys()) this.updateCard(id);
    });

    const byRule = new Map<string, Occurrence[]>();
    for (const occ of this.occurrences) {
      const k = occ.mappingId ?? '';
      if (!byRule.has(k)) byRule.set(k, []);
      byRule.get(k)!.push(occ);
    }
    for (const [mid, occs] of byRule) {
      const rule = this.occRules.find((r) => r.id === mid);
      if (!rule) continue;
      el.createDiv({
        text: `${rule.source}  →  ${rule.replacement}`,
        cls: 'pseudobs-occ-rule-header',
      });
      for (const occ of occs) this.buildCard(el, occ, rule);
    }

    el.createEl('hr');
    el
      .createEl('button', {
        text: 'Appliquer les remplacements',
        cls: 'pseudobs-view-apply-btn',
      })
      .addEventListener('click', () => void this.applyOccurrences());
  }

  private buildCard(container: HTMLElement, occ: Occurrence, rule: MappingRule): void {
    const card = container.createDiv('pseudobs-occ-card');

    const srcLine = card.createDiv();
    srcLine.addClass('pseudobs-occ-line');
    srcLine.createSpan({ text: occ.contextBefore, cls: 'pseudobs-ctx-side' });
    srcLine.createSpan({ text: occ.text, cls: 'pseudobs-occ-term' });
    srcLine.createSpan({ text: occ.contextAfter, cls: 'pseudobs-ctx-side' });

    const arrow = card.createDiv({ text: '↓' });
    arrow.addClass('pseudobs-occ-arrow');

    const resLine = card.createDiv();
    resLine.addClass('pseudobs-occ-line', 'pseudobs-occ-result-line');
    resLine.createSpan({ text: occ.contextBefore, cls: 'pseudobs-ctx-side' });
    resLine.createSpan({ text: rule.replacement, cls: 'pseudobs-occ-replacement' });
    resLine.createSpan({ text: occ.contextAfter, cls: 'pseudobs-ctx-side' });

    const statusLabel = card.createDiv();
    statusLabel.addClass('pseudobs-occ-status-label');

    card.createEl('small', { text: `ligne ${occ.line}`, cls: 'pseudobs-occ-meta' });

    const actions = card.createDiv('pseudobs-occ-actions');
    const btnRefs = new Map<Decision, HTMLElement>();
    for (const [label, value, title] of [
      ['✓', 'validated',     'Valider'],
      ['✗', 'ignored',       'Ignorer'],
      ['⚠', 'false_positive','Faux positif'],
    ] as [string, Decision, string][]) {
      const btn = actions.createEl('button', { text: label });
      btn.title = title;
      btn.addClass('pseudobs-occ-btn');
      btn.addEventListener('click', () => {
        this.occDecisions.set(occ.id, value);
        this.updateCard(occ.id);
      });
      btnRefs.set(value, btn);
    }

    this.occCardRefs.set(occ.id, { card, buttons: btnRefs, arrow, resLine, statusLabel });
    this.updateCard(occ.id);
  }

  private updateCard(occId: string): void {
    const ref = this.occCardRefs.get(occId);
    if (!ref) return;
    const decision = this.occDecisions.get(occId) ?? 'validated';

    ref.card.removeClass('pseudobs-occ-validated', 'pseudobs-occ-ignored', 'pseudobs-occ-false_positive');
    ref.card.addClass(`pseudobs-occ-${decision}`);

    for (const [value, btn] of ref.buttons) {
      btn.toggleClass('pseudobs-occ-btn-active', value === decision);
    }

    const show = decision === 'validated';
    ref.arrow.toggle(show);
    ref.resLine.toggle(show);
    ref.statusLabel.toggle(!show);

    const labels: Record<Decision, string> = {
      validated:      '',
      ignored:        'Conservé tel quel',
      false_positive: 'Faux positif — exclu',
    };
    ref.statusLabel.setText(labels[decision]);
  }

  private async applyOccurrences(): Promise<void> {
    if (!this.occFile) return;

    const s = this.plugin.settings;
    const wrap = (r: string) => s.useMarkerInExport
      ? `${s.markerOpen}${r}${s.markerClose}`
      : r;

    const validated = this.occurrences.filter((o) => this.occDecisions.get(o.id) === 'validated');
    const spans: ReplacementSpan[] = validated.map((occ) => {
      const rule = this.occRules.find((r) => r.id === occ.mappingId)!;
      return {
        start: occ.start, end: occ.end,
        source: occ.text, replacement: wrap(rule.replacement),
        mappingId: occ.mappingId ?? '', priority: rule.priority,
      };
    });

    const updated = applySpans(this.occContent, resolveSpans(spans));
    await this.app.vault.modify(this.occFile, updated);
    await this.plugin.updateMappingStatuses(
      this.occFile.path, this.occRules, this.occurrences, this.occDecisions
    );

    const nv = validated.length;
    new Notice(`✓ ${nv} remplacement${nv > 1 ? 's' : ''} appliqué${nv > 1 ? 's' : ''}`);

    this.occScanned = false;
    void this.plugin.refreshHighlightData();
    await this.renderTab('occurrences');
  }

  // ---- Onglet Mappings -------------------------------------------

  private async renderMappingsTab(el: HTMLElement): Promise<void> {
    const toolbar = el.createDiv('pseudobs-view-toolbar');
    toolbar
      .createEl('button', { text: 'Ajouter une règle', cls: 'pseudobs-view-add-btn' })
      .addEventListener('click', () => new RuleModal(this.app, this.plugin).open());

    const file = this.getFile();
    if (!file) {
      el.createEl('p', { text: 'Aucun fichier actif.', cls: 'pseudobs-view-hint' });
      return;
    }

    const locations = await this.plugin.scopeResolver.getRulesWithLocation(file.path);

    if (locations.length === 0) {
      el.createEl('p', { text: `Aucune règle pour ${file.name}.`, cls: 'pseudobs-view-hint' });
      return;
    }

    const table = el.createEl('table', { cls: 'pseudobs-mappings-table' });
    const headerRow = table.createEl('thead').createEl('tr');
    for (const col of ['Source', 'Remplacement', 'Catégorie', 'Portée', 'P.', 'Statut', '']) {
      headerRow.createEl('th', { text: col });
    }

    const tbody = table.createEl('tbody');
    for (const loc of locations) {
      const { rule } = loc;
      const row = tbody.createEl('tr');
      row.createEl('td', { text: rule.source,      cls: 'pseudobs-mappings-source' });
      row.createEl('td', { text: rule.replacement, cls: 'pseudobs-mappings-replacement' });
      row.createEl('td', { text: CATEGORY_LABELS[rule.category] ?? rule.category });
      row.createEl('td', { text: SCOPE_LABELS[rule.scope.type]  ?? rule.scope.type });
      row.createEl('td', { text: String(rule.priority) });
      row.createEl('td', { text: STATUS_LABELS[rule.status]     ?? rule.status });

      const editBtn = row.createEl('td').createEl('button', {
        text: '✎',
        cls: 'pseudobs-mappings-edit-btn',
      });
      editBtn.title = 'Modifier';
      editBtn.addEventListener('click', () => new EditRuleModal(this.app, this.plugin, loc).open());
    }
  }

  // ---- Onglet Dictionnaires --------------------------------------

  private renderDictionariesTab(el: HTMLElement): void {
    el.createEl('p', {
      text: 'La gestion avancée des dictionnaires (détection NER, listes de lieux et d\'institutions) sera disponible en Phase 9.',
      cls: 'pseudobs-view-hint',
    });
    el.createEl('p', {
      text: 'Utilisez l\'outil Coulmont via le menu contextuel (clic droit sur un prénom dans la transcription).',
      cls: 'pseudobs-view-hint',
    });
  }

  // ---- Onglet Exports --------------------------------------------

  private renderExportsTab(el: HTMLElement): void {
    const file = this.getFile();

    if (!file) {
      el.createEl('p', { text: 'Aucun fichier actif.', cls: 'pseudobs-view-hint' });
      return;
    }

    el.createEl('p', { text: `Fichier actif : ${file.name}`, cls: 'pseudobs-view-filename' });

    new Setting(el)
      .setName('Pseudonymiser et exporter')
      .setDesc('Génère un fichier .pseudonymized.[ext] dans le dossier d\'exports configuré')
      .addButton((btn) =>
        btn.setButtonText('Exporter').setCta().onClick(() => {
          void this.plugin.pseudonymizeActiveFile();
        })
      );

    new Setting(el)
      .setName('Exporter la table de correspondance')
      .setDesc('Copie le mapping JSON dans le dossier d\'exports')
      .addButton((btn) =>
        btn.setButtonText('Exporter le mapping').onClick(() => {
          void this.plugin.exportMappingForFile(file);
        })
      );
  }

  // ---- Onglet NER ---------------------------------------------------

  private async renderNerTab(el: HTMLElement): Promise<void> {
    const s = this.plugin.settings;

    el.createEl('p', {
      text: 'Paramètres du scanner de détection automatique des entités nommées.',
      cls: 'pseudobs-view-hint',
    });

    // --- Seuil de confiance ---
    const scoreSection = el.createDiv('pseudobs-ner-section');
    scoreSection.createEl('strong', { text: 'Seuil de confiance' });
    scoreSection.createEl('p', {
      text: 'Les entités dont le score est inférieur à cette valeur sont ignorées. Plus la valeur est haute, moins de faux positifs mais aussi moins de détections.',
      cls: 'pseudobs-view-hint',
    });

    const scoreRow = scoreSection.createDiv('pseudobs-ner-score-row');
    const scoreDisplay = scoreRow.createEl('span', {
      text: s.nerMinScore.toFixed(2),
      cls: 'pseudobs-ner-score-display',
    });
    const slider = scoreRow.createEl('input');
    slider.type = 'range';
    slider.min = '0.5';
    slider.max = '1';
    slider.step = '0.01';
    slider.value = String(s.nerMinScore);
    slider.addClass('pseudobs-ner-slider');
    slider.addEventListener('input', () => {
      scoreDisplay.setText(parseFloat(slider.value).toFixed(2));
    });
    slider.addEventListener('change', () => {
      this.plugin.settings.nerMinScore = parseFloat(slider.value);
      void this.plugin.saveSettings();
    });

    // --- Mots fonctionnels ---
    const fwSection = el.createDiv('pseudobs-ner-section');
    fwSection.createEl('strong', { text: 'Mots fonctionnels exclus' });
    fwSection.createEl('p', {
      text: 'Un mot par ligne. Ces termes ne seront jamais retenus comme entités nommées, même si le modèle les détecte (artefacts de tokenisation).',
      cls: 'pseudobs-view-hint',
    });

    const textarea = fwSection.createEl('textarea');
    textarea.addClass('pseudobs-ner-fw-textarea');
    textarea.value = s.nerFunctionWords.join('\n');
    textarea.rows = 10;
    textarea.spellcheck = false;

    const saveBtn = fwSection.createEl('button', {
      text: 'Enregistrer',
      cls: 'pseudobs-view-action-btn',
    });
    saveBtn.addEventListener('click', () => { void (async () => {
      const words = textarea.value
        .split('\n')
        .map((w) => w.trim())
        .filter((w) => w.length > 0);
      this.plugin.settings.nerFunctionWords = words;
      await this.plugin.saveSettings();
      saveBtn.addClass('pseudobs-btn-saved');
      saveBtn.setText('Enregistré');
      window.setTimeout(() => { saveBtn.removeClass('pseudobs-btn-saved'); saveBtn.setText('Enregistrer'); }, 2000);
    })(); });

    const resetBtn = fwSection.createEl('button', {
      text: 'Réinitialiser par défaut',
      cls: 'pseudobs-view-action-btn',
    });
    resetBtn.addClass('pseudobs-ner-reset-btn');
    resetBtn.addEventListener('click', () => { void (async () => {
      const { DEFAULT_SETTINGS } = await import('../settings');
      this.plugin.settings.nerFunctionWords = [...DEFAULT_SETTINGS.nerFunctionWords];
      await this.plugin.saveSettings();
      textarea.value = this.plugin.settings.nerFunctionWords.join('\n');
    })(); });
  }

  onClose(): Promise<void> {
    return Promise.resolve();
  }
}
