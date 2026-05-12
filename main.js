"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => PseudObsPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian7 = require("obsidian");

// src/settings.ts
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  transcriptionsFolder: "Transcriptions",
  mappingFolder: "_pseudonymisation/mappings",
  dictionariesFolder: "_pseudonymisation/dictionaries",
  exportsFolder: "_pseudonymisation/exports",
  reportsFolder: "_pseudonymisation/reports",
  caseSensitive: false,
  accentSensitive: false,
  wholeWordOnly: true,
  preserveCase: true,
  preserveAnalyticNotation: true,
  warnIfSyncedFolder: true,
  useMarkerInExport: false,
  markerOpen: "\u27E6",
  markerClose: "\u27E7"
};
var PseudObsSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Dossiers").setHeading();
    new import_obsidian.Setting(containerEl).setName("Transcriptions import\xE9es").setDesc("Dossier de destination des transcriptions import\xE9es").addText(
      (text) => text.setValue(this.plugin.settings.transcriptionsFolder).onChange(async (value) => {
        this.plugin.settings.transcriptionsFolder = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Tables de correspondance").setDesc("Chemin relatif dans le vault").addText(
      (text) => text.setValue(this.plugin.settings.mappingFolder).onChange(async (value) => {
        this.plugin.settings.mappingFolder = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Dictionnaires").setDesc("Chemin relatif dans le vault").addText(
      (text) => text.setValue(this.plugin.settings.dictionariesFolder).onChange(async (value) => {
        this.plugin.settings.dictionariesFolder = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Exports").addText(
      (text) => text.setValue(this.plugin.settings.exportsFolder).onChange(async (value) => {
        this.plugin.settings.exportsFolder = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Remplacement").setHeading();
    new import_obsidian.Setting(containerEl).setName("Sensible \xE0 la casse").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.caseSensitive).onChange(async (value) => {
        this.plugin.settings.caseSensitive = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Sensible aux accents").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.accentSensitive).onChange(async (value) => {
        this.plugin.settings.accentSensitive = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Mots entiers uniquement").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.wholeWordOnly).onChange(async (value) => {
        this.plugin.settings.wholeWordOnly = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Pr\xE9server la casse").setDesc("Adapter la casse du remplacement \xE0 celle de la source (ex. : JEAN \u2192 PIERRE, jean \u2192 pierre, Jean \u2192 Pierre)").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.preserveCase).onChange(async (value) => {
        this.plugin.settings.preserveCase = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Pr\xE9server les notations analytiques").setDesc("Ne jamais remplacer les symboles de convention analytique de type Jefferson ou ICOR").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.preserveAnalyticNotation).onChange(async (value) => {
        this.plugin.settings.preserveAnalyticNotation = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Marqueur d'export").setHeading();
    new import_obsidian.Setting(containerEl).setName("Ajouter un marqueur autour des pseudonymes dans l'export").setDesc("Permet d'identifier visuellement les termes pseudonymis\xE9s dans le fichier export\xE9").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.useMarkerInExport).onChange(async (value) => {
        this.plugin.settings.useMarkerInExport = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Marqueur ouvrant").setDesc("Exemple : \u27E6  [  {  \xAB").addText(
      (text) => text.setValue(this.plugin.settings.markerOpen).onChange(async (value) => {
        this.plugin.settings.markerOpen = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Marqueur fermant").setDesc("Exemple : \u27E7  ]  }  \xBB").addText(
      (text) => text.setValue(this.plugin.settings.markerClose).onChange(async (value) => {
        this.plugin.settings.markerClose = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("S\xE9curit\xE9").setHeading();
    new import_obsidian.Setting(containerEl).setName("Avertir si le dossier est synchronis\xE9").setDesc("Alerter si les tables de correspondance sont dans un dossier Git, iCloud ou Synology Drive").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.warnIfSyncedFolder).onChange(async (value) => {
        this.plugin.settings.warnIfSyncedFolder = value;
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/ui/RuleModal.ts
var import_obsidian2 = require("obsidian");

// src/mappings/MappingStore.ts
function generateId() {
  return `map_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
var DEFAULT_FILE_SETTINGS = {
  caseSensitive: false,
  accentSensitive: false,
  wholeWordOnly: true,
  preserveCase: true,
  preserveGender: true,
  preserveAnalyticNotation: true
};
var MappingStore = class _MappingStore {
  constructor(scope, project, settings) {
    this.rules = /* @__PURE__ */ new Map();
    this.scope = scope;
    this.project = project;
    this.createdAt = (/* @__PURE__ */ new Date()).toISOString();
    this.updatedAt = this.createdAt;
    this.fileSettings = { ...DEFAULT_FILE_SETTINGS, ...settings };
  }
  add(partial) {
    const rule = {
      ...partial,
      id: generateId(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.rules.set(rule.id, rule);
    this.touch();
    return rule;
  }
  get(id) {
    return this.rules.get(id);
  }
  update(id, changes) {
    const rule = this.rules.get(id);
    if (!rule)
      return false;
    this.rules.set(id, { ...rule, ...changes, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    this.touch();
    return true;
  }
  remove(id) {
    const deleted = this.rules.delete(id);
    if (deleted)
      this.touch();
    return deleted;
  }
  getAll() {
    return Array.from(this.rules.values());
  }
  // Règles validées applicables à un fichier donné (cascade file → folder → vault)
  getValidatedFor(filePath) {
    return this.getAll().filter((r) => {
      var _a;
      if (r.status !== "validated")
        return false;
      if (r.scope.type === "vault")
        return true;
      if (r.scope.type === "folder")
        return filePath.startsWith((_a = r.scope.path) != null ? _a : "");
      return r.scope.path === filePath;
    });
  }
  get settings() {
    return this.fileSettings;
  }
  toJSON() {
    return {
      schemaVersion: "1.0.0",
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      project: this.project,
      scope: this.scope,
      settings: this.fileSettings,
      mappings: this.getAll()
    };
  }
  static fromJSON(data) {
    const store = new _MappingStore(data.scope, data.project, data.settings);
    for (const rule of data.mappings) {
      store.rules.set(rule.id, rule);
    }
    return store;
  }
  touch() {
    this.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  }
};

// src/ui/RuleModal.ts
var RuleModal = class extends import_obsidian2.Modal {
  constructor(app, plugin, prefillSource = "", prefillReplacement = "", suggestions = []) {
    super(app);
    this.scopeType = "file";
    this.priority = 0;
    this.plugin = plugin;
    this.source = prefillSource;
    this.replacement = prefillReplacement;
    this.suggestions = suggestions;
    this.category = suggestions.length > 0 ? "first_name" : "custom";
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Cr\xE9er une r\xE8gle de remplacement" });
    new import_obsidian2.Setting(contentEl).setName("Source").setDesc("Terme original \xE0 remplacer").addText(
      (t) => t.setValue(this.source).onChange((v) => {
        this.source = v;
      })
    );
    let replacementInput;
    if (this.suggestions.length > 0) {
      const box = contentEl.createDiv();
      box.addClass("pseudobs-suggestions-box");
      box.createEl("small", { text: "Suggestions de pr\xE9noms \xE9quivalents \u2014 choisissez :" }).addClass("pseudobs-suggestions-label");
      const tags = box.createDiv();
      tags.addClass("pseudobs-suggestions-tags");
      const btnEls = [];
      for (const name of this.suggestions) {
        const btn = tags.createEl("button", { text: name });
        btn.addClass("pseudobs-suggestion-btn");
        btn.addEventListener("click", () => {
          this.replacement = name;
          if (replacementInput)
            replacementInput.value = name;
          btnEls.forEach((b) => b.removeClass("pseudobs-suggestion-btn-selected"));
          btn.addClass("pseudobs-suggestion-btn-selected");
        });
        btnEls.push(btn);
      }
    }
    new import_obsidian2.Setting(contentEl).setName("Remplacement").setDesc("Pseudonyme ou cat\xE9gorie analytique").addText((t) => {
      t.setValue(this.replacement).onChange((v) => {
        this.replacement = v;
      });
      replacementInput = t.inputEl;
    });
    new import_obsidian2.Setting(contentEl).setName("Cat\xE9gorie").addDropdown((d) => {
      const options = {
        first_name: "Pr\xE9nom",
        last_name: "Nom de famille",
        full_name: "Nom complet",
        place: "Lieu",
        institution: "Institution",
        date: "Date",
        age: "\xC2ge",
        profession: "Profession",
        custom: "Autre"
      };
      for (const [value, label] of Object.entries(options)) {
        d.addOption(value, label);
      }
      d.setValue(this.category);
      d.onChange((v) => {
        this.category = v;
      });
      if (this.suggestions.length > 0) {
        const settingItem = d.selectEl.closest(".setting-item");
        if (settingItem instanceof HTMLElement)
          settingItem.hide();
      }
    });
    new import_obsidian2.Setting(contentEl).setName("Port\xE9e").addDropdown((d) => {
      d.addOption("file", "Ce fichier uniquement");
      d.addOption("folder", "Ce dossier");
      d.addOption("vault", "Tout le vault");
      d.setValue("file");
      d.onChange((v) => {
        this.scopeType = v;
      });
    });
    new import_obsidian2.Setting(contentEl).setName("Priorit\xE9").setDesc("Entier libre, comme un z-index CSS \u2014 d\xE9faut 0, plus grand = appliqu\xE9 en premier").addText(
      (t) => t.setValue("0").onChange((v) => {
        this.priority = parseInt(v, 10) || 0;
      })
    );
    new import_obsidian2.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("Cr\xE9er la r\xE8gle").setCta().onClick(() => this.createRule())
    );
  }
  async createRule() {
    var _a, _b;
    if (!this.source.trim() || !this.replacement.trim()) {
      new import_obsidian2.Notice("La source et le remplacement sont obligatoires.");
      return;
    }
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new import_obsidian2.Notice("Aucun fichier actif.");
      return;
    }
    const mappingPath = `${this.plugin.settings.mappingFolder}/${activeFile.basename}.mapping.json`;
    let store;
    const mappingFile = this.app.vault.getAbstractFileByPath(mappingPath);
    if (mappingFile instanceof import_obsidian2.TFile) {
      const data = JSON.parse(await this.app.vault.read(mappingFile));
      store = MappingStore.fromJSON(data);
    } else {
      await this.plugin.ensureFolder(this.plugin.settings.mappingFolder);
      store = new MappingStore({ type: "file", path: activeFile.path });
    }
    const scopePath = this.scopeType === "file" ? activeFile.path : this.scopeType === "folder" ? (_b = (_a = activeFile.parent) == null ? void 0 : _a.path) != null ? _b : "" : void 0;
    store.add({
      source: this.source.trim(),
      replacement: this.replacement.trim(),
      category: this.category,
      scope: { type: this.scopeType, path: scopePath },
      status: "validated",
      priority: this.priority,
      createdBy: "user"
    });
    const json = JSON.stringify(store.toJSON(), null, 2);
    if (mappingFile instanceof import_obsidian2.TFile) {
      await this.app.vault.modify(mappingFile, json);
    } else {
      await this.app.vault.create(mappingPath, json);
    }
    new import_obsidian2.Notice(`\u2713 R\xE8gle cr\xE9\xE9e : "${this.source.trim()}" \u2192 "${this.replacement.trim()}"`);
    void this.plugin.refreshHighlightData();
    this.close();
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/ui/QuickPseudonymizeModal.ts
var import_obsidian3 = require("obsidian");
var QuickPseudonymizeModal = class extends import_obsidian3.Modal {
  constructor(app, plugin, editor, prefillReplacement = "", suggestions = []) {
    super(app);
    this.replacement = "";
    this.category = "custom";
    this.applyScope = "file";
    this.plugin = plugin;
    this.editor = editor;
    this.source = editor.getSelection();
    this.replacement = prefillReplacement;
    this.suggestions = suggestions;
    if (suggestions.length > 0)
      this.category = "first_name";
    this.from = editor.getCursor("from");
    this.to = editor.getCursor("to");
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Pseudonymiser" });
    new import_obsidian3.Setting(contentEl).setName("Expression s\xE9lectionn\xE9e").setDesc("Terme \xE0 remplacer \u2014 non modifiable").addText((t) => {
      t.setValue(this.source).setDisabled(true);
      t.inputEl.addClass("pseudobs-disabled-input");
    });
    let replacementInput;
    if (this.suggestions.length > 0) {
      const suggBox = contentEl.createDiv();
      suggBox.addClass("pseudobs-suggestions-box");
      suggBox.createEl("small", { text: "Suggestions de pr\xE9noms \xE9quivalents (m/f non diff\xE9renci\xE9s) :" }).addClass("pseudobs-suggestions-label");
      const tags = suggBox.createDiv();
      tags.addClass("pseudobs-suggestions-tags");
      const btnEls = [];
      for (const name of this.suggestions) {
        const btn = tags.createEl("button", { text: name });
        btn.addClass("pseudobs-suggestion-btn");
        btn.addEventListener("click", () => {
          this.replacement = name;
          if (replacementInput) {
            replacementInput.value = name;
            replacementInput.dispatchEvent(new Event("input"));
          }
          btnEls.forEach((b) => b.removeClass("pseudobs-suggestion-btn-selected"));
          btn.addClass("pseudobs-suggestion-btn-selected");
        });
        btnEls.push(btn);
      }
    }
    new import_obsidian3.Setting(contentEl).setName("Remplacer par").addText((t) => {
      t.setPlaceholder("Pseudonyme ou cat\xE9gorie analytique");
      t.setValue(this.replacement);
      t.onChange((v) => this.replacement = v);
      replacementInput = t.inputEl;
    });
    new import_obsidian3.Setting(contentEl).setName("Cat\xE9gorie").addDropdown((d) => {
      const options = {
        first_name: "Pr\xE9nom",
        last_name: "Nom de famille",
        full_name: "Nom complet",
        place: "Lieu",
        institution: "Institution",
        date: "Date",
        age: "\xC2ge",
        profession: "Profession",
        custom: "Autre"
      };
      for (const [value, label] of Object.entries(options)) {
        d.addOption(value, label);
      }
      d.setValue("custom");
      d.onChange((v) => this.category = v);
    });
    new import_obsidian3.Setting(contentEl).setName("Port\xE9e du remplacement").addDropdown((d) => {
      d.addOption("file", "Toutes les occurrences dans ce fichier");
      d.addOption("occurrence", "Cette occurrence uniquement");
      d.setValue("file");
      d.onChange((v) => this.applyScope = v);
    });
    new import_obsidian3.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("Pseudonymiser").setCta().onClick(() => this.apply())
    );
    setTimeout(() => replacementInput == null ? void 0 : replacementInput.focus(), 50);
  }
  async apply() {
    const replacement = this.replacement.trim();
    if (!replacement) {
      new import_obsidian3.Notice("Le remplacement est obligatoire.");
      return;
    }
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new import_obsidian3.Notice("Aucun fichier actif.");
      return;
    }
    await this.saveRule(activeFile, replacement);
    if (this.applyScope === "occurrence") {
      this.editor.replaceRange(replacement, this.from, this.to);
      new import_obsidian3.Notice(`\u2713 "${this.source}" \u2192 "${replacement}" (cette occurrence)`);
    } else {
      const count = await this.plugin.applyRuleToFile(activeFile, this.source, replacement);
      new import_obsidian3.Notice(`\u2713 "${this.source}" \u2192 "${replacement}" (${count} occurrence${count > 1 ? "s" : ""})`);
    }
    void this.plugin.refreshHighlightData();
    this.close();
  }
  async saveRule(activeFile, replacement) {
    const mappingPath = `${this.plugin.settings.mappingFolder}/${activeFile.basename}.mapping.json`;
    let store;
    const mappingTFile = this.app.vault.getAbstractFileByPath(mappingPath);
    if (mappingTFile instanceof import_obsidian3.TFile) {
      const data = JSON.parse(await this.app.vault.read(mappingTFile));
      store = MappingStore.fromJSON(data);
    } else {
      await this.plugin.ensureFolder(this.plugin.settings.mappingFolder);
      store = new MappingStore({ type: "file", path: activeFile.path });
    }
    store.add({
      source: this.source,
      replacement,
      category: this.category,
      scope: { type: "file", path: activeFile.path },
      status: "validated",
      priority: 0,
      createdBy: "user"
    });
    const json = JSON.stringify(store.toJSON(), null, 2);
    if (mappingTFile instanceof import_obsidian3.TFile) {
      await this.app.vault.modify(mappingTFile, json);
    } else {
      await this.app.vault.create(mappingPath, json);
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/ui/PseudonymHighlighter.ts
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
var highlightDataChanged = import_state.StateEffect.define();
function createPseudonymHighlighter(getData) {
  return import_view.ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = import_view.Decoration.none;
        this.decorations = this.build(view);
      }
      update(update) {
        const dataChanged = update.transactions.some(
          (t) => t.effects.some((e) => e.is(highlightDataChanged))
        );
        if (update.docChanged || update.viewportChanged || dataChanged) {
          this.decorations = this.build(update.view);
        }
      }
      build(view) {
        const { sources, replacements } = getData();
        if (sources.length === 0 && replacements.length === 0)
          return import_view.Decoration.none;
        const text = view.state.doc.toString();
        const lower = text.toLowerCase();
        const spans = [];
        const collect = (terms, cls) => {
          for (const term of terms) {
            if (!term)
              continue;
            const needle = term.toLowerCase();
            let pos = 0;
            while (pos < lower.length) {
              const idx = lower.indexOf(needle, pos);
              if (idx === -1)
                break;
              spans.push({ from: idx, to: idx + term.length, cls });
              pos = idx + term.length;
            }
          }
        };
        collect(sources, "pseudobs-source");
        collect(replacements, "pseudobs-replaced");
        spans.sort((a, b) => a.from - b.from || a.to - b.to);
        const builder = new import_state.RangeSetBuilder();
        let lastTo = -1;
        for (const { from, to, cls } of spans) {
          if (from >= lastTo) {
            builder.add(from, to, import_view.Decoration.mark({ class: cls }));
            lastTo = to;
          }
        }
        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations }
  );
}

// src/ui/EditRuleModal.ts
var import_obsidian4 = require("obsidian");
var EditRuleModal = class extends import_obsidian4.Modal {
  constructor(app, plugin, location) {
    super(app);
    this.plugin = plugin;
    this.location = location;
    const { rule } = location;
    this.replacement = rule.replacement;
    this.category = rule.category;
    this.scopeType = rule.scope.type;
    this.priority = rule.priority;
  }
  onOpen() {
    const { contentEl } = this;
    const { rule } = this.location;
    contentEl.createEl("h2", { text: "Modifier la r\xE8gle" });
    new import_obsidian4.Setting(contentEl).setName("Source").setDesc("Non modifiable \u2014 cr\xE9ez une nouvelle r\xE8gle pour changer la source").addText((t) => {
      t.setValue(rule.source).setDisabled(true);
      t.inputEl.addClass("pseudobs-disabled-input");
    });
    new import_obsidian4.Setting(contentEl).setName("Remplacement").addText(
      (t) => t.setValue(this.replacement).onChange((v) => this.replacement = v)
    );
    new import_obsidian4.Setting(contentEl).setName("Cat\xE9gorie").addDropdown((d) => {
      const options = {
        first_name: "Pr\xE9nom",
        last_name: "Nom de famille",
        full_name: "Nom complet",
        place: "Lieu",
        institution: "Institution",
        date: "Date",
        age: "\xC2ge",
        profession: "Profession",
        custom: "Autre"
      };
      for (const [value, label] of Object.entries(options))
        d.addOption(value, label);
      d.setValue(this.category);
      d.onChange((v) => this.category = v);
    });
    new import_obsidian4.Setting(contentEl).setName("Port\xE9e").addDropdown((d) => {
      d.addOption("file", "Ce fichier uniquement");
      d.addOption("folder", "Ce dossier");
      d.addOption("vault", "Tout le vault");
      d.setValue(this.scopeType);
      d.onChange((v) => this.scopeType = v);
    });
    new import_obsidian4.Setting(contentEl).setName("Priorit\xE9").setDesc("Entier libre, comme un z-index CSS \u2014 d\xE9faut 0").addText(
      (t) => t.setValue(String(this.priority)).onChange((v) => this.priority = parseInt(v, 10) || 0)
    );
    new import_obsidian4.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("Enregistrer").setCta().onClick(() => this.save())
    ).addButton(
      (btn) => btn.setButtonText("Supprimer la r\xE8gle").setWarning().onClick(() => this.delete())
    );
  }
  async save() {
    if (!this.replacement.trim()) {
      new import_obsidian4.Notice("Le remplacement est obligatoire.");
      return;
    }
    const { store, filePath, rule } = this.location;
    store.update(rule.id, {
      replacement: this.replacement.trim(),
      category: this.category,
      scope: { ...rule.scope, type: this.scopeType },
      priority: this.priority
    });
    await this.plugin.scopeResolver.saveStore(store, filePath);
    new import_obsidian4.Notice(`\u2713 R\xE8gle mise \xE0 jour : "${rule.source}" \u2192 "${this.replacement.trim()}"`);
    void this.plugin.refreshHighlightData();
    this.close();
  }
  async delete() {
    const { store, filePath, rule } = this.location;
    store.remove(rule.id);
    await this.plugin.scopeResolver.saveStore(store, filePath);
    new import_obsidian4.Notice(`\u2713 R\xE8gle supprim\xE9e : "${rule.source}"`);
    void this.plugin.refreshHighlightData();
    this.close();
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/ui/OccurrencesModal.ts
var import_obsidian5 = require("obsidian");

// src/pseudonymizer/SpanProtector.ts
function resolveSpans(candidates) {
  const sorted = [...candidates].sort((a, b) => {
    if (b.priority !== a.priority)
      return b.priority - a.priority;
    const lenB = b.end - b.start;
    const lenA = a.end - a.start;
    if (lenB !== lenA)
      return lenB - lenA;
    return a.start - b.start;
  });
  const accepted = [];
  for (const candidate of sorted) {
    const overlaps = accepted.some(
      (s) => candidate.start < s.end && candidate.end > s.start
    );
    if (!overlaps)
      accepted.push(candidate);
  }
  return accepted.sort((a, b) => b.start - a.start);
}
function applySpans(text, spans, marker) {
  let output = text;
  for (const span of spans) {
    const value = marker ? `${marker.open}${span.replacement}${marker.close}` : span.replacement;
    output = output.slice(0, span.start) + value + output.slice(span.end);
  }
  return output;
}

// src/ui/OccurrencesModal.ts
var OccurrencesModal = class extends import_obsidian5.Modal {
  constructor(app, plugin, file, content, occurrences, rules) {
    super(app);
    this.decisions = /* @__PURE__ */ new Map();
    // Références stables — on ne recrée jamais les cartes
    this.cardRefs = /* @__PURE__ */ new Map();
    this.plugin = plugin;
    this.file = file;
    this.content = content;
    this.occurrences = occurrences;
    this.rules = rules;
    for (const occ of occurrences)
      this.decisions.set(occ.id, "validated");
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: `Scanner \u2014 ${this.file.name}` });
    const n = this.occurrences.length;
    contentEl.createEl("p", {
      text: `${n} occurrence${n > 1 ? "s" : ""} trouv\xE9e${n > 1 ? "s" : ""} pour ${this.countRules()} r\xE8gle${this.countRules() > 1 ? "s" : ""}.`
    });
    const legend = contentEl.createDiv();
    legend.addClass("pseudobs-legend");
    for (const [icon, label, cls] of [
      ["\u2713", "Valider le remplacement", "pseudobs-legend-badge-validate"],
      ["\u2717", "Conserver l'original", "pseudobs-legend-badge-ignore"],
      ["\u26A0", "Faux positif \u2014 exclure", "pseudobs-legend-badge-fp"]
    ]) {
      const item = legend.createSpan();
      item.addClass("pseudobs-legend-item");
      const badge = item.createSpan({ text: icon });
      badge.addClass("pseudobs-legend-badge", cls);
      item.createSpan({ text: ` ${label}` });
    }
    new import_obsidian5.Setting(contentEl).addButton(
      (b) => b.setButtonText("\u2713 tout valider").onClick(() => {
        for (const occ of this.occurrences)
          this.decisions.set(occ.id, "validated");
        this.updateAllCards();
      })
    ).addButton(
      (b) => b.setButtonText("\u2717 tout ignorer").onClick(() => {
        for (const occ of this.occurrences)
          this.decisions.set(occ.id, "ignored");
        this.updateAllCards();
      })
    );
    this.renderAllCards(contentEl);
    contentEl.createEl("hr");
    new import_obsidian5.Setting(contentEl).addButton(
      (b) => b.setButtonText("Appliquer").setCta().onClick(() => this.apply())
    );
  }
  countRules() {
    return new Set(this.occurrences.map((o) => o.mappingId)).size;
  }
  // Construit toutes les cartes une seule fois — ne sera plus jamais appelé après
  renderAllCards(container) {
    var _a;
    const byRule = /* @__PURE__ */ new Map();
    for (const occ of this.occurrences) {
      const key = (_a = occ.mappingId) != null ? _a : "";
      if (!byRule.has(key))
        byRule.set(key, []);
      byRule.get(key).push(occ);
    }
    for (const [mappingId, occs] of byRule) {
      const rule = this.rules.find((r) => r.id === mappingId);
      if (!rule)
        continue;
      const group = container.createDiv();
      group.createEl("div", {
        text: `${rule.source}  \u2192  ${rule.replacement}`,
        cls: "pseudobs-occ-rule-header"
      });
      for (const occ of occs) {
        this.buildCard(group, occ, rule);
      }
    }
  }
  buildCard(container, occ, rule) {
    var _a;
    const decision = (_a = this.decisions.get(occ.id)) != null ? _a : "validated";
    const card = container.createDiv();
    card.addClass("pseudobs-occ-card");
    const srcLine = card.createDiv();
    srcLine.addClass("pseudobs-occ-line");
    this.ctxSpan(srcLine, occ.contextBefore);
    const termSpan = srcLine.createSpan({ text: occ.text });
    termSpan.addClass("pseudobs-occ-term");
    this.ctxSpan(srcLine, occ.contextAfter);
    const arrow = card.createDiv();
    arrow.addClass("pseudobs-occ-arrow");
    arrow.setText("\u2193");
    const resLine = card.createDiv();
    resLine.addClass("pseudobs-occ-line", "pseudobs-occ-result-line");
    this.ctxSpan(resLine, occ.contextBefore);
    const replSpan = resLine.createSpan({ text: rule.replacement });
    replSpan.addClass("pseudobs-occ-replacement");
    this.ctxSpan(resLine, occ.contextAfter);
    const statusLabel = card.createDiv();
    statusLabel.addClass("pseudobs-occ-status-label");
    const meta = card.createEl("small");
    meta.addClass("pseudobs-occ-meta");
    meta.setText(`ligne ${occ.line}`);
    const actions = card.createDiv();
    actions.addClass("pseudobs-occ-actions");
    const btnRefs = /* @__PURE__ */ new Map();
    for (const [label, value, title] of [
      ["\u2713", "validated", "Valider"],
      ["\u2717", "ignored", "Ignorer"],
      ["\u26A0", "false_positive", "Faux positif"]
    ]) {
      const btn = actions.createEl("button", { text: label });
      btn.title = title;
      btn.addClass("pseudobs-occ-btn");
      btn.addEventListener("click", () => {
        this.decisions.set(occ.id, value);
        this.updateCard(occ.id);
      });
      btnRefs.set(value, btn);
    }
    this.cardRefs.set(occ.id, { card, buttons: btnRefs, arrow, resLine, statusLabel });
    this.updateCard(occ.id);
  }
  // Met à jour UNE carte sans toucher au DOM — styles + résultat en direct
  updateCard(occId) {
    var _a;
    const ref = this.cardRefs.get(occId);
    if (!ref)
      return;
    const decision = (_a = this.decisions.get(occId)) != null ? _a : "validated";
    ref.card.removeClass("pseudobs-occ-validated", "pseudobs-occ-ignored", "pseudobs-occ-false_positive");
    ref.card.addClass(`pseudobs-occ-${decision}`);
    for (const [value, btn] of ref.buttons) {
      btn.toggleClass("pseudobs-occ-btn-active", value === decision);
    }
    const show = decision === "validated";
    ref.arrow.toggle(show);
    ref.resLine.toggle(show);
    ref.statusLabel.toggle(!show);
    const labels = {
      validated: "",
      ignored: "Conserv\xE9 tel quel dans ce fichier",
      false_positive: "Faux positif \u2014 exclu du remplacement"
    };
    ref.statusLabel.setText(labels[decision]);
  }
  // Met à jour TOUTES les cartes
  updateAllCards() {
    for (const occId of this.cardRefs.keys()) {
      this.updateCard(occId);
    }
  }
  ctxSpan(parent, text) {
    parent.createSpan({ text, cls: "pseudobs-ctx-side" });
  }
  async apply() {
    const validated = this.occurrences.filter((o) => this.decisions.get(o.id) === "validated");
    const ignored = this.occurrences.filter((o) => this.decisions.get(o.id) === "ignored");
    const spans = validated.map((occ) => {
      var _a;
      const rule = this.rules.find((r) => r.id === occ.mappingId);
      return { start: occ.start, end: occ.end, source: occ.text, replacement: rule.replacement, mappingId: (_a = occ.mappingId) != null ? _a : "", priority: rule.priority };
    });
    const updated = applySpans(this.content, resolveSpans(spans));
    await this.app.vault.modify(this.file, updated);
    await this.plugin.updateMappingStatuses(this.file.path, this.rules, this.occurrences, this.decisions);
    const nv = validated.length, ni = ignored.length;
    new import_obsidian5.Notice(`\u2713 ${nv} remplacement${nv > 1 ? "s" : ""} appliqu\xE9${nv > 1 ? "s" : ""}` + (ni > 0 ? `, ${ni} ignor\xE9${ni > 1 ? "s" : ""}` : ""));
    void this.plugin.refreshHighlightData();
    this.close();
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/pseudonymizer/ReplacementPlanner.ts
var DEFAULT_PLANNER_SETTINGS = {
  caseSensitive: false,
  wholeWordOnly: true
};
function sortRules(rules) {
  return [...rules].sort((a, b) => {
    if (b.priority !== a.priority)
      return b.priority - a.priority;
    if (b.source.length !== a.source.length)
      return b.source.length - a.source.length;
    return scopeWeight(b.scope) - scopeWeight(a.scope);
  });
}
function scopeWeight(scope) {
  if (scope.type === "file")
    return 3;
  if (scope.type === "folder")
    return 2;
  return 1;
}
var WORD_CHAR = /[\wÀ-ɏ]/;
function isWholeWord(text, start, end) {
  if (start > 0 && WORD_CHAR.test(text[start - 1]))
    return false;
  if (end < text.length && WORD_CHAR.test(text[end]))
    return false;
  return true;
}
function findSpansForRule(text, rule, settings) {
  const spans = [];
  const needle = settings.caseSensitive ? rule.source : rule.source.toLowerCase();
  const haystack = settings.caseSensitive ? text : text.toLowerCase();
  const sourceLen = needle.length;
  let pos = 0;
  while (pos <= haystack.length - sourceLen) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1)
      break;
    if (!settings.wholeWordOnly || isWholeWord(text, idx, idx + sourceLen)) {
      spans.push({
        start: idx,
        end: idx + sourceLen,
        source: text.slice(idx, idx + sourceLen),
        replacement: rule.replacement,
        mappingId: rule.id,
        priority: rule.priority
      });
    }
    pos = idx + 1;
  }
  return spans;
}
function buildReplacementPlan(text, rules, settings = DEFAULT_PLANNER_SETTINGS) {
  const allSpans = [];
  for (const rule of sortRules(rules)) {
    allSpans.push(...findSpansForRule(text, rule, settings));
  }
  return allSpans;
}

// src/scanner/OccurrenceScanner.ts
var CONTEXT_LEN = 45;
var _counter = 0;
function lineOf(text, pos) {
  return text.slice(0, pos).split("\n").length;
}
function context(text, start, end) {
  return {
    before: text.slice(Math.max(0, start - CONTEXT_LEN), start),
    after: text.slice(end, Math.min(text.length, end + CONTEXT_LEN))
  };
}
function scanOccurrences(content, filePath, rules, settings = DEFAULT_PLANNER_SETTINGS) {
  const occurrences = [];
  for (const rule of sortRules(rules)) {
    for (const span of findSpansForRule(content, rule, settings)) {
      const { before, after } = context(content, span.start, span.end);
      occurrences.push({
        id: `occ_${Date.now()}_${++_counter}`,
        file: filePath,
        line: lineOf(content, span.start),
        start: span.start,
        end: span.end,
        text: span.source,
        contextBefore: before,
        contextAfter: after,
        category: rule.category,
        mappingId: rule.id,
        status: "suggested"
      });
    }
  }
  return occurrences.sort((a, b) => a.start - b.start);
}

// src/parsers/SrtParser.ts
var SrtParser = class {
  parse(content) {
    const trailingNewline = content.endsWith("\n");
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
    const rawBlocks = normalized.split(/\n\n+/).filter((b) => b.trim() !== "");
    const blocks = rawBlocks.map((rawBlock) => {
      const lines = rawBlock.split("\n");
      const index = parseInt(lines[0].trim(), 10);
      const arrowPos = lines[1].indexOf(" --> ");
      const startTime = lines[1].slice(0, arrowPos);
      const endTime = lines[1].slice(arrowPos + 5);
      return { index, startTime, endTime, lines: lines.slice(2) };
    });
    return { blocks, trailingNewline };
  }
  reconstruct(doc) {
    const body = doc.blocks.map((b) => `${b.index}
${b.startTime} --> ${b.endTime}
${b.lines.join("\n")}`).join("\n\n");
    return doc.trailingNewline ? body + "\n" : body;
  }
};

// src/parsers/ChatParser.ts
var ChatParser = class {
  parse(content) {
    const trailingNewline = content.endsWith("\n");
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const rawLines = normalized.split("\n");
    const linesToParse = trailingNewline && rawLines[rawLines.length - 1] === "" ? rawLines.slice(0, -1) : rawLines;
    return { lines: linesToParse.map((raw) => this.parseLine(raw)), trailingNewline };
  }
  parseLine(raw) {
    var _a, _b;
    if (raw === "")
      return { type: "blank", raw };
    if (raw.startsWith("@"))
      return { type: "meta", raw };
    if (raw.startsWith("%"))
      return { type: "dependent", raw };
    if (raw.startsWith("	"))
      return { type: "continuation", raw };
    if (raw.startsWith("*")) {
      const colonIdx = raw.indexOf(":");
      if (colonIdx > 1) {
        const speaker = raw.slice(1, colonIdx);
        const afterColon = raw.slice(colonIdx + 1);
        const sep = (_b = (_a = afterColon.match(/^([\t ]*)/)) == null ? void 0 : _a[1]) != null ? _b : "";
        const prefix = raw.slice(0, colonIdx + 1) + sep;
        const content = afterColon.slice(sep.length);
        return { type: "turn", raw, speaker, prefix, content };
      }
    }
    return { type: "meta", raw };
  }
  reconstruct(doc) {
    const body = doc.lines.map((line) => {
      if (line.type === "turn" && line.prefix !== void 0 && line.content !== void 0) {
        return line.prefix + line.content;
      }
      return line.raw;
    }).join("\n");
    return doc.trailingNewline ? body + "\n" : body;
  }
};

// src/parsers/TranscriptConverter.ts
function srtToMarkdown(doc, sourceName) {
  const lines = [
    "---",
    `pseudobs-format: srt`,
    `pseudobs-source: "${sourceName}"`,
    "---",
    ""
  ];
  for (const block of doc.blocks) {
    lines.push(`**[${block.index}]** *${block.startTime} \u2192 ${block.endTime}*`);
    lines.push(...block.lines);
    lines.push("");
  }
  while (lines[lines.length - 1] === "")
    lines.pop();
  lines.push("");
  return lines.join("\n");
}
function chatToMarkdown(doc, sourceName) {
  const lines = [
    "---",
    `pseudobs-format: chat`,
    `pseudobs-source: "${sourceName}"`,
    "---",
    ""
  ];
  let prevGroup = null;
  for (const chatLine of doc.lines) {
    const group = lineGroup(chatLine);
    if (prevGroup !== null && prevGroup !== group) {
      lines.push("");
    }
    switch (chatLine.type) {
      case "meta":
      case "dependent":
        lines.push(`> ${chatLine.raw}`);
        break;
      case "turn":
        lines.push(`**${chatLine.speaker}** : ${chatLine.content}`);
        break;
      case "continuation":
        if (lines.length > 0) {
          lines[lines.length - 1] += ` ${chatLine.raw.trim()}`;
        }
        break;
      case "blank":
        break;
    }
    if (group !== null)
      prevGroup = group;
  }
  while (lines[lines.length - 1] === "")
    lines.pop();
  lines.push("");
  return lines.join("\n");
}
function lineGroup(line) {
  if (line.type === "meta" || line.type === "dependent")
    return "structural";
  if (line.type === "turn" || line.type === "continuation")
    return "turn";
  return null;
}

// src/mappings/ScopeResolver.ts
var import_obsidian6 = require("obsidian");
var ScopeResolver = class {
  constructor(vault, mappingFolder) {
    this.vault = vault;
    this.mappingFolder = mappingFolder;
  }
  async getRulesFor(filePath) {
    const folder = this.vault.getAbstractFileByPath(this.mappingFolder);
    if (!(folder instanceof import_obsidian6.TFolder))
      return [];
    const allRules = [];
    for (const child of folder.children) {
      if (!(child instanceof import_obsidian6.TFile))
        continue;
      if (!child.name.endsWith(".mapping.json"))
        continue;
      try {
        const raw = await this.vault.read(child);
        const data = JSON.parse(raw);
        const store = MappingStore.fromJSON(data);
        allRules.push(...store.getValidatedFor(filePath));
      } catch (e) {
      }
    }
    const seen = /* @__PURE__ */ new Set();
    return allRules.filter((r) => {
      const key = `${r.source}||${r.replacement}||${r.scope.type}`;
      if (seen.has(key))
        return false;
      seen.add(key);
      return true;
    });
  }
  // Retrouve la première règle dont la source OU le remplacement correspond au terme.
  // Retourne aussi le store et le chemin JSON pour permettre la modification.
  async findRuleByTerm(term) {
    const folder = this.vault.getAbstractFileByPath(this.mappingFolder);
    if (!(folder instanceof import_obsidian6.TFolder))
      return null;
    const needle = term.toLowerCase();
    for (const child of folder.children) {
      if (!(child instanceof import_obsidian6.TFile) || !child.name.endsWith(".mapping.json"))
        continue;
      try {
        const data = JSON.parse(await this.vault.read(child));
        const store = MappingStore.fromJSON(data);
        const rule = store.getAll().find(
          (r) => r.source.toLowerCase() === needle || r.replacement.toLowerCase() === needle
        );
        if (rule)
          return { rule, store, filePath: child.path };
      } catch (e) {
      }
    }
    return null;
  }
  // Sauvegarde un store modifié dans son fichier JSON.
  async saveStore(store, filePath) {
    const file = this.vault.getAbstractFileByPath(filePath);
    const json = JSON.stringify(store.toJSON(), null, 2);
    if (file instanceof import_obsidian6.TFile) {
      await this.vault.modify(file, json);
    }
  }
};

// src/pseudonymizer/PseudonymizationEngine.ts
var PseudonymizationEngine = class {
  constructor(settings = DEFAULT_PLANNER_SETTINGS) {
    this.settings = settings;
  }
  // Applique toutes les règles validées sur le texte et retourne le texte pseudonymisé.
  // Si marker est fourni, chaque remplacement est encadré par marker.open / marker.close.
  pseudonymize(text, rules, marker) {
    const validated = rules.filter((r) => r.status === "validated");
    const candidates = buildReplacementPlan(text, validated, this.settings);
    const resolved = resolveSpans(candidates);
    return applySpans(text, resolved, marker);
  }
};

// src/main.ts
var CONVERTIBLE_EXTS = ["srt", "cha", "chat"];
var PseudObsPlugin = class extends import_obsidian7.Plugin {
  constructor() {
    super(...arguments);
    // Cache synchrone pour le surlignage CM6 (mis à jour de façon asynchrone)
    this.highlightData = { sources: [], replacements: [] };
  }
  async onload() {
    await this.loadSettings();
    this.scopeResolver = new ScopeResolver(this.app.vault, this.settings.mappingFolder);
    this.addSettingTab(new PseudObsSettingTab(this.app, this));
    this.registerEditorExtension(
      createPseudonymHighlighter(() => this.highlightData)
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        void this.refreshHighlightData();
      })
    );
    void this.refreshHighlightData();
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof import_obsidian7.TFile))
          return;
        if (!CONVERTIBLE_EXTS.includes(file.extension.toLowerCase()))
          return;
        setTimeout(() => {
          void this.autoConvert(file);
        }, 300);
      })
    );
    this.addCommand({
      id: "add-transcription",
      name: "Ajouter une transcription",
      callback: () => this.openFilePicker()
    });
    this.addCommand({
      id: "pseudonymize-current-file",
      name: "Pseudonymiser le fichier courant",
      callback: () => this.pseudonymizeActiveFile()
    });
    this.addCommand({
      id: "create-rule",
      name: "Cr\xE9er une r\xE8gle de remplacement",
      editorCallback: (editor) => {
        new RuleModal(this.app, this, editor.getSelection()).open();
      }
    });
    this.addCommand({
      id: "scan-current-file",
      name: "Scanner le fichier courant",
      callback: () => this.scanCurrentFile()
    });
    this.addCommand({
      id: "pseudonymize-selection",
      name: "Pseudonymiser la s\xE9lection",
      editorCheckCallback: (checking, editor) => {
        if (!editor.getSelection())
          return false;
        if (!checking)
          new QuickPseudonymizeModal(this.app, this, editor).open();
        return true;
      }
    });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const selection = editor.getSelection().trim();
        if (!selection)
          return;
        menu.addSeparator();
        const selLower = selection.toLowerCase();
        const isKnown = this.highlightData.sources.some((s) => s.toLowerCase() === selLower) || this.highlightData.replacements.some((r) => r.toLowerCase() === selLower);
        if (isKnown) {
          menu.addItem(
            (item) => item.setTitle(`Modifier la r\xE8gle pour "${selection.slice(0, 25)}${selection.length > 25 ? "\u2026" : ""}"`).setIcon("settings").onClick(async () => {
              const location = await this.scopeResolver.findRuleByTerm(selection);
              if (location) {
                new EditRuleModal(this.app, this, location).open();
              } else {
                new import_obsidian7.Notice("R\xE8gle introuvable dans les mappings.");
              }
            })
          );
        }
        menu.addItem(
          (item) => item.setTitle(`Pseudonymiser "${selection.slice(0, 25)}${selection.length > 25 ? "\u2026" : ""}"`).setIcon("eye-off").onClick(() => new QuickPseudonymizeModal(this.app, this, editor).open())
        );
        menu.addItem(
          (item) => item.setTitle(`Pseudonymiser avec Pr Baptiste Coulmont`).setIcon("book-user").onClick(async () => {
            const notice = new import_obsidian7.Notice("Recherche sur coulmont.com\u2026", 0);
            const suggestions = await this.fetchCoulmont(selection);
            notice.hide();
            if (suggestions.length === 0) {
              new import_obsidian7.Notice(`Aucun r\xE9sultat Coulmont pour "${selection}".`);
              return;
            }
            new RuleModal(this.app, this, selection, "", suggestions).open();
          })
        );
        menu.addItem(
          (item) => item.setTitle("Cr\xE9er une r\xE8gle de remplacement\u2026").setIcon("pencil").onClick(() => new RuleModal(this.app, this, selection).open())
        );
      })
    );
  }
  onunload() {
  }
  // --- Coulmont ---
  // Interroge l'outil de Baptiste Coulmont pour suggérer un prénom équivalent.
  // Le prénom source est envoyé à coulmont.com — ne pas utiliser pour des données
  // déjà sensibles (utiliser un prénom de substitution neutre si besoin).
  // Retourne tous les prénoms équivalents proposés par l'outil Coulmont.
  // Le jeu de données ne différencie pas M/F — l'utilisateur choisit dans la liste.
  async fetchCoulmont(prenom) {
    try {
      const url = `https://coulmont.com/bac/results.php?search=${encodeURIComponent(prenom)}`;
      const response = await (0, import_obsidian7.requestUrl)({ url, method: "GET" });
      const doc = new DOMParser().parseFromString(response.text, "text/html");
      const els = doc.querySelectorAll(
        "#hero > div > div > div > div > p.mb-1.mb-md-1 > a"
      );
      const names = Array.from(els).map((el) => {
        var _a, _b;
        return (_b = (_a = el.textContent) == null ? void 0 : _a.trim()) != null ? _b : "";
      }).filter((n) => n.length > 0);
      return [...new Set(names)];
    } catch (e) {
      return [];
    }
  }
  // --- Surlignage ---
  async refreshHighlightData() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      this.highlightData = { sources: [], replacements: [] };
    } else {
      try {
        const rules = await this.scopeResolver.getRulesFor(file.path);
        this.highlightData = {
          sources: rules.map((r) => r.source).filter(Boolean),
          replacements: rules.map((r) => r.replacement).filter(Boolean)
        };
      } catch (e) {
        this.highlightData = { sources: [], replacements: [] };
      }
    }
    const view = this.app.workspace.getActiveViewOfType(import_obsidian7.MarkdownView);
    const cm = (view == null ? void 0 : view.editor) && view.editor.cm;
    cm == null ? void 0 : cm.dispatch({ effects: highlightDataChanged.of(void 0) });
  }
  // --- Conversion automatique ---
  async autoConvert(file) {
    var _a, _b;
    try {
      const raw = await this.app.vault.read(file);
      const ext = file.extension.toLowerCase();
      const basename = file.basename;
      const folder = (_b = (_a = file.parent) == null ? void 0 : _a.path) != null ? _b : "";
      const mdPath = folder ? `${folder}/${basename}.md` : `${basename}.md`;
      let mdContent;
      if (ext === "srt") {
        mdContent = srtToMarkdown(new SrtParser().parse(raw), file.name);
      } else {
        mdContent = chatToMarkdown(new ChatParser().parse(raw), file.name);
      }
      if (this.app.vault.getAbstractFileByPath(mdPath) instanceof import_obsidian7.TFile) {
        new import_obsidian7.Notice(`\u26A0 ${basename}.md existe d\xE9j\xE0 \u2014 conversion ignor\xE9e pour ${file.name}`);
        return;
      }
      await this.app.vault.create(mdPath, mdContent);
      const mappingPath = `${this.settings.mappingFolder}/${basename}.mapping.json`;
      if (!this.app.vault.getAbstractFileByPath(mappingPath)) {
        await this.ensureFolder(this.settings.mappingFolder);
        const store = new MappingStore({ type: "file", path: mdPath });
        await this.app.vault.create(mappingPath, JSON.stringify(store.toJSON(), null, 2));
      }
      await this.app.vault.delete(file);
      const mdFile = this.app.vault.getAbstractFileByPath(mdPath);
      if (mdFile instanceof import_obsidian7.TFile) {
        await this.app.workspace.getLeaf().openFile(mdFile);
      }
      new import_obsidian7.Notice(`\u2713 ${file.name} \u2192 ${basename}.md`);
    } catch (e) {
      new import_obsidian7.Notice(`Erreur de conversion de ${file.name} : ${e.message}`);
    }
  }
  // --- Commande "Ajouter une transcription" ---
  openFilePicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".srt,.cha,.chat,.txt,.md";
    input.multiple = true;
    input.classList.add("pseudobs-hidden-input");
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      void this.processFilePicker(input);
    });
    input.click();
  }
  async processFilePicker(input) {
    var _a;
    const files = Array.from((_a = input.files) != null ? _a : []);
    input.remove();
    for (const file of files) {
      await this.copyToVault(file);
    }
  }
  async copyToVault(browserFile) {
    const raw = await browserFile.text();
    const destFolder = this.settings.transcriptionsFolder;
    await this.ensureFolder(destFolder);
    const destPath = `${destFolder}/${browserFile.name}`;
    if (this.app.vault.getAbstractFileByPath(destPath) instanceof import_obsidian7.TFile) {
      new import_obsidian7.Notice(`Le fichier existe d\xE9j\xE0 dans le vault : ${browserFile.name}`);
      return;
    }
    await this.app.vault.create(destPath, raw);
  }
  // --- Pseudonymisation ---
  async pseudonymizeActiveFile() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new import_obsidian7.Notice("Aucun fichier actif.");
      return;
    }
    const ext = file.extension.toLowerCase();
    if (!["srt", "cha", "chat", "md", "txt"].includes(ext)) {
      new import_obsidian7.Notice(`Format non pris en charge : .${ext}`);
      return;
    }
    const content = await this.app.vault.read(file);
    const rules = await this.scopeResolver.getRulesFor(file.path);
    if (rules.length === 0) {
      new import_obsidian7.Notice(
        `Aucune r\xE8gle valid\xE9e.
Cr\xE9ez des r\xE8gles via Ctrl+P \u2192 "Cr\xE9er une r\xE8gle".
Mapping attendu : ${this.settings.mappingFolder}/${file.basename}.mapping.json`
      );
      return;
    }
    const marker = this.settings.useMarkerInExport ? { open: this.settings.markerOpen, close: this.settings.markerClose } : void 0;
    const engine = new PseudonymizationEngine({
      caseSensitive: this.settings.caseSensitive,
      wholeWordOnly: this.settings.wholeWordOnly
    });
    let pseudonymized;
    if (ext === "srt") {
      const parser = new SrtParser();
      const doc = parser.parse(content);
      for (const block of doc.blocks) {
        block.lines = block.lines.map((l) => engine.pseudonymize(l, rules, marker));
      }
      pseudonymized = parser.reconstruct(doc);
    } else if (ext === "cha" || ext === "chat") {
      const parser = new ChatParser();
      const doc = parser.parse(content);
      for (const line of doc.lines) {
        if (line.type === "turn" && line.content !== void 0) {
          line.content = engine.pseudonymize(line.content, rules, marker);
        }
      }
      pseudonymized = parser.reconstruct(doc);
    } else {
      pseudonymized = engine.pseudonymize(content, rules, marker);
    }
    await this.ensureFolder(this.settings.exportsFolder);
    const outputPath = `${this.settings.exportsFolder}/${file.basename}.pseudonymized.${ext}`;
    const existing = this.app.vault.getAbstractFileByPath(outputPath);
    if (existing instanceof import_obsidian7.TFile) {
      await this.app.vault.modify(existing, pseudonymized);
    } else {
      await this.app.vault.create(outputPath, pseudonymized);
    }
    new import_obsidian7.Notice(`\u2713 ${rules.length} r\xE8gle(s) appliqu\xE9e(s)
\u2192 ${outputPath}`);
  }
  async scanCurrentFile() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new import_obsidian7.Notice("Aucun fichier actif.");
      return;
    }
    const rules = await this.scopeResolver.getRulesFor(file.path);
    if (rules.length === 0) {
      new import_obsidian7.Notice('Aucune r\xE8gle pour ce fichier.\nCr\xE9ez des r\xE8gles via Ctrl+P \u2192 "Cr\xE9er une r\xE8gle".');
      return;
    }
    const content = await this.app.vault.read(file);
    const occurrences = scanOccurrences(content, file.path, rules, {
      caseSensitive: this.settings.caseSensitive,
      wholeWordOnly: this.settings.wholeWordOnly
    });
    if (occurrences.length === 0) {
      new import_obsidian7.Notice("Aucune occurrence trouv\xE9e pour les r\xE8gles actives.");
      return;
    }
    new OccurrencesModal(this.app, this, file, content, occurrences, rules).open();
  }
  // Appelé par OccurrencesModal après application — met à jour les statuts des règles.
  async updateMappingStatuses(filePath, rules, occurrences, decisions) {
    const folder = this.app.vault.getAbstractFileByPath(this.settings.mappingFolder);
    if (!folder)
      return;
    for (const rule of rules) {
      const ruleOccs = occurrences.filter((o) => o.mappingId === rule.id);
      if (ruleOccs.length === 0)
        continue;
      const validated = ruleOccs.filter((o) => decisions.get(o.id) === "validated").length;
      const ignored = ruleOccs.filter((o) => decisions.get(o.id) === "ignored").length;
      const fp = ruleOccs.filter((o) => decisions.get(o.id) === "false_positive").length;
      let newStatus;
      if (validated > 0 && ignored + fp > 0)
        newStatus = "partial";
      else if (validated === ruleOccs.length)
        newStatus = "validated";
      else
        newStatus = "ignored";
      const location = await this.scopeResolver.findRuleByTerm(rule.source);
      if (location) {
        location.store.update(rule.id, { status: newStatus });
        await this.scopeResolver.saveStore(location.store, location.filePath);
      }
    }
  }
  async applyRuleToFile(file, source, replacement) {
    const content = await this.app.vault.read(file);
    const fakeRule = {
      id: "_quick",
      source,
      replacement,
      category: "custom",
      scope: { type: "file", path: file.path },
      status: "validated",
      priority: 0,
      createdBy: "user",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const spans = findSpansForRule(content, fakeRule, {
      caseSensitive: this.settings.caseSensitive,
      wholeWordOnly: this.settings.wholeWordOnly
    });
    if (spans.length === 0)
      return 0;
    spans.sort((a, b) => b.start - a.start);
    await this.app.vault.modify(file, applySpans(content, spans));
    return spans.length;
  }
  // --- Utilitaires ---
  async ensureFolder(folderPath) {
    const parts = folderPath.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
