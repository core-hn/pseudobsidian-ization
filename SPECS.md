# SPECS — PseudObsidian-ization

Spécifications fonctionnelles et techniques — Plugin Obsidian de correction et pseudonymisation de transcriptions

1. Objectif général

Développer un plugin Obsidian permettant de corriger, annoter, pseudonymiser et exporter des transcriptions issues de terrains de recherche, en particulier dans des formats structurés comme .srt, .cha / .chat, .txt ou .md.

Le plugin doit permettre de travailler directement dans Obsidian sur des transcriptions brutes ou semi-brutes, tout en produisant :

1. une version pseudonymisée exploitable pour l’analyse discursive, interactionnelle ou conversationnelle ;
2. une table de correspondance séparée, sécurisée, permettant éventuellement la réidentification contrôlée ;
3. des dictionnaires de remplacement réutilisables à l’échelle d’un fichier, d’un dossier parent ou d’un vault entier ;
4. une interface de validation permettant de choisir si une occurrence doit être remplacée localement, globalement ou ignorée.

L’enjeu n’est pas seulement de masquer les données personnelles, mais de préserver autant que possible les propriétés analytiques des énoncés étudiés : structure interactionnelle, indices catégoriels pertinents, formatage conversationnel, rythme, tours de parole, types de toponymes, genres, âges approximatifs, positions institutionnelles, etc.

⸻

2. Cas d’usage principaux

2.1 Correction simple d’une transcription

L’utilisateur ouvre une transcription dans Obsidian, sélectionne un mot, un segment ou une séquence, puis demande à le remplacer par une autre forme.

Exemples :

* corriger une erreur de reconnaissance automatique ;
* uniformiser une graphie ;
* remplacer un prénom réel par un prénom pseudonymisé ;
* remplacer un lieu précis par une catégorie de lieu ;
* corriger une désignation institutionnelle trop identifiable.

Le remplacement peut être appliqué :

* uniquement à l’occurrence sélectionnée ;
* à toutes les occurrences identiques du fichier ;
* à toutes les occurrences du dossier courant ;
* à toutes les occurrences du vault ;
* à une sélection manuelle d’occurrences proposées par le plugin.

2.2 Pseudonymisation assistée

Le plugin détecte ou propose des éléments potentiellement identifiants :

* prénoms ;
* noms de famille ;
* lieux ;
* établissements ;
* villes ;
* services hospitaliers ;
* dates ;
* âges ;
* métiers rares ;
* combinaisons indirectement identifiantes ;
* événements biographiques singuliers.

L’utilisateur peut valider, ignorer ou modifier les propositions.

2.3 Travail avec dictionnaires importés

L’utilisateur peut importer plusieurs dictionnaires de correspondance, par exemple :

* un dictionnaire de prénoms, inspiré ou dérivé de ressources comme les listes de Baptiste Coulmont ;
* un dictionnaire de noms de lieux ;
* un dictionnaire de catégories institutionnelles ;
* un dictionnaire interne au projet de recherche ;
* un dictionnaire déjà produit lors d’un précédent traitement.

L’interface permet de choisir quels dictionnaires appliquer au fichier, au dossier ou au vault.

2.4 Export séparé

À la fin du traitement, l’utilisateur peut exporter :

1. la transcription pseudonymisée seule, sans table de correspondance ;
2. la table de correspondance seule ;
3. un rapport de pseudonymisation ;
4. éventuellement un paquet d’export contenant la transcription, le rapport et les métadonnées non sensibles.

La table de correspondance doit pouvoir être exportée dans un format structuré, notamment JSON, sur le modèle des outils comme Sonal PI.

⸻

3. Formats de transcription à prendre en charge

3.1 Formats prioritaires

Le plugin doit prendre en charge en priorité :

* .srt : sous-titres horodatés ;
* .cha ou .chat : format CHAT / CLAN ;
* .txt : transcription texte simple ;
* .md : transcription annotée dans Obsidian.

3.2 Contraintes propres au SRT

Le format SRT contient des blocs de type :

1
00:00:01,000 --> 00:00:04,000
Bonjour Jean, tu es arrivé à Montpellier quand ?

Le plugin doit préserver :

* les numéros de blocs ;
* les horodatages ;
* les sauts de ligne ;
* l’ordre des segments ;
* les éventuelles balises ou conventions déjà présentes.

La pseudonymisation ne doit porter que sur le contenu textuel, sauf action explicite de l’utilisateur.

3.3 Contraintes propres au CHAT / CLAN

Le format CHAT contient des lignes structurées :

@Begin
@Languages: fra
@Participants: INV Investigator, PAR Participant
*INV: Bonjour Jean, tu peux te présenter ?
*PAR: je m'appelle Jean et j'habite Saint-Jean-de-Luz.
@End

Le plugin doit préserver :

* les lignes de métadonnées commençant par @ ;
* les identifiants de locuteur commençant par * ;
* les lignes dépendantes commençant par % ;
* les conventions CHAT existantes ;
* les alignements et annotations interactionnelles.

