import type { SrtDocument } from './SrtParser';
import type { ChatDocument, ChatLine } from './ChatParser';

// Converts a SrtDocument to a structured, Obsidian-readable Markdown string.
// Timestamps are preserved as italic headers; text lines are the editable content.
// Frontmatter records the original format for future re-export.
export function srtToMarkdown(doc: SrtDocument, sourceName: string): string {
  const lines: string[] = [
    '---',
    `pseudobs-format: srt`,
    `pseudobs-source: "${sourceName}"`,
    '---',
    '',
  ];

  for (const block of doc.blocks) {
    lines.push(`**[${block.index}]** *${block.startTime} → ${block.endTime}*`);
    lines.push(...block.lines);
    lines.push('');
  }

  // Retirer la dernière ligne vide superflue, puis ajouter \n final
  while (lines[lines.length - 1] === '') lines.pop();
  lines.push('');

  return lines.join('\n');
}

// Converts a ChatDocument to a structured, Obsidian-readable Markdown string.
// Meta (@) and dependent (%) lines become Markdown blockquotes (gray in preview).
// Speaker turns become **SPEAKER** : text (bold speaker name, editable content).
export function chatToMarkdown(doc: ChatDocument, sourceName: string): string {
  const lines: string[] = [
    '---',
    `pseudobs-format: chat`,
    `pseudobs-source: "${sourceName}"`,
    '---',
    '',
  ];

  let prevGroup: 'structural' | 'turn' | null = null;

  for (const chatLine of doc.lines) {
    const group = lineGroup(chatLine);

    // Ligne vide entre groupes structurels et tours de parole
    if (prevGroup !== null && prevGroup !== group) {
      lines.push('');
    }

    switch (chatLine.type) {
      case 'meta':
      case 'dependent':
        lines.push(`> ${chatLine.raw}`);
        break;
      case 'turn':
        lines.push(`**${chatLine.speaker}** : ${chatLine.content}`);
        break;
      case 'continuation':
        // Rattacher au tour précédent (rare en pratique)
        if (lines.length > 0) {
          lines[lines.length - 1] += ` ${chatLine.raw.trim()}`;
        }
        break;
      case 'blank':
        // Les blancs du source sont absorbés par la logique de groupe ci-dessus
        break;
    }

    if (group !== null) prevGroup = group;
  }

  while (lines[lines.length - 1] === '') lines.pop();
  lines.push('');

  return lines.join('\n');
}

function lineGroup(line: ChatLine): 'structural' | 'turn' | null {
  if (line.type === 'meta' || line.type === 'dependent') return 'structural';
  if (line.type === 'turn' || line.type === 'continuation') return 'turn';
  return null;
}
