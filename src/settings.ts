import { App, PluginSettingTab, Setting } from 'obsidian';
import type PseudObsPlugin from './main';
import { OnboardingModal } from './ui/OnboardingModal';
import { t, setLocale, AVAILABLE_LANGUAGES } from './i18n';

export type NerBackend = 'none' | 'spacy' | 'transformers-js';

export interface PseudObsSettings {
  transcriptionsFolder: string;
  mappingFolder: string;
  dictionariesFolder: string;
  exportsFolder: string;
  reportsFolder: string;
  caseSensitive: boolean;
  accentSensitive: boolean;
  wholeWordOnly: boolean;
  preserveCase: boolean;
  preserveAnalyticNotation: boolean;
  warnIfSyncedFolder: boolean;
  useMarkerInExport: boolean;
  markerOpen: string;
  markerClose: string;
  // Langue de l'interface
  language: string;
  // Onboarding
  onboardingCompleted: boolean;
  nerBackend: NerBackend;
  spacyServerUrl: string;
  // Paramètres du scanner NER
  nerMinScore: number;
  nerFunctionWords: string[];
}

export const DEFAULT_SETTINGS: PseudObsSettings = {
  transcriptionsFolder: 'Transcriptions',
  mappingFolder: '_pseudonymisation/mappings',
  dictionariesFolder: '_pseudonymisation/dictionaries',
  exportsFolder: '_pseudonymisation/exports',
  reportsFolder: '_pseudonymisation/reports',
  caseSensitive: false,
  accentSensitive: false,
  wholeWordOnly: true,
  preserveCase: true,
  preserveAnalyticNotation: true,
  warnIfSyncedFolder: true,
  useMarkerInExport: true,
  markerOpen: '{{',
  markerClose: '}}',
  language: 'en',
  onboardingCompleted: false,
  nerBackend: 'none',
  spacyServerUrl: 'http://localhost:5757',
  nerMinScore: 0.75,
  nerFunctionWords: [
    'de', 'du', 'des', "d'", 'le', 'la', 'les', "l'",
    'un', 'une', 'au', 'aux', 'en', 'dans', 'sur', 'sous', 'par', 'pour',
    'et', 'ou', 'ni', 'mais', 'donc', 'or', 'car',
    'à', 'a', 'y', 'the', 'of', 'in', 'and',
  ],
};

export class PseudObsSettingTab extends PluginSettingTab {
  plugin: PseudObsPlugin;

  constructor(app: App, plugin: PseudObsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ---- Général -------------------------------------------------------
    new Setting(containerEl).setName(t('settings.heading.general')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.language'))
      .setDesc(t('settings.languageDesc'))
      .addDropdown((d) => {
        for (const [code, name] of Object.entries(AVAILABLE_LANGUAGES)) {
          d.addOption(code, name);
        }
        d.setValue(this.plugin.settings.language);
        d.onChange(async (v) => {
          this.plugin.settings.language = v;
          await this.plugin.saveSettings();
          setLocale(v);
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(t('settings.reconfigure'))
      .setDesc(t('settings.reconfigureDesc2'))
      .addButton((btn) =>
        btn.setButtonText(t('settings.reconfigureBtn2')).onClick(() => {
          new OnboardingModal(this.app, this.plugin).open();
        })
      );

    // ---- Détection du texte --------------------------------------------
    new Setting(containerEl).setName(t('settings.heading.textDetection')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.wholeWordOnly'))
      .setDesc(t('settings.wholeWordOnlyDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.wholeWordOnly).onChange(async (value) => {
          this.plugin.settings.wholeWordOnly = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.caseSensitive'))
      .setDesc(t('settings.caseSensitiveDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.caseSensitive).onChange(async (value) => {
          this.plugin.settings.caseSensitive = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.accentSensitive'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.accentSensitive).onChange(async (value) => {
          this.plugin.settings.accentSensitive = value;
          await this.plugin.saveSettings();
        })
      );

    // ---- Pseudonymisation ----------------------------------------------
    new Setting(containerEl).setName(t('settings.heading.pseudonymization')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.preserveCase'))
      .setDesc(t('settings.preserveCaseDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.preserveCase).onChange(async (value) => {
          this.plugin.settings.preserveCase = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.preserveAnalyticNotation'))
      .setDesc(t('settings.preserveAnalyticNotationDesc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.preserveAnalyticNotation)
          .onChange(async (value) => {
            this.plugin.settings.preserveAnalyticNotation = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t('settings.useMarkerInExport'))
      .setDesc(t('settings.useMarkerInExportDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.useMarkerInExport).onChange(async (value) => {
          this.plugin.settings.useMarkerInExport = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.markerOpen'))
      .setDesc(t('settings.markerOpenDesc'))
      .addText((text) =>
        text.setValue(this.plugin.settings.markerOpen).onChange(async (value) => {
          this.plugin.settings.markerOpen = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.markerClose'))
      .setDesc(t('settings.markerCloseDesc'))
      .addText((text) =>
        text.setValue(this.plugin.settings.markerClose).onChange(async (value) => {
          this.plugin.settings.markerClose = value;
          await this.plugin.saveSettings();
        })
      );

    // ---- Détection NER -------------------------------------------------
    new Setting(containerEl).setName(t('settings.heading.ner')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.nerBackend'))
      .setDesc(t('settings.nerBackendDesc'))
      .addDropdown((d) => {
        d.addOption('none', t('settings.nerBackend.none'));
        d.addOption('transformers-js', t('settings.nerBackend.tfjs'));
        d.setValue(this.plugin.settings.nerBackend);
        d.onChange(async (v) => {
          this.plugin.settings.nerBackend = v as PseudObsSettings['nerBackend'];
          await this.plugin.saveSettings();
          this.display();
        });
      });

    // ---- Stockage -------------------------------------------------------
    new Setting(containerEl).setName(t('settings.heading.storage')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.transcriptionsFolder'))
      .setDesc(t('settings.transcriptionsFolderDesc'))
      .addText((text) =>
        text.setValue(this.plugin.settings.transcriptionsFolder).onChange(async (value) => {
          this.plugin.settings.transcriptionsFolder = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.mappingFolder'))
      .setDesc(t('settings.mappingFolderDesc'))
      .addText((text) =>
        text.setValue(this.plugin.settings.mappingFolder).onChange(async (value) => {
          this.plugin.settings.mappingFolder = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.dictionariesFolder'))
      .setDesc(t('settings.dictionariesFolderDesc'))
      .addText((text) =>
        text.setValue(this.plugin.settings.dictionariesFolder).onChange(async (value) => {
          this.plugin.settings.dictionariesFolder = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t('settings.exportsFolder'))
      .addText((text) =>
        text.setValue(this.plugin.settings.exportsFolder).onChange(async (value) => {
          this.plugin.settings.exportsFolder = value;
          await this.plugin.saveSettings();
        })
      );

    // ---- Sécurité -------------------------------------------------------
    new Setting(containerEl).setName(t('settings.heading.security')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.vaultPerCorpus'))
      .setDesc(t('settings.vaultPerCorpusDesc'));

    new Setting(containerEl)
      .setName(t('settings.warnIfSyncedFolder'))
      .setDesc(t('settings.warnIfSyncedFolderDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.warnIfSyncedFolder).onChange(async (value) => {
          this.plugin.settings.warnIfSyncedFolder = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