La pseudonymisation doit être capable de traiter séparément :

* les métadonnées ;
* les tours de parole ;
* les lignes dépendantes ;
* les identifiants de participants.

3.4 Préservation des conventions analytiques

Le plugin ne doit pas dégrader les conventions propres aux analyses AD, EMCA ou linguistiques :

* pauses ;
* chevauchements ;
* allongements vocaliques ;
* rires ;
* hésitations ;
* marques prosodiques ;
* symboles de transcription ;
* indices de séquentialité ;
* ponctuation analytique.

Le remplacement doit préserver autant que possible la longueur approximative, la catégorie grammaticale, le genre, le nombre, et la fonction discursive de l’élément remplacé.

⸻

4. Unités de portée

Le plugin doit gérer trois échelles de correspondance.

4.1 Portée fichier

Une table de correspondance est associée à un seul fichier.

Exemple :

{
  "scope": "file",
  "file": "Entretiens/entretien_01.cha",
  "mappings": [
    {
      "source": "Jean",
      "replacement": "Pierre",
      "category": "first_name",
      "strategy": "dictionary",
      "status": "validated"
    }
  ]
}

4.2 Portée dossier parent

Une table de correspondance est associée à un dossier et peut s’appliquer à tous les fichiers enfants.

Exemple :

* Entretiens/2026-03/
* Entretiens/2026-04/
* Transcriptions/UJAA/

Cela permet de garantir qu’une même personne ou un même lieu soit pseudonymisé de manière cohérente dans tout un sous-corpus.

4.3 Portée vault

Une table de correspondance globale s’applique à l’ensemble du vault.

Cette option est utile pour les terrains longitudinaux, lorsque les mêmes personnes ou lieux réapparaissent dans plusieurs sous-dossiers.

4.4 Priorité entre portées

La priorité par défaut doit être :

1. mapping explicite local sur une occurrence ;
2. mapping fichier ;
3. mapping dossier le plus proche ;
4. mapping vault ;
5. dictionnaire externe ;
6. suggestion automatique.

Un mapping local ou validé manuellement doit toujours primer sur une suggestion issue d’un dictionnaire.

⸻

5. Tables de correspondance

5.1 Rôle

La table de correspondance est le fichier sensible qui relie les formes originales aux formes pseudonymisées.

Elle doit être stockée séparément de la transcription exportée.

Elle doit pouvoir être :

* créée automatiquement ;
* consultée dans une interface dédiée ;
* modifiée manuellement ;
* exportée ;
* réimportée ;
* désactivée temporairement ;
* appliquée à un autre fichier ou dossier.

5.2 Format JSON recommandé

Format proposé :

{
  "schemaVersion": "1.0.0",
  "createdAt": "2026-05-11T20:00:00.000Z",
  "updatedAt": "2026-05-11T20:10:00.000Z",
  "project": "LIIPPS",
  "scope": {
    "type": "folder",
    "path": "Transcriptions/UJAA"
  },
  "settings": {
    "caseSensitive": false,
    "accentSensitive": false,
    "wholeWordOnly": true,
    "preserveCase": true,
    "preserveGender": true,
    "preserveAnalyticNotation": true
  },
  "mappings": [
    {
      "id": "map_000001",
      "source": "Jean",
      "replacement": "Pierre",
      "category": "first_name",
      "sourceDictionary": "prenoms_coulmont",
      "scope": "folder",
      "status": "validated",
      "priority": 0,
      "createdBy": "user",
      "createdAt": "2026-05-11T20:05:00.000Z",
      "notes": "Remplacement validé pour le participant principal.",
      "occurrences": [
        {
          "file": "Transcriptions/UJAA/entretien_01.cha",
          "line": 42,
          "start": 18,
          "end": 22,
          "status": "validated"
        }
      ]
    }
  ]
}

5.3 Champs minimaux d’un mapping

Chaque mapping doit contenir :

* id : identifiant unique ;
* source : forme originale ;
* replacement : forme pseudonymisée ;
* category : type d’entité ;
* scope : fichier, dossier ou vault ;
* status : proposé, validé, ignoré, conflit, désactivé ;
* priority : entier libre (comme un z-index CSS), défaut 0 — plus le nombre est élevé, plus le mapping est appliqué en priorité ;
* occurrences : liste optionnelle des occurrences repérées.

5.4 Statuts possibles

Statuts recommandés :

* suggested : proposition non validée ;
* validated : remplacement validé ;
* ignored : occurrence ou mapping ignoré ;
* partial : certaines occurrences seulement sont remplacées ;
* conflict : conflit entre plusieurs règles ;
* disabled : mapping conservé mais non appliqué ;
* needs_review : remplacement potentiellement risqué.

⸻

6. Dictionnaires de pseudonymisation

6.1 Fonction générale

Les dictionnaires servent à proposer des remplacements cohérents en fonction du type d’entité.

