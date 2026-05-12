import { App, PluginSettingTab, Setting } from 'obsidian';
import type PseudObsPlugin from './main';
import { OnboardingModal } from './ui/OnboardingModal';

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

    new Setting(containerEl).setName('Dossiers').setHeading();

    new Setting(containerEl)
      .setName('Transcriptions importées')
      .setDesc('Dossier de destination des transcriptions importées')
      .addText((text) =>
        text.setValue(this.plugin.settings.transcriptionsFolder).onChange(async (value) => {
          this.plugin.settings.transcriptionsFolder = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Tables de correspondance')
      .setDesc('Chemin relatif dans le vault')
      .addText((text) =>
        text.setValue(this.plugin.settings.mappingFolder).onChange(async (value) => {
          this.plugin.settings.mappingFolder = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Dictionnaires')
      .setDesc('Chemin relatif dans le vault')
      .addText((text) =>
        text.setValue(this.plugin.settings.dictionariesFolder).onChange(async (value) => {
          this.plugin.settings.dictionariesFolder = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Exports')
      .addText((text) =>
        text.setValue(this.plugin.settings.exportsFolder).onChange(async (value) => {
          this.plugin.settings.exportsFolder = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName('Remplacement').setHeading();

    new Setting(containerEl)
      .setName('Sensible à la casse')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.caseSensitive).onChange(async (value) => {
          this.plugin.settings.caseSensitive = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Sensible aux accents')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.accentSensitive).onChange(async (value) => {
          this.plugin.settings.accentSensitive = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Mots entiers uniquement')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.wholeWordOnly).onChange(async (value) => {
          this.plugin.settings.wholeWordOnly = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Préserver la casse')
      .setDesc('Adapter la casse du remplacement à celle de la source (ex. : JEAN → PIERRE, jean → pierre, Jean → Pierre)')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.preserveCase).onChange(async (value) => {
          this.plugin.settings.preserveCase = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Préserver les notations analytiques')
      .setDesc('Ne jamais remplacer les symboles de convention analytique de type Jefferson ou ICOR')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.preserveAnalyticNotation)
          .onChange(async (value) => {
            this.plugin.settings.preserveAnalyticNotation = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName("Marqueur d'export").setHeading();

    new Setting(containerEl)
      .setName('Ajouter un marqueur autour des pseudonymes dans l\'export')
      .setDesc('Permet d\'identifier visuellement les termes pseudonymisés dans le fichier exporté')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.useMarkerInExport).onChange(async (value) => {
          this.plugin.settings.useMarkerInExport = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Marqueur ouvrant')
      .setDesc('Exemple : {{  ⟦  [  «')
      .addText((text) =>
        text.setValue(this.plugin.settings.markerOpen).onChange(async (value) => {
          this.plugin.settings.markerOpen = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Marqueur fermant')
      .setDesc('Exemple : }}  ⟧  ]  »')
      .addText((text) =>
        text.setValue(this.plugin.settings.markerClose).onChange(async (value) => {
          this.plugin.settings.markerClose = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName('Détection automatique (NER)').setHeading();

    new Setting(containerEl)
      .setName('Moteur de détection')
      .setDesc('Backend utilisé pour la détection automatique des entités nommées identifiantes')
      .addDropdown((d) => {
        d.addOption('none', 'Désactivé — règles manuelles uniquement');
        d.addOption('transformers-js', 'transformers.js (modèle ONNX embarqué)');
        d.setValue(this.plugin.settings.nerBackend);
        d.onChange(async (v) => {
          this.plugin.settings.nerBackend = v as PseudObsSettings['nerBackend'];
          await this.plugin.saveSettings();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName('Assistant de configuration')
      .setDesc('Relancer l\'assistant pour reconfigurer la détection NER et les dictionnaires')
      .addButton((btn) =>
        btn.setButtonText('Reconfigurer…').onClick(() => {
          new OnboardingModal(this.app, this.plugin).open();
        })
      );

    new Setting(containerEl).setName('Sécurité').setHeading();

    new Setting(containerEl)
      .setName('Avertir si le dossier est synchronisé')
      .setDesc('Alerter si les tables de correspondance sont dans un dossier Git, iCloud ou Synology Drive')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.warnIfSyncedFolder).onChange(async (value) => {
          this.plugin.settings.warnIfSyncedFolder = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
