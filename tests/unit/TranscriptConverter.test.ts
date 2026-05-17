import * as fs from 'fs';
import * as path from 'path';
import { SrtParser } from '../../src/parsers/SrtParser';
import { ChatParser } from '../../src/parsers/ChatParser';
import { VttParser } from '../../src/parsers/VttParser';
import { NoScribeHtmlParser } from '../../src/parsers/NoScribeHtmlParser';
import { srtToMarkdown, chatToMarkdown, vttToMarkdown, noScribeHtmlToMarkdown, extractWordData, markdownToVtt } from '../../src/parsers/TranscriptConverter';

const SRT_FIXTURE = path.join(__dirname, '../fixtures/entretien_01.srt');
const CHA_FIXTURE = path.join(__dirname, '../fixtures/entretien_02.cha');

describe('srtToMarkdown', () => {
  let md: string;

  beforeAll(() => {
    const content = fs.readFileSync(SRT_FIXTURE, 'utf-8');
    const doc = new SrtParser().parse(content);
    md = srtToMarkdown(doc, 'entretien_01.srt');
  });

  it('produit un frontmatter avec le format et la source', () => {
    expect(md).toContain('pseudobs-format: srt');
    expect(md).toContain('pseudobs-source: "entretien_01.srt"');
  });

  it('contient le texte de chaque bloc SRT', () => {
    expect(md).toContain('Bonjour Jean, tu peux te présenter ?');
    expect(md).toContain("Saint-Jean-de-Luz");
    expect(md).toContain('CHU de Montpellier');
  });

  it('affiche les timestamps en italique', () => {
    expect(md).toContain('*00:00:01,000 → 00:00:04,500*');
    expect(md).toContain('*00:00:05,000 → 00:00:09,200*');
  });

  it('affiche les numéros de blocs en gras entre crochets', () => {
    expect(md).toContain('**[1]**');
    expect(md).toContain('**[6]**');
  });

  it('ne contient pas de syntaxe SRT brute (-->) en dehors du frontmatter', () => {
    const body = md.split('---').slice(2).join('---');
    expect(body).not.toContain('-->');
  });

  it('termine par un saut de ligne', () => {
    expect(md.endsWith('\n')).toBe(true);
  });
});

describe('chatToMarkdown', () => {
  let md: string;

  beforeAll(() => {
    const content = fs.readFileSync(CHA_FIXTURE, 'utf-8');
    const doc = new ChatParser().parse(content);
    md = chatToMarkdown(doc, 'entretien_02.cha');
  });

  it('produit un frontmatter avec le format et la source', () => {
    expect(md).toContain('pseudobs-format: chat');
    expect(md).toContain('pseudobs-source: "entretien_02.cha"');
  });

  it('convertit les tours de parole en **SPEAKER** : texte', () => {
    expect(md).toContain('**INV** : bonjour Marie, tu peux te présenter ?');
    expect(md).toContain('**PAR** : je m\'appelle Marie Dupont');
  });

  it('convertit les lignes @ en blockquote', () => {
    expect(md).toContain('> @Begin');
    expect(md).toContain('> @Languages: fra');
    expect(md).toContain('> @End');
  });

  it('convertit les lignes % en blockquote', () => {
    expect(md).toContain('> %com: PAR marque une hésitation');
  });

  it('contient le cas Nancy ville/prenom dans un tour PAR', () => {
    expect(md).toContain('**PAR** : oui (0.5) à Nancy');
    expect(md).toContain('la ville');
    expect(md).toContain('le prénom');
  });

  it('ne contient pas de syntaxe CHA brute (*SPEAKER:) en dehors du frontmatter', () => {
    const body = md.split('---').slice(2).join('---');
    expect(body).not.toMatch(/^\*[A-Z]+:/m);
  });

  it('termine par un saut de ligne', () => {
    expect(md.endsWith('\n')).toBe(true);
  });
});

// ---- vttToMarkdown / noScribeHtmlToMarkdown --------------------------------

const VTT_FIXTURE = `WEBVTT

1
00:00:01.240 --> 00:00:05.800
<v Expérimentateur>Bonjour, je m'appelle Marie.

2
00:00:06.100 --> 00:00:09.300
<v SC01>Si je me présente ?

3
00:00:09.800 --> 00:00:11.200
(..)
`;

