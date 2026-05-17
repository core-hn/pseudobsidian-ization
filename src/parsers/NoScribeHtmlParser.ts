/**
 * Parser HTML noScribe — produit un VttDocument compatible avec VttParser/TranscriptConverter.
 *
 * Format noScribe HTML (Qt Rich Text) :
 * - <meta name="audio_source"> : chemin vers le fichier audio source
 * - Chaque <p> = un tour de parole ou une pause
 * - Chaque <a name="ts_START_END_SPEAKER"> = un segment avec timestamps
 *   START et END sont en millisecondes depuis le début de l'audio
 * - Le nom du locuteur précède " :" en début de tour
 * - Les timestamps d'affichage [HH:MM:SS] (couleur #78909c) sont à ignorer
 */

import type { VttDocument, VttCue, VttWord } from './VttParser';

// ---- Regex ------------------------------------------------------------------

const PARA_RE = /<p(?:\s[^>]*)?>(?<content>.*?)<\/p>/gs;
const ANCHOR_RE = /<a\s+name="(ts_[^"]+)"[^>]*>(.*?)<\/a>/gs;
const TS_NAME_RE = /^ts_(\d+)_(\d+)_(\w*)$/;
// Timestamps d'affichage [HH:MM:SS] générés par noScribe pour l'interface — ignorer
const DISPLAY_TS_RE = /^\[\d{2}:\d{2}:\d{2}\]$/;
// Locuteur suivi de " :" en début de texte
const SPEAKER_RE = /^(.+?)\s*:\s*/;
const ALL_TAGS_RE = /<[^>]+>/g;

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#039;': "'", '&apos;': "'", '&nbsp;': ' ',
};

// ---- Helpers ----------------------------------------------------------------

function decodeEntities(text: string): string {
  return text.replace(/&[^;]+;/g, (m) => HTML_ENTITIES[m] ?? m);
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(ALL_TAGS_RE, ''));
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }
function pad3(n: number): string { return String(n).padStart(3, '0'); }

/** Convertit des millisecondes en timestamp HH:MM:SS.mmm. */
function msToTimestamp(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mss = ms % 1000;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(mss)}`;
}

// ---- Parser -----------------------------------------------------------------

export class NoScribeHtmlParser {
  /** Vérifie qu'un contenu HTML est une sortie noScribe. */
  static isNoScribeHtml(content: string): boolean {
    return content.includes('qrichtext') && content.includes('<a name="ts_');
  }

  /** Extrait le chemin absolu du fichier audio depuis la meta tag noScribe. */
  static extractAudioSource(content: string): string | null {
    const m = /meta\s+name="audio_source"\s+content="([^"]+)"/.exec(content);
    return m ? m[1] : null;
  }

  parse(content: string): VttDocument {
    const cues: VttCue[] = [];

    PARA_RE.lastIndex = 0;
    let paraMatch: RegExpExecArray | null;

    while ((paraMatch = PARA_RE.exec(content)) !== null) {
      const paraHtml = paraMatch[1];
      if (!paraHtml.includes('ts_')) continue;

      // Extraire et grouper les ancres par nom de timestamp (plusieurs ancres peuvent
      // partager le même ts_ pour des raisons de mise en forme Qt)
      const grouped = new Map<string, {
        startMs: number; endMs: number; speakerId: string; texts: string[];
      }>();
      const groupOrder: string[] = [];

      ANCHOR_RE.lastIndex = 0;
      let anchorMatch: RegExpExecArray | null;

      while ((anchorMatch = ANCHOR_RE.exec(paraHtml)) !== null) {
        const tsName = anchorMatch[1];
        const innerHtml = anchorMatch[2];
        const tsMatch = TS_NAME_RE.exec(tsName);
        if (!tsMatch) continue;

        const text = stripTags(innerHtml);
        if (DISPLAY_TS_RE.test(text.trim())) continue;

        if (!grouped.has(tsName)) {
          grouped.set(tsName, {
            startMs:  parseInt(tsMatch[1], 10),
            endMs:    parseInt(tsMatch[2], 10),
            speakerId: tsMatch[3],
            texts: [],
          });
          groupOrder.push(tsName);
        }
        if (text) grouped.get(tsName)!.texts.push(text);
      }

      if (groupOrder.length === 0) continue;

      // Construire les VttWords à partir des groupes
      const rawWords: VttWord[] = [];
      for (const tsName of groupOrder) {
        const g = grouped.get(tsName)!;
        const text = g.texts.join('');
        if (text.trim()) rawWords.push({ text, time: msToTimestamp(g.startMs) });
      }
      if (rawWords.length === 0) continue;

      // Extraire le locuteur depuis le début du premier mot
      let speaker: string | undefined;
      const firstText = rawWords[0].text;
      const speakerMatch = SPEAKER_RE.exec(firstText);
      if (speakerMatch) {
        const candidate = speakerMatch[1].trim();
        // Pas de locuteur si c'est juste une marque de pause
        if (candidate && !/^\(\.+\)$/.test(candidate)) {
          speaker = candidate;
          rawWords[0] = { ...rawWords[0], text: firstText.slice(speakerMatch[0].length) };
        }
      }

      const words = rawWords.filter((w) => w.text.trim().length > 0);
      if (words.length === 0) continue;

      const startMs = grouped.get(groupOrder[0])!.startMs;
      const endMs   = grouped.get(groupOrder[groupOrder.length - 1])!.endMs;

      cues.push({
        startTime: msToTimestamp(startMs),
        endTime:   msToTimestamp(endMs),
        speaker,
        text: words.map((w) => w.text).join(''),
        words,
        rawLines: [],
      });
    }

    return { cues, trailingNewline: false };
  }
}
