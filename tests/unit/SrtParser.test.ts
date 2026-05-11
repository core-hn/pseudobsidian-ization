import * as fs from 'fs';
import * as path from 'path';
import { SrtParser } from '../../src/parsers/SrtParser';

const FIXTURE = path.join(__dirname, '../fixtures/entretien_01.srt');

describe('SrtParser', () => {
  const parser = new SrtParser();
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(FIXTURE, 'utf-8');
  });

  // --- Structure ---

  it('parse le bon nombre de blocs', () => {
    const doc = parser.parse(content);
    expect(doc.blocks).toHaveLength(6);
  });

  it('extrait index, timestamps et texte du bloc 1', () => {
    const { blocks } = parser.parse(content);
    expect(blocks[0].index).toBe(1);
    expect(blocks[0].startTime).toBe('00:00:01,000');
    expect(blocks[0].endTime).toBe('00:00:04,500');
    expect(blocks[0].lines).toEqual(['Bonjour Jean, tu peux te présenter ?']);
  });

  it('extrait correctement le bloc 2 (Jean Dupont / Saint-Jean-de-Luz)', () => {
    const { blocks } = parser.parse(content);
    expect(blocks[1].index).toBe(2);
    expect(blocks[1].startTime).toBe('00:00:05,000');
    expect(blocks[1].endTime).toBe('00:00:09,200');
    expect(blocks[1].lines[0]).toContain('Jean Dupont');
    expect(blocks[1].lines[0]).toContain('Saint-Jean-de-Luz');
  });

  it('les blocs sont numérotés séquentiellement', () => {
    const { blocks } = parser.parse(content);
    blocks.forEach((b, i) => expect(b.index).toBe(i + 1));
  });

  // --- Round-trip (SPECS §17.4) ---

  it('round-trip exact : reconstruct(parse(content)) === content', () => {
    const doc = parser.parse(content);
    expect(parser.reconstruct(doc)).toBe(content);
  });

  it('les timestamps sont inchangés après reconstruction', () => {
    const doc = parser.parse(content);
    const lines = parser.reconstruct(doc).split('\n');
    expect(lines[1]).toBe('00:00:01,000 --> 00:00:04,500');
    expect(lines[5]).toBe('00:00:05,000 --> 00:00:09,200');
  });

  it('les numéros de blocs sont inchangés après reconstruction', () => {
    const doc = parser.parse(content);
    const lines = parser.reconstruct(doc).split('\n');
    expect(lines[0]).toBe('1');
    expect(lines[4]).toBe('2');
  });

  // --- Remplacement de texte sans toucher la structure ---

  it("modifier le texte d'un bloc ne touche pas son timestamp", () => {
    const doc = parser.parse(content);
    doc.blocks[0].lines[0] = 'Bonjour Pierre, tu peux te présenter ?';
    const lines = parser.reconstruct(doc).split('\n');
    expect(lines[1]).toBe('00:00:01,000 --> 00:00:04,500');
    expect(lines[2]).toBe('Bonjour Pierre, tu peux te présenter ?');
  });

  it('remplacer Jean par Pierre dans le bloc 2 préserve Saint-Jean-de-Luz', () => {
    const doc = parser.parse(content);
    // Remplacement correct (entité longue d'abord) : Saint-Jean-de-Luz → Ville littorale,
    // puis Jean → Pierre sur les occurrences restantes
    doc.blocks[1].lines[0] = doc.blocks[1].lines[0]
      .replace('Saint-Jean-de-Luz', 'Ville littorale')
      .replace('Jean Dupont', 'Pierre Martin');
    const result = parser.reconstruct(doc);
    expect(result).not.toContain('Saint-Pierre-de-Luz');
    expect(result).toContain('Ville littorale');
    expect(result).toContain('Pierre Martin');
  });

  // --- Robustesse ---

  it('parse un SRT avec fins de ligne Windows (CRLF)', () => {
    const crlf = content.replace(/\n/g, '\r\n');
    const doc = parser.parse(crlf);
    expect(doc.blocks).toHaveLength(6);
    expect(doc.blocks[0].startTime).toBe('00:00:01,000');
    expect(doc.blocks[0].endTime).toBe('00:00:04,500');
  });

  it('parse un SRT avec plusieurs lignes vides entre blocs', () => {
    const extraBlank = content.replace(/\n\n/g, '\n\n\n');
    const doc = parser.parse(extraBlank);
    expect(doc.blocks).toHaveLength(6);
  });

  it('parse un SRT sans saut de ligne final', () => {
    const noTrailing = content.trimEnd();
    const doc = parser.parse(noTrailing);
    expect(doc.trailingNewline).toBe(false);
    expect(doc.blocks).toHaveLength(6);
    expect(parser.reconstruct(doc)).toBe(noTrailing);
  });
});
