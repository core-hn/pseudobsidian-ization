# Pseudonymizer Tool

An Obsidian plugin for **pseudonymizing and correcting interactional transcripts** for researchers in linguistics and conversation analysis. It fills a gap: existing tools (Sonal, Whispurge) do not integrate into a note-taking and analysis environment, and few applications support multimodal transcription conventions (Jefferson, ICOR).

> **Français** — [README.fr.md](README.fr.md)

---

## Workflow

```
noScribe (.html, .vtt)  or  raw transcript (.srt, .cha, .md, .txt)
        ↓ automatic import  (audio file imported alongside)
Obsidian — native Markdown editing  (**S00** [HH:MM:SS] : text)
        ↓ pseudonymization  (manual · NER · dictionary scan)
Annotated source file  +  correspondence table  +  word timestamps (.words.json)
        ↓ export
Pseudonymized transcript (.pseudonymized.md / .pseudonymized.vtt)
```

Two approaches, freely combined:

- **Manual** — right-click a term → choose a pseudonym → the plugin replaces it and saves the rule
- **Automatic (NER)** — an AI model detects identifying entities and highlights them in blue in the editor → the researcher validates or rejects each candidate

Pseudonyms are wrapped in `{{...}}` markers in the source file and export to remain visually distinct from raw data. Correspondence tables are never included in exports.

---

## Getting started

### First launch

A setup wizard opens automatically on first load:

1. **Welcome** — plugin overview
2. **Language** — choose the interface language
3. **Storage** — configure vault folders (we recommend one vault per corpus)
4. **NER detection** — enable the local AI model (WASM download ~19 MB) or work with manual rules only
5. **Dictionaries** — install replacement candidate dictionaries from the online catalogue

The wizard can be relaunched at any time: Settings → Pseudonymizer Tool → Setup wizard.

### Supported formats

| Format | Extension | Notes |
|---|---|---|
| **noScribe HTML** | `.html` | Qt Rich Text from noScribe — speaker labels, word timestamps, audio path |
| **noScribe VTT** | `.vtt` | noScribe v0.7 output — also standard Whisper WebVTT with word timestamps |
| Timestamped subtitles | `.srt` | Whisper / AI output — timestamps and structure preserved |
| CHAT / CLAN | `.cha`, `.chat` | `@`, `*`, `%` lines preserved |
| Annotated Markdown | `.md` | Jefferson or ICOR conventions |
| Plain text | `.txt` | No convention markers |

All formats are automatically converted to Markdown on import. Alongside the `.md`, the plugin creates:
- `<basename>.mapping.json` — pseudonymization rules
- `<basename>.words.json` — word-level timestamps (noScribe / Whisper only), used for VTT re-export
- If an audio file is referenced in the transcript, it is imported to the vault automatically.

