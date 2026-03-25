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
