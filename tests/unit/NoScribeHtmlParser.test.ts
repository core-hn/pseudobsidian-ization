import { NoScribeHtmlParser } from '../../src/parsers/NoScribeHtmlParser';

const parser = new NoScribeHtmlParser();

// ---- Fixture ----------------------------------------------------------------
// Structure calquée sur une vraie sortie noScribe (Qt Rich Text HTML).
// Les timestamps sont en millisecondes depuis le début de l'audio.

const NOSCRIBE_HTML = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0//EN">
<html><head><meta name="qrichtext" content="1" />
<meta charset="UTF-8" />
<meta name="audio_source" content="/Corpus/entretien_01.m4a" />
</head><body>
<div class="WordSection1">

<p><span style="font-weight: 600">entretien_01</span></p>

<p><span style="font-size: 0.8em; color: #909090">Transcrit avec noScribe vers. 0.5<br />
(Détection des locuteurs : 2)</span></p>

<p><a name="ts_0_2130_" ><span style="color: #000000">(..) </span></a></p>

<p><a name="ts_2130_7730_S00" ><span style="color: #000000">Expérimentateur </span></a><a name="ts_2130_7730_S00" ><span style="color: #78909c">[00:00:02]</span></a><a name="ts_2130_7730_S00" ><span style="color: #000000">: Ok. D'abord, merci d'avoir accepté.</span></a><a name="ts_8330_9730_S00" ><span style="color: #000000"> On s'était déjà parlé.</span></a><a name="ts_9730_12230_S00" ><span style="color: #000000"> (..)</span></a></p>

<p><a name="ts_17900_18660_S01" ><span style="color: #000000">SC01 : Si je me présente ?</span></a></p>

<p><a name="ts_1668980_1673180_S00" ><span style="color: #000000">Expérimentateur : si jamais demain j'arrive à être en contact avec quelqu'un.</span></a></p>

</div>
</body></html>`;

// ---- Tests ------------------------------------------------------------------

describe('NoScribeHtmlParser — isNoScribeHtml', () => {
  test('reconnaît un HTML noScribe', () => {
    expect(NoScribeHtmlParser.isNoScribeHtml(NOSCRIBE_HTML)).toBe(true);
  });

  test('rejette un HTML ordinaire', () => {
    expect(NoScribeHtmlParser.isNoScribeHtml('<html><body><p>Bonjour</p></body></html>')).toBe(false);
  });
});

describe('NoScribeHtmlParser — parse', () => {
  test('ignore les paragraphes sans ancre ts_', () => {
    const doc = parser.parse(NOSCRIBE_HTML);
    // Les 2 paragraphes d'en-tête (titre + métadonnées) ne doivent pas produire de cue
    // Les cues sont : pause, tour S00, tour S01, tour S00 long = 4 cues
    expect(doc.cues.length).toBe(4);
  });

  test('extrait la pause sans locuteur', () => {
    const doc = parser.parse(NOSCRIBE_HTML);
    const pause = doc.cues[0];
    expect(pause.speaker).toBeUndefined();
    expect(pause.text).toContain('..');
    expect(pause.startTime).toBe('00:00:00.000');
    expect(pause.endTime).toBe('00:00:02.130');
  });

  test('extrait le locuteur depuis "Nom : texte" multi-ancres', () => {
    const doc = parser.parse(NOSCRIBE_HTML);
    const turn = doc.cues[1];
    expect(turn.speaker).toBe('Expérimentateur');
    expect(turn.text).not.toContain('Expérimentateur');
    expect(turn.text).toContain('Ok. D\'abord');
  });

  test('extrait le locuteur depuis "Nom : texte" mono-ancre', () => {
    const doc = parser.parse(NOSCRIBE_HTML);
    const turn = doc.cues[2];
    expect(turn.speaker).toBe('SC01');
    expect(turn.text).toContain('Si je me présente');
    expect(turn.text).not.toContain('SC01');
  });

  test('convertit les timestamps en HH:MM:SS.mmm', () => {
    const doc = parser.parse(NOSCRIBE_HTML);
    const turn = doc.cues[1];
    expect(turn.startTime).toBe('00:00:02.130');
    expect(turn.endTime).toBe('00:00:12.230');
  });

  test('timestamp long (> 27 min) correctement converti', () => {
    const doc = parser.parse(NOSCRIBE_HTML);
    const turn = doc.cues[3];
    // 1668980ms = 27min 48.980s
    expect(turn.startTime).toBe('00:27:48.980');
    expect(turn.endTime).toBe('00:27:53.180');
  });

  test('word timestamps produits pour chaque ancre distincte', () => {
    const doc = parser.parse(NOSCRIBE_HTML);
    const turn = doc.cues[1]; // Expérimentateur avec 3 ancres ts_ distinctes
    expect(turn.words.length).toBeGreaterThanOrEqual(2);
    expect(turn.words[0].time).toBe('00:00:02.130');
  });

  test('ignore les timestamps d\'affichage [HH:MM:SS]', () => {
    const doc = parser.parse(NOSCRIBE_HTML);
    const turn = doc.cues[1];
    expect(turn.text).not.toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
  });
});
