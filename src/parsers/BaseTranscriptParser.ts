// Interface commune à tous les parsers de transcription (SPECS §11.2)

export interface BaseTranscriptParser<TDocument> {
  // Transforme le contenu brut en document structuré
  parse(content: string): TDocument;
  // Reconstruit le texte original depuis le document — doit être un round-trip exact
  reconstruct(doc: TDocument): string;
}
