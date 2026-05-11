import * as fs from 'fs';
import * as path from 'path';
import { ChatParser } from '../../src/parsers/ChatParser';
import type { ChatLine } from '../../src/parsers/ChatParser';

const FIXTURE = path.join(__dirname, '../fixtures/entretien_02.cha');

describe('ChatParser', () => {
  const parser = new ChatParser();
  let content: string;
  let lines: ChatLine[];

  beforeAll(() => {
    content = fs.readFileSync(FIXTURE, 'utf-8');
    lines = parser.parse(content).lines;
  });

  // --- Structure (SPECS §3.3) ---

  it('parse le bon nombre de lignes', () => {
    // 8 meta (@Begin…@Transcriber) + 8 turns + 2 dependent + 1 meta (@End) = 19
    expect(lines).toHaveLength(19);
  });

  it('identifie correctement les lignes @ comme meta', () => {
    const metas = lines.filter((l) => l.type === 'meta');
    expect(metas).toHaveLength(9); // @Begin, 7 @*, @End
    expect(metas[0].raw).toBe('@Begin');
    expect(metas[metas.length - 1].raw).toBe('@End');
  });

  it('identifie correctement les tours de parole (*)', () => {
    const turns = lines.filter((l) => l.type === 'turn');
    expect(turns).toHaveLength(8);
  });

  it('identifie correctement les lignes dépendantes (%)', () => {
    const deps = lines.filter((l) => l.type === 'dependent');
    expect(deps).toHaveLength(2);
    expect(deps[0].raw).toContain('%com:');
    expect(deps[1].raw).toContain('%com:');
  });

  // --- Extraction locuteur / contenu ---

  it('extrait le locuteur et le contenu du premier tour INV', () => {
    const firstTurn = lines.find((l) => l.type === 'turn');
    expect(firstTurn?.speaker).toBe('INV');
    expect(firstTurn?.content).toBe('bonjour Marie, tu peux te présenter ?');
  });

  it('extrait le locuteur et le contenu du premier tour PAR (Marie Dupont)', () => {
    const parTurns = lines.filter((l) => l.type === 'turn' && l.speaker === 'PAR');
    expect(parTurns[0].content).toContain('Marie Dupont');
  });

  it('le prefix reconstitue la ligne originale avec le contenu', () => {
    const turns = lines.filter((l) => l.type === 'turn');
    for (const turn of turns) {
      expect(turn.prefix! + turn.content!).toBe(turn.raw);
    }
  });

  // --- Round-trip exact (SPECS §17.5) ---

  it('round-trip exact : reconstruct(parse(content)) === content', () => {
    const doc = parser.parse(content);
    expect(parser.reconstruct(doc)).toBe(content);
  });

  it('les lignes @ sont inchangées après reconstruction', () => {
    const doc = parser.parse(content);
    const result = parser.reconstruct(doc);
    expect(result).toContain('@Begin');
    expect(result).toContain('@End');
    expect(result).toContain('@Languages: fra');
    expect(result).toContain('@Participants:');
  });

  it('les lignes % sont inchangées après reconstruction', () => {
    const doc = parser.parse(content);
    const result = parser.reconstruct(doc);
    expect(result).toContain('%com: PAR marque une hésitation avant de répondre');
    expect(result).toContain('%com: INV et PAR rient');
  });

  // --- Remplacement de contenu ---

  it('modifier le contenu ne touche pas le locuteur ni les lignes @', () => {
    const doc = parser.parse(content);
    const parTurn = doc.lines.find((l) => l.type === 'turn' && l.speaker === 'PAR');
    parTurn!.content = parTurn!.content!.replace('Marie Dupont', 'Sophie Arnaud');
    const result = parser.reconstruct(doc);
    expect(result).toContain('*PAR: je m\'appelle Sophie Arnaud');
    expect(result).toContain('@Begin');
    expect(result).toContain('@Participants:');
    expect(result).not.toContain('Marie Dupont');
  });

  it("le cas Nancy ville/prenom : PAR thematise l'ambiguite dans son tour", () => {
    // INV mentionne Nancy en premier ; PAR explicite l'ambiguïté ville/prénom
    const parNancyTurn = lines.find(
      (l) => l.type === 'turn' && l.speaker === 'PAR' && l.content?.includes('Nancy')
    );
    expect(parNancyTurn).toBeDefined();
    expect(parNancyTurn?.content).toContain('Nancy');
    expect(parNancyTurn?.content).toContain('la ville');
    expect(parNancyTurn?.content).toContain('le prénom');
  });

  // --- Robustesse ---

  it('parse un fichier CHAT avec fins de ligne Windows (CRLF)', () => {
    const crlf = content.replace(/\n/g, '\r\n');
    const doc = parser.parse(crlf);
    expect(doc.lines).toHaveLength(19);
    expect(doc.lines[0].type).toBe('meta');
    expect(doc.lines[0].raw).toBe('@Begin');
  });

  it('parse un fichier CHAT sans saut de ligne final', () => {
    const noTrailing = content.trimEnd();
    const doc = parser.parse(noTrailing);
    expect(doc.trailingNewline).toBe(false);
    expect(parser.reconstruct(doc)).toBe(noTrailing);
  });

  it('un locuteur avec tabulation comme séparateur est correctement parsé', () => {
    const withTab = '*INV:\tbonjour tout le monde';
    const line = (parser as unknown as { parseLine: (r: string) => ChatLine }).parseLine?.(withTab)
      ?? parser.parse(withTab + '\n@End\n').lines[0];
    // fallback : on teste via un mini-document
    const miniDoc = parser.parse('@Begin\n' + withTab + '\n@End\n');
    const turn = miniDoc.lines.find((l) => l.type === 'turn');
    expect(turn?.speaker).toBe('INV');
    expect(turn?.content).toBe('bonjour tout le monde');
    expect(turn?.prefix).toBe('*INV:\t');
    // round-trip du mini-document
    expect(parser.reconstruct(miniDoc)).toBe('@Begin\n' + withTab + '\n@End\n');
  });
});