> Install the [Data Files Editor](https://github.com/zuktol/obsidian-data-files-editor) plugin to view mapping JSON files directly in your vault.

### Installation

**Via the Obsidian community plugins directory** (under review):
1. Obsidian → Settings → Community plugins → Browse → "Pseudonymizer Tool"

**Manual installation** from the [latest GitHub release](https://github.com/core-hn/pseudobsidian-ization/releases):
1. Download `main.js`, `manifest.json`, `styles.css`
2. Copy into `.obsidian/plugins/pseudonymizer-tool/` in your vault
3. Enable in Settings → Community plugins

> WASM files (NER) are downloaded automatically by the wizard on first launch if you enable automatic detection. They can also be downloaded manually from the release.

---

## Features

### Manual pseudonymization

All actions are available via **right-click** on a selection in the editor:

| Action | Description |
|---|---|
| **Pseudonymize** | Replace the term (this occurrence or all) with `{{...}}` markers |
| **Pseudonymize with Prof. Baptiste Coulmont** | Queries [coulmont.com](https://coulmont.com) — suggests sociologically equivalent first names (same social background, same decade) |
| **Create a rule** | Saves the correspondence in the mapping JSON without modifying the text |
| **Edit rule** | Modifies an existing rule (available on orange or green highlighted terms) |
| **Cancel pseudonymization** | Restores the original term for this occurrence (available on green terms) |

### Automatic NER detection

The **named entity recognition** engine detects first names, surnames, places and institutions without a pre-existing list, using syntactic context. Unlike a dictionary approach, it distinguishes "Florence" the person from "Florence" the city. Sub-terms of a known compound entity are automatically filtered (if "Saint-Jean-de-Luz" is a rule, "Jean" and "Luz" do not appear as NER candidates).

**Usage:**
1. Side panel → **NER** tab → **Identify candidates**
2. Entities appear **highlighted in blue** in the editor
3. Right-click a blue term → **Pseudonymize** or **Create a rule**

**Model:** `Xenova/bert-base-multilingual-cased-ner-hrl` via `transformers.js`. 100% local execution. One-time downloads on first use: WASM (~19 MB) + NER model (~66 MB). **Works offline after the first download.**

**Settings (NER tab in the panel):**
- **Confidence threshold** (0.50–1.00): increasing it reduces false positives
- **Excluded function words**: editable list of tokens to always ignore ("de", "du", "la"…)

### Side panel

Accessible via the ribbon icon or `Ctrl+P → Pseudonymization: open panel`.

| Tab | Content |
|---|---|
| **Mappings** | Active rules · Edit · Delete · Add · Scan file · **Exceptions section** |
| **Dictionaries** | Mini cards · Dictionary scan · Local import |
| **Exports** | Pseudonymize and export · Export correspondence table · **Export as VTT** |
| **NER** | Visible if NER enabled · Identify candidates · Confidence threshold · Function words |

### Highlighting and markers

Highlighting is active in all open files, including `.pseudonymized.*` export files, which automatically inherit rules from the source file.

| Colour | Meaning |
|---|---|
| 🟠 Orange + outline | Source term still present — to be pseudonymized |
| 🟢 Green + underline | Pseudonym applied directly in the file |
| 🔵 Blue + outline | NER candidate — no rule yet |
| 🔴 Red + underline | **Exception** — occurrence explicitly ignored during scan (case-sensitive; persisted in mapping) |

In exported files, pseudonyms are wrapped in `{{Pierre}}` markers to distinguish them from raw data (enabled by default, configurable in settings).

### Correspondence tables

- Three scope levels: `file.mapping.json` · `folder.mapping.json` · `vault.mapping.json`
- Per-rule statuses: **Active** (validated), **Partial**, **Ignored**, **Suggested**
- Per-occurrence ignored exceptions: `IgnoredOccurrence {text, contextBefore, contextAfter}` stored in the rule
- **Z-index priority**: free integer — longer entities take precedence (`Saint-Jean-de-Luz` > `Jean`)
- JSON format documented in `SPECS.md §5`

### Pseudonymization dictionaries

Dictionaries provide **replacement candidates** and feed **automatic detection**. They are hosted in a dedicated repository and downloaded into your vault — no transcript text ever leaves Obsidian.

**Installing from the catalogue:**
1. Wizard → Dictionaries step → choose from the online catalogue
2. Or: Settings → Setup wizard → Dictionaries step

**Usage:**
1. Side panel → **Dictionaries** tab
2. Check the dictionaries to activate for the scan
3. Click **Scan active file** (or the magnifier button on each card for a single dictionary)
4. A review modal opens: each detected entity is shown with its context excerpt, proposed class and automatically computed replacement (`Ville_1`, `Métropole_2`…)
5. Uncheck false positives · edit the prefix if needed · **Create rules**

**Available dictionary — French communes (GeoAPI INSEE):**
- 34,957 French communes, 5 classes: Village · Petite_Ville · Ville · Grande_Ville · Métropole
- Roles: detection + class-based replacement with incremental index
- Recommended scope: file (each file gets its own numbering)

> Dedicated repository: [core-hn/pseudobsidian-dictionaries](https://github.com/core-hn/pseudobsidian-dictionaries) — contributions welcome.

### Corpus organization

The plugin helps you structure your corpus in folders before starting work. Use the command **Organize corpus** (Ctrl+P) to define classes (sub-folders). Each class automatically creates mirrored folders for transcriptions, mapping tables and exports. When adding a transcription, you are prompted to select a class.

> We recommend **one Obsidian vault per corpus**. This keeps mapping files, dictionaries and exports together with their transcriptions, and makes archiving or sharing a corpus straightforward.

### Privacy and security

- All processing is **local** — no transcript text is sent to an external server
- The NER model runs in Obsidian via WASM, without any network call
- **Documented exception:** "Pseudonymize with Coulmont" sends the *source first name* (not transcript content) to `coulmont.com/bac` to suggest equivalent names. B. Coulmont states on his website that searches are not logged.
- Correspondence tables are never included in pseudonymized exports.

---

## For developers

```bash
git clone https://gitlab.huma-num.fr/aabbadie/pseudobsidian-ization.git
cd pseudobsidian-ization
npm install
npm run dev           # watch build (esbuild)
npm test              # Jest test suite
npm run build         # production build
npm run deploy        # build + copy to test_vault/
npm run build:cities  # regenerate assets/cities.dict.json from GeoAPI INSEE
```

Repository structure:

```
src/
├── main.ts               # Obsidian entry point
├── settings.ts           # Persistent settings
├── types.ts              # Shared types (MappingRule, IgnoredOccurrence, …)
├── i18n/                 # Internationalization (en, fr)
├── parsers/              # SrtParser, ChatParser, VttParser,
│                         # NoScribeHtmlParser, NoScribeVttParser, TranscriptConverter
├── mappings/             # MappingStore, ScopeResolver
├── pseudonymizer/        # Engine, ReplacementPlanner, SpanProtector, Redaction
├── scanner/              # OccurrenceScanner, OnnxNerScanner
├── dictionaries/         # DictionaryLoader
└── ui/                   # PseudonymizationView, modals (incl. OccurrencesContextModal),
                          # CM6 highlighting (PseudonymHighlighter)
```

---

## Status — v0.1.x

| Phase | Status | Description |
|---|---|---|
| 0–6 | ✅ | Parsers · Engine · Commands · Scopes · Highlighting · Validation |
| 7 — Coulmont | ✅ | Equivalent first name suggestions · JSON/CSV import |
| 8 — Side panel | ✅ | 3 tabs · Embedded NER · Wizard · Cancellation · Export highlighting |
| 9 — Structured dictionaries | ✅ | Format v1.1 · DictionaryLoader · Dictionary scan · Review modal · French communes |
| 10 — Refinement & noScribe | 🔄 | i18n · Corpus org · noScribe HTML/VTT import · per-occurrence scan · exceptions · VTT re-export |
| 11 — EMCA functions | ⏳ | Turn navigation · Jefferson/ICOR correction · ELAN export |

See [ROADMAP.md](ROADMAP.md) for the full phase breakdown and planned features.

---

## Contributing

Contributions are welcome, particularly:

- **Dictionaries**: first name lists, place names, institutions for specific corpora (regional languages, non-French fields, historical periods) — see [core-hn/pseudobsidian-dictionaries](https://github.com/core-hn/pseudobsidian-dictionaries)
- **Transcription conventions**: parsers for other systems (ELAN, Praat TextGrid, EXMARaLDA)
- **Usage feedback**: issues to report edge cases encountered on real corpora

Please open an issue before submitting a pull request for significant features.

---

## Licence

GPL 3.0

### Code

*The Beerware License* (Revision 42)

```
Axelle Abbadie wrote this code. You can do whatever you want with it
as long as you keep this notice. If we meet someday, and you think
it was worth it, you can buy me a beer.
```

**This plugin is made to be modified.** If your fieldwork involves particular transcription conventions, a regional dialect, multilingual corpora or institution-specific export formats, adapt the code to your needs.

---

## Credits

### Intellectual property
- **Axelle Abbadie** — design, specifications, development direction, UX research. ([cvHAL](https://cv.hal.science/axelle-abbadie))
- Vibe-coded with **Claude Sonnet 4.6** (Anthropic)

### Inspiration
- **Sonal pi** — Following a meeting with [Maxime Beligné](https://umr5600.cnrs.fr/fr/lequipe/name/max-beligne/) at the ["Pseudonymiser, Anonymiser?" day organized by MSH-Sud](https://www.mshsud.org/agenda/anonymiser-pseudonymiser/). Software: [Sonal-pi](https://www.sonal-info.com/), developed since 2008 by Alex Alber.

### Acknowledged work
- **Baptiste Coulmont** — pseudonymization tool ([coulmont.com/bac](https://coulmont.com/bac)) used for first name suggestions.
- **Stefan Schweter** (Bayerische Staatsbibliothek) — multilingual NER model [`bert-base-multilingual-cased-ner-hrl`](https://huggingface.co/stefan-it/bert-base-multilingual-cased-ner-hrl), used for automatic entity detection.
- **Joshua Lochner / Xenova** — ONNX model conversion and [`transformers.js`](https://github.com/xenova/transformers.js) library, enabling local execution in Obsidian without a Python dependency.