Ils ne doivent jamais s’appliquer de manière irréversible sans validation ou sans mode d’application explicite.

6.2 Types de dictionnaires

Le plugin doit permettre d’importer au moins les types suivants :

* prénoms ;
* patronymes ;
* villes ;
* départements ;
* régions ;
* pays ;
* établissements ;
* professions ;
* institutions ;
* catégories libres définies par l’utilisateur.

6.3 Format `DictionaryFile` v1.1

Schéma JSON complet. Les champs `roles` et `entries` sont obligatoires.

```json
{
  "schemaVersion": "1.1",
  "dictionaryId": "fr-communes",
  "label": "Communes françaises (GeoAPI INSEE)",
  "type": "place",
  "language": "fr",
  "source": "https://geo.api.gouv.fr/communes",
  "license": "Licence Ouverte v2.0",
  "author": "INSEE",
  "doi": null,

  "roles": {
    "detection": true,
    "replacement": true,
    "classes": true
  },

  "configSchema": [
    {
      "key": "incrementScope",
      "label": "Portée de l’incrémentation",
      "type": "enum",
      "values": ["file", "folder", "vault"],
      "default": "file",
      "recommended": "file",
      "description": "Portée dans laquelle les index ({index}) sont uniques."
    },
    {
      "key": "replacementPattern",
      "label": "Format du pseudonyme généré",
      "type": "string",
      "default": "{class}_{index}",
      "description": "Variables : {class} (classe), {index} (numéro dans la portée)."
    },
    {
      "key": "caseSensitive",
      "label": "Sensible à la casse",
      "type": "boolean",
      "values": [true, false],
      "default": false
    }
  ],

  "config": {
    "classificationMode": "conditions",
    "conditions": [
      { "field": "population", "op": "lt",  "value": 2000,   "class": "Village" },
      { "field": "population", "op": "lt",  "value": 10000,  "class": "Petite_Ville" },
      { "field": "population", "op": "lt",  "value": 100000, "class": "Ville" },
      { "field": "population", "op": "lt",  "value": 500000, "class": "Grande_Ville" },
      { "field": "population", "op": "gte", "value": 500000, "class": "Métropole" }
    ],
    "incrementScope": "file",
    "replacementPattern": "{class}_{index}",
    "caseSensitive": false
  },

  "entries": [
    { "value": "Saint-Jean-de-Luz", "type": "place", "population": 14857, "departement": "64" }
  ]
}
```

**Champs de l’en-tête :**

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `schemaVersion` | string | oui | Version du format — actuellement `"1.1"` |
| `dictionaryId` | string | oui | Identifiant unique, slug kebab-case |
| `label` | string | oui | Nom affiché dans l’interface |
| `type` | EntityCategory | oui | Type principal des entrées (`place`, `first_name`, `institution`…) |
| `language` | string | oui | Code langue ISO 639-1 (`fr`, `en`…) |
| `source` | string | oui | URL ou description de la source |
| `license` | string | non | Licence des données |
| `author` | string | non | Auteur ou organisme producteur |
| `doi` | string\|null | non | DOI de la ressource si disponible |
| `roles.detection` | bool | oui | `true` si les entrées alimentent la détection |
| `roles.replacement` | bool | oui | `true` si les entrées alimentent les suggestions de remplacement |
| `roles.classes` | bool | oui | `true` si le remplacement utilise un système de classes avec incrémentation |
| `configSchema` | array | non | Décrit les variables configurables et leurs valeurs possibles |
| `config` | object | non | Valeurs actives (modifiables par l’utilisateur) |

**Modes de classification (`config.classificationMode`) :**

| Mode | Usage |
|---|---|
| `conditions` | Règles sur un champ numérique ou catégoriel des entrées (ex. `population`) |
| `regex` | Patterns regex sur la valeur de l’entrée (ex. `^CHU`, `^Université`) |
| `word-to-word` | Remplacement fixe par entrée (champ `replacement` dans l’entrée) |

**Champs libres dans `DictionaryEntry` :** toute propriété supplémentaire (`population`, `departement`, `platform`…) est transmise aux conditions de classification.

6.4 Import et installation de dictionnaires

Trois voies d’installation :

