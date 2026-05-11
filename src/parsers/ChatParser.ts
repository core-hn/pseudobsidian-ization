import type { BaseTranscriptParser } from './BaseTranscriptParser';

// Types de lignes du format CHAT / CHA (SPECS §3.3)
export type ChatLineType = 'meta' | 'turn' | 'dependent' | 'continuation' | 'blank';

export interface ChatLine {
  type: ChatLineType;
  raw: string;       // ligne originale complète — garantit le round-trip
  // Présents uniquement pour type === 'turn'
  speaker?: string;  // identifiant du locuteur (ex. 'INV', 'PAR')
  prefix?: string;   // "*SPEAKER: " — tout ce qui précède le contenu remplaçable
  content?: string;  // texte du tour de parole (seule zone remplaçable)
}

export interface ChatDocument {
  lines: ChatLine[];
  trailingNewline: boolean;
}

export class ChatParser implements BaseTranscriptParser<ChatDocument> {
  parse(content: string): ChatDocument {
    const trailingNewline = content.endsWith('\n');
    const normalized = content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    const rawLines = normalized.split('\n');

    // La dernière entrée après split est vide si le fichier finit par \n
    // On la retire pour ne pas créer une ligne 'blank' fantôme
    const linesToParse =
      trailingNewline && rawLines[rawLines.length - 1] === ''
        ? rawLines.slice(0, -1)
        : rawLines;

    return { lines: linesToParse.map((raw) => this.parseLine(raw)), trailingNewline };
  }

  private parseLine(raw: string): ChatLine {
    if (raw === '') return { type: 'blank', raw };
    if (raw.startsWith('@')) return { type: 'meta', raw };
    if (raw.startsWith('%')) return { type: 'dependent', raw };
    if (raw.startsWith('\t')) return { type: 'continuation', raw };

    if (raw.startsWith('*')) {
      const colonIdx = raw.indexOf(':');
      // colonIdx > 1 : il faut au moins un caractère de locuteur entre * et :
      if (colonIdx > 1) {
        const speaker = raw.slice(1, colonIdx);
        const afterColon = raw.slice(colonIdx + 1);
        // préserver le séparateur exact (espace, tabulation, ou les deux)
        const sep = afterColon.match(/^([\t ]*)/)?.[1] ?? '';
        const prefix = raw.slice(0, colonIdx + 1) + sep;
        const content = afterColon.slice(sep.length);
        return { type: 'turn', raw, speaker, prefix, content };
      }
    }

    // Ligne non reconnue → préserver telle quelle
    return { type: 'meta', raw };
  }

  reconstruct(doc: ChatDocument): string {
    const body = doc.lines
      .map((line) => {
        // Reconstruire les tours depuis prefix + content (éventuellement modifié)
        if (line.type === 'turn' && line.prefix !== undefined && line.content !== undefined) {
          return line.prefix + line.content;
        }
        return line.raw;
      })
      .join('\n');

    return doc.trailingNewline ? body + '\n' : body;
  }
}
