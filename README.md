# PseudObsidian-ization

Plugin Obsidian de **pseudonymisation et de correction de transcriptions** pour chercheurs en sciences du langage. Il comble un manque : les outils existants (Sonal, Whispurge) ne s'intègrent pas dans un environnement de prise de notes et d'analyse, et peu de logiciels acceptent les conventions de transcription multimodales (Jefferson, ICOR).

> **English summary** — An Obsidian plugin for pseudonymizing and correcting interactional transcripts (Jefferson / ICOR conventions, .srt, .cha formats). Designed for qualitative researchers in linguistics and conversation analysis. See [SPECS.md](SPECS.md) for full technical specifications.

---

## Workflow

```
Transcription brute (.srt, .cha, .md, .txt)
        ↓ import automatique
Obsidian — édition native Markdown
        ↓ pseudonymisation (manuelle ou NER)
Fichier source annoté  +  table de correspondance (séparée)
        ↓ export
Transcription pseudonymisée (.pseudonymized.*)
```

Deux approches, combinables librement :

- **Manuelle** — clic droit sur un terme → choisir un pseudonyme → le plugin remplace et enregistre la règle
- **Automatique (NER)** — un modèle d'IA détecte les entités identifiantes et les surligne en bleu dans l'éditeur → le chercheur valide ou rejette chaque candidat par clic droit

Les pseudonymes sont encadrés de marqueurs `{{...}}` dans le fichier source et l'export pour rester visuellement distincts des données brutes. Les tables de correspondance ne sont jamais incluses dans les exports.

---

## Prise en main

### Premier lancement

Au premier chargement, un assistant de configuration s'ouvre automatiquement en trois étapes :

1. **Bienvenue** — présentation du plugin
2. **Détection NER** — choisir d'activer le modèle IA local (téléchargement WASM ~19 Mo) ou de travailler uniquement avec des règles manuelles
3. **Dictionnaires** — importer des fichiers `.dict.json` existants si vous avez déjà des listes de candidats de remplacement

L'assistant est relançable à tout moment : Paramètres → Pseudonymizer tool → Reconfigurer.

### Formats pris en charge

| Format | Extension | Notes |
|---|---|---|
| Sous-titres horodatés | `.srt` | Sortie Whisper / IA — horodatages et structure préservés |
| CHAT / CLAN | `.cha`, `.chat` | Lignes `@`, `*`, `%` préservées |
| Markdown annoté | `.md` | Conventions Jefferson ou ICOR |
| Texte brut | `.txt` | Sans marqueurs de convention |

Les fichiers `.srt` et `.cha` sont automatiquement convertis en Markdown à l'import. Un fichier de mapping JSON vide est créé en même temps.