1. **Catalogue en ligne** (wizard ou Paramètres → Reconfigurer) — télécharge depuis le dépôt [`pseudobsidian-dictionaries`](https://github.com/core-hn/pseudobsidian-dictionaries) dans `_pseudonymisation/dictionaries/`
2. **Import local** (onglet Dictionnaires) — importe un fichier `.dict.json` local
3. **Dépôt dédié** — les dictionnaires sont versionnés dans un repo séparé du plugin ; format et schéma documentés dans ce repo

6.5 Sélection et scan

L’onglet **Dictionnaires** du panneau latéral liste les dictionnaires installés sous forme de mini cards. Pour chaque card :

- **Checkbox** — inclure ou exclure du scan groupé
- **Bouton scan** (loupe) — scanner le fichier actif avec ce seul dictionnaire
- **Bouton scan groupé** — scanner avec tous les dictionnaires cochés

La **modale de révision** (`DictScanReviewModal`) présente chaque entité détectée avec :
- son extrait de contexte (±50 caractères) pour aider à distinguer les faux positifs
- sa classe proposée (ex. `Ville`)
- son remplacement calculé : préfixe éditable + index en lecture seule (`Ville_1`)
- une checkbox pour l’inclure ou l’exclure

L’index est recalculé dynamiquement : décocher `Ville_2` redistribue les indices suivants.

⸻

7. Détection et remplacement des occurrences

7.1 Sélection manuelle

L’utilisateur peut sélectionner un mot ou segment dans l’éditeur Obsidian et ouvrir une commande :

* Créer une règle de remplacement ;
* Pseudonymiser cette occurrence ;
* Pseudonymiser toutes les occurrences similaires ;
* Chercher les occurrences similaires.

7.2 Détection automatique

Le plugin doit pouvoir scanner un fichier, un dossier ou un vault pour détecter des occurrences candidates.

La détection peut combiner :

* dictionnaires ;
* expressions régulières ;
* règles typographiques ;
* conventions propres aux formats SRT ou CHAT ;
* listes personnalisées ;
* entités déjà présentes dans une table de correspondance.

7.3 Occurrences suggérées

Lorsqu’une entité est repérée, le plugin doit proposer toutes les occurrences candidates à l’utilisateur.

Exemple :

Source détectée : Jean
Remplacement proposé : Pierre

Occurrences :

Fichier	Ligne	Contexte	Action
entretien_01.cha	42	Bonjour Jean, tu peux...	remplacer
entretien_01.cha	87	Saint-Jean-de-Luz	vérifier
entretien_02.srt	12	Jean disait que...	remplacer

L’utilisateur doit pouvoir choisir :

* remplacer cette occurrence ;
* remplacer toutes les occurrences exactes ;
* remplacer toutes sauf certaines ;
* ignorer cette occurrence ;
* marquer comme faux positif ;
* créer une règle spécifique.

7.4 Prévisualisation

Avant application, le plugin doit afficher une prévisualisation diff.

Exemple :

- Bonjour Jean, tu habites Saint-Jean-de-Luz ?
+ Bonjour Pierre, tu habites Ville moyenne limitrophe ?

Le diff doit être disponible :

* par occurrence ;
* par fichier ;
* par lot de remplacement.

⸻

8. Gestion des priorités et conflits

8.1 Problème à éviter

Le plugin doit éviter les effets de remplacement naïf.

Exemple problématique :

* Jean → Pierre
* Saint-Jean-de-Luz → Ville moyenne limitrophe

Si le plugin applique d’abord Jean → Pierre, il risque de produire :

Saint-Pierre-de-Luz

Cette transformation est dangereuse, car elle peut préserver ou produire un indice de réidentification indirecte.

8.2 Principe général

Les remplacements doivent être appliqués selon une stratégie de priorité qui protège les entités longues, composées ou englobantes.

Règle par défaut :

1. appliquer les remplacements sur les segments les plus longs ;
2. appliquer ensuite les segments plus courts ;
3. ne jamais appliquer un remplacement court à l’intérieur d’un segment déjà remplacé ;
4. signaler les chevauchements ;
5. demander validation en cas de conflit.

8.3 Priorité automatique par longueur

Par défaut, le plugin doit trier les mappings par longueur décroissante de source.

Exemple :

1. Saint-Jean-de-Luz → Ville moyenne limitrophe
2. Jean → Pierre

Résultat attendu :

Bonjour Pierre, tu habites Ville moyenne limitrophe ?

et non :

Bonjour Pierre, tu habites Saint-Pierre-de-Luz ?

8.4 Priorité explicite

Chaque mapping doit pouvoir recevoir un champ priority.

La priorité fonctionne comme le z-index en CSS : c’est un entier libre, positif ou nul, que l’utilisateur assigne manuellement. Il n’existe pas de paliers sémantiques prédéfinis. Un mapping avec priority: 10 passe avant un mapping avec priority: 2 ; un mapping avec priority: 999 passe avant tous les autres. L’utilisateur décide lui-même de l’échelle.

La valeur par défaut à la création d’un mapping est 0. Deux mappings à priorité égale sont départagés par la longueur de la source (le plus long passe en premier), puis par la portée la plus locale.

Le tri d’application est :

1. priorité explicite décroissante (entier libre, défini par l’utilisateur) ;
2. longueur de la source décroissante ;
3. portée la plus locale ;
4. validation manuelle avant suggestion automatique.

8.5 Chevauchements

Le plugin doit détecter les chevauchements entre mappings.

Exemples :

* Jean dans Saint-Jean-de-Luz ;
* Luz dans Saint-Jean-de-Luz ;
* Paul dans Saint-Paul ;
* CHU dans CHU de Montpellier ;
* Montpellier dans CHU de Montpellier.

En cas de chevauchement, le plugin doit :

* marquer les occurrences comme needs_review ;
* proposer l’entité englobante en priorité ;
* empêcher le remplacement partiel non validé ;
* permettre à l’utilisateur de créer une règle composée.

8.6 Protection des segments déjà remplacés

Lors de l’application, le plugin doit utiliser une logique de spans protégés.

Principe :

1. scanner le texte original ;
2. identifier toutes les occurrences candidates avec leurs positions ;
3. résoudre les conflits ;
4. sélectionner les spans à remplacer ;
5. appliquer les remplacements de droite à gauche ou via reconstruction du texte ;
6. empêcher tout remplacement à l’intérieur d’un span déjà traité.

⸻

9. Préservation analytique des énoncés

9.1 Problème scientifique

Dans des corpus destinés à l’analyse du discours, à l’EMCA ou à la linguistique interactionnelle, une pseudonymisation trop brutale peut dégrader l’objet d’analyse.

Le plugin doit donc viser une pseudonymisation contrôlée, non une anonymisation destructrice.

9.2 Préservation des catégories pertinentes

Quand c’est possible, le remplacement doit préserver :

* le type d’entité ;
* le genre grammatical ou socialement perçu, si pertinent et connu ;
* la catégorie d’âge approximative ;
* la longueur approximative ;
* le registre ;
* la place syntaxique ;
* la structure morphologique ;
* le statut institutionnel ;
* la granularité géographique.

Exemples :

* Jean → prénom masculin courant ;
* Marie → prénom féminin courant ;
* Montpellier → ville moyenne ou grande ville du Sud, selon la stratégie choisie ;
* CHU de Montpellier → centre hospitalier universitaire régional ou CHU d’une grande ville du Sud, selon le niveau de généralisation.

9.3 Stratégies de remplacement

Le plugin doit proposer plusieurs stratégies :

1. remplacement par pseudonyme réaliste ;
2. remplacement par catégorie analytique ;
3. remplacement par étiquette neutre ;
4. généralisation ;
5. suppression ;
6. masquage partiel.

Exemples :

Source	Stratégie	Remplacement
Jean	prénom réaliste	Pierre
Saint-Jean-de-Luz	catégorie analytique	ville moyenne littorale
CHU de Montpellier	généralisation	CHU régional
14 mars 2026	généralisation	au printemps 2026
17 ans	catégorie	mineur·e proche de la majorité

9.4 Conservation du rythme interactionnel

Pour les transcriptions fines, le plugin doit éviter d’altérer :

* le nombre de tours ;
* les retours à la ligne ;
* les pauses ;
* les chevauchements ;
* les signes de prosodie ;
* les notations de rire, souffle, hésitation ;
* les timestamps.

⸻

10. Interface utilisateur Obsidian

10.1 Commandes principales

Le plugin doit ajouter les commandes suivantes à la palette Obsidian :

* Pseudonymisation: créer une règle depuis la sélection ;
* Pseudonymisation: scanner le fichier courant ;
* Pseudonymisation: scanner le dossier courant ;
* Pseudonymisation: scanner le vault ;
* Pseudonymisation: ouvrir la table de correspondance ;
* Pseudonymisation: gérer les dictionnaires ;
* Pseudonymisation: exporter la transcription pseudonymisée ;
* Pseudonymisation: exporter la table de correspondance ;
* Pseudonymisation: générer un rapport de pseudonymisation.

10.2 Menu contextuel

Sur une sélection de texte, le clic droit doit proposer :

* Créer une règle de remplacement ;
* Remplacer cette occurrence ;
* Chercher toutes les occurrences similaires ;
* Marquer comme donnée identifiante ;
* Ignorer cette occurrence.

10.3 Vue latérale

Le plugin doit fournir une vue latérale avec quatre onglets :

1. Occurrences ;
2. Mappings ;
3. Dictionnaires ;
4. Exports.

Onglet Occurrences

Affiche les occurrences détectées avec :

* fichier ;
* ligne ;
* contexte gauche/droite ;
* catégorie supposée ;
* remplacement proposé ;
* statut ;
* action.

Onglet Mappings

Affiche les règles validées, avec possibilité de :

* modifier la source ;
* modifier le remplacement ;
* changer la catégorie ;
* changer la portée ;
* changer la priorité ;
* désactiver la règle ;
* voir les occurrences liées.

Onglet Dictionnaires

Permet de :

* importer un dictionnaire ;
* activer/désactiver un dictionnaire ;
* choisir la portée ;
* définir la priorité ;
* consulter les entrées ;
* tester une suggestion.

Onglet Exports

Permet de :

* choisir le format d’export ;
* choisir le fichier, le dossier ou le vault ;
* exporter la transcription pseudonymisée ;
* exporter la table de correspondance ;
* exporter un rapport ;
* vérifier qu’aucune table de correspondance n’est incluse dans la transcription exportée.

10.4 Modale de création de règle

Quand l’utilisateur crée une règle depuis une sélection, une modale doit permettre de renseigner :

* texte source ;
* remplacement ;
* catégorie ;
* portée ;
* priorité ;
* stratégie ;
* application à cette occurrence seulement ou à plusieurs ;
* recherche d’occurrences similaires.

10.5 Validation par lots

Le plugin doit permettre une validation rapide :

* tout remplacer ;
* tout ignorer ;
* valider un par un ;
* valider toutes les occurrences exactes ;
* valider seulement dans certains fichiers ;
* valider selon contexte.

⸻

11. Architecture technique proposée

11.1 Stack

Plugin Obsidian standard :

* TypeScript ;
* API Obsidian ;
* CodeMirror pour interaction avec l’éditeur ;
* JSON pour tables et dictionnaires ;
* éventuellement Web Workers pour le scan de grands corpus.

11.2 Modules principaux

Architecture recommandée :

src/
  main.ts
  settings.ts
  types.ts
  parsers/
    BaseTranscriptParser.ts
    SrtParser.ts
    ChatParser.ts
    MarkdownParser.ts
    PlainTextParser.ts
  dictionaries/
    DictionaryManager.ts
    CsvDictionaryImporter.ts
    JsonDictionaryImporter.ts
  mappings/
    MappingStore.ts
    MappingResolver.ts
    ConflictDetector.ts
    ScopeResolver.ts
  scanner/
    OccurrenceScanner.ts
    RegexScanner.ts
    DictionaryScanner.ts
  pseudonymizer/
    PseudonymizationEngine.ts
    ReplacementPlanner.ts
    SpanProtector.ts
  ui/
    PseudonymizationView.ts
    RuleModal.ts
    DictionaryModal.ts
    ExportModal.ts
  exporters/
    TranscriptExporter.ts
    MappingExporter.ts
    ReportExporter.ts
  tests/

11.3 Types principaux

type ScopeType = 'file' | 'folder' | 'vault';
type MappingStatus = 'suggested' | 'validated' | 'ignored' | 'partial' | 'conflict' | 'disabled' | 'needs_review';
type EntityCategory =
  | 'first_name'
  | 'last_name'
  | 'full_name'
  | 'place'
  | 'institution'
  | 'date'
  | 'age'
  | 'profession'
  | 'custom';
interface MappingRule {
  id: string;
  source: string;
  replacement: string;
  category: EntityCategory;
  scope: Scope;
  status: MappingStatus;
  priority: number;
  sourceDictionary?: string;
  createdBy: 'user' | 'dictionary' | 'scanner';
  createdAt: string;
  updatedAt?: string;
  notes?: string;
}
interface Scope {
  type: ScopeType;
  path?: string;
}
interface Occurrence {
  id: string;
  file: string;
  line: number;
  start: number;
  end: number;
  text: string;
  contextBefore: string;
  contextAfter: string;
  category?: EntityCategory;
  mappingId?: string;
  status: MappingStatus;
}
interface ReplacementSpan {
  start: number;
  end: number;
  source: string;
  replacement: string;
  mappingId: string;
  priority: number;
}

⸻

12. Algorithme de remplacement recommandé

12.1 Étapes générales

1. Charger le texte original.
2. Parser le format du fichier.
3. Identifier les zones remplaçables.
4. Charger les mappings applicables selon la portée.
5. Scanner les occurrences candidates.
6. Résoudre les conflits.
7. Construire un plan de remplacement.
8. Afficher une prévisualisation.
9. Appliquer les remplacements validés.
10. Exporter la transcription pseudonymisée.

12.2 Résolution des mappings applicables

Pseudo-code :

function getApplicableMappings(filePath: string): MappingRule[] {
  const localMappings = mappingStore.getFileMappings(filePath);
  const folderMappings = mappingStore.getFolderMappingsFor(filePath);
  const vaultMappings = mappingStore.getVaultMappings();
  return [...localMappings, ...folderMappings, ...vaultMappings]
    .filter(mapping => mapping.status === 'validated')
    .sort(compareMappings);
}

12.3 Tri des mappings

function compareMappings(a: MappingRule, b: MappingRule): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  if (b.source.length !== a.source.length) return b.source.length - a.source.length;
  return scopeWeight(b.scope) - scopeWeight(a.scope);
}
function scopeWeight(scope: Scope): number {
  if (scope.type === 'file') return 3;
  if (scope.type === 'folder') return 2;
  return 1;
}

