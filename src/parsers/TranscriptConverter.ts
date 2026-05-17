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

// ---- Re-exports format d'origine -------------------------------------------

/** Extrait le corps d'un Markdown (après le frontmatter ---...---). */
function extractBody(mdContent: string): string {
  const m = /^---\n[\s\S]*?\n---\n+([\s\S]*)$/.exec(mdContent);
  return m ? m[1] : mdContent;
}

/**
 * Reconstruit un fichier SRT pseudonymisé depuis le Markdown (pseudobs-format: srt).
 * Format attendu : **[N]** *HH:MM:SS,mmm → HH:MM:SS,mmm* suivi des lignes de texte.
 */
export function markdownToSrt(mdContent: string): string {
  const body = extractBody(mdContent);
  const lines = body.split('\n');

  // Regex d'en-tête de bloc SRT dans le Markdown
  const HEADER_RE = /^\*\*\[(\d+)\]\*\* \*(.+?) → (.+?)\*$/;

  const parts: string[] = [];
  let currentBlock: { index: string; start: string; end: string; lines: string[] } | null = null;

  const flush = () => {
    if (!currentBlock) return;
    parts.push(currentBlock.index);
    parts.push(`${currentBlock.start} --> ${currentBlock.end}`);
    parts.push(...currentBlock.lines);
    parts.push('');
  };

  for (const line of lines) {
    const m = HEADER_RE.exec(line);
    if (m) {
      flush();
      currentBlock = { index: m[1], start: m[2], end: m[3], lines: [] };
    } else if (currentBlock) {
      currentBlock.lines.push(line);
    }
  }
  flush();

  // Retirer les lignes vides de fin de chaque bloc sauf la dernière
  return parts.join('\n');
}

/**
 * Reconstruit un fichier CHAT (.cha) pseudonymisé depuis le Markdown (pseudobs-format: chat).
 * Format attendu :
 *   > @ligne-meta   →  @ligne-meta
 *   **SPEAKER** : texte  →  *SPEAKER:\ttexte
 */
export function markdownToCha(mdContent: string): string {
  const body = extractBody(mdContent);
  const lines = body.split('\n');

  const BLOCKQUOTE_RE = /^> (.*)$/;
  const TURN_RE = /^\*\*([^*]+)\*\* : (.*)$/;

  const out: string[] = [];

  for (const line of lines) {
    const bq = BLOCKQUOTE_RE.exec(line);
    if (bq) {
      out.push(bq[1]);
      continue;
    }
    const turn = TURN_RE.exec(line);
    if (turn) {
      out.push(`*${turn[1]}:\t${turn[2]}`);
      continue;
    }
    // Lignes vides : préserver pour séparer les blocs
    if (line.trim() === '') continue;
    // Texte de continuation (rare)
    out.push(line);
  }

  // Assurer @End en dernière ligne si présent
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  out.push('');
  return out.join('\n');
}

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
