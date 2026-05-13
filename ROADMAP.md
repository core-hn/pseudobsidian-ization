# ROADMAP — PseudObsidian-ization

Plugin Obsidian de pseudonymisation et correction de transcriptions (conventions Jefferson / ICOR / SRT / CHAT).

Chaque phase produit quelque chose de testable. Les critères d'acceptation renvoient aux sections de SPECS.md.

## État actuel (mai 2026) — v0.1.0

**Phases 0 à 8 terminées.** La Phase 9 (dictionnaires de remplacement pour lieux/institutions) est la prochaine cible.

Décision architecturale adoptée en mai 2026 : la **détection des entités identifiantes** repose sur du **NER** (`transformers.js` + `bert-base-multilingual-cased-ner-hrl`) plutôt que sur des dictionnaires lexicaux exhaustifs. Les dictionnaires restent des ressources de **remplacement** (candidats de substitution), pas de détection.

```
✅ Phases 0–8   Parsers · Moteur · UI · Portées · Surlignage · Validation · Coulmont · Panneau · NER · Wizard
🔄 Phase 9      Dictionnaires de remplacement (lieux/institutions) (v0.1.0)
⏳ Phase 10     Affinage et stabilisation (v0.2.0)
⏳ Phase 11     Fonctions d'analyse interactionnelle et conversationnelle (v1.0.0)
```