12.4 Protection contre les remplacements imbriqués

Pseudo-code :

function resolveSpans(candidates: ReplacementSpan[]): ReplacementSpan[] {
  const sorted = candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if ((b.end - b.start) !== (a.end - a.start)) {
      return (b.end - b.start) - (a.end - a.start);
    }
    return a.start - b.start;
  });
  const accepted: ReplacementSpan[] = [];
  for (const candidate of sorted) {
    const overlaps = accepted.some(span =>
      candidate.start < span.end && candidate.end > span.start
    );
    if (!overlaps) {
      accepted.push(candidate);
    }
  }
  return accepted.sort((a, b) => b.start - a.start);
}

12.5 Application des remplacements

Appliquer les remplacements de droite à gauche pour éviter de décaler les indices :

function applySpans(text: string, spans: ReplacementSpan[]): string {
  let output = text;
  for (const span of spans.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, span.start) + span.replacement + output.slice(span.end);
  }
  return output;
}

⸻

13. Stockage dans le vault

13.1 Dossier recommandé

Le plugin peut créer un dossier de configuration dans le vault :

.obsidian/plugins/transcript-pseudonymizer/

Mais les tables sensibles ne devraient pas nécessairement être stockées dans .obsidian, car ce dossier peut être synchronisé automatiquement.

