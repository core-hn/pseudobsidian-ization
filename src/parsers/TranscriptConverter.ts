import type { SrtDocument } from './SrtParser';
import type { ChatDocument, ChatLine } from './ChatParser';
import type { VttDocument, VttWord } from './VttParser';

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
        if (lines.length > 0) {
          lines[lines.length - 1] += ` ${chatLine.raw.trim()}`;
        }
        break;
      case 'blank':
        break;
    }

    if (group !== null) prevGroup = group;
  }

  while (lines[lines.length - 1] === '') lines.pop();
  lines.push('');

  return lines.join('\n');
}

// ---- VTT / noScribe HTML ---------------------------------------------------

/** Données word-level d'une cue — stockées dans <basename>.words.json. */
export interface VttCueData {
  index: number;
  startTime: string;
  endTime: string;
  speaker?: string;
  words: VttWord[];
}

/**
 * Extrait les données word-level d'un VttDocument pour le fichier .words.json.
 * Seules les cues avec au moins un word timestamp sont incluses.
 */
export function extractWordData(doc: VttDocument): VttCueData[] {
  return doc.cues
    .map((cue, index) => ({
      index,
      startTime: cue.startTime,
      endTime:   cue.endTime,
      speaker:   cue.speaker,
      words:     cue.words,
    }))
    .filter((c) => c.words.some((w) => w.time !== ''));
}

// ---- Re-export VTT ----------------------------------------------------------

/**
 * Regex pour une ligne de corps noScribe dans le Markdown.
 * Capture optionnellement le locuteur (groupe 1) et le texte (groupe 2).
 *   **S00** [00:01:28] : texte   →  speaker=S00, text=texte
 *   [00:00:00] (..)              →  speaker=undefined, text=(..)
 */
const MD_CUE_RE = /^(?:\*\*([^*]+)\*\*\s+)?\[[\d:]+\]\s*(?::\s*)?(.*)$/;

/**
 * Reconstruit un fichier WebVTT pseudonymisé depuis :
 *   - `mdContent`  : le Markdown noScribe (pseudonymisé)
 *   - `wordData`   : le contenu de <basename>.words.json (timestamps précis)
 *
 * Alignement par index : ligne de corps N = cue N du words.json.
 * Le texte vient du Markdown ; les timestamps et le speaker de secours
 * viennent du words.json.
 *
 * Retourne null si le nombre de lignes et de cues ne correspondent pas
 * (le caller affiche un avertissement dans ce cas).
 */
export function markdownToVtt(
  mdContent: string,
  wordData: VttCueData[],
): { vtt: string; mismatch: boolean } {
  // Extraire le corps (après le frontmatter --- ... ---)
  const bodyMatch = /^---\n[\s\S]*?\n---\n+([\s\S]*)$/.exec(mdContent);
  const body = bodyMatch ? bodyMatch[1] : mdContent;

  const cueLines = body.split('\n').filter((l) => MD_CUE_RE.test(l.trim()));
  const mismatch = cueLines.length !== wordData.length;

  const parts = ['WEBVTT', ''];
  const count = Math.min(cueLines.length, wordData.length);

  for (let i = 0; i < count; i++) {
    const m = MD_CUE_RE.exec(cueLines[i].trim())!;
    // Locuteur : priorité au Markdown, fallback words.json
    const speaker = m[1]?.trim() || wordData[i].speaker;
    const text    = m[2]?.trim() ?? '';

    if (!text) continue;

    parts.push(String(i + 1));
    parts.push(`${wordData[i].startTime} --> ${wordData[i].endTime}`);
    parts.push(speaker ? `<v ${speaker}>${text}` : text);
    parts.push('');
  }

  return { vtt: parts.join('\n'), mismatch };
}

/** Convertit HH:MM:SS.mmm en [HH:MM:SS] — format d'affichage noScribe. */
function displayTime(ts: string): string {
  return `[${ts.slice(0, 8)}]`;
}

/**
 * Convertit un VttDocument en Markdown structuré au format noScribe.
 *
 * Format par cue :
 *   **Locuteur** [HH:MM:SS] : texte
 *   [HH:MM:SS] texte          (sans locuteur)
 *
 * Les timestamps précis (avec ms) et les word timestamps sont dans .words.json,
 * pas dans le corps Markdown. Le frontmatter peut inclure pseudobs-audio si
 * un fichier audio a été importé avec la transcription.
 */
function vttDocToMarkdown(
  doc: VttDocument,
  sourceName: string,
  format: 'vtt' | 'html',
  audioFilename?: string,
): string {
  const lines: string[] = ['---', `pseudobs-format: ${format}`, `pseudobs-source: "${sourceName}"`];
  if (audioFilename) lines.push(`pseudobs-audio: "${audioFilename}"`);
  lines.push('---', '');

  for (const cue of doc.cues) {
    const ts = displayTime(cue.startTime);
    if (cue.speaker) {
      lines.push(`**${cue.speaker}** ${ts} : ${cue.text}`);
    } else {
      lines.push(`${ts} ${cue.text}`);
    }
    lines.push('');
  }

  while (lines[lines.length - 1] === '') lines.pop();
  lines.push('');

  return lines.join('\n');
}

export function vttToMarkdown(doc: VttDocument, sourceName: string, audioFilename?: string): string {
  return vttDocToMarkdown(doc, sourceName, 'vtt', audioFilename);
}

export function noScribeHtmlToMarkdown(doc: VttDocument, sourceName: string, audioFilename?: string): string {
  return vttDocToMarkdown(doc, sourceName, 'html', audioFilename);
}

function lineGroup(line: ChatLine): 'structural' | 'turn' | null {
  if (line.type === 'meta' || line.type === 'dependent') return 'structural';
  if (line.type === 'turn' || line.type === 'continuation') return 'turn';
  return null;
}
