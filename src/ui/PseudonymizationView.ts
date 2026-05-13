import { ItemView, Notice, Setting, TFile, WorkspaceLeaf, setIcon } from 'obsidian';
import type { DictionaryFile } from '../types';
import type PseudObsPlugin from '../main';
import { scanOccurrences } from '../scanner/OccurrenceScanner';
import { EditRuleModal } from './EditRuleModal';
import { RuleModal } from './RuleModal';
import { MappingScanReviewModal } from './MappingScanReviewModal';
import type { MappingRuleResult } from './MappingScanReviewModal';

export const VIEW_TYPE_PSEUDOBS = 'pseudonymization-view';

type Tab = 'mappings' | 'dictionaries' | 'exports' | 'ner';

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
  private activeTab: Tab = 'mappings';
  private panes!: Record<Tab, HTMLElement>;
  private tabBtns!: Record<Tab, HTMLElement>;

  // Dernier fichier markdown connu (survit au focus du panneau)
  private lastFile: TFile | null = null;
  // IDs des dictionnaires cochés pour le scan groupé (tous cochés par défaut)
  private checkedDicts = new Set<string>();
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

    const toolbar = el.createDiv('pseudobs-view-toolbar');
    // Bouton ajouter règle
    const addRuleBtn = toolbar.createEl('button', { cls: 'pseudobs-view-action-btn' });
    setIcon(addRuleBtn, 'list-plus');
    addRuleBtn.createSpan({ text: 'Ajouter une règle' });
    addRuleBtn.addEventListener('click', () => new RuleModal(this.app, this.plugin).open());
    
    // Bouton scan — ouvre MappingScanReviewModal
    const scanBtn = toolbar.createEl('button', { cls: 'pseudobs-view-action-btn' });
    setIcon(scanBtn, 'scan-search');
    scanBtn.createSpan({ text: 'Scanner le fichier' });
    if (!file) scanBtn.setAttr('disabled', 'true');
    scanBtn.addEventListener('click', () => { void (async () => {
      if (!file) return;
      scanBtn.setAttr('disabled', 'true');
      scanBtn.setText('Scan en cours…');
      try {
        const content = await this.app.vault.read(file);
        const rules = await this.plugin.scopeResolver.getRulesFor(file.path);
        if (rules.length === 0) {
          new Notice('Aucune règle active pour ce fichier. Créez des règles via le menu contextuel.');
          return;
        }
        const occs = scanOccurrences(content, file.path, rules, {
          caseSensitive: this.plugin.settings.caseSensitive,
          wholeWordOnly: this.plugin.settings.wholeWordOnly,
        });
        // Grouper par règle
        const countByRule = new Map<string, number>();
        for (const occ of occs) {
          const id = occ.mappingId ?? '';
          countByRule.set(id, (countByRule.get(id) ?? 0) + 1);
        }
        const ruleResults: MappingRuleResult[] = rules
          .filter((r) => countByRule.has(r.id))
          .map((r) => ({ rule: r, matchCount: countByRule.get(r.id)! }));
        if (ruleResults.length === 0) {
          new Notice('Aucune occurrence trouvée pour les règles actives.');
          return;
        }
        new MappingScanReviewModal(this.app, this.plugin, file, content, ruleResults).open();
      } finally {
        scanBtn.removeAttribute('disabled');
        scanBtn.setText('Scanner le fichier');
      }
    })(); });

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

      const editBtn = row.createEl('td').createEl('button', { cls: 'pseudobs-mappings-edit-btn' });
      setIcon(editBtn, "pencil");
      editBtn.title = 'Modifier';
      editBtn.addEventListener('click', () => new EditRuleModal(this.app, this.plugin, loc).open());
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
      el.createEl('p', {
        text: 'Aucun dictionnaire installé. Installez-en un depuis le wizard (Paramètres → Reconfigurer) ou importez un fichier local.',
        cls: 'pseudobs-view-hint',
      });
    } else {
      // Mini cards
      for (const dict of dicts) {
        const card = el.createDiv('pseudobs-dict-card');

        // Checkbox scan groupé
        const checkbox = card.createEl('input');
        checkbox.type = 'checkbox';
        checkbox.checked = this.checkedDicts.has(dict.dictionaryId);
        checkbox.addClass('pseudobs-dict-card-checkbox');
        checkbox.title = 'Inclure dans le scan groupé';
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) this.checkedDicts.add(dict.dictionaryId);
          else this.checkedDicts.delete(dict.dictionaryId);
        });

        // Infos
        const info = card.createDiv('pseudobs-dict-card-info');
        info.createEl('strong', { text: dict.label, cls: 'pseudobs-dict-card-title' });
        info.createEl('small', { text: `${dict.dictionaryId}.dict.json`, cls: 'pseudobs-dict-card-filename' });

        // Bouton scan individuel
        if (dict.roles?.detection) {
          const scanBtn = card.createEl('button', { cls: 'pseudobs-dict-card-scan mod-cta' });
          setIcon(scanBtn, 'scan-search');
          scanBtn.setAttribute('aria-label', `Scanner avec ${dict.label}`);
          scanBtn.title = `Scanner le fichier actif avec "${dict.label}"`;
          scanBtn.addEventListener('click', () => {
            void this.plugin.scanCurrentFileWithDictionaries([dict.dictionaryId]);
          });
        }

        // Bouton suppression
        const removeBtn = card.createEl('button', { cls: 'pseudobs-dict-card-remove' });
        setIcon(removeBtn, 'trash-2');
        removeBtn.setAttribute('aria-label', 'Supprimer ce dictionnaire');
        removeBtn.title = 'Supprimer ce dictionnaire du vault';
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

      // Bouton scan groupé
      el.createEl('hr');
      const groupScanBtn = el.createEl('button', { cls: 'pseudobs-dict-group-scan mod-cta' });
      setIcon(groupScanBtn, 'scan-search');
      groupScanBtn.createSpan({ text: 'Scanner les dictionnaires cochés' });
      groupScanBtn.addEventListener('click', () => {
        const ids = [...this.checkedDicts];
        if (ids.length === 0) { new Notice('Aucun dictionnaire coché.'); return; }
        void this.plugin.scanCurrentFileWithDictionaries(ids);
      });
    }

    // Import manuel
    el.createEl('hr');
    const importBtn = el.createEl('button', {
      text: 'Importer un fichier local (.dict.json)',
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
          } catch { new Notice(`Format invalide : ${f.name}`); }
        }
        if (ok > 0) {
          new Notice(`✓ ${ok} dictionnaire${ok > 1 ? 's' : ''} importé${ok > 1 ? 's' : ''}`);
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

    // Bouton scan NER
    const nerScanBtn = el.createEl('button', { cls: 'pseudobs-view-action-btn mod-cta' });
    setIcon(nerScanBtn, 'scan-search');
    nerScanBtn.createSpan({ text: 'Identifier des candidats' });
    nerScanBtn.title = 'Détecter les entités nommées dans le fichier actif et les surligner en bleu';
    nerScanBtn.addEventListener('click', () => void this.plugin.scanCurrentFileNer());

    el.createEl('hr');

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

    const resetBtn = fwSection.createEl('button', { cls: 'pseudobs-view-action-btn' });
    setIcon(resetBtn, 'rotate-ccw');
    resetBtn.createSpan({ text: 'Réinitialiser par défaut' });
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