Il faut prévoir une option permettant de choisir un dossier sécurisé séparé, par exemple :

_pseudonymisation/
  dictionaries/
  mappings/
  exports/
  reports/

Ou, mieux, un chemin hors vault si l’utilisateur le souhaite.

13.2 Avertissement de sécurité

Le plugin doit afficher un avertissement si la table de correspondance est stockée dans un dossier susceptible d’être synchronisé, publié ou exporté.

Exemples :

* vault synchronisé sur Git ;
* vault publié avec Quartz ;
* dossier partagé ;
* dossier d’export public ;
* dossier inclus dans une sauvegarde non chiffrée.

13.3 Fichiers générés

Fichiers recommandés :

_pseudonymisation/
  dictionaries/
    prenoms_coulmont.json
    lieux_france.json
  mappings/
    vault.mapping.json
    Transcriptions_UJAA.mapping.json
    entretien_01.mapping.json
  exports/
    entretien_01.pseudonymized.cha
  reports/
    entretien_01.report.md

⸻

14. Export

14.1 Export de la transcription pseudonymisée

L’export doit préserver le format source quand c’est possible :

* .srt vers .srt ;
* .cha vers .cha ;
* .chat vers .chat ;
* .txt vers .txt ;
* .md vers .md.

Nom recommandé :

