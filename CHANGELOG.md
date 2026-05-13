# Changelog

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