const NOSCRIBE_HTML_FIXTURE = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0//EN">
<html><head><meta name="qrichtext" content="1" /><meta charset="UTF-8" /></head><body>
<div class="WordSection1">
<p><a name="ts_0_2130_" ><span>(..) </span></a></p>
<p><a name="ts_2130_5800_S00" ><span>Expérimentateur </span></a><a name="ts_2130_5800_S00" ><span style="color: #78909c">[00:00:02]</span></a><a name="ts_2130_5800_S00" ><span>: Bonjour, je m'appelle Marie.</span></a></p>
<p><a name="ts_6100_9300_S01" ><span>SC01 : Si je me présente ?</span></a></p>
</div></body></html>`;

describe('vttToMarkdown — format noScribe', () => {
  let md: string;
  beforeAll(() => { md = vttToMarkdown(new VttParser().parse(VTT_FIXTURE), 'entretien.vtt'); });

  it('frontmatter pseudobs-format: vtt', () => {
    expect(md).toContain('pseudobs-format: vtt');
  });

  it('locuteur en gras suivi du timestamp [HH:MM:SS]', () => {
    expect(md).toContain('**Expérimentateur** [00:00:01]');
    expect(md).toContain('**SC01** [00:00:06]');
  });

  it('texte précédé de " : " quand il y a un locuteur', () => {
    expect(md).toContain('**Expérimentateur** [00:00:01] : Bonjour');
  });

  it('cue sans locuteur : timestamp seul', () => {
    expect(md).toContain('[00:00:09] (..)');
    expect(md).not.toMatch(/\*\*\*\* \[/);
  });

  it('aucun commentaire HTML dans le corps', () => {
    const body = md.split('---').slice(2).join('---');
    expect(body).not.toContain('<!--');
  });

  it('termine par un saut de ligne', () => {
    expect(md.endsWith('\n')).toBe(true);
  });
});

describe('noScribeHtmlToMarkdown — format html', () => {
  let md: string;
  beforeAll(() => {
    const doc = new NoScribeHtmlParser().parse(NOSCRIBE_HTML_FIXTURE);
    md = noScribeHtmlToMarkdown(doc, 'entretien.html');
  });

  it('frontmatter pseudobs-format: html', () => {
    expect(md).toContain('pseudobs-format: html');
    expect(md).not.toContain('pseudobs-format: vtt');
  });

  it('locuteur en gras avec timestamp [HH:MM:SS]', () => {
    expect(md).toContain('**Expérimentateur** [00:00:02]');
    expect(md).toContain('**SC01** [00:00:06]');
  });

  it('texte présent après " : "', () => {
    expect(md).toContain(': Bonjour, je m\'appelle Marie.');
    expect(md).toContain(': Si je me présente ?');
  });

  it('aucun commentaire HTML dans le corps', () => {
    const body = md.split('---').slice(2).join('---');
    expect(body).not.toContain('<!--');
  });
});

describe('extractWordData', () => {
  const VTT_WITH_WORDS = `WEBVTT

1
00:00:01.240 --> 00:00:05.800
<v Expérimentateur><00:00:01.240><c> Bonjour,</c><00:00:02.100><c> Marie.</c>

2
00:00:06.100 --> 00:00:09.300
<v SC01>Si je me présente ?
`;

  it('extrait les cues avec word timestamps', () => {
    const doc = new VttParser().parse(VTT_WITH_WORDS);
    const data = extractWordData(doc);
    expect(data).toHaveLength(1); // cue 2 sans word timestamps exclue
    expect(data[0].index).toBe(0);
    expect(data[0].speaker).toBe('Expérimentateur');
    expect(data[0].startTime).toBe('00:00:01.240');
    expect(data[0].endTime).toBe('00:00:05.800');
    expect(data[0].words.some((w) => w.time !== '')).toBe(true);
  });

  it('exclut les cues sans word timestamps', () => {
    const doc = new VttParser().parse(VTT_WITH_WORDS);
    const data = extractWordData(doc);
    expect(data.every((c) => c.words.some((w) => w.time !== ''))).toBe(true);
  });

  it('produit un JSON sérialisable', () => {
    const doc = new VttParser().parse(VTT_WITH_WORDS);
    const data = extractWordData(doc);
    expect(() => JSON.stringify(data)).not.toThrow();
  });
});

// ---- markdownToVtt ----------------------------------------------------------

describe('markdownToVtt — re-export VTT', () => {
  const WORDS_DATA = [
    { index: 0, startTime: '00:01:28.080', endTime: '00:01:33.536', speaker: 'S00',
      words: [{ text: 'original', time: '00:01:28.080' }] },
    { index: 1, startTime: '00:01:32.672', endTime: '00:01:34.816', speaker: 'S01',
      words: [{ text: 'original', time: '00:01:32.672' }] },
    { index: 2, startTime: '00:01:34.816', endTime: '00:01:45.920', speaker: 'S00',
      words: [{ text: 'original', time: '00:01:34.816' }] },
  ];

  const MD_PSEUDONYMIZED = `---
pseudobs-format: html
pseudobs-source: "juste-leblanc.html"
---

**S00** [00:01:28] : Je vais le faire moi-même. Il s'appelle Pierre Martin.

**S01** [00:01:32] : Ah bon, il n'a pas de prénom ?

**S00** [00:01:34] : Je viens de vous le dire, Pierre Martin.
`;

  it('produit un WebVTT valide', () => {
    const { vtt } = markdownToVtt(MD_PSEUDONYMIZED, WORDS_DATA);
    expect(vtt).toMatch(/^WEBVTT/);
    expect(vtt).toContain('00:01:28.080 --> 00:01:33.536');
    expect(vtt).toContain('00:01:32.672 --> 00:01:34.816');
  });

  it('intègre le texte pseudonymisé', () => {
    const { vtt } = markdownToVtt(MD_PSEUDONYMIZED, WORDS_DATA);
    expect(vtt).toContain('Pierre Martin');
    expect(vtt).not.toContain('Juste Leblanc');
  });

  it('préserve les locuteurs', () => {
    const { vtt } = markdownToVtt(MD_PSEUDONYMIZED, WORDS_DATA);
    expect(vtt).toContain('<v S00>');
    expect(vtt).toContain('<v S01>');
  });

  it('utilise les timestamps du words.json, pas du Markdown', () => {
    const { vtt } = markdownToVtt(MD_PSEUDONYMIZED, WORDS_DATA);
    // Les ms précises viennent du words.json
    expect(vtt).toContain('00:01:28.080');
    expect(vtt).toContain('00:01:33.536');
  });

  it('signale une incohérence si le nombre de cues diffère', () => {
    const { mismatch } = markdownToVtt(MD_PSEUDONYMIZED, WORDS_DATA.slice(0, 2));
    expect(mismatch).toBe(true);
  });

  it('pas de mismatch si les comptes sont égaux', () => {
    const { mismatch } = markdownToVtt(MD_PSEUDONYMIZED, WORDS_DATA);
    expect(mismatch).toBe(false);
  });
});
