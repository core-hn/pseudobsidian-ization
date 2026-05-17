import { Extension, RangeSetBuilder, StateEffect } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

// Signal externe : les données de surlignage ont changé.
// À dispatcher sur l'EditorView après chaque refreshHighlightData().
export const highlightDataChanged = StateEffect.define<void>();

export interface ExceptionRange { from: number; to: number; }

export interface HighlightData {
  sources: string[];                // termes originaux encore présents → orange
  replacements: string[];           // pseudonymes déjà appliqués → vert + souligné
  nerCandidates: string[];          // entités NER → bleu
  exceptionRanges: ExceptionRange[]; // positions exactes des occurrences ignorées → rouge
}

// Extension CodeMirror 6 qui surligne dans l'éditeur :
//   - en orange  : les termes sources (à pseudonymiser)
//   - en vert    : les termes de remplacement (déjà pseudonymisés)
// getData est appelé de façon synchrone à chaque mise à jour du doc.
export function createPseudonymHighlighter(getData: () => HighlightData): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;

      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }

      update(update: ViewUpdate): void {
        const dataChanged = update.transactions.some((t) =>
          t.effects.some((e) => e.is(highlightDataChanged))
        );
        if (update.docChanged || update.viewportChanged || dataChanged) {
          this.decorations = this.build(update.view);
        }
      }

      private build(view: EditorView): DecorationSet {
        const { sources, replacements, nerCandidates, exceptionRanges } = getData();
        if (sources.length === 0 && replacements.length === 0
            && nerCandidates.length === 0 && exceptionRanges.length === 0)
          return Decoration.none;

        const text = view.state.doc.toString();
        const lower = text.toLowerCase();

        // prio : 0 = plus haute priorité (gagne en cas de chevauchement)
        type Span = { from: number; to: number; cls: string; prio: number };
        const spans: Span[] = [];

        // Matching insensible à la casse (sources, remplacements, NER)
        const collect = (terms: string[], cls: string, prio: number) => {
          for (const term of terms) {
            if (!term) continue;
            const needle = term.toLowerCase();
            let pos = 0;
            while (pos < lower.length) {
              const idx = lower.indexOf(needle, pos);
              if (idx === -1) break;
              spans.push({ from: idx, to: idx + term.length, cls, prio });
              pos = idx + term.length;
            }
          }
        };

        // Exceptions par position exacte calculée depuis le contexte
        for (const { from, to } of exceptionRanges) {
          if (from >= 0 && to <= text.length) {
            spans.push({ from, to, cls: 'pseudobs-exception', prio: 0 });
          }
        }

        // Les candidats NER ne sont affichés que s'ils n'ont pas déjà une règle active
        // et ne sont pas des sous-chaînes d'une source composée connue
        // (ex. "Jean" et "Luz" filtrés si "Saint-Jean-de-Luz" est une source).
        const knownLower = new Set([
          ...sources.map((s) => s.toLowerCase()),
          ...replacements.map((r) => r.toLowerCase()),
        ]);
        const sourcesLower = sources.map((s) => s.toLowerCase());
        const freshCandidates = nerCandidates.filter((c) => {
          const cl = c.toLowerCase();
          if (knownLower.has(cl)) return false;
          // Filtrer si c est une sous-chaîne stricte d'une source composée
          return !sourcesLower.some((src) => src !== cl && src.includes(cl));
        });

        // Priorités explicites : 0 = gagne en cas de chevauchement
        // (exceptionRanges déjà ajoutés par position ci-dessus, prio 0)
        collect(replacements,  'pseudobs-replaced',      1);
        collect(sources,            'pseudobs-source',        2);
        collect(freshCandidates,    'pseudobs-ner-candidate', 3);

        // Trier par position, puis par priorité (0 = gagne) en cas d'égalité de position
        spans.sort((a, b) => a.from - b.from || a.prio - b.prio || a.to - b.to);

        const builder = new RangeSetBuilder<Decoration>();
        let lastTo = -1;
        for (const { from, to, cls } of spans) {
          if (from >= lastTo) {
            builder.add(from, to, Decoration.mark({ class: cls }));
            lastTo = to;
          }
        }

        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations }
  );
}
