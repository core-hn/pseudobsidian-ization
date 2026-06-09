import { markdownToEaf } from '../../src/parsers/TranscriptConverter';
import type { VttCueData } from '../../src/parsers/TranscriptConverter';

const WORDS_DATA: VttCueData[] = [
  {
    index: 0, startTime: '00:00:01.240', endTime: '00:00:05.800',
    speaker: 'Expérimentateur',
    words: [{ text: 'Bonjour,', time: '00:00:01.240' }, { text: ' Marie.', time: '00:00:02.100' }],
    wordTimestampRate: 1,
  },
  {
    index: 1, startTime: '00:00:06.100', endTime: '00:00:09.300',
    speaker: 'SC01',
    words: [{ text: 'Si je me présente ?', time: '' }],
    wordTimestampRate: 0,
  },
];

const MD = `---
pseudobs-format: vtt
pseudobs-source: "entretien.vtt"
---

**Expérimentateur** [00:00:01] : Bonjour, Marie.

**SC01** [00:00:06] : Si je me présente ?
`;

describe('markdownToEaf', () => {
  it('produit une déclaration XML valide', () => {
    const { eaf } = markdownToEaf(MD, WORDS_DATA);
    expect(eaf).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  });

  it('contient ANNOTATION_DOCUMENT FORMAT="3.0"', () => {
    const { eaf } = markdownToEaf(MD, WORDS_DATA);
    expect(eaf).toContain('FORMAT="3.0"');
    expect(eaf).toContain('<ANNOTATION_DOCUMENT');
  });

  it('génère un TIME_SLOT par timestamp unique', () => {
    const { eaf } = markdownToEaf(MD, WORDS_DATA);
    // 4 timestamps distincts : 1240, 5800, 6100, 9300
    const slots = [...eaf.matchAll(/<TIME_SLOT /g)];
    expect(slots).toHaveLength(4);
  });

  it('les TIME_SLOTs sont triés en ordre croissant', () => {
    const { eaf } = markdownToEaf(MD, WORDS_DATA);
    const values = [...eaf.matchAll(/TIME_VALUE="(\d+)"/g)].map((m) => parseInt(m[1], 10));
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it('crée un tier par locuteur', () => {
    const { eaf } = markdownToEaf(MD, WORDS_DATA);
    expect(eaf).toContain('TIER_ID="Expérimentateur"');
    expect(eaf).toContain('TIER_ID="SC01"');
  });

  it('intègre le texte pseudonymisé dans ANNOTATION_VALUE', () => {
    const { eaf } = markdownToEaf(MD, WORDS_DATA);
    expect(eaf).toContain('<ANNOTATION_VALUE>Bonjour, Marie.</ANNOTATION_VALUE>');
    expect(eaf).toContain('<ANNOTATION_VALUE>Si je me présente ?</ANNOTATION_VALUE>');
  });

  it('les TIME_VALUE correspondent aux timestamps du words.json (en ms)', () => {
    const { eaf } = markdownToEaf(MD, WORDS_DATA);
    expect(eaf).toContain('TIME_VALUE="1240"');
    expect(eaf).toContain('TIME_VALUE="5800"');
    expect(eaf).toContain('TIME_VALUE="6100"');
    expect(eaf).toContain('TIME_VALUE="9300"');
  });

  it('déduplique les TIME_SLOTs partagés entre cues', () => {
    const sharedData: VttCueData[] = [
      { index: 0, startTime: '00:00:01.000', endTime: '00:00:03.000',
        speaker: 'S1', words: [], wordTimestampRate: 0 },
      { index: 1, startTime: '00:00:03.000', endTime: '00:00:05.000',
        speaker: 'S1', words: [], wordTimestampRate: 0 },
    ];
    const md = `---\npseudobs-format: vtt\npseudobs-source: "x.vtt"\n---\n\n**S1** [00:00:01] : Aa.\n\n**S1** [00:00:03] : Bb.\n`;
    const { eaf } = markdownToEaf(md, sharedData);
    // 3 slots : 1000, 3000 (partagé), 5000
    const slots = [...eaf.matchAll(/<TIME_SLOT /g)];
    expect(slots).toHaveLength(3);
  });

  it('inclut MEDIA_DESCRIPTOR si audioSource fourni', () => {
    const { eaf } = markdownToEaf(MD, WORDS_DATA, '/audio/entretien.wav');
    expect(eaf).toContain('<MEDIA_DESCRIPTOR');
    expect(eaf).toContain('/audio/entretien.wav');
  });

  it("n'inclut pas MEDIA_DESCRIPTOR si audioSource absent", () => {
    const { eaf } = markdownToEaf(MD, WORDS_DATA);
    expect(eaf).not.toContain('<MEDIA_DESCRIPTOR');
  });

  it('échappe les caractères spéciaux XML dans le texte', () => {
    const dataXml: VttCueData[] = [
      { index: 0, startTime: '00:00:01.000', endTime: '00:00:02.000',
        speaker: 'S1', words: [], wordTimestampRate: 0 },
    ];
    const md = `---\npseudobs-format: vtt\npseudobs-source: "x.vtt"\n---\n\n**S1** [00:00:01] : a & b < c > d.\n`;
    const { eaf } = markdownToEaf(md, dataXml);
    expect(eaf).toContain('a &amp; b &lt; c &gt; d.');
  });

  it('signale un mismatch si le nombre de cues diffère', () => {
    const { mismatch } = markdownToEaf(MD, WORDS_DATA.slice(0, 1));
    expect(mismatch).toBe(true);
  });

  it('pas de mismatch si les comptes sont égaux', () => {
    const { mismatch } = markdownToEaf(MD, WORDS_DATA);
    expect(mismatch).toBe(false);
  });

  it('utilise _transcript comme tier si aucun locuteur', () => {
    const dataNoSpk: VttCueData[] = [
      { index: 0, startTime: '00:00:01.000', endTime: '00:00:03.000',
        speaker: undefined, words: [], wordTimestampRate: 0 },
    ];
    const md = `---\npseudobs-format: vtt\npseudobs-source: "x.vtt"\n---\n\n[00:00:01] Texte sans locuteur.\n`;
    const { eaf } = markdownToEaf(md, dataNoSpk);
    expect(eaf).toContain('TIER_ID="_transcript"');
  });

  it('contient LINGUISTIC_TYPE et les quatre CONSTRAINT requis par ELAN', () => {
    const { eaf } = markdownToEaf(MD, WORDS_DATA);
    expect(eaf).toContain('<LINGUISTIC_TYPE');
    expect(eaf).toContain('STEREOTYPE="Time_Subdivision"');
    expect(eaf).toContain('STEREOTYPE="Symbolic_Subdivision"');
    expect(eaf).toContain('STEREOTYPE="Symbolic_Association"');
    expect(eaf).toContain('STEREOTYPE="Included_In"');
  });
});
