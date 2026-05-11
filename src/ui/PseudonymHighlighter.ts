import { Extension, RangeSetBuilder, StateEffect } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

// Signal externe : les données de surlignage ont changé.
// À dispatcher sur l'EditorView après chaque refreshHighlightData().
export const highlightDataChanged = StateEffect.define<void>();

export interface HighlightData {
  sources: string[];       // termes originaux encore présents → orange (à pseudonymiser)
  replacements: string[];  // pseudonymes déjà appliqués → vert
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
        const { sources, replacements } = getData();
        if (sources.length === 0 && replacements.length === 0) return Decoration.none;

        const text = view.state.doc.toString();
        const lower = text.toLowerCase();

        type Span = { from: number; to: number; cls: string };
        const spans: Span[] = [];

        const collect = (terms: string[], cls: string) => {
          for (const term of terms) {
            if (!term) continue;
            const needle = term.toLowerCase();
            let pos = 0;
            while (pos < lower.length) {
              const idx = lower.indexOf(needle, pos);
              if (idx === -1) break;
              spans.push({ from: idx, to: idx + term.length, cls });
              pos = idx + term.length;
            }
          }
        };

        collect(sources, 'pseudobs-source');
        collect(replacements, 'pseudobs-replaced');

        // Trier par position (RangeSetBuilder l'exige) et éliminer les chevauchements
        spans.sort((a, b) => a.from - b.from || a.to - b.to);

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
