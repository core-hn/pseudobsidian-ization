# Pseudonymizer Tool
alias `PseudObsidian-ization`

**Plugin Obsidian de pseudonymisation et de correction de transcriptions d'entretiens et de corpus interactionnels.**

Conçu pour les chercheurs en **analyse conversationnelle (EMCA)** et en **sciences du langage**, ce plugin permet de travailler directement dans Obsidian sur des transcriptions brutes issues de terrains de recherche, en produisant des versions pseudonymisées exploitables pour l'analyse et l'archivage éthique.

> **English summary** — An Obsidian plugin for pseudonymizing and correcting interactional transcripts (Jefferson / ICOR conventions, SRT, CHAT/CHA formats). Designed for qualitative researchers in linguistics and conversation analysis. See [SPECS.md](SPECS.md) for full technical specifications.

---

## Fonctionnalités

### Formats pris en charge
- `.srt` — sous-titres horodatés (sortie Whisper / IA)
- `.cha` / `.chat` — format CHAT / CLAN (CLAN, corpus de linguistique)
- `.md` — transcription Markdown (conventions Jefferson ou ICOR)
- `.txt` — texte brut

Les fichiers `.srt` et `.cha` sont **automatiquement convertis en Markdown** à l'import, pour une édition native dans Obsidian. La structure (horodatages, locuteurs, métadonnées `@`, lignes dépendantes `%`) est préservée.

### Pseudonymisation
- **Sélection → clic droit → Pseudonymiser** : remplace immédiatement dans le fichier
- **Pseudonymiser avec Coulmont** : interroge l'outil de Baptiste Coulmont ([coulmont.com](https://coulmont.com)) pour proposer des prénoms sociologiquement équivalents (même milieu social, même décennie de popularité) — le chercheur choisit dans la liste proposée
- **Créer une règle** : ajoute une correspondance dans le mapping JSON sans modifier le texte, pour validation ultérieure
- **Scanner le fichier courant** : liste toutes les occurrences des règles avec diff avant/après, validation occurrence par occurrence
- **Portées** : fichier, dossier, vault entier

### Tables de correspondance
- Format JSON structuré (voir `SPECS.md §5`)
- Trois niveaux : `fichier.mapping.json`, `dossier.mapping.json`, `vault.mapping.json`
- Statuts : `suggested`, `validated`, `ignored`, `partial`, `conflict`, `needs_review`
- Priorité z-index : entier libre, comme le `z-index` CSS — les entités longues priment sur les plus courtes par défaut (protection `Saint-Jean-de-Luz` vs `Jean`)
- Marqueur optionnel dans l'export : `⟦Pierre⟧` pour identifier visuellement les pseudonymes

### Surlignage dans l'éditeur
- **Orange** : termes sources encore présents (à pseudonymiser)
- **Vert** : pseudonymes déjà appliqués

### Sécurité
- Tout traitement est **local** — aucune donnée de transcription n'est envoyée à un serveur externe
- Exception documentée : "Pseudonymiser avec Coulmont" envoie le prénom à `coulmont.com` (pas le contenu de la transcription)
- Tables de correspondance strictement séparées des exports

---

## Statut actuel

**Version en développement actif — 0.0.1 (alpha)**

| Phase | Statut | Description |
|---|---|---|
| 0 — Boilerplate | ✅ | Plugin Obsidian TypeScript, Jest, ESLint |
| 1 — Parser SRT | ✅ | Round-trip exact, horodatages préservés |
| 2 — Parser CHAT | ✅ | Lignes `@`, `*`, `%` préservées |
| 3 — Moteur de pseudonymisation | ✅ | Spans, z-index, protection des chevauchements |
| 4 — Commandes UI | ✅ | Import, création de règles, export avec marqueur |
| 5 — Portées + surlignage | ✅ | ScopeResolver, CM6 ViewPlugin |
| 6 — Validation sélective | ✅ | OccurrencesModal, statuts partiels |
| **7 — Dictionnaires** | 🔄 **En cours** | Intégration Coulmont opérationnelle — import de dictionnaires JSON/CSV et constitution de ressources lexicales embarquées en cours |
| 8 — Scan automatique | ⏳ | Détection sans règle préexistante |
| 9 — Interface complète | ⏳ | Panneau latéral 4 onglets |
| 10 — Publication | ⏳ | Communauté Obsidian |

---

## Installation

### Pour les utilisateurs

