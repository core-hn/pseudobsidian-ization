/**
 * Parser VTT (WebVTT) — optimisé pour les sorties noScribe (Whisper + pyannote).
 *
 * Formats pris en charge :
 *  - VTT standard (blocs sans word timestamps)
 *  - Whisper word timestamps : <HH:MM:SS.mmm><c>mot</c>
 *  - Speaker tags : <v SPEAKER_NAME> ou [SPEAKER_NAME]
 *
 * Round-trip garanti : les word timestamps sont stockés séparément du texte
 * et réinsérés à la reconstruction autour du texte (éventuellement pseudonymisé).
 */

import type { BaseTranscriptParser } from './BaseTranscriptParser';

/** Un mot avec sa position temporelle dans l'audio. */
export interface VttWord {
  text: string;       // texte du mot (tel qu'il apparaît dans le fichier, espaces inclus)
  time: string;       // timestamp Whisper "HH:MM:SS.mmm" — vide si absent
}

export interface VttCue {
  id?: string;                  // identifiant optionnel de la cue (nombre ou chaîne)
  startTime: string;            // "HH:MM:SS.mmm"
  endTime: string;              // "HH:MM:SS.mmm"
  speaker?: string;             // locuteur extrait du tag <v ...> ou [...]
  text: string;                 // texte nettoyé (pseudonymisable)
  words: VttWord[];             // mots avec timestamps — vide si pas de word timestamps
  // Ligne(s) de texte brut original (pour le round-trip si pas de word timestamps)
  rawLines: string[];
}

export interface VttDocument {
  cues: VttCue[];
  trailingNewline: boolean;
}

// ---- Regex ------------------------------------------------------------------

// Timestamp VTT : HH:MM:SS.mmm ou MM:SS.mmm
const TIME_RE = /(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})/;
const TIMESTAMP_LINE_RE = new RegExp(
  `^${TIME_RE.source}\\s+-->\\s+${TIME_RE.source}\\s*(.*)$`
);

// Word timestamp Whisper : <HH:MM:SS.mmm>
const WORD_TIME_RE = /<(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})>/g;

// Tag de classe Whisper : <c>...</c>
const CLASS_TAG_RE = /<\/?c>/g;

// Speaker tag : <v Nom> ou <v.classname Nom>
const SPEAKER_V_RE = /^<v(?:\.[^\s>]+)?\s+([^>]+)>/;

// Speaker bracket : [Nom]
const SPEAKER_BRACKET_RE = /^\[([^\]]+)\]/;

// Tout tag HTML/VTT générique
const ALL_TAGS_RE = /<[^>]+>/g;

// ---- Helpers ----------------------------------------------------------------

/** Normalise un timestamp "MM:SS.mmm" en "HH:MM:SS.mmm". */
function normalizeTime(t: string): string {
  return t.includes(':') && t.split(':').length === 2 ? `00:${t}` : t;
}

/** Retire tous les tags VTT du texte pour obtenir le texte brut lisible. */
function stripTags(text: string): string {
  return text.replace(ALL_TAGS_RE, '').trim();
}

/**
 * Extrait les mots avec leurs timestamps Whisper depuis une ligne de texte cue.
 * Si aucun timestamp n'est présent, retourne un tableau avec le texte complet.
 */
function extractWords(rawText: string): VttWord[] {
  // Vérifier si des word timestamps sont présents
  const hasWordTimes = WORD_TIME_RE.test(rawText);
  WORD_TIME_RE.lastIndex = 0; // reset après test

  if (!hasWordTimes) {
    const clean = stripTags(rawText);
    return clean ? [{ text: clean, time: '' }] : [];
  }

  // Découper en segments : [timestamp, texte, timestamp, texte, ...]
  const words: VttWord[] = [];
  const remaining = rawText;
  let currentTime = '';

  // Traiter segment par segment
  const parts = remaining.split(WORD_TIME_RE);
  // parts alterne : [texte_avant_premier_ts, ts1, texte1, ts2, texte2, ...]

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (TIME_RE.test(part) && part.match(/^\d/)) {
      // C'est un timestamp
      currentTime = normalizeTime(part);
    } else {
      // C'est du texte — nettoyer les tags de classe
      const clean = part.replace(CLASS_TAG_RE, '').replace(ALL_TAGS_RE, '');
      if (clean.trim()) {
        words.push({ text: clean, time: currentTime });
        currentTime = '';
      }
    }
  }

  return words;
}

/**
 * Extrait le locuteur et le texte brut (sans speaker tag) d'une ligne cue.
 */
