import fs from "fs";

import { PDFParse } from "pdf-parse";

import { db } from "../db";
import {
  analyzeContractWithLaws,
  generateContractDraft,
  getEmbedding,
  refineContractDraftLLM,
} from "../embeddings";
import { sanitizeLegalPlainText } from "../legalText";
import { cleanPdfText } from "../parser";

function buildLawRetrievalQuery(contractText: string): string {
  const normalized = contractText.replace(/\s+/g, " ").trim();
  const maxTotal = 6500;
  if (normalized.length <= maxTotal) {
    return normalized;
  }

  const head = normalized.slice(0, 2200);
  const midStart = Math.floor(normalized.length / 2) - 1100;
  const mid = normalized.slice(Math.max(0, midStart), Math.max(0, midStart) + 2200);
  const tail = normalized.slice(-2200);

  return `${head}\n\n---\n\n${mid}\n\n---\n\n${tail}`;
}

export async function retrieveLawContext(searchText: string, limit = 22): Promise<string> {
  const queryEmbedding = await getEmbedding(searchText);
  const queryEmbeddingStr = `[${queryEmbedding.join(",")}]`;

  const result = await db.query(
    `
SELECT dc.content
FROM document_chunks dc
INNER JOIN documents d ON d.id = dc.document_id
WHERE COALESCE(d.kind, 'zakon') = 'zakon'
ORDER BY dc.embedding <-> $1::vector
LIMIT $2
`,
    [queryEmbeddingStr, limit],
  );

  const rows = result.rows as Array<{ content: string }>;
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const row of rows) {
    const text = row.content?.trim() ?? "";
    if (!text || seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
  }

  return parts.join("\n\n---\n\n");
}

async function extractPdfText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const pdfData = await parser.getText();
    return cleanPdfText(pdfData.text ?? "");
  } finally {
    await parser.destroy();
  }
}

const MAX_CONTRACT_CHARS = 100_000;

export async function analyzeContractFromPdf(
  filePath: string,
  _fileName: string,
): Promise<{ analysis: string; lawExcerpts: string }> {
  const rawText = await extractPdfText(filePath);
  const contractText =
    rawText.length > MAX_CONTRACT_CHARS
      ? `${rawText.slice(0, MAX_CONTRACT_CHARS)}\n\n[TEKST JE SKRAĆEN ZBOG DUŽINE — analiza važi za prikazani deo.]`
      : rawText;

  if (!contractText.trim()) {
    throw new Error("Prazan PDF ili nepodržan sadržaj.");
  }

  const retrievalQuery = buildLawRetrievalQuery(contractText);
  const lawExcerpts = await retrieveLawContext(retrievalQuery, 22);
  const analysis = await analyzeContractWithLaws(contractText, lawExcerpts);

  return { analysis, lawExcerpts };
}

export async function generateContractFromDetails(
  contractType: string,
  details: string,
): Promise<{ draft: string; lawExcerpts: string }> {
  const trimmedType = contractType.trim();
  const trimmedDetails = details.trim();

  if (!trimmedType || !trimmedDetails) {
    throw new Error("Nedostaju vrsta ugovora ili opis uslova.");
  }

  const retrievalQuery = `
Pravni okvir Republike Srbije za ugovor: ${trimmedType}.
Obavezni elementi, zaštita slabije strane, primenjivi propisi.
Detalji predmeta: ${trimmedDetails}
`;

  const lawExcerpts = await retrieveLawContext(retrievalQuery, 24);
  const rawDraft = await generateContractDraft(trimmedType, trimmedDetails, lawExcerpts);
  const draft = sanitizeLegalPlainText(rawDraft);

  return { draft, lawExcerpts };
}

export async function refineContractFromInstruction(
  currentDraft: string,
  instruction: string,
  contractType: string,
): Promise<{ draft: string; lawExcerpts: string }> {
  const trimmedDraft = currentDraft.trim();
  const trimmedInstruction = instruction.trim();
  const type = contractType.trim() || "Ugovor";

  if (!trimmedDraft) {
    throw new Error("Nedostaje tekst nacrta.");
  }

  if (!trimmedInstruction) {
    throw new Error("Nedostaje uputstvo za doradu.");
  }

  const retrievalQuery = `
Pravni okvir Republike Srbije za: ${type}.
Izmena / dorada ugovora po uputstvu: ${trimmedInstruction}

Fragment teksta ugovora za pretragu propisa:
${trimmedDraft.slice(0, 8000)}
`;

  const lawExcerpts = await retrieveLawContext(retrievalQuery, 24);
  const raw = await refineContractDraftLLM(
    trimmedDraft,
    trimmedInstruction,
    lawExcerpts,
    type,
  );
  const draft = sanitizeLegalPlainText(raw);

  return { draft, lawExcerpts };
}