1. Télécharger la dernière release (fichiers `main.js`, `manifest.json`, `styles.css`)
2. Copier ces trois fichiers dans `.obsidian/plugins/pseudobsidianization/` de votre vault
3. Activer le plugin dans Obsidian → Paramètres → Extensions communautaires

> Le plugin n'est pas encore soumis au répertoire communautaire Obsidian. Publication prévue à partir de la version 0.1.0.

### Pour les développeurs et contributeurs

```bash
git clone https://gitlab.huma-num.fr/[votre-groupe]/pseudobsidianization.git
cd pseudobsidianization
npm install
npm run dev      # build en mode watch
npm test         # suite de tests Jest
npm run build    # build de production
```

Copier `main.js`, `manifest.json` et `styles.css` dans `.obsidian/plugins/pseudobsidianization/` d'un vault Obsidian dédié au développement.  
Installer [Hot Reload](https://github.com/pjeby/hot-reload) dans ce vault et créer un fichier `.hotreload` dans le dossier du plugin pour le rechargement automatique à chaque build.

#### Structure du dépôt

```
pseudobsidianization/
├── src/
│   ├── main.ts           # Point d'entrée Obsidian
│   ├── types.ts          # Types partagés (SPECS §11.3)
│   ├── settings.ts       # Paramètres
│   ├── parsers/          # SrtParser, ChatParser, TranscriptConverter
│   ├── mappings/         # MappingStore, ScopeResolver
│   ├── pseudonymizer/    # Moteur, ReplacementPlanner, SpanProtector
│   ├── scanner/          # OccurrenceScanner
│   └── ui/               # Modales, surlignage CM6
├── tests/                # Tests unitaires Jest
├── manifest.json         # Métadonnées du plugin Obsidian
├── versions.json
├── styles.css
├── SPECS.md              # Spécifications fonctionnelles complètes
├── ROADMAP.md            # Feuille de route détaillée
└── README.md
```

---

## Contribuer

Les contributions sont les bienvenues, en particulier :

- **Dictionnaires** : listes de prénoms, toponymes, institutions adaptés à des corpus spécifiques (langues régionales, périodes historiques, terrains non francophones)
- **Conventions de transcription** : parsers pour d'autres systèmes (ELAN, Praat TextGrid, EXMARaLDA)
- **Adaptateurs** : connecteurs vers d'autres ressources lexicales ouvertes
- **Retours d'usage** : issues GitLab pour signaler des cas limites rencontrés sur de vrais corpus

Merci d'ouvrir une issue avant de proposer une pull request pour les fonctionnalités importantes.

---

## Licence

### Code — *The Beerware License* (Revision 42)

```
Axelle Abbadie <https://cv.hal.science/axelle-abbadie/> a écrit ce logiciel.
Vous pouvez faire ce que vous voulez avec, tant que vous conservez cette notice.
Si on se croise un jour et que vous pensez que ça valait le coup,
vous pouvez m'offrir une bière.
```

**Ce plugin est fait pour être modifié.** Si votre terrain de recherche implique des conventions de transcription particulières, un dialecte régional, des corpus multilingues ou des formats d'export spécifiques à votre institution, ne vous gênez pas pour adapter le code à vos besoins. C'est précisément l'esprit de cet outil.

### Documentation et spécifications — CC BY 4.0

Les fichiers `SPECS.md`, `ROADMAP.md` et ce `README.md` sont placés sous licence [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

Vous êtes libres de les réutiliser, adapter et redistribuer, y compris à des fins commerciales, à condition de créditer la source.

---

## Crédits

### Propriété intellectuelle
- **Axelle Abbadie** — conception, spécifications, direction du développement, recherche UX ([cvHAL](https://cv.hal.science/axelle-abbadie/))
- Vibe-coding avec **Claude Sonnet 4.6** (Anthropic)

### Inspiration
- **Sonal pi** — À la suite d'une rencontre avec [Maxime Beligné](https://umr5600.cnrs.fr/fr/lequipe/name/max-beligne/) au cours de [la journée "Pseudonymiser, Anonymiser ?" organisée par la MSH-Sud](https://www.mshsud.org/agenda/anonymiser-pseudonymiser/). Lien vers le logiciel : [Sonal-pi](https://www.sonal-info.com/), développé depuis 2008 par Alex Alber.

### Travaux valorisés
- **Baptiste Coulmont** — outil de pseudonymisation ([coulmont.com/bac](https://coulmont.com/bac)) utilisé pour la suggestion de prénoms
