import type { BaseTranscriptParser } from './BaseTranscriptParser';

export interface SrtBlock {
  index: number;
  startTime: string;
  endTime: string;
  lines: string[];   // lignes de texte remplaçables uniquement
}

export interface SrtDocument {
  blocks: SrtBlock[];
  // préservé pour le round-trip exact
  trailingNewline: boolean;
}

export class SrtParser implements BaseTranscriptParser<SrtDocument> {
  parse(content: string): SrtDocument {
    const trailingNewline = content.endsWith('\n');
    // normaliser les fins de ligne et retirer le blanc final avant de découper en blocs
    // (sinon le dernier bloc capture le \n terminal dans ses lines[])
    const normalized = content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trimEnd();

    const rawBlocks = normalized.split(/\n\n+/).filter((b) => b.trim() !== '');

    const blocks: SrtBlock[] = rawBlocks.map((rawBlock) => {
      const lines = rawBlock.split('\n');
      const index = parseInt(lines[0].trim(), 10);

      // "HH:MM:SS,mmm --> HH:MM:SS,mmm"
      const arrowPos = lines[1].indexOf(' --> ');
      const startTime = lines[1].slice(0, arrowPos);
      const endTime = lines[1].slice(arrowPos + 5);

      return { index, startTime, endTime, lines: lines.slice(2) };
    });

    return { blocks, trailingNewline };
  }

  reconstruct(doc: SrtDocument): string {
    const body = doc.blocks
      .map((b) => `${b.index}\n${b.startTime} --> ${b.endTime}\n${b.lines.join('\n')}`)
      .join('\n\n');
    return doc.trailingNewline ? body + '\n' : body;
  }
}
