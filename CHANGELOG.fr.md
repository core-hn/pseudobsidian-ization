# Changelog

## [dev] v0.1.5 — branche `dev`

### Nouvelles fonctionnalités

**Intégration noScribe**
- **`VttParser`** — WebVTT standard avec word timestamps Whisper (`<00:00:01.240><c>mot</c>`), tags `<v Nom>`, round-trip garanti
- **`NoScribeHtmlParser`** — HTML Qt Rich Text noScribe : ancres `ts_DEBUT_FIN_SXX` (ms), labels locuteurs (`S00:`, `S01:`), timestamps d'affichage filtrés, entités HTML décodées ; `extractAudioSource()` lit `<meta name="audio_source">`
- **`NoScribeVttParser`** — VTT noScribe v0.7 : cues splitées (label / timestamp affichage / texte), détection locuteur par préfixe `SXX:`, entités HTML, source audio depuis `NOTE media:`
- **Format Markdown noScribe** — `**S00** [HH:MM:SS] : texte` par tour ; `pseudobs-format: html|vtt` et `pseudobs-audio` optionnel en frontmatter ; timestamps word-level dans `<basename>.words.json`
- **Import audio automatique** — depuis la meta tag HTML ou le dossier source (VTT, un seul fichier audio)
- **`Redaction.ts`** — caviardage par syllabes avec `🀫` ; `generateRedaction()` et `isRedaction()`
- **Re-export VTT** (commande "Exporter en VTT") — WebVTT propre depuis `.md` pseudonymisé + `.words.json`

**Modale de scan — candidats par occurrence**
- **`MappingScanReviewModal`** — colonne occurrences cliquable (compteur mis à jour en direct : `N / total` si exceptions)
- **`OccurrencesContextModal`** — cartes par occurrence (✓ / ✗ / ⚠) avec contexte, callback "Confirmer la sélection", sans application immédiate
- **Bouton "Enregistrer les exceptions"** — sauvegarde les décisions dans le `mapping.json` sans pseudonymiser
- `MappingRuleResult` porte maintenant `occurrences: Occurrence[]`

**Exceptions**
- Type **`IgnoredOccurrence`** (`{text, contextBefore, contextAfter}`) sur `MappingRule.ignoredOccurrences`
- Persistance dans `mapping.json`, chargement au démarrage — surlignage rouge sans re-scan
- **Surlignage rouge** (`pseudobs-exception`, sensible à la casse, priorité 0)
- **Section "Exceptions" dans l'onglet Mappings** — cartes contextuelles avec bouton supprimer

### Modifications
- Labels de statut clarifiés : `validated` → "Actif", `ignored` → "Ignoré", `partial` → "Partiel", `suggested` → "Suggéré" ; colonne renommée "État"
- `getValidatedFor()` inclut maintenant `partial` comme état actif (avec `validated`)
- Bouton "Scanner" de `PseudonymizationView` corrigé (`occurrences` manquant dans `MappingRuleResult`)

### Tests
149 tests · 10 suites · `VttParser`, `NoScribeHtmlParser`, `NoScribeVttParser`, `markdownToVtt`, `extractWordData` couverts ; fixtures : `fight_club.vtt`, `juste-leblanc.html`

---

## [prod] v0.1.3 — 14 mai 2026

**Branche :** `main` | **Tag :** `0.1.3`

