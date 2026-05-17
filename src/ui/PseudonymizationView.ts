import { ItemView, Notice, Setting, TFile, WorkspaceLeaf, setIcon } from 'obsidian';
import { t } from '../i18n';
import type { DictionaryFile } from '../types';
import type PseudObsPlugin from '../main';
import { scanOccurrences } from '../scanner/OccurrenceScanner';
import { EditRuleModal } from './EditRuleModal';
import { RuleModal } from './RuleModal';
import { MappingScanReviewModal } from './MappingScanReviewModal';
import type { MappingRuleResult } from './MappingScanReviewModal';

export const VIEW_TYPE_PSEUDOBS = 'pseudonymization-view';

type Tab = 'mappings' | 'dictionaries' | 'exports' | 'ner';

function categoryLabel(cat: string): string { return t(`category.${cat}`) || cat; }
function scopeLabel(s: string): string { return t(`scope.${s}`) || s; }
function statusLabel(s: string): string { return t(`status.${s}`) || s; }

export class PseudonymizationView extends ItemView {
  private plugin: PseudObsPlugin;
  private activeTab: Tab = 'mappings';
  private panes!: Record<Tab, HTMLElement>;
  private tabBtns!: Record<Tab, HTMLElement>;

  // Dernier fichier markdown connu (survit au focus du panneau)
  private lastFile: TFile | null = null;
  // IDs des dictionnaires cochés pour le scan groupé (tous cochés par défaut)
  private checkedDicts = new Set<string>();
  // Onglet Mappings : filtrer sur le fichier actif (coché par défaut)
  private mappingsFilterActive = true;
  // Garde contre la réentrance de onFileChange (le panneau lui-même peut devenir feuille active)
  private _renderingTab = false;

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
      ['mappings',      t('panel.tab.mappings')],
      ['dictionaries',  t('panel.tab.dictionaries')],
      ['exports',       t('panel.tab.exports')],
    ];
    if (this.plugin.settings.nerBackend !== 'none') {
      tabs.push(['ner', t('panel.tab.ner')]);
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

    await this.switchTab('mappings');
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

  /** Appelé par le plugin pour forcer un re-rendu de l'onglet actif. */
  async refreshActiveTab(): Promise<void> {
    if (!this._renderingTab) await this.renderTab(this.activeTab);
  }

  private async renderTab(tab: Tab): Promise<void> {
    const pane = this.panes[tab];
    pane.empty();
    if (tab === 'mappings')           await this.renderMappingsTab(pane);
    else if (tab === 'dictionaries')  await this.renderDictionariesTab(pane);
    else if (tab === 'ner')           await this.renderNerTab(pane);
    else                              this.renderExportsTab(pane);
  }

  private async onFileChange(): Promise<void> {
    // Le panneau lui-même peut devenir la feuille active sans changement de fichier
    // → éviter une boucle render ↔ active-leaf-change
    if (this._renderingTab) return;
    if (this.app.workspace.getActiveViewOfType(ItemView) === this) return;

    const f = this.app.workspace.getActiveFile();
    if (f) this.lastFile = f;

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

  // ---- Onglet Mappings -------------------------------------------

  private async renderMappingsTab(el: HTMLElement): Promise<void> {
    const file = this.getFile();

    // ---- Toolbar ----
    const toolbar = el.createDiv('pseudobs-view-toolbar');

    const addRuleBtn = toolbar.createEl('button', { cls: 'pseudobs-view-action-btn' });
    setIcon(addRuleBtn, 'list-plus');
    addRuleBtn.createSpan({ text: t('panel.mappings.addRule') });
    addRuleBtn.addEventListener('click', () => new RuleModal(this.app, this.plugin).open());

    const scanBtn = toolbar.createEl('button', { cls: 'pseudobs-view-action-btn' });
    setIcon(scanBtn, 'scan-search');
    scanBtn.createSpan({ text: t('panel.mappings.scanFile') });
    if (!file) scanBtn.setAttr('disabled', 'true');
    scanBtn.addEventListener('click', () => { void (async () => {
      if (!file) return;
      scanBtn.setAttr('disabled', 'true');
      scanBtn.querySelector('span')?.setText(t('panel.mappings.scanning'));
      try {
        const content = await this.app.vault.read(file);
        const rules = await this.plugin.scopeResolver.getRulesFor(file.path);
        if (rules.length === 0) { new Notice(t('panel.mappings.noRulesHint')); return; }
        const occs = scanOccurrences(content, file.path, rules, {
          caseSensitive: this.plugin.settings.caseSensitive,
          wholeWordOnly: this.plugin.settings.wholeWordOnly,
        });
        const occsByRule = new Map<string, typeof occs>();
        for (const occ of occs) {
          const id = occ.mappingId ?? '';
          if (!occsByRule.has(id)) occsByRule.set(id, []);
          occsByRule.get(id)!.push(occ);
        }
        const ruleResults: MappingRuleResult[] = rules
          .filter((r) => occsByRule.has(r.id))
          .map((r) => ({
            rule: r,
            matchCount: occsByRule.get(r.id)!.length,
            occurrences: occsByRule.get(r.id)!,
          }));
        if (ruleResults.length === 0) { new Notice(t('notice.noOccurrences')); return; }
        new MappingScanReviewModal(this.app, this.plugin, file, content, ruleResults).open();
      } finally {
        scanBtn.removeAttribute('disabled');
        scanBtn.querySelector('span')?.setText(t('panel.mappings.scanFile'));
      }
    })(); });

    // ---- Checkbox filtre fichier actif ----
    const filterRow = el.createDiv('pseudobs-mappings-filter-row');
    const cb = filterRow.createEl('input');
    cb.type = 'checkbox';
    cb.checked = this.mappingsFilterActive;
    cb.addClass('pseudobs-dict-review-cb');
    filterRow.createEl('label', { text: t('panel.mappings.filterActive') });
    cb.addEventListener('change', () => {
      this.mappingsFilterActive = cb.checked;
      void this.renderTab('mappings');
    });

    if (!file && this.mappingsFilterActive) {
      el.createEl('p', { text: t('panel.mappings.noFile'), cls: 'pseudobs-view-hint' });
      return;
    }

    // ---- Chargement des règles ----
    const locations = this.mappingsFilterActive && file
      ? await this.plugin.scopeResolver.getRulesWithLocation(file.path)
      : await this.plugin.scopeResolver.getAllRulesWithLocation();

    if (locations.length === 0) {
      el.createEl('p', {
        text: this.mappingsFilterActive && file
          ? t('panel.mappings.noRules', file.name)
          : t('panel.mappings.noRules', '—'),
        cls: 'pseudobs-view-hint',
      });
      return;
    }

    // ---- Grouper par portée ----
    const byScope: Record<string, typeof locations> = { file: [], folder: [], vault: [] };
    for (const loc of locations) {
      const s = loc.rule.scope.type;
      (byScope[s] ??= []).push(loc);
    }

    const scopeOrder: Array<'file' | 'folder' | 'vault'> = ['file', 'folder', 'vault'];
    const cols = [
      t('panel.mappings.col.source'), t('panel.mappings.col.replacement'),
      t('panel.mappings.col.category'), t('panel.mappings.col.priority'),
      t('panel.mappings.col.status'), '',
    ];

    for (const scopeType of scopeOrder) {
      const locs = byScope[scopeType];
      if (!locs || locs.length === 0) continue;

      el.createEl('h3', { text: scopeLabel(scopeType), cls: 'pseudobs-mappings-scope-heading' });

      const table = el.createEl('table', { cls: 'pseudobs-mappings-table' });
      const headerRow = table.createEl('thead').createEl('tr');
      for (const col of cols) headerRow.createEl('th', { text: col });

      const tbody = table.createEl('tbody');
      for (const loc of locs) {
        const { rule } = loc;
        const row = tbody.createEl('tr');
        row.createEl('td', { text: rule.source,      cls: 'pseudobs-mappings-source' });
        row.createEl('td', { text: rule.replacement, cls: 'pseudobs-mappings-replacement' });
        row.createEl('td', { text: categoryLabel(rule.category) });
        row.createEl('td', { text: String(rule.priority) });
        row.createEl('td', { text: statusLabel(rule.status) });

        const editBtn = row.createEl('td').createEl('button', { cls: 'pseudobs-mappings-edit-btn' });
        setIcon(editBtn, 'pencil');
        editBtn.addEventListener('click', () => new EditRuleModal(this.app, this.plugin, loc).open());
      }
    }

    // ---- Section Exceptions ----
    const allIgnored = locations.flatMap(({ rule, store, filePath }) =>
      (rule.ignoredOccurrences ?? []).map((occ) => ({ occ, rule, store, filePath }))
    );

    if (allIgnored.length > 0) {
      el.createEl('h3', { text: t('panel.mappings.exceptions'), cls: 'pseudobs-mappings-scope-heading' });
      el.createEl('p', { text: t('panel.mappings.exceptions.hint'), cls: 'pseudobs-view-hint' });

      const exceptionsGrid = el.createDiv('pseudobs-exceptions-grid');

      for (const { occ, rule, store, filePath } of allIgnored) {
        const card = exceptionsGrid.createDiv('pseudobs-exception-card');

        // En-tête : règle concernée
        card.createEl('div', {
          text: `${rule.source} → ${rule.replacement}`,
          cls: 'pseudobs-exception-card-rule',
        });

        // Contexte
        const ctx = card.createDiv('pseudobs-exception-card-ctx');
        ctx.createSpan({ text: occ.contextBefore, cls: 'pseudobs-ctx-side' });
        ctx.createSpan({ text: occ.text, cls: 'pseudobs-exception-card-term' });
        ctx.createSpan({ text: occ.contextAfter, cls: 'pseudobs-ctx-side' });

        // Bouton supprimer
        const delBtn = card.createEl('button', { cls: 'pseudobs-exception-card-del' });
        setIcon(delBtn, 'x');
        delBtn.title = 'Supprimer cette exception';
        delBtn.addEventListener('click', async () => {
          const updated = (rule.ignoredOccurrences ?? []).filter((o) => o.text !== occ.text);
          store.update(rule.id, { ignoredOccurrences: updated });
          await this.plugin.scopeResolver.saveStore(store, filePath);
          void this.plugin.refresh();
          void this.renderTab('mappings');
        });
      }
    }
  }

  // ---- Onglet Dictionnaires --------------------------------------

  private async renderDictionariesTab(el: HTMLElement): Promise<void> {
    const dicts = this.plugin.dictionaryLoader.getAll();

    // Initialiser checkedDicts avec tous les IDs au premier rendu
    if (this.checkedDicts.size === 0 && dicts.length > 0) {
      dicts.forEach((d) => this.checkedDicts.add(d.dictionaryId));
    }

    if (dicts.length === 0) {
      el.createEl('p', { text: t('panel.dict.noneInstalled'), cls: 'pseudobs-view-hint' });
    } else {
      for (const dict of dicts) {
        const card = el.createDiv('pseudobs-dict-card');

        const checkbox = card.createEl('input');
        checkbox.type = 'checkbox';
        checkbox.checked = this.checkedDicts.has(dict.dictionaryId);
        checkbox.addClass('pseudobs-dict-card-checkbox');
        checkbox.title = t('panel.dict.checkbox');
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) this.checkedDicts.add(dict.dictionaryId);
          else this.checkedDicts.delete(dict.dictionaryId);
        });

        const info = card.createDiv('pseudobs-dict-card-info');
        info.createEl('strong', { text: dict.label, cls: 'pseudobs-dict-card-title' });
        info.createEl('small', { text: `${dict.dictionaryId}.dict.json`, cls: 'pseudobs-dict-card-filename' });

        if (dict.roles?.detection) {
          const scanBtn = card.createEl('button', { cls: 'pseudobs-dict-card-scan mod-cta' });
          setIcon(scanBtn, 'scan-search');
          scanBtn.setAttribute('aria-label', t('panel.dict.scanWith', dict.label));
          scanBtn.title = t('panel.dict.scanWith', dict.label);
          scanBtn.addEventListener('click', () => {
            void this.plugin.scanCurrentFileWithDictionaries([dict.dictionaryId]);
          });
        }

        const removeBtn = card.createEl('button', { cls: 'pseudobs-dict-card-remove' });
        setIcon(removeBtn, 'trash-2');
        removeBtn.setAttribute('aria-label', t('panel.dict.remove'));
        removeBtn.title = t('panel.dict.remove');
        removeBtn.addEventListener('click', () => { void (async () => {
          const f = this.app.vault.getAbstractFileByPath(
            `${this.plugin.settings.dictionariesFolder}/${dict.dictionaryId}.dict.json`
          );
          if (f instanceof TFile) await this.app.fileManager.trashFile(f);
          this.checkedDicts.delete(dict.dictionaryId);
          await this.plugin.dictionaryLoader.load();
          await this.renderTab('dictionaries');
        })(); });
      }

      el.createEl('hr');
      const groupScanBtn = el.createEl('button', { cls: 'pseudobs-dict-group-scan mod-cta' });
      setIcon(groupScanBtn, 'scan-search');
      groupScanBtn.createSpan({ text: t('panel.dict.scanAll') });
      groupScanBtn.addEventListener('click', () => {
        const ids = [...this.checkedDicts];
        if (ids.length === 0) { new Notice(t('notice.noCheckedDicts')); return; }
        void this.plugin.scanCurrentFileWithDictionaries(ids);
      });
    }

    el.createEl('hr');
    const importBtn = el.createEl('button', {
      text: t('panel.dict.importLocal'),
      cls: 'pseudobs-view-add-btn',
    });
    importBtn.addEventListener('click', () => {
      const input = activeDocument.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.multiple = true;
      input.classList.add('pseudobs-hidden-input');
      activeDocument.body.appendChild(input);
      input.addEventListener('change', () => { void (async () => {
        const files = Array.from(input.files ?? []);
        input.remove();
        if (files.length === 0) return;
        await this.plugin.ensureFolder(this.plugin.settings.dictionariesFolder);
        let ok = 0;
        for (const f of files) {
          try {
            const text = await f.text();
            const parsed = JSON.parse(text) as DictionaryFile;
            if (!parsed.entries || !Array.isArray(parsed.entries)) throw new Error('Format invalide');
            const dest = `${this.plugin.settings.dictionariesFolder}/${f.name}`;
            const existing = this.app.vault.getAbstractFileByPath(dest);
            if (existing instanceof TFile) {
              await this.app.vault.modify(existing, text);
            } else {
              await this.app.vault.create(dest, text);
            }
            ok++;
          } catch { new Notice(t('notice.invalidFormat', f.name)); }
        }
        if (ok > 0) {
          new Notice(t('notice.dictImported', String(ok), ok > 1 ? t('notice.dictImported.many') : t('notice.dictImported.one')));
          await this.plugin.dictionaryLoader.load();
        }
        await this.renderTab('dictionaries');
      })(); });
      input.click();
    });
  }

  // ---- Onglet Exports --------------------------------------------

  private renderExportsTab(el: HTMLElement): void {
    const file = this.getFile();

    if (!file) {
      el.createEl('p', { text: t('panel.mappings.noFile'), cls: 'pseudobs-view-hint' });
      return;
    }

    el.createEl('p', { text: `${file.name}`, cls: 'pseudobs-view-filename' });

    new Setting(el)
      .setName(t('panel.exports.pseudonymize'))
      .addButton((btn) =>
        btn.setButtonText(t('panel.exports.pseudonymize')).setCta().onClick(() => {
          void this.plugin.pseudonymizeActiveFile();
        })
      );

    new Setting(el)
      .setName(t('panel.exports.exportMapping'))
      .addButton((btn) =>
        btn.setButtonText(t('panel.exports.exportMapping')).onClick(() => {
          void this.plugin.exportMappingForFile(file);
        })
      );
  }

  // ---- Onglet NER ---------------------------------------------------

  private async renderNerTab(el: HTMLElement): Promise<void> {
    const s = this.plugin.settings;

    const nerScanBtn = el.createEl('button', { cls: 'pseudobs-view-action-btn mod-cta' });
    const nerScanIcon = nerScanBtn.createSpan();
    setIcon(nerScanIcon, 'scan-search');
    nerScanBtn.createSpan({ text: ` ${t('panel.ner.scanBtn')}` });
    nerScanBtn.title = t('panel.ner.scanBtn');
    nerScanBtn.addEventListener('click', () => { void (async () => {
      nerScanBtn.setAttr('disabled', 'true');
      setIcon(nerScanIcon, 'loader-circle');
      nerScanIcon.addClass('pseudobs-spin');
      try {
        await this.plugin.scanCurrentFileNer();
      } finally {
        nerScanBtn.removeAttribute('disabled');
        setIcon(nerScanIcon, 'scan-search');
        nerScanIcon.removeClass('pseudobs-spin');
      }
    })(); });

    el.createEl('hr');

    el.createEl('p', { text: t('panel.ner.hint'), cls: 'pseudobs-view-hint' });

    const scoreSection = el.createDiv('pseudobs-ner-section');
    scoreSection.createEl('strong', { text: t('panel.ner.threshold') });
    scoreSection.createEl('p', { text: t('panel.ner.thresholdDesc'), cls: 'pseudobs-view-hint' });

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

    const fwSection = el.createDiv('pseudobs-ner-section');
    fwSection.createEl('strong', { text: t('panel.ner.functionWords') });
    fwSection.createEl('p', { text: t('panel.ner.functionWordsDesc'), cls: 'pseudobs-view-hint' });

    const textarea = fwSection.createEl('textarea');
    textarea.addClass('pseudobs-ner-fw-textarea');
    textarea.value = s.nerFunctionWords.join('\n');
    textarea.rows = 10;
    textarea.spellcheck = false;

    const saveBtn = fwSection.createEl('button', {
      text: t('panel.ner.save'),
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
      saveBtn.setText(t('panel.ner.saved'));
      window.setTimeout(() => { saveBtn.removeClass('pseudobs-btn-saved'); saveBtn.setText(t('panel.ner.save')); }, 2000);
    })(); });

    const resetBtn = fwSection.createEl('button', { cls: 'pseudobs-view-action-btn' });
    setIcon(resetBtn, 'rotate-ccw');
    resetBtn.createSpan({ text: t('panel.ner.reset') });
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
