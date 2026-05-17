/**
 * Parser VTT noScribe — format produit par noScribe ≥ 0.7.
 *
 * Le VTT noScribe n'est PAS du WebVTT standard : chaque tour de parole est
 * décomposé en plusieurs cues successives ayant souvent le même intervalle :
 *   - cue "label"   : "<v SXX>SXX: " (détection du locuteur)
 *   - cue "display" : "<v SXX>[HH:MM:SS]" (timestamp lisible — ignorer)
 *   - cue "texte"   : "<v SXX>contenu transcrit" (texte réel)
 *
 * Parfois le label et le texte sont fusionnés :
 *   "S01: [00:00:09] Vous avez fini ces rapports ?"
 *
 * Contraintes :
 *   - Le tag <v SXX> n'est pas fiable pour l'attribution des locuteurs.
 *   - Le timestamp des cues "label" est erroné ; utiliser celui de la cue texte.
 *   - Pas de word-level timestamps (contrairement au VTT Whisper).
 *
 * Produit un VttDocument compatible avec vttToMarkdown / extractWordData.
 */

import type { VttDocument, VttCue } from './VttParser';

// ---- Regex ------------------------------------------------------------------

// Ligne de timestamp VTT
const TIMESTAMP_LINE_RE = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})/;

// Tag <v SXX> noScribe
const SPEAKER_V_TAG_RE = /^<v\s+\w+>/;

// Label locuteur en début de texte : "S00: " ou "S00 : "
const SPEAKER_LABEL_RE = /^(S\d+)\s*:\s*/;

// Timestamp d'affichage : [HH:MM:SS]
const DISPLAY_TS_RE = /^\[\d{2}:\d{2}:\d{2}\]\s*/;

// Entités HTML basiques
const HTML_ENTITIES: Record<string, string> = {
  '&#x27;': "'", '&#39;': "'", '&amp;': '&',
  '&lt;': '<', '&gt;': '>', '&quot;': '"', '&nbsp;': ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&#?x?[0-9a-zA-Z]+;/g, (m) => HTML_ENTITIES[m] ?? m);
}

function stripSpeakerVTag(line: string): string {
  return SPEAKER_V_TAG_RE.test(line) ? line.replace(SPEAKER_V_TAG_RE, '') : line;
}

// ---- Types intermédiaires ---------------------------------------------------

interface RawCue {
  startTime: string;
  endTime: string;
  text: string; // texte nettoyé (sans <v>), entités décodées
}

interface Fragment {
  startTime: string;
  endTime: string;
  speaker: string | undefined;
  text: string;
}

// ---- Parser -----------------------------------------------------------------

export class NoScribeVttParser {
  /** Détecte un VTT produit par noScribe (présence de NOTE noScribe). */
  static isNoScribeVtt(content: string): boolean {
    return content.startsWith('WEBVTT') && content.includes('noScribe');
  }

  /** Extrait le chemin audio depuis la ligne NOTE media. */
  static extractAudioSource(content: string): string | null {
    const m = /^NOTE\s+media:\s*(.+)$/m.exec(content);
    return m ? m[1].trim() : null;
  }

  parse(content: string): VttDocument {
    const rawCues = this.parseRawCues(content);
    const fragments = this.buildFragments(rawCues);
    const cues = this.mergeIntoCues(fragments);
    return { cues, trailingNewline: content.endsWith('\n') };
  }

  // --- Étape 1 : parser les cues brutes ------------------------------------

  private parseRawCues(content: string): RawCue[] {
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    const cues: RawCue[] = [];

    let i = 0;
    // Sauter jusqu'à la première ligne de timestamp (ignore header + NOTE)
    while (i < lines.length) {
      const tsMatch = TIMESTAMP_LINE_RE.exec(lines[i]);
      if (tsMatch) {
        const startTime = tsMatch[1];
        const endTime   = tsMatch[2];
        i++;

        // Collecter les lignes de texte jusqu'à la ligne vide
        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '') {
          const cleaned = decodeEntities(stripSpeakerVTag(lines[i]));
          textLines.push(cleaned);
          i++;
        }

        const text = textLines.join(' ').trim();
        cues.push({ startTime, endTime, text });
      } else {
        i++;
      }
    }
    return cues;
  }

  // --- Étape 2 : convertir en fragments (speaker + text + timestamp) --------

  private buildFragments(cues: RawCue[]): Fragment[] {
    const fragments: Fragment[] = [];
    let currentSpeaker: string | undefined;

    for (const cue of cues) {
      let text = cue.text;

      // Extraire le label locuteur s'il est présent
      const labelMatch = SPEAKER_LABEL_RE.exec(text);
      if (labelMatch) {
        currentSpeaker = labelMatch[1]; // "S00", "S01", etc.
        text = text.slice(labelMatch[0].length);
      }

      // Supprimer le timestamp d'affichage [HH:MM:SS]
      text = text.replace(DISPLAY_TS_RE, '').trim();

      // Ignorer les cues vides, les cues label seuls, et les timestamps seuls
      if (!text || /^\[[\d:]+\]$/.test(text)) continue;

      fragments.push({
        startTime: cue.startTime,
        endTime:   cue.endTime,
        speaker:   currentSpeaker,
        text,
      });
    }

    return fragments;
  }

  // --- Étape 3 : fusionner les fragments en VttCues -------------------------
  //
  // Un "tour" commence à chaque nouveau label de locuteur dans l'étape 2.
  // Les fragments sans changement de locuteur sont rattachés au tour courant.
  // Heuristique de fusion : on regroupe les fragments temporellement proches
  // (gap < 2 s) appartenant au même locuteur.

  private mergeIntoCues(fragments: Fragment[]): VttCue[] {
    if (fragments.length === 0) return [];

    const cues: VttCue[] = [];
    let batch: Fragment[] = [fragments[0]];

    const flushBatch = () => {
      if (batch.length === 0) return;
      const text = batch.map((f) => f.text).join(' ').replace(/\s+/g, ' ').trim();
      if (text) {
        cues.push({
          startTime: batch[0].startTime,
          endTime:   batch[batch.length - 1].endTime,
          speaker:   batch[0].speaker,
          text,
          words: [{ text, time: batch[0].startTime }],
          rawLines: [],
        });
      }
      batch = [];
    };

    for (let i = 1; i < fragments.length; i++) {
      const prev = batch[batch.length - 1];
      const curr = fragments[i];

      // Nouveau tour si le locuteur change
      const speakerChanged = curr.speaker !== prev.speaker;
      // Ou si le gap temporel est significatif (> 2 s) entre deux fragments du même locuteur
      const prevEndSec  = timeToSeconds(prev.endTime);
      const currStartSec = timeToSeconds(curr.startTime);
      const bigGap = !speakerChanged && (currStartSec - prevEndSec) > 2;

      if (speakerChanged || bigGap) {
        flushBatch();
        batch = [curr];
      } else {
        batch.push(curr);
      }
    }

    flushBatch();
    return cues;
  }
}

function timeToSeconds(ts: string): number {
  const [h, m, s] = ts.split(':');
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
}