### Nouvelles fonctionnalités
- **Système de dictionnaires structurés** — format `DictionaryFile` v1.1 : champs `roles` (détection / remplacement / classes), `configSchema` (variables configurables avec valeurs possibles), `config` (valeurs actives), `author`, `doi`
- **`DictionaryLoader`** — service de chargement, index de détection normalisé, résolution de classes par conditions/regex/word-to-word, calcul d'index incrémental par portée
- **Repo dédié [`pseudobsidian-dictionaries`](https://github.com/core-hn/pseudobsidian-dictionaries)** — catalogue de dictionnaires téléchargeables, premier dictionnaire : communes françaises GeoAPI INSEE (34 957 entrées, classes Village → Métropole)
- **Wizard — catalogue de dictionnaires** : tableau scrollable avec bouton icône `cloud-download` → `refresh-cw` (spin) → `cloud-check` ; installation depuis le repo dédié sans quitter Obsidian
- **`scripts/build-cities.mjs`** — script one-shot de génération du dictionnaire communes depuis GeoAPI INSEE
- **Scan par dictionnaire** (`Onglet Dictionnaires → Scanner`) : fenêtre glissante de n-grammes, filtre par dictionnaires cochés, commande Ctrl+P disponible
- **`DictScanReviewModal`** — modale de révision en cards : terme source, catégorie (tiny), extrait de contexte avec terme surligné, préfixe éditable + index calculé en lecture seule (recalcul dynamique si décoché), checkbox par card
- **`MappingScanReviewModal`** — modale de révision pour le scan par règles : tableau source → remplacement · occurrences, application directe dans le fichier source
- **Onglet Mappings** — bouton "Scanner le fichier" ouvre `MappingScanReviewModal`
- **Onglet NER** — bouton "Identifier des candidats" en haut de l'onglet
- **`RuleModal`** — suggestions de remplacement par classe (dictionnaire) séparées des suggestions Coulmont ; modal Coulmont n'affiche plus les suggestions dictionnaire (prénoms ≠ lieux)

### Suppressions
- **Onglet "Candidats"** supprimé — le scan par règles est maintenant dans Mappings, le scan NER dans NER

### Corrections
- `DictScanReviewModal` : l'index n'est plus modifiable manuellement — seul le préfixe l'est, l'index se recalcule quand on coche/décoche des items
- CSS : animation spin sur l'icône de téléchargement en cours, mini cards dictionnaires dans le panneau

---

## [prod] v0.1.2 — 13 mai 2026

**Branche :** `main` | **Tag :** `0.1.2`

### Corrections
- `setInterval`/`clearInterval` remplacés par partage de Promise dans `OnnxNerScanner` — plus de polling, appels concurrents correctement gérés

---

## [prod] v0.1.1 — 13 mai 2026

**Branche :** `main` | **Tag :** `0.1.1`

### Nouvelles fonctionnalités
- **Onglet Dictionnaires** — liste les `.dict.json` du vault avec nombre d'entrées, import et suppression

### Corrections portail communautaire Obsidian
- `onunload` : suppression de `detachLeavesOfType`
- `eslint-disable` et `any` : type `TransformersModule` explicite dans `OnnxNerScanner`
- `window.setInterval`/`clearInterval`, `window.setTimeout`, `activeDocument`
- `FileManager.trashFile()` à la place de `Vault.delete()`
- `activeLeaf` déprécié → `getActiveViewOfType(ItemView)`
- Imports inutilisés supprimés (`Setting`, `RuleLocation`, `fs`)
- Promises dans les event listeners wrappées avec `void (async () => {})()`
- CSS `text-decoration-color` → `border-bottom` (support partiel)
- Workflow `.github/workflows/release.yml` — attestations GitHub Actions
- Régénération `package-lock.json` (erreur CI `concat-map` 404)

---

## [prod] v0.1.0 — 13 mai 2026

**Branche :** `main` | **Tag :** `0.1.0`

## [dev] v0.1.0 — en cours

**Branche :** `dev` | **Publié :** non

### Nouvelles fonctionnalités
- **Panneau latéral** (`PseudonymizationView`) — 5 onglets : Candidats, Mappings, Dictionnaires, Exports, NER
- **Détection NER** (`OnnxNerScanner`) — modèle BERT-NER multilingue via `transformers.js` (WASM, 100 % local)
  - Surlignage bleu des candidats dans l'éditeur
  - Filtrage des sous-termes de règles composées (Saint-Jean-de-Luz filtre Jean/Luz)
  - Paramètres ajustables : seuil de confiance, mots fonctionnels exclus (onglet NER)
- **Wizard onboarding** — 3 étapes : bienvenue, setup NER (téléchargement WASM ~19 Mo), import dictionnaires
- **Marqueurs `{{...}}`** activés par défaut dans les remplacements en direct et les exports
- **Clic droit → Annuler la pseudonymisation** — restaure le terme original (sur termes verts)
- **Surlignage** : vert + souligné pour les remplacements en direct ; fichiers `*.pseudonymized.*` surlignés avec les règles du fichier source
- **Import de dictionnaires `.dict.json`** depuis le wizard
- **Paramètres NER** : `nerBackend`, `nerMinScore`, `nerFunctionWords` dans les settings
- **eslint_violations.md** — référence du lint Obsidian et commande de test local

### Corrections
- `style.marginLeft` → classe CSS (`no-static-styles-assignment`)
- Icônes UI (✓ ✗ ← → +) déplacées en CSS `::before`/`::after`
- `getActiveFile()` polyfill pour le panneau latéral (garde le dernier fichier connu)
- `import.meta.url` polyfill dans esbuild pour `@xenova/transformers/src/env.js`
- Alias `onnxruntime-node → ort-web.node.js` pour éviter les binaires natifs non bundlables
- `env.cacheDir` fixé avant `pipeline()` (évite `path.join(null, ...)`)
- Références institutionnelles incorrectes supprimées (ICAR, CNRS)

### Technique
- `@xenova/transformers` v2.17.2 ajouté comme dépendance
- esbuild : `target: es2020`, `platform: browser` retiré, banner polyfill `import.meta.url`
- `tsconfig.json` : target ES2020, lib ES2020

---

## [prod] v0.0.4 — 12 mai 2026

**Branche :** `main` | **Tag :** `0.0.4` | **Publié :** GitLab + GitHub (`core-hn/pseudobsidian-ization`)

### Corrections bot Obsidian
- Suppression du heading "Pseudonymizer tool" en tête des settings (`settings-tab/no-manual-html-headings`)

---

## [prod] v0.0.3 — mai 2026

**Branche :** `main` | **Tag :** `0.0.3`

### Corrections bot Obsidian (Required)
- `style.cssText` et `setAttribute('style')` → classes CSS (`no-static-styles-assignment`)
- Headings `<h2>`/`<h3>` dans les settings → `new Setting().setHeading()` (`settings-tab/no-manual-html-headings`)
- Promesses flottantes → opérateur `void` (`no-floating-promises`)
- Sentence case sur les labels UI

---

## [prod] v0.0.2 — mai 2026

**Branche :** `main` | **Tag :** `0.0.2`

### Changements
- Rename du plugin : `pseudobsidianization` → `pseudonymizer-tool` (exigence répertoire communautaire)
- Description `manifest.json` en anglais

---

## [prod] v0.0.1 — mai 2026

**Branche :** `main` | **Tag :** `0.0.1`

### Première release
- Parsers SRT et CHAT/CHA avec round-trip garanti
- Moteur de pseudonymisation (spans, priorité z-index, protection chevauchements)
- Portées fichier / dossier / vault
- Surlignage CM6 (orange = sources, vert = remplacements)
- Validation sélective par occurrence (OccurrencesModal)
- Import de transcriptions avec conversion automatique
- Intégration Coulmont (suggestions de prénoms sociologiquement équivalents)
- Soumission PR #12766 au répertoire communautaire Obsidian
