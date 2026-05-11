import * as fs from 'fs';
import * as path from 'path';
import { SrtParser } from '../../src/parsers/SrtParser';
import { ChatParser } from '../../src/parsers/ChatParser';
import { srtToMarkdown, chatToMarkdown } from '../../src/parsers/TranscriptConverter';

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