nom_du_fichier.pseudonymized.ext

La transcription exportée ne doit contenir aucune table de correspondance.

14.2 Export de la table de correspondance

La table doit pouvoir être exportée en :

* JSON ;
* CSV ;
* Markdown pour revue humaine ;
* éventuellement format compatible Sonal PI si le schéma exact est renseigné ultérieurement.

14.3 Export du rapport

Le rapport doit indiquer :

* nombre d’occurrences détectées ;
* nombre d’occurrences remplacées ;
* nombre d’occurrences ignorées ;
* nombre de conflits ;
* dictionnaires utilisés ;
* portée du traitement ;
* fichiers concernés ;
* date d’export ;
* paramètres appliqués.

Le rapport ne doit pas inclure les correspondances sensibles par défaut.

Une option explicite peut permettre d’inclure les correspondances, mais avec avertissement.

⸻

15. Paramètres du plugin

15.1 Paramètres généraux

* dossier de stockage des tables ;
* dossier de stockage des dictionnaires ;
* dossier d’export ;
* mode de confirmation par défaut ;
* sensibilité à la casse ;
* sensibilité aux accents ;
* remplacement mot entier uniquement ;
* préservation de la casse ;
* préservation des formats de transcription ;
* avertissements de sécurité.

15.2 Paramètres de pseudonymisation

* stratégie par défaut pour les prénoms ;
* stratégie par défaut pour les lieux ;
* stratégie par défaut pour les dates ;
* stratégie par défaut pour les institutions ;
* priorité par défaut des dictionnaires ;
* validation obligatoire ou non ;
* gestion des chevauchements.

15.3 Paramètres de sécurité

* ne jamais exporter les tables avec la transcription ;
* demander confirmation avant export d’une table ;
* avertir si export dans un dossier public ;
* avertir si mapping stocké dans le vault ;
* option de chiffrement éventuelle dans une version ultérieure.

⸻

16. MVP proposé

16.1 Version 0.1 — MVP utile

Fonctions minimales :

1. sélection d’un mot ou segment dans l’éditeur ;
2. création d’un mapping source → remplacement ;
3. choix de la portée : fichier, dossier, vault ;
4. stockage JSON de la table de correspondance ;
5. scan du fichier courant ;
6. liste des occurrences trouvées ;
7. validation occurrence par occurrence ou globale ;
8. application avec priorité manuelle (z-index) puis longueur décroissante en cas d'égalité ;
9. export du fichier pseudonymisé ;
10. export de la table JSON.

16.2 Version 0.2 — Dictionnaires

Ajouter :

1. import JSON ;
2. import CSV ;
3. gestion de plusieurs dictionnaires ;
4. activation/désactivation par dictionnaire ;
5. suggestions de remplacement à partir des dictionnaires ;
6. interface de validation des suggestions.

16.3 Version 0.3 — Formats spécialisés

Ajouter :

1. parser SRT ;
2. parser CHAT ;
3. préservation des zones non textuelles ;
4. export natif .srt et .cha ;
5. rapport de traitement.