La publication sur le répertoire communautaire Obsidian se fait **au fil des versions** (PR #12766 en cours de validation).

---

---

## ✅ Phase 0 — Boilerplate

- [x] Initialiser le plugin avec le template officiel Obsidian (TypeScript + esbuild)
- [x] Configurer ESLint, Prettier, Jest
- [x] Définir les types partagés de SPECS.md §11.3 : `ScopeType`, `MappingStatus`, `EntityCategory`, `MappingRule`, `Scope`, `Occurrence`, `ReplacementSpan`
- [x] Créer un vault de test avec des fichiers fictifs : `entretien_01.srt`, `entretien_02.cha`, `entretien_03.md`
- [x] Mettre en place le dossier `_pseudonymisation/` dans le vault de test (§13.3)

**Testable :** le plugin se charge dans Obsidian sans erreur.

---

## ✅ Phase 1 — Parser SRT

Objectif : ouvrir un `.srt`, le lire sans l'altérer, identifier les zones textuelles. Priorité haute car c'est le format le plus courant en sortie de Whisper.

- [ ] Implémenter `parsers/SrtParser.ts` :
  - Découpage en blocs (numéro / horodatage / texte)
  - Identification des zones remplaçables (texte uniquement, pas les timestamps)
  - Représentation interne : tableau de `SrtBlock { index, start, end, lines[] }`
- [ ] Tests unitaires sur `entretien_01.srt` fictif
- [ ] Vérifier que la reconstruction du fichier à partir de l'AST est identique à l'original (round-trip)

**Testable — SPECS §17.4 :** après parse + reconstruction, les horodatages et numéros de blocs sont inchangés.

---

## ✅ Phase 2 — Parser CHAT / CHA

Objectif : ouvrir un `.cha`, distinguer métadonnées, tours de parole et lignes dépendantes.

- [ ] Implémenter `parsers/ChatParser.ts` :
  - Lignes `@` (métadonnées) → préservées telles quelles
  - Lignes `*LOCUTEUR:` → tour de parole, zone remplaçable
  - Lignes `%` (dépendantes) → préservées ou traitées séparément selon action explicite
  - Représentation interne : `ChatLine { type: 'meta'|'turn'|'dependent', speaker?, content }`
- [ ] Tests unitaires sur `entretien_02.cha` fictif
- [ ] Vérifier le round-trip

**Testable — SPECS §17.5 :** les lignes `@`, `*` et `%` sont conservées après parse + reconstruction.

---

## ✅ Phase 3 — Mapping basique : sélection → règle → application fichier

Objectif : premier flux complet, portée fichier uniquement. C'est le cœur du MVP v0.1 (SPECS §16.1).

- [ ] Commande "Créer une règle depuis la sélection" (§10.1) : modale minimale (source, remplacement, catégorie, portée = fichier par défaut)
- [ ] `mappings/MappingStore.ts` : lecture / écriture de `entretien_XX.mapping.json` (portée `file`)
- [ ] `scanner/OccurrenceScanner.ts` : scan du fichier courant, liste des occurrences avec contexte gauche/droite (§7.2)
- [ ] Vue latérale minimale — onglet **Occurrences** : fichier, ligne, contexte, remplacement proposé, bouton valider/ignorer (§10.3)
- [ ] `pseudonymizer/ReplacementPlanner.ts` : construit le plan de remplacement (§12.1)
- [ ] `pseudonymizer/SpanProtector.ts` : résolution des spans, application droite-à-gauche (§12.4, §12.5)
- [ ] Export du fichier pseudonymisé (`nom.pseudonymized.srt` / `.cha` / `.md`) sans table de correspondance (§14.1)
- [ ] Export de la table JSON séparément (§14.2)

**Testable — SPECS §17.1 :** `Bonjour Jean.` → règle Jean → Pierre → export contient `Bonjour Pierre.` et la table JSON contient le mapping.

---

## ✅ Phase 4 — Priorité z-index et protection des spans imbriqués

Objectif : garantir qu'un remplacement court ne s'applique pas à l'intérieur d'un segment long déjà traité.

- [x] Champ `priority` dans `MappingRule` : entier libre, défaut 0 (comme z-index CSS — §8.4)
- [x] `sortRules` : tri par `priority` décroissant, puis longueur source décroissante, puis portée locale (§12.3)
- [x] `resolveSpans` : élimination des chevauchements selon ce tri (§12.4)
- [x] Tests de non-régression obligatoires (§18.2) : Jean/Saint-Jean-de-Luz, Paul/Saint-Paul, Montpellier/CHU, Marie/Sainte-Marie
- [ ] **Exploitable dans Obsidian** :
  - Commande `Pseudonymisation : ajouter une transcription` (Ctrl+P) : ouvre un sélecteur de fichier natif, importe le fichier dans le vault, initialise un mapping JSON vide, ouvre le fichier
  - Commande `Pseudonymisation : pseudonymiser le fichier courant` : lit le fichier actif (SRT, CHA/CHAT, MD), charge le mapping JSON correspondant, écrit `[nom].pseudonymized.[ext]` dans `_pseudonymisation/exports/`
  - Commande `Pseudonymisation : créer une règle` (disponible sur sélection dans l'éditeur) : modale minimale — source, remplacement, catégorie, portée, priority — écrit dans le mapping JSON du fichier courant
  - Tester manuellement : importer `entretien_01.srt`, créer les règles Jean → Pierre et Saint-Jean-de-Luz → Ville littorale, pseudonymiser, vérifier l'export

**Testable — SPECS §17.2 :** `Jean habite Saint-Jean-de-Luz.` → `Pierre habite Ville littorale.` visible dans le fichier exporté dans Obsidian.

---

## ✅ Phase 5 — Portée dossier et vault + surlignage éditeur

Objectif : charger automatiquement les trois niveaux de mapping et visualiser dans l'éditeur les termes déjà pseudonymisés.

- [ ] `mappings/ScopeResolver.ts` : parcourir le dossier `_pseudonymisation/mappings/`, charger tous les fichiers JSON, filtrer et fusionner les règles applicables à un fichier donné (§4, §12.2)
- [ ] Cascade de résolution : fichier → dossier le plus proche → vault — géré par le tri `sortRules` existant via `scopeWeight` (§4.4)
- [ ] **Surlignage éditeur** : extension CodeMirror 6 (`registerEditorExtension`) qui marque dans le fichier ouvert :
  - en **orange** : les termes sources (encore à pseudonymiser)
  - en **vert** : les termes de remplacement (déjà pseudonymisés)
  - se met à jour à chaque changement de fichier actif
- [ ] **Exploitable dans Obsidian** :
  - La commande "pseudonymiser" utilise ScopeResolver pour charger les trois niveaux automatiquement
  - Commande `Pseudonymisation : créer une règle au niveau dossier / vault`
  - Le surlignage apparaît dès qu'un mapping existe pour le fichier ouvert
  - Tester : une règle vault s'applique à deux entretiens différents ; les termes s'affichent surlignés dans les deux fichiers

**Testable :** ouvrir un fichier avec des règles de mapping → termes sources en orange, pseudonymes déjà appliqués en vert.

---

## ✅ Phase 6 — Validation sélective et statuts

Objectif : pouvoir remplacer certaines occurrences et en ignorer d'autres.

- [ ] Statuts par occurrence : `suggested`, `validated`, `ignored`, `partial`, `conflict`, `disabled`, `needs_review` (§5.4)
- [ ] Validation occurrence par occurrence, par lot, ou globale (§10.5)
- [ ] Mapping au statut `partial` quand certaines occurrences seulement sont remplacées (§17.3)
- [ ] **Exploitable dans Obsidian** :
  - Commande `Pseudonymisation : scanner le fichier courant` → liste les occurrences candidates dans une modale
  - Chaque occurrence : bouton Valider / Ignorer / Faux positif
  - Prévisualisation diff par occurrence avant application (§7.4)
  - Menu contextuel sur sélection : Créer une règle / Pseudonymiser cette occurrence (§10.2)
  - Tester : trois occurrences de `Jean`, en valider deux, ignorer une → statut `partial` dans le JSON

**Testable — SPECS §17.3 :** mapping `Jean → Pierre` passe au statut `partial` après validation sélective.

---

## ✅ Phase 7 — Prénoms : suggestions Coulmont et import de dictionnaires

Objectif : générer des suggestions de prénoms sociologiquement équivalents et permettre l'import de dictionnaires existants.

- [x] Intégration de l'outil Coulmont : appel HTTP → suggestions de prénoms équivalents (genre, décennie, milieu social)
- [x] Format interne `DictionaryEntry` avec `gender`, `decade`, `socialClass`, `replacementCandidates[]` (§6.3)
- [x] `dictionaries/JsonDictionaryImporter.ts` : import JSON format SPECS §6.3
- [x] `dictionaries/CsvDictionaryImporter.ts` : import CSV + mapping des colonnes (§6.4)
- [x] `adapters/coulmont.ts` : CSV Coulmont → `DictionaryEntry[]`
- [x] `dictionaries/DictionaryManager.ts` : activation / désactivation, portée par dictionnaire (§6.5)
- [x] `adapters/insee.ts` : CSV INSEE prénoms → `DictionaryEntry[]`
- [x] Dans la modale de création de règle : suggestions Coulmont affichées sous forme de boutons cliquables

> **Note :** les dictionnaires embarqués massifs (`cities.json`, `lastnames.json`, etc.) sont **dépriorisés** — la détection des entités sera déléguée au NER en Phase 9. Seuls les dictionnaires de **remplacement** (prénoms Coulmont/INSEE) sont maintenus ici.

**Testable :** sélectionner un prénom dans une transcription → suggestions Coulmont affichées → cliquer pour pré-remplir le champ de remplacement.

---

## ✅ Phase 8 — Interface complète (panneau latéral 4 onglets)

Objectif : interface de travail complète pour le workflow pseudonymisation.

- [x] Vue latérale 5 onglets : **Candidats / Mappings / Dictionnaires / Exports / NER**
  - Onglet **Candidats** (ex-Occurrences) : scanner le fichier + identifier des candidats NER · Valider / Ignorer / Faux positif · Appliquer
  - Onglet **Mappings** : tableau des règles actives — modifier, supprimer, ajouter
  - Onglet **Dictionnaires** : import de fichiers `.dict.json`
  - Onglet **Exports** : pseudonymiser + exporter · exporter la table de correspondance
  - Onglet **NER** : seuil de confiance + mots fonctionnels exclus (visible si NER activé)
- [x] Surlignage tri-couleur dans l'éditeur : orange (sources) · vert souligné (remplacements) · bleu (candidats NER)
- [x] Surlignage actif dans les fichiers exportés `.pseudonymized.*`
- [x] Clic droit → Annuler la pseudonymisation (sur termes verts)
- [x] Marqueurs `{{...}}` activés par défaut dans les remplacements en direct et les exports
- [x] Wizard onboarding (3 étapes) avec téléchargement WASM et import de dictionnaires
- [x] NER embarqué via `transformers.js` + `bert-base-multilingual-cased-ner-hrl`
- [x] Filtrage des sous-termes de règles composées (Saint-Jean-de-Luz filtre Jean/Luz en NER)
- [ ] `correction/checker.ts` : vérification des conventions Jefferson/ICOR *(reporté Phase 10)*

**Livré en v0.1.0.**

---

## 🔄 Phase 9 — Dictionnaires structurés (v0.1.3)

Objectif : permettre la détection et le remplacement automatiques des entités identifiantes à partir de dictionnaires locaux, téléchargeables hors-ligne depuis un dépôt dédié.

**Décision architecturale :** le NER (transformers.js) reste le moteur de détection principal pour les entités contextuelles (prénoms, noms, institutions). Les dictionnaires ajoutent une détection exhaustive par liste pour les types dénombrables (communes, institutions connues) et fournissent les remplacements structurés (classes + index).

### Tâches

- [x] `scanner/OnnxNerScanner.ts` : pipeline BERT-NER via `@xenova/transformers`, filtres score et mots fonctionnels
- [x] Surlignage bleu des entités détectées dans l'éditeur
- [x] Onglet NER dans le panneau latéral : seuil de confiance + mots fonctionnels · bouton "Identifier des candidats"
- [x] Wizard : téléchargement WASM + catalogue de dictionnaires depuis le repo dédié
- [x] Format `DictionaryFile` v1.1 : `roles`, `configSchema`, `config`, `author`, `doi`
- [x] `src/dictionaries/DictionaryLoader.ts` : chargement, index de détection, résolution de classes (conditions / regex / word-to-word), `nextReplacement()`, `scanText()` (fenêtre glissante n-grammes)
- [x] Repo dédié [`pseudobsidian-dictionaries`](https://github.com/core-hn/pseudobsidian-dictionaries) + `fr-communes.dict.json` (34 957 communes GeoAPI INSEE)
- [x] `scripts/build-cities.mjs` : génération du dictionnaire communes depuis GeoAPI
- [x] Onglet Dictionnaires : mini cards (checkbox · scan individuel · suppression) + scan groupé
- [x] `DictScanReviewModal` : modale de révision en cards (contexte, préfixe éditable, index calculé)
- [x] `MappingScanReviewModal` : modale de révision pour le scan par règles existantes
- [x] Scan par dictionnaire accessible depuis l'onglet Dictionnaires et commande Ctrl+P
- [x] Suppression onglet "Candidats" — scan règles → Mappings · scan NER → NER
- [ ] `mappings/ConflictDetector.ts` : détection des chevauchements entre spans NER et règles manuelles (§8.5)
- [ ] `ambiguous.json` : tokens historiquement ambigus prénom/lieu (Florence, Nancy, Lorraine…) — badge ⚠ dans la modale de révision
- [ ] Seuil de population minimum configurable pour la détection (exclure les communes < N hab)
- [ ] Amélioration modèle : évaluer CamemBERT-NER (`Jean-Baptiste/camembert-ner`)

**Testable (v0.1.3) :** installer le dictionnaire communes → scanner un fichier → modale de révision → décocher les faux positifs → créer les règles → pseudonymiser.

---

## ⏳ Phase 10 — Affinage et stabilisation (v0.2.0)

Objectif : consolider l'ensemble des features en place avant d'aborder les fonctions avancées.

- [ ] Couverture de tests unitaires ≥ 80 % sur parsers, moteur, NER scanner
- [ ] Tests de non-régression Phase 4 (§18.2) maintenus verts avec les règles NER actives
- [ ] Correction des conventions Jefferson / ICOR : suggestions au survol, highlighting éditeur
- [ ] Performance : mesurer et optimiser le temps de scan NER sur un fichier de 500 tours
- [ ] **Internationalisation (i18n)** : externaliser toutes les chaînes UI dans un fichier de traduction (`locales/fr.json`, `locales/en.json`) — architecture à définir (standard Obsidian ou `i18next`)
- [ ] Intégration [Meld Encrypt](https://github.com/meld-cp/obsidian-encrypt) dans l'onglet Exports pour le chiffrement des tables de correspondance et des exports pseudonymisés
- [ ] Trancher les questions ouvertes persistantes (SPECS §20)

**Testable (v0.2.0) :** workflow de bout en bout stable sur un corpus réel de 10 entretiens.

---

## ⏳ Phase 11 — Fonctions d'analyse interactionnelle et conversationnelle (v1.0.0)

Objectif : aller au-delà de la pseudonymisation pour offrir des fonctions adaptées aux besoins spécifiques de l'EMCA et de l'analyse conversationnelle.

Périmètre à définir lors de la Phase 10 — pistes envisagées :

- Vérification et correction assistée des conventions Jefferson / ICOR (chevauchements `[`, enchaînements `=`, pauses `(0.5)`, allongements `:`, prosodie `.` `,` `?`)
- Navigation structurée par tour de parole / séquence (vue panoptique inspirée de Sonal)
- Annotation thématique des tours (codes libres, portée fichier/dossier/vault)
- Export ELAN (`.eaf`) ou Praat (`.TextGrid`) depuis les fichiers annotés
- Couplage audio optionnel via fichier local (Obsidian API `app.vault`) — synchronisation tour ↔ segment audio
- Compatibilité avec le JSON d'échange Whispurge / Sonal pi (SPECS §20.6)

**Testable (v1.0.0) :** un chercheur peut ouvrir une transcription CHAT, la naviguer tour par tour, corriger les conventions, pseudonymiser, annoter thématiquement, et exporter vers ELAN — sans quitter Obsidian.

---

## Features envisagées (hors phases planifiées)

Ces fonctionnalités sont identifiées comme utiles mais non planifiées dans les phases actuelles.

| Feature | Description | Prérequis |
|---|---|---|
| **Backend spaCy** | Serveur Python sidecar (`fr_core_news_sm`) appelé via HTTP — meilleure précision sur le français, pas de téléchargement de modèle, temps de réponse plus rapide. Requiert Python ≥ 3.9 côté utilisateur. | Phase 9 stable |
| **Modèle CamemBERT-NER** | Remplacer le modèle multilingue BERT par `Jean-Baptiste/camembert-ner` ou `cmarkea/distilcamembert-base-ner` — spécifiquement entraîné sur le français. Nécessite une conversion ONNX et un hébergement HuggingFace. | Phase 9 stable |
| **Score de confiance spaCy** | Exposer les scores d'entités de spaCy (via `displacy` ou scorer) pour filtrer comme avec transformers.js. | Backend spaCy |
| **Désambiguïsation interactive** | Modale contextuelle pour les tokens ambigus ville/prénom (Nancy, Florence…) : affichage du contexte + boutons Personne / Lieu / Ignorer. | Phase 9 |

---

## Questions ouvertes (SPECS §20)

| # | Question | Statut |
|---|---|---|
| 1 | Modifier les fichiers originaux ou fonctionner uniquement par export ? | **Décidé** — export en `.md` pour relire dans Obsidian, puis re-export dans le format inscrit dans les métadonnées du fichier source. L'onglet Exports affiche conditionnellement une option de chiffrement via [Meld Encrypt](https://github.com/meld-cp/obsidian-encrypt) quand on est dans un `*.pseudonymized.*`. |
| 2 | Tables de correspondance dans le vault ou hors vault par défaut ? | À trancher |
| 3 | Chiffrement des tables dès la v1 ? | **Décidé** — recommander le plugin [Meld Encrypt](https://github.com/meld-cp/obsidian-encrypt) pour le chiffrement des tables et des exports. Intégration dans l'onglet Exports (Phase 10). |
| 4 | Métadonnées CHAT dès le MVP ou à partir de la v0.3 ? | À trancher |
| 5 | NER avancé plus tard, ou rester sur dictionnaires + regex + validation humaine ? | **Décidé : NER (Phase 9)** — l'objectif du dictionnaire (détection ou remplacement) est déterminé à l'import. Le NER assure la détection ; les dictionnaires fournissent les candidats de substitution. |
| 6 | Compatibilité exacte à viser avec les JSON de Sonal pi / Whispurge ? | À explorer |
| 7 | Couplage audio optionnel via fichier local (API Obsidian) ? | À explorer |
| 8 | Export ELAN ou Praat ? | À explorer |
| 9 | Liste canonique pour `ambiguous.json` (Nancy, Florence, Lorraine…) ? | À constituer |
| 10 | Internationalisation (i18n) du plugin ? | **Décidé** — l'architecture doit permettre la traduction de l'interface. Toutes les chaînes UI doivent être externalisées dans un fichier de traduction. Implémentation en Phase 10. |
