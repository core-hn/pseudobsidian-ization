import { VttParser } from '../../src/parsers/VttParser';

const parser = new VttParser();

// ---- Helpers ----------------------------------------------------------------

function roundTrip(input: string): string {
  return parser.reconstruct(parser.parse(input));
}

// ---- Fixtures ---------------------------------------------------------------

const VTT_SIMPLE = `WEBVTT

1
00:00:01.240 --> 00:00:05.800
Bonjour, je m'appelle Marie Dupont.

2
00:00:06.100 --> 00:00:09.300
Et tu habites à Lyon ?
`;

const VTT_SPEAKER = `WEBVTT

1
00:00:01.240 --> 00:00:05.800
<v SPEAKER_1>Bonjour, je m'appelle Marie Dupont.

2
00:00:06.100 --> 00:00:09.300
<v SPEAKER_2>Et tu habites à Lyon ?
`;

const VTT_WORD_TIMESTAMPS = `WEBVTT

1
00:00:01.240 --> 00:00:05.800
<v SPEAKER_1><00:00:01.240><c> Bonjour,</c><00:00:02.100><c> je</c><00:00:02.300><c> m'appelle</c><00:00:03.400><c> Marie</c><00:00:04.200><c> Dupont.</c>

2
00:00:06.100 --> 00:00:09.300
<v SPEAKER_2><00:00:06.100><c> Et</c><00:00:06.500><c> tu</c><00:00:06.800><c> habites</c><00:00:07.200><c> à</c><00:00:07.800><c> Lyon</c><00:00:08.200><c> ?</c>
`;

// ---- Tests ------------------------------------------------------------------

describe('VttParser — parse', () => {
  test('VTT simple : 2 cues sans speaker', () => {
    const doc = parser.parse(VTT_SIMPLE);
    expect(doc.cues).toHaveLength(2);
    expect(doc.cues[0].startTime).toBe('00:00:01.240');
    expect(doc.cues[0].endTime).toBe('00:00:05.800');
    expect(doc.cues[0].text).toContain('Marie Dupont');
    expect(doc.cues[0].speaker).toBeUndefined();
  });

  test('VTT avec speakers : extraction correcte', () => {
    const doc = parser.parse(VTT_SPEAKER);
    expect(doc.cues[0].speaker).toBe('SPEAKER_1');
    expect(doc.cues[1].speaker).toBe('SPEAKER_2');
    expect(doc.cues[0].text).toContain('Marie Dupont');
    expect(doc.cues[0].text).not.toContain('<v');
  });

  test('VTT avec word timestamps : extraction des mots', () => {
    const doc = parser.parse(VTT_WORD_TIMESTAMPS);
    const cue = doc.cues[0];
    expect(cue.speaker).toBe('SPEAKER_1');
    expect(cue.words.length).toBeGreaterThan(1);
    expect(cue.words.some(w => w.time === '00:00:03.400')).toBe(true);
    // Le mot "Marie" doit être associé au timestamp 00:00:03.400
    const marie = cue.words.find(w => w.time === '00:00:03.400');
    expect(marie?.text).toContain('Marie');
  });

  test('Header WEBVTT reconnu', () => {
    const doc = parser.parse(VTT_SIMPLE);
    expect(doc.cues.length).toBeGreaterThan(0);
  });

  test('Timestamps normalisés en HH:MM:SS.mmm', () => {
    const vtt = `WEBVTT\n\n01:23.456 --> 01:27.800\nTest\n`;
    const doc = parser.parse(vtt);
    expect(doc.cues[0].startTime).toBe('00:01:23.456');
    expect(doc.cues[0].endTime).toBe('00:01:27.800');
  });
});

describe('VttParser — round-trip', () => {
  test('VTT simple : round-trip exact', () => {
    const doc = parser.parse(VTT_SIMPLE);
    const out = parser.reconstruct(doc);
    expect(out).toContain('WEBVTT');
    expect(out).toContain('00:00:01.240 --> 00:00:05.800');
    expect(out).toContain('Marie Dupont');
  });

  test('VTT avec speakers : speaker préservé', () => {
    const doc = parser.parse(VTT_SPEAKER);
    const out = parser.reconstruct(doc);
    expect(out).toContain('<v SPEAKER_1>');
    expect(out).toContain('<v SPEAKER_2>');
  });

  test('VTT word timestamps : reconstruction avec timestamps', () => {
    const doc = parser.parse(VTT_WORD_TIMESTAMPS);
    const out = parser.reconstruct(doc);
    expect(out).toContain('<v SPEAKER_1>');
    expect(out).toContain('00:00:03.400');
    expect(out).toContain('Marie');
  });
});

describe('VttParser — pseudonymisation', () => {
  test('Remplacement dans le texte reflété dans la reconstruction', () => {
    const doc = parser.parse(VTT_SPEAKER);
    doc.cues[0].text = doc.cues[0].text.replace('Marie Dupont', 'Sophie Martin');
    VttParser.applyTextToWords(doc.cues[0], doc.cues[0].text);
    const out = parser.reconstruct(doc);
    expect(out).toContain('Sophie Martin');
    expect(out).not.toContain('Marie Dupont');
  });
});
