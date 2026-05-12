# ROADMAP — PseudObsidian-ization

Plugin Obsidian de pseudonymisation et correction de transcriptions (conventions Jefferson / ICOR / SRT / CHAT).

Chaque phase produit quelque chose de testable. Les critères d'acceptation renvoient aux sections de SPECS.md.

## État actuel (mai 2026)

**Phases 0 à 6 terminées.** La Phase 7 est en cours : l'intégration de l'outil Coulmont est opérationnelle (suggestion de prénoms sociologiquement équivalents via `coulmont.com`). Le travail porte maintenant sur la **constitution de dictionnaires lexicaux embarqués** (prénoms, toponymes, institutions) et leur **intégration dans le moteur de suggestion** pour les phases de scan automatique.

```
✅ Phases 0–6   Parsers · Moteur · Commandes UI · Portées · Surlignage · Validation sélective
🔄 Phase 7      Dictionnaires — Coulmont ✅ · Dictionnaires JSON/CSV · Ressources embarquées
⏳ Phase 8      Scan automatique (détection sans règle préexistante)
⏳ Phase 9      Interface complète (panneau latéral 4 onglets)
⏳ Phase 10     Publication communauté Obsidian
```

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

## 🔄 Phase 7 — Dictionnaires : import et suggestions

Objectif : importer des dictionnaires existants (Coulmont, INSEE, etc.) et générer des suggestions de remplacement.

- [ ] Format interne `DictionaryEntry` avec `gender`, `decade`, `socialClass`, `replacementCandidates[]` (§6.3)
- [ ] `dictionaries/JsonDictionaryImporter.ts` : import JSON format SPECS §6.3
- [ ] `dictionaries/CsvDictionaryImporter.ts` : import CSV + mapping des colonnes (§6.4)
- [ ] `adapters/coulmont.ts` : CSV Coulmont → `DictionaryEntry[]`
- [ ] `adapters/insee.ts` : CSV INSEE prénoms → `DictionaryEntry[]`
- [ ] `adapters/geoapi.ts` : GeoAPI INSEE (villes + `sizeClass`) → `DictionaryEntry[]`
- [ ] `dictionaries/DictionaryManager.ts` : activation / désactivation, portée par dictionnaire (§6.5)
- [ ] Dictionnaires embarqués : `firstnames.json`, `lastnames.json`, `cities.json`, `ambiguous.json`, `protected.json`
- [ ] **Exploitable dans Obsidian** :
  - Commande `Pseudonymisation : importer un dictionnaire` (JSON ou CSV)
  - Dans la modale de création de règle : suggestions issues des dictionnaires actifs
  - Tester : importer `prenoms_coulmont.json`, créer une règle pour `Jean` → candidats proposés depuis le dictionnaire

**Testable :** suggestion automatique de remplacement à partir d'un dictionnaire Coulmont importé.

---

## ⏳ Phase 8 — Détection automatique et chevauchements

Objectif : scanner un fichier sans règle préexistante et détecter les entités candidates.

- [ ] `scanner/DictionaryScanner.ts` : croisement texte × dictionnaires actifs (§7.2)
- [ ] `scanner/RegexScanner.ts` : heuristiques typographiques (majuscule initiale, locuteurs CHAT, formats Jefferson/ICOR)
- [ ] `mappings/ConflictDetector.ts` : détection des chevauchements (§8.5)
- [ ] Marquage automatique `needs_review` pour les occurrences chevauchantes
- [ ] `ambiguous.json` : tokens ville/prénom ambigus — signalement pour validation manuelle
- [ ] **Exploitable dans Obsidian** :
  - Commande `Pseudonymisation : scanner le fichier` sans mapping préexistant → propose des candidats depuis les dictionnaires et les heuristiques
  - Modale de désambiguïsation : contexte du tour + boutons Ville / Prénom / Ignorer
  - Tester : scanner `entretien_01.cha`, voir `Jean` et `Saint-Jean-de-Luz` détectés, chevauchement signalé

**Testable :** scan automatique → détection de candidats → résolution manuelle de l'ambiguïté ville/prénom.

---

## ⏳ Phase 9 — Interface complète et correction des conventions

- [ ] Vue latérale complète : 4 onglets Occurrences / Mappings / Dictionnaires / Exports (§10.3)
- [ ] Onglet **Mappings** : modifier source, remplacement, catégorie, portée, priority (z-index), désactiver
- [ ] Onglet **Exports** : choix format, vérification absence de table dans l'export (§10.4)
- [ ] Rapport de pseudonymisation (§14.3)
- [ ] `correction/checker.ts` : vérification des conventions Jefferson/ICOR
- [ ] Suggestions de correction au survol
- [ ] **Exploitable dans Obsidian** :
  - Panneau latéral complet accessible via l'icône ruban
  - Workflow complet : ouvrir → scanner → valider → pseudonymiser → exporter sans table
  - Tester le workflow de bout en bout sur `entretien_01.srt` et `entretien_02.cha`

---

## ⏳ Phase 10 — Publication

- [ ] README utilisateur en français avec captures d'écran
- [ ] Trancher les questions ouvertes de SPECS §20
- [ ] Publication sur le répertoire communautaire Obsidian

---

## Questions ouvertes (SPECS §20)

| # | Question | Statut |
|---|---|---|
| 1 | Modifier les fichiers originaux ou fonctionner uniquement par export ? | À trancher |
| 2 | Tables de correspondance dans le vault ou hors vault par défaut ? | À trancher |
| 3 | Chiffrement des tables dès la v1 ? | À trancher |
| 4 | Métadonnées CHAT dès le MVP ou à partir de la v0.3 ? | À trancher |
| 5 | NER avancé plus tard, ou rester sur dictionnaires + regex + validation humaine ? | À trancher |
| 6 | Compatibilité exacte à viser avec les JSON de Sonal pi / Whispurge ? | À explorer |
| 7 | Couplage audio optionnel via fichier local (API Obsidian) ? | À explorer |
| 8 | Export ELAN ou Praat ? | À explorer |
| 9 | Liste canonique pour `ambiguous.json` (Nancy, Florence, Lorraine…) ? | À constituer |