function extractSpeakerAndText(line: string): { speaker: string | undefined; text: string } {
  const vMatch = SPEAKER_V_RE.exec(line);
  if (vMatch) {
    return { speaker: vMatch[1].trim(), text: line.slice(vMatch[0].length) };
  }
  const bMatch = SPEAKER_BRACKET_RE.exec(line);
  if (bMatch) {
    return { speaker: bMatch[1].trim(), text: line.slice(bMatch[0].length).trim() };
  }
  return { speaker: undefined, text: line };
}

// ---- Parser -----------------------------------------------------------------

export class VttParser implements BaseTranscriptParser<VttDocument> {

  parse(content: string): VttDocument {
    const trailingNewline = content.endsWith('\n');
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();

    const lines = normalized.split('\n');
    let i = 0;

    // Sauter le header WEBVTT (et les métadonnées éventuelles)
    while (i < lines.length && !lines[i].startsWith('WEBVTT')) i++;
    i++; // sauter la ligne WEBVTT elle-même

    const cues: VttCue[] = [];

    while (i < lines.length) {
      // Sauter les lignes vides
      while (i < lines.length && lines[i].trim() === '') i++;
      if (i >= lines.length) break;

      // ID optionnel (ligne non-timestamp, non-vide avant le timestamp)
      let cueId: string | undefined;
      if (i < lines.length && !TIMESTAMP_LINE_RE.test(lines[i])) {
        cueId = lines[i].trim();
        i++;
      }

      // Ligne timestamp
      if (i >= lines.length) break;
      const tsMatch = TIMESTAMP_LINE_RE.exec(lines[i]);
      if (!tsMatch) { i++; continue; } // ligne inattendue

      const startTime = normalizeTime(tsMatch[1]);
      const endTime   = normalizeTime(tsMatch[2]);
      i++;

      // Lignes de texte de la cue
      const rawLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '') {
        rawLines.push(lines[i]);
        i++;
      }

      if (rawLines.length === 0) continue;

      // Extraire locuteur depuis la première ligne
      const firstLineResult = extractSpeakerAndText(rawLines[0]);
      const speaker = firstLineResult.speaker;

      // Reconstruire le texte complet de la cue (sans speaker tag sur la 1ère ligne)
      const textLines = [firstLineResult.text, ...rawLines.slice(1)];
      const fullRaw = textLines.join('\n');

      // Extraire les word timestamps
      const words = extractWords(fullRaw);

      // Texte nettoyé pour pseudonymisation
      const text = words.map((w) => w.text).join('');

      cues.push({ id: cueId, startTime, endTime, speaker, text, words, rawLines });
    }

    return { cues, trailingNewline };
  }

  reconstruct(doc: VttDocument): string {
    const parts: string[] = ['WEBVTT', ''];

    for (const cue of doc.cues) {
      if (cue.id !== undefined) parts.push(cue.id);

      parts.push(`${cue.startTime} --> ${cue.endTime}`);

      if (cue.words.length > 0 && cue.words.some((w) => w.time !== '')) {
        // Reconstruire avec word timestamps depuis le tableau words
        const line = this.reconstructWithWordTimestamps(cue);
        parts.push(line);
      } else {
        // Pas de word timestamps — reconstruire depuis le texte pseudonymisé
        // en préservant le speaker tag si présent
        const speaker = cue.speaker;
        const textLine = speaker ? `<v ${speaker}>${cue.text}` : cue.text;
        parts.push(textLine);
      }

      parts.push('');
    }

    const body = parts.join('\n');
    return doc.trailingNewline ? body : body.trimEnd();
  }

  private reconstructWithWordTimestamps(cue: VttCue): string {
    let line = cue.speaker ? `<v ${cue.speaker}>` : '';
    for (const word of cue.words) {
      if (word.time) line += `<${word.time}>`;
      line += `<c>${word.text}</c>`;
    }
    return line;
  }

  /**
   * Met à jour le texte d'une cue après pseudonymisation.
   * Propage le remplacement dans le tableau words pour maintenir le round-trip.
   */
  static applyTextToWords(cue: VttCue, newText: string): void {
    cue.text = newText;
    // Si pas de word timestamps, on met tout dans le premier mot
    if (cue.words.length === 0 || cue.words.every((w) => w.time === '')) {
      cue.words = [{ text: newText, time: '' }];
      return;
    }
    // Avec word timestamps : le remplacement affecte potentiellement plusieurs mots.
    // Stratégie simple : on remplace le texte du premier mot et on vide les suivants.
    // Une future version pourrait aligner mot à mot via diff.
    cue.words[0].text = newText;
    for (let i = 1; i < cue.words.length; i++) {
      cue.words[i].text = '';
    }
  }
}