> Installez le plugin [Data Files Editor](https://github.com/zuktol/obsidian-data-files-editor) pour visionner les fichiers de mapping JSON directement depuis votre vault.

### Installation

**Via le répertoire communautaire Obsidian** (validation en cours) :
1. Obsidian → Paramètres → Extensions communautaires → Parcourir → "Pseudonymizer Tool"

**Installation manuelle** depuis la [dernière release GitHub](https://github.com/core-hn/pseudobsidian-ization/releases) :
1. Télécharger `main.js`, `manifest.json`, `styles.css`
2. Copier dans `.obsidian/plugins/pseudonymizer-tool/` de votre vault
3. Activer dans Paramètres → Extensions communautaires

> Les fichiers WASM (NER) sont téléchargés automatiquement par l'assistant au premier lancement si vous activez la détection automatique. Vous pouvez aussi les télécharger manuellement depuis la release.

---

## Fonctionnalités

### Pseudonymisation manuelle

Toutes les actions sont disponibles via le **clic droit** sur une sélection dans l'éditeur :

| Action | Description |
|---|---|
| **Pseudonymiser** | Remplace le terme (cette occurrence ou toutes) avec marqueurs `{{...}}` |
| **Pseudonymiser avec Pr Baptiste Coulmont** | Interroge [coulmont.com](https://coulmont.com) — propose des prénoms sociologiquement équivalents (même milieu social, même décennie) |
| **Créer une règle** | Enregistre la correspondance dans le mapping JSON sans modifier le texte |
| **Modifier la règle** | Modifie une règle existante (disponible sur les termes en orange ou en vert) |
| **Annuler la pseudonymisation** | Restaure le terme original pour cette occurrence (disponible sur les termes en vert) |

### Détection automatique par NER

Le moteur de **reconnaissance d'entités nommées** détecte prénoms, noms, lieux et institutions sans liste préexistante, en exploitant le contexte syntaxique. Contrairement à une approche par dictionnaire, il distingue "Florence" la personne de "Florence" la ville. Les sous-termes d'une entité composée connue sont filtrés automatiquement (si "Saint-Jean-de-Luz" est une règle, "Jean" et "Luz" ne remontent pas comme candidats NER).

> Pour comprendre ce que sont les modèles NER : [blog Vaniila](https://blog.vaniila.ai/NER/).

**Utilisation :**
1. Panneau latéral → onglet **Candidats** → **Identifier des candidats**
2. Les entités apparaissent **surlignées en bleu** dans l'éditeur
3. Clic droit sur un terme bleu → **Pseudonymiser** ou **Créer une règle**

**Modèle :** `Xenova/bert-base-multilingual-cased-ner-hrl` via `transformers.js`. Exécution 100 % locale. Téléchargements uniques au premier usage : WASM (~19 Mo) + modèle NER (~66 Mo). **Fonctionnement hors-ligne après le premier téléchargement.**

**Paramètres (onglet NER du panneau)** :
- **Seuil de confiance** (0,50–1,00) : augmenter réduit les faux positifs
- **Mots fonctionnels exclus** : liste éditable des tokens à toujours ignorer ("de", "du", "la"…)

### Panneau latéral

Accessible via l'icône dans le ruban ou `Ctrl+P → Pseudonymisation : ouvrir le panneau`.

| Onglet | Contenu |
|---|---|
| **Candidats** | Scanner (règles existantes) · Identifier des candidats (NER) · Validation · Appliquer |
| **Mappings** | Règles actives · Modifier · Supprimer · Ajouter |
| **Dictionnaires** | Import de fichiers `.dict.json` |
| **Exports** | Pseudonymiser et exporter · Exporter la table de correspondance |
| **NER** | Visible si NER activé · Seuil de confiance · Mots fonctionnels exclus |

### Surlignage et marqueurs

Le surlignage est actif dans tout fichier ouvert, y compris les fichiers export `.pseudonymized.*` qui héritent automatiquement des règles du fichier source.

| Couleur | Signification |
|---|---|
| 🟠 Orange + contour | Terme source encore présent — à pseudonymiser |
| 🟢 Vert + souligné | Pseudonyme appliqué en direct dans le fichier |
| 🔵 Bleu + contour | Candidat NER — pas encore de règle |

Dans les fichiers exportés, les pseudonymes sont encadrés de marqueurs `{{Pierre}}` pour les distinguer des données brutes (activé par défaut, configurable dans les paramètres).

### Tables de correspondance

- Trois niveaux de portée : `fichier.mapping.json` · `dossier.mapping.json` · `vault.mapping.json`
- Statuts par occurrence : `validated`, `ignored`, `partial`, `conflict`, `needs_review`
- **Priorité z-index** : entier libre — les entités longues priment (`Saint-Jean-de-Luz` > `Jean`)
- Format JSON documenté dans `SPECS.md §5`

### Sécurité et confidentialité

- Tout traitement est **local** — aucun texte de transcription n'est envoyé à un serveur externe
- Le modèle NER s'exécute dans Obsidian via WASM, sans appel réseau
- **Exception documentée :** "Pseudonymiser avec Coulmont" propose des *prénoms de remplacement* à partir d'une requête du *prénom à pseudonymiser* (pas le contenu de la transcription) à l'outil `coulmont.com/bac`. Sur son site web, B. Coulmont précise que "recherches ne sont pas enregistrées".
- Les tables de correspondance ne sont jamais incluses dans les exports pseudonymisés.

---

## Pour les développeurs

```bash
git clone https://gitlab.huma-num.fr/aabbadie/pseudobsidian-ization.git
cd pseudobsidian-ization
npm install
npm run dev      # build en mode watch
npm test         # suite de tests Jest
npm run build    # build de production
npm run deploy   # build + copie dans test_vault/
```

Structure du dépôt :

```
src/
├── main.ts               # Point d'entrée Obsidian
├── settings.ts           # Paramètres persistants
├── types.ts              # Types partagés
├── parsers/              # SrtParser, ChatParser, TranscriptConverter
├── mappings/             # MappingStore, ScopeResolver
├── pseudonymizer/        # Moteur, ReplacementPlanner, SpanProtector
├── scanner/              # OccurrenceScanner, OnnxNerScanner
└── ui/                   # PseudonymizationView, modales, surlignage CM6
```

---

## Statut — v0.1.0

| Phase | Statut | Description |
|---|---|---|
| 0–6 | ✅ | Parsers · Moteur · Commandes · Portées · Surlignage · Validation |
| 7 — Coulmont | ✅ | Suggestions de prénoms équivalents · Import JSON/CSV |
| 8 — Panneau latéral | ✅ | 4 onglets · NER embarqué · Wizard · Annulation · Surlignage export |
| 9 — Dictionnaires de candidats NER & spaCy | 🔄 | Dictionnaires de d'identification des mots candidats pour lieux/institutions à pseudonymiser |
| 10 — Affinage | ⏳ | Stabilisation v0.2.0 |
| 11 — Fonctions EMCA | ⏳ | Navigation tours · Correction Jefferson/ICOR · Export ELAN |

Voir [ROADMAP.md](ROADMAP.md) pour le détail des phases et les features envisagées.

---

## Contribuer

Les contributions sont les bienvenues, en particulier :

- **Dictionnaires** : listes de prénoms, toponymes, institutions pour des corpus spécifiques (langues régionales, terrains non francophones, périodes historiques)
- **Conventions de transcription** : parsers pour d'autres systèmes (ELAN, Praat TextGrid, EXMARaLDA)
- **Retours d'usage** : issues pour signaler des cas limites rencontrés sur de vrais corpus

Merci d'ouvrir une issue avant de proposer une pull request pour les fonctionnalités importantes.

---

## Licence

### Code

*The Beerware License* (Revision 42)

```
Axelle Abbadie a conçu ce code. Vous pouvez faire ce que vous voulez avec,
tant que vous conservez cette notice. Si on se croise un jour et que vous
pensez que ça valait le coup, vous pouvez m'offrir une bière.
```

**Ce plugin est fait pour être modifié.** Si votre terrain implique des conventions de transcription particulières, un dialecte régional, des corpus multilingues ou des formats d'export spécifiques à votre institution, adaptez le code à vos besoins.

### Plugin et dépôt

[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) (CC BY 4.0).

---

## Crédits

<!-- Suggestions — à compléter par l'auteure : -->
### Propriété intellectuelle
- **Axelle Abbadie** — conception, spécifications, direction du développement, recherche UX. ([cvHAL](https://cv.hal.science/axelle-abbadie))
- Vibe-coding avec **Claude Sonnet 4.6** (Anthropic)

### Inspiration
- **Sonal pi** — À la suite d'une rencontre avec [Maxime Beligné](https://umr5600.cnrs.fr/fr/lequipe/name/max-beligne/) au cours de [la journée "Pseudonymiser, Anonymiser ?" organisée par la MSH-Sud](https://www.mshsud.org/agenda/anonymiser-pseudonymiser/). Lien vers le logiciel : [Sonal-pi](https://www.sonal-info.com/), développé par depuis 2008 par Alex Alber.

### Travaux valorisés
- **Baptiste Coulmont** — outil de pseudonymisation ([coulmont.com/bac](https://coulmont.com/bac)) utilisé pour la suggestion de prénoms.
- **Stefan Schweter** (Bayerische Staatsbibliothek) — modèle NER multilingue [`bert-base-multilingual-cased-ner-hrl`](https://huggingface.co/stefan-it/bert-base-multilingual-cased-ner-hrl), utilisé pour la détection automatique des entités nommées.
- **Joshua Lochner / Xenova** — conversion ONNX du modèle et bibliothèque [`transformers.js`](https://github.com/xenova/transformers.js), qui permettent l'exécution locale dans Obsidian sans dépendance Python.
