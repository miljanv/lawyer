export function cleanPdfText(text: string): string {
  return text
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, " ")
    .replace(/^\s*\.\s*$/gm, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function splitBySize(text: string, maxLen = 800, overlap = 120): string[] {
  const chunks: string[] = [];
  const step = Math.max(1, maxLen - overlap);
  const minTail = Math.floor(maxLen * 0.6);

  for (let start = 0; start < text.length; ) {
    let safeStart = start;
    if (safeStart > 0) {
      const nextWhitespace = text.slice(safeStart).search(/\s/);
      if (nextWhitespace > 0) {
        safeStart += nextWhitespace + 1;
      }
    }

    if (safeStart >= text.length) break;

    const maxEnd = Math.min(safeStart + maxLen, text.length);
    let safeEnd = maxEnd;

    if (maxEnd < text.length) {
      const candidate = text.slice(safeStart, maxEnd);
      const lastWhitespace = candidate.search(/\s\S*$/);
      if (lastWhitespace >= minTail) {
        safeEnd = safeStart + lastWhitespace;
      }
    }

    const part = text.slice(safeStart, safeEnd).trim();
    if (part) chunks.push(part);
    if (safeEnd >= text.length) break;
    start = Math.max(safeEnd - overlap, start + step);
  }

  return chunks;
}

export function chunkText(text: string): string[] {
  const normalized = cleanPdfText(text);
  if (!normalized) return [];

  // Support both Cyrillic and Latin headers: "Члан 1" / "Član 1"
  const articlePattern = /(Члан|Član)\s+\d+/g;
  const parts = normalized.split(new RegExp(`(${articlePattern.source})`, "g"));
  const chunks: string[] = [];

  for (let i = 1; i < parts.length; i += 2) {
    const articleTitle = parts[i]?.trim() ?? "";
    const articleContent = parts[i + 1]?.trim() ?? "";
    const fullArticle = `${articleTitle}\n${articleContent}`.trim();

    if (!fullArticle) continue;

    if (fullArticle.length <= 1000) {
      chunks.push(fullArticle);
    } else {
      chunks.push(...splitBySize(fullArticle, 800, 120));
    }
  }

  // Fallback for documents without article markers.
  if (chunks.length === 0) {
    return splitBySize(normalized, 800, 120).filter((chunk) => chunk.length >= 80);
  }

  return chunks.filter((chunk) => chunk.length >= 80);
}
