/**
 * Splits text into sentences using Intl.Segmenter when available,
 * falling back to a regex-based approach.
 */
export function splitSentences(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    return Array.from(segmenter.segment(text))
      .map((s) => s.segment.trim())
      .filter(Boolean);
  }

  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Splits text into paragraphs (by double-newline), then each paragraph
 * into sentences.  Returns string[][] — an array of paragraphs, each
 * containing an array of sentences.
 */
export function splitIntoParagraphs(text: string): string[][] {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
  return paragraphs
    .map((p) => splitSentences(p.trim()))
    .filter((sentences) => sentences.length > 0);
}
