import { App, PluginSettingTab, Setting, type SettingDefinitionItem, type SettingGroup } from 'obsidian';
import { FolderSuggest } from './ui/FolderSuggest';
import type PseudObsPlugin from './main';
import { OnboardingModal } from './ui/OnboardingModal';
import { t, setLocale, AVAILABLE_LANGUAGES } from './i18n';

export type NerBackend = 'none' | 'spacy' | 'transformers-js';
export type ExportDestinationType = 'vault' | 'external';

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
  // Destination des exports finaux (VTT, SRT, CHA)
  exportDestinationType: ExportDestinationType;
  exportFinalFolder: string;       // vault path (si type === 'vault')
  exportExternalPath: string;      // chemin absolu hors vault (si type === 'external')
  exportMirrorClasses: boolean;    // répercuter la structure de classes dans le dossier d'export
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
  exportDestinationType: 'vault',
  exportFinalFolder: '_pseudonymisation/exports',
  exportExternalPath: '',
  exportMirrorClasses: false,
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

  private heading(name: string): SettingDefinitionItem {
    return { name, render: (setting) => { setting.setName(name).setHeading(); } };
  }

  // `update()` (re-rendu déclaratif) n'existe qu'à partir d'Obsidian 1.13 ;
  // sur les versions antérieures on retombe sur display() (voir ci-dessous).
  private refresh(): void {
    const declarativeUpdate = (this as unknown as { update?: () => void }).update;
    if (typeof declarativeUpdate === 'function') {
      declarativeUpdate.call(this);
    } else {
      this.display();
    }
  }

  // Fallback pour Obsidian < 1.13 : sur ces versions, getSettingDefinitions()
  // n'est jamais appelée par le coeur et l'onglet resterait vide sans display().
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    // Aucun de nos callbacks render() n'utilise ce second paramètre (réservé
    // aux items imbriqués dans un SettingDefinitionGroup) : stub inoffensif.
    const unusedGroup = {} as unknown as SettingGroup;
    for (const def of this.getSettingDefinitions()) {
      if (!('render' in def) || !def.render) continue;
      def.render(new Setting(containerEl), unusedGroup);
    }
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      // ---- Général -------------------------------------------------------
      this.heading(t('settings.heading.general')),

      {
        name: t('settings.language'),
        desc: t('settings.languageDesc'),
        render: (setting) => {
          setting
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
                this.refresh();
              });
            });
        },
      },

      {
        name: t('settings.reconfigure'),
        desc: t('settings.reconfigureDesc2'),
        render: (setting) => {
          setting
            .setName(t('settings.reconfigure'))
            .setDesc(t('settings.reconfigureDesc2'))
            .addButton((btn) =>
              btn.setButtonText(t('settings.reconfigureBtn2')).onClick(() => {
                new OnboardingModal(this.app, this.plugin).open();
              })
            );
        },
      },

      // ---- Détection du texte --------------------------------------------
      this.heading(t('settings.heading.textDetection')),

      {
        name: t('settings.wholeWordOnly'),
        desc: t('settings.wholeWordOnlyDesc'),
        render: (setting) => {
          setting
            .setName(t('settings.wholeWordOnly'))
            .setDesc(t('settings.wholeWordOnlyDesc'))
            .addToggle((toggle) =>
              toggle.setValue(this.plugin.settings.wholeWordOnly).onChange(async (value) => {
                this.plugin.settings.wholeWordOnly = value;
                await this.plugin.saveSettings();
              })
            );
        },
      },

      {
        name: t('settings.caseSensitive'),
        desc: t('settings.caseSensitiveDesc'),
        render: (setting) => {
          setting
            .setName(t('settings.caseSensitive'))
            .setDesc(t('settings.caseSensitiveDesc'))
            .addToggle((toggle) =>
              toggle.setValue(this.plugin.settings.caseSensitive).onChange(async (value) => {
                this.plugin.settings.caseSensitive = value;
                await this.plugin.saveSettings();
              })
            );
        },
      },

      {
        name: t('settings.accentSensitive'),
        render: (setting) => {
          setting
            .setName(t('settings.accentSensitive'))
            .addToggle((toggle) =>
              toggle.setValue(this.plugin.settings.accentSensitive).onChange(async (value) => {
                this.plugin.settings.accentSensitive = value;
                await this.plugin.saveSettings();
              })
            );
        },
      },

      // ---- Pseudonymisation ----------------------------------------------
      this.heading(t('settings.heading.pseudonymization')),

      {
        name: t('settings.preserveCase'),
        desc: t('settings.preserveCaseDesc'),
        render: (setting) => {
          setting
            .setName(t('settings.preserveCase'))
            .setDesc(t('settings.preserveCaseDesc'))
            .addToggle((toggle) =>
              toggle.setValue(this.plugin.settings.preserveCase).onChange(async (value) => {
                this.plugin.settings.preserveCase = value;
                await this.plugin.saveSettings();
              })
            );
        },
      },

      {
        name: t('settings.preserveAnalyticNotation'),
        desc: t('settings.preserveAnalyticNotationDesc'),
        render: (setting) => {
          setting
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
        },
      },

      {
        name: t('settings.useMarkerInExport'),
        desc: t('settings.useMarkerInExportDesc'),
        render: (setting) => {
          setting
            .setName(t('settings.useMarkerInExport'))
            .setDesc(t('settings.useMarkerInExportDesc'))
            .addToggle((toggle) =>
              toggle.setValue(this.plugin.settings.useMarkerInExport).onChange(async (value) => {
                this.plugin.settings.useMarkerInExport = value;
                await this.plugin.saveSettings();
              })
            );
        },
      },

      {
        name: t('settings.markerOpen'),
        desc: t('settings.markerOpenDesc'),
        render: (setting) => {
          setting
            .setName(t('settings.markerOpen'))
            .setDesc(t('settings.markerOpenDesc'))
            .addText((text) =>
              text.setValue(this.plugin.settings.markerOpen).onChange(async (value) => {
                this.plugin.settings.markerOpen = value;
                await this.plugin.saveSettings();
              })
            );
        },
      },

      {
        name: t('settings.markerClose'),
        desc: t('settings.markerCloseDesc'),
        render: (setting) => {
          setting
            .setName(t('settings.markerClose'))
            .setDesc(t('settings.markerCloseDesc'))
            .addText((text) =>
              text.setValue(this.plugin.settings.markerClose).onChange(async (value) => {
                this.plugin.settings.markerClose = value;
                await this.plugin.saveSettings();
              })
            );
        },
      },

      // ---- Détection NER -------------------------------------------------
      this.heading(t('settings.heading.ner')),

      {
        name: t('settings.nerBackend'),
        desc: t('settings.nerBackendDesc'),
        render: (setting) => {
          setting
            .setName(t('settings.nerBackend'))
            .setDesc(t('settings.nerBackendDesc'))
            .addDropdown((d) => {
              d.addOption('none', t('settings.nerBackend.none'));
              d.addOption('transformers-js', t('settings.nerBackend.tfjs'));
              d.setValue(this.plugin.settings.nerBackend);
              d.onChange(async (v) => {
                this.plugin.settings.nerBackend = v as PseudObsSettings['nerBackend'];
                await this.plugin.saveSettings();
                this.refresh();
              });
            });
        },
      },

      // ---- Stockage -------------------------------------------------------
      this.heading(t('settings.heading.storage')),

      {
        name: t('settings.transcriptionsFolder'),
        desc: t('settings.transcriptionsFolderDesc'),
        render: (setting) => {
          setting
            .setName(t('settings.transcriptionsFolder'))
            .setDesc(t('settings.transcriptionsFolderDesc'))
            .addSearch((cb) => {
              new FolderSuggest(this.app, cb.inputEl);
              cb.setValue(this.plugin.settings.transcriptionsFolder).onChange(async (value) => {
                this.plugin.settings.transcriptionsFolder = value;
                await this.plugin.saveSettings();
              });
            });
        },
      },

      {
        name: t('settings.mappingFolder'),
        desc: t('settings.mappingFolderDesc'),
        render: (setting) => {
          setting
            .setName(t('settings.mappingFolder'))
            .setDesc(t('settings.mappingFolderDesc'))
            .addSearch((cb) => {
              new FolderSuggest(this.app, cb.inputEl);
              cb.setValue(this.plugin.settings.mappingFolder).onChange(async (value) => {
                this.plugin.settings.mappingFolder = value;
                await this.plugin.saveSettings();
              });
            });
        },
      },

      {
        name: t('settings.dictionariesFolder'),
        desc: t('settings.dictionariesFolderDesc'),
        render: (setting) => {
          setting
            .setName(t('settings.dictionariesFolder'))
            .setDesc(t('settings.dictionariesFolderDesc'))
            .addSearch((cb) => {
              new FolderSuggest(this.app, cb.inputEl);
              cb.setValue(this.plugin.settings.dictionariesFolder).onChange(async (value) => {
                this.plugin.settings.dictionariesFolder = value;
                await this.plugin.saveSettings();
              });
            });
        },
      },

      {
        name: t('settings.exportsFolder'),
        render: (setting) => {
          setting
            .setName(t('settings.exportsFolder'))
            .addSearch((cb) => {
              new FolderSuggest(this.app, cb.inputEl);
              cb.setValue(this.plugin.settings.exportsFolder).onChange(async (value) => {
                this.plugin.settings.exportsFolder = value;
                await this.plugin.saveSettings();
              });
            });
        },
      },

      // ---- Sécurité -------------------------------------------------------
      this.heading(t('settings.heading.security')),

      {
        name: t('settings.vaultPerCorpus'),
        desc: t('settings.vaultPerCorpusDesc'),
        render: (setting) => {
          setting.setName(t('settings.vaultPerCorpus')).setDesc(t('settings.vaultPerCorpusDesc'));
        },
      },

      {
        name: t('settings.warnIfSyncedFolder'),
        desc: t('settings.warnIfSyncedFolderDesc'),
        render: (setting) => {
          setting
            .setName(t('settings.warnIfSyncedFolder'))
            .setDesc(t('settings.warnIfSyncedFolderDesc'))
            .addToggle((toggle) =>
              toggle.setValue(this.plugin.settings.warnIfSyncedFolder).onChange(async (value) => {
                this.plugin.settings.warnIfSyncedFolder = value;
                await this.plugin.saveSettings();
              })
            );
        },
      },
    ];
  }
}