16.4 Version 0.4 — Contrôle avancé des risques

Ajouter :

1. détection des chevauchements ;
2. score de risque de réidentification indirecte ;
3. signalement des entités composées ;
4. règles contextuelles ;
5. revue des cas needs_review.

⸻

17. Critères d’acceptation

17.1 Remplacement simple

Étant donné un fichier contenant :

Bonjour Jean.

Quand l’utilisateur crée la règle Jean → Pierre, alors l’export doit contenir :

Bonjour Pierre.

et la table JSON doit contenir le mapping.

17.2 Remplacement composé prioritaire

Étant donné :

Jean habite Saint-Jean-de-Luz.

Avec les règles :

* Jean → Pierre ;
* Saint-Jean-de-Luz → Ville moyenne limitrophe.

Alors le résultat doit être :

Pierre habite Ville moyenne limitrophe.

et jamais :

Pierre habite Saint-Pierre-de-Luz.

17.3 Validation sélective

Étant donné trois occurrences de Jean, l’utilisateur doit pouvoir en remplacer deux et en ignorer une.

Le mapping doit alors passer au statut partial ou conserver des statuts différenciés par occurrence.

17.4 Préservation SRT

Étant donné un fichier SRT, les horodatages et numéros de blocs doivent être inchangés après export.

17.5 Préservation CHAT

Étant donné un fichier CHAT, les lignes @, * et % doivent être conservées dans leur structure.

17.6 Export séparé

L’export de transcription pseudonymisée ne doit contenir aucune correspondance source → remplacement.

La table de correspondance doit être exportée séparément.

⸻

18. Tests prioritaires

18.1 Tests unitaires

* parsing SRT ;
* parsing CHAT ;
* création de mapping ;
* résolution de portée ;
* tri des priorités ;
* détection de chevauchements ;
* application de spans ;
* export JSON ;
* import dictionnaire JSON ;
* import dictionnaire CSV.

18.2 Tests de non-régression

Cas à tester systématiquement :

Jean / Saint-Jean-de-Luz
Paul / Saint-Paul
Montpellier / CHU de Montpellier
Marie / Sainte-Marie
Luz / Saint-Jean-de-Luz

18.3 Tests sur corpus simulé

Créer un petit corpus de test :

Transcriptions/
  entretien_01.srt
  entretien_02.cha
  entretien_03.md

Avec plusieurs entités répétées et composées, afin de vérifier la cohérence fichier/dossier/vault.

⸻

19. Prompt initial recommandé pour Claude Code

Tu vas développer un plugin Obsidian en TypeScript appelé transcript-pseudonymizer.
Objectif : permettre à une chercheuse de corriger et pseudonymiser des transcriptions dans Obsidian, notamment aux formats SRT, CHAT/CHA, TXT et Markdown.
Commence par implémenter le MVP v0.1 décrit dans les spécifications :
- sélection d’un texte dans l’éditeur Obsidian ;
- création d’une règle source → remplacement ;
- choix de la portée fichier/dossier/vault ;
- stockage JSON des mappings ;
- scan du fichier courant ;
- validation des occurrences ;
- application des remplacements avec priorité aux entités longues ;
- export du fichier pseudonymisé ;
- export séparé de la table de correspondance.
Contraintes essentielles :
- ne jamais faire de remplacement imbriqué naïf ;
- toujours protéger les spans déjà remplacés ;
- appliquer les remplacements par priorité décroissante puis longueur décroissante ;
- préserver les formats SRT et CHAT autant que possible ;
- séparer strictement transcription pseudonymisée et table de correspondance ;
- écrire des tests pour le cas Jean / Saint-Jean-de-Luz.
Lis d’abord le fichier de specs complet, puis propose une architecture de fichiers avant de coder.

⸻

20. Points ouverts à trancher

1. Le plugin doit-il modifier directement les fichiers originaux ou fonctionner uniquement par export ?
2. Les tables de correspondance doivent-elles être stockées dans le vault ou hors vault par défaut ?
3. Faut-il prévoir un chiffrement des tables dès la première version ?
4. Faut-il gérer les métadonnées CHAT dès le MVP ou seulement à partir de la version 0.3 ?
5. Faut-il intégrer un vrai module NER plus tard, ou rester sur dictionnaires + regex + validation humaine ?
6. Quelle compatibilité exacte viser avec les JSON de Sonal PI ?
7. Comment gérer les cas où la pseudonymisation doit conserver une propriété socialement pertinente mais sensible ?

⸻

21. Principe directeur

Le plugin ne doit pas être conçu comme un simple outil de recherche-remplacement.

Il doit être conçu comme un environnement de pseudonymisation qualitative contrôlée, adapté aux corpus interactionnels, aux matériaux de terrain sensibles, et aux exigences de recherche en sciences humaines et sociales.

La règle fondamentale est :

aucune transformation irréversible, aucun remplacement global non contrôlé, aucune table sensible exportée avec la transcription pseudonymisée.