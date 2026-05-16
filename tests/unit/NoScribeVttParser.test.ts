import * as fs from 'fs';
import * as path from 'path';
import { NoScribeVttParser } from '../../src/parsers/NoScribeVttParser';
import { NoScribeHtmlParser } from '../../src/parsers/NoScribeHtmlParser';
import { noScribeHtmlToMarkdown } from '../../src/parsers/TranscriptConverter';

const VTT_FIXTURE  = path.join(__dirname, '../fixtures/fight_club.vtt');
const HTML_FIXTURE = path.join(__dirname, '../fixtures/juste-leblanc.html');

// ---- Détection --------------------------------------------------------------

describe('NoScribeVttParser — détection', () => {
  test('reconnaît un VTT noScribe', () => {
    const content = fs.readFileSync(VTT_FIXTURE, 'utf-8');
    expect(NoScribeVttParser.isNoScribeVtt(content)).toBe(true);
  });

  test('rejette un VTT standard', () => {
    expect(NoScribeVttParser.isNoScribeVtt('WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nBonjour\n')).toBe(false);
  });

  test('extrait le chemin audio depuis NOTE media', () => {
    const content = fs.readFileSync(VTT_FIXTURE, 'utf-8');
    const src = NoScribeVttParser.extractAudioSource(content);
    expect(src).toMatch(/fight_club\.mp3$/);
  });
});

// ---- Parsing VTT fight_club -------------------------------------------------

describe('NoScribeVttParser — fight_club.vtt', () => {
  let doc: ReturnType<NoScribeVttParser['parse']>;

  beforeAll(() => {
    const content = fs.readFileSync(VTT_FIXTURE, 'utf-8');
    doc = new NoScribeVttParser().parse(content);
  });

  test('produit au moins 5 cues', () => {
    expect(doc.cues.length).toBeGreaterThanOrEqual(5);
  });

  test('détecte les locuteurs S00, S01, S02', () => {
    const speakers = new Set(doc.cues.map((c) => c.speaker).filter(Boolean));
    expect(speakers.has('S00')).toBe(true);
    expect(speakers.has('S01')).toBe(true);
    expect(speakers.has('S02')).toBe(true);
  });

  test('premier cue : S00, timestamp correct, texte non vide', () => {
    const first = doc.cues[0];
    expect(first.speaker).toBe('S00');
    expect(first.startTime).toBe('00:00:00.530');
    expect(first.text).toContain('combat');
  });

  test('les timestamps d\'affichage [HH:MM:SS] sont absents du texte', () => {
    for (const cue of doc.cues) {
      expect(cue.text).not.toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
    }
  });

  test('les entités HTML sont décodées', () => {
    const allText = doc.cues.map((c) => c.text).join(' ');
    expect(allText).not.toContain('&#x27;');
    expect(allText).toContain("'"); // apostrophes décodées
  });

  test('les labels SXX: sont absents du texte', () => {
    for (const cue of doc.cues) {
      expect(cue.text).not.toMatch(/^S\d+\s*:/);
    }
  });

  test('chaque cue a un mot pour le timestamps word-level', () => {
    for (const cue of doc.cues) {
      expect(cue.words.length).toBeGreaterThan(0);
      expect(cue.words[0].time).toBe(cue.startTime);
    }
  });
});

// ---- Parsing HTML juste-leblanc --------------------------------------------

describe('NoScribeHtmlParser — juste-leblanc.html', () => {
  let doc: ReturnType<NoScribeHtmlParser['parse']>;

  beforeAll(() => {
    const content = fs.readFileSync(HTML_FIXTURE, 'utf-8');
    doc = new NoScribeHtmlParser().parse(content);
  });

  test('produit au moins 8 cues', () => {
    expect(doc.cues.length).toBeGreaterThanOrEqual(8);
  });

  test('détecte S00 et S01', () => {
    const speakers = new Set(doc.cues.map((c) => c.speaker).filter(Boolean));
    expect(speakers.has('S00')).toBe(true);
    expect(speakers.has('S01')).toBe(true);
  });

  test('premier cue : S00, contient "Juste Leblanc"', () => {
    const first = doc.cues.find((c) => c.speaker === 'S00');
    expect(first?.text).toContain('Juste Leblanc');
  });

  test('les labels SXX: sont absents du texte', () => {
    for (const cue of doc.cues) {
      expect(cue.text).not.toMatch(/^S\d+\s*:/);
    }
  });

  test('les timestamps [HH:MM:SS] sont absents du texte', () => {
    for (const cue of doc.cues) {
      expect(cue.text).not.toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
    }
  });

  test('audio source extrait correctement', () => {
    const content = fs.readFileSync(HTML_FIXTURE, 'utf-8');
    expect(NoScribeHtmlParser.extractAudioSource(content)).toMatch(/juste-leblanc\.mp3$/);
  });
});

// ---- Markdown produit -------------------------------------------------------

describe('noScribeHtmlToMarkdown — juste-leblanc', () => {
  test('format clean : pas de commentaires HTML', () => {
    const content = fs.readFileSync(HTML_FIXTURE, 'utf-8');
    const doc = new NoScribeHtmlParser().parse(content);
    const md = noScribeHtmlToMarkdown(doc, 'juste-leblanc.html');
    expect(md).toContain('pseudobs-format: html');
    expect(md).not.toContain('<!--');
    expect(md).toContain('**S00**');
    expect(md).toContain('**S01**');
  });
});
