import fs from "fs";
import { PDFParse } from "pdf-parse";

import { db } from "../db";
import { askAI, getEmbedding } from "../embeddings";
import { chunkText } from "../parser";

type SourceItem = { content: string };
type DocumentListItem = { id: number; name: string };
type QaHistoryListItem = {
  id: number;
  question: string;
  answer: string;
  category: string;
  createdAt: string;
};
type QaHistoryQuery = { page: number; pageSize: number; category?: string };
type QaHistoryResponse = {
  items: QaHistoryListItem[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
  categories: string[];
};

function cleanRetrievedChunk(text: string): string {
  const cleaned = text
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, " ")
    .replace(/^\s*\.\s*$/gm, " ")
    .replace(/^Члан\s*$/gm, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  if (/^[a-zа-яčćžšđ]/i.test(cleaned) && !/^[A-ZА-ЯČĆŽŠĐ]/.test(cleaned)) {
    const withoutFirstToken = cleaned.replace(/^\S+\s+/, "");
    return withoutFirstToken.trim();
  }

  return cleaned;
}

function isLikelyFragmentStart(text: string): boolean {
  const startsWithLowercase =
    /^[a-zа-яčćžšđ]/i.test(text) && !/^[A-ZА-ЯČĆŽŠĐ]/.test(text);
  const startsWithConnector =
    /^(и|или|да|се|је|су|на|у|од|до|за|код|као|који|којим|која|односно)\b/i.test(
      text,
    );

  return startsWithLowercase || startsWithConnector;
}

export async function uploadDocument(filePath: string, fileName: string): Promise<void> {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const pdfData = await parser.getText();

    const docRes = await db.query(
      "INSERT INTO documents(name) VALUES($1) RETURNING id",
      [fileName],
    );

    const docId: number = docRes.rows[0].id;
    const chunks = chunkText(pdfData.text);

    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);
      const embeddingStr = `[${embedding.join(",")}]`;

      await db.query(
        "INSERT INTO document_chunks(document_id, content, embedding) VALUES($1, $2, $3::vector)",
        [docId, chunk, embeddingStr],
      );
    }
  } finally {
    await parser.destroy();
  }
}

export async function answerQuestion(
  question: string,
): Promise<{ answer: string; sources: SourceItem[] }> {
  const queryEmbedding = await getEmbedding(question);
  const queryEmbeddingStr = `[${queryEmbedding.join(",")}]`;

  const result = await db.query(
    `
SELECT dc.content, dc.document_id, d.name AS document_name
FROM document_chunks dc
LEFT JOIN documents d ON d.id = dc.document_id
ORDER BY embedding <-> $1::vector
LIMIT 25
`,
    [queryEmbeddingStr],
  );

  const topDocumentName =
    (result.rows[0]?.document_name as string | undefined)?.trim() || "Opšte";
  const topDocumentId = result.rows[0]?.document_id as number | null | undefined;

  const cleanedSources = result.rows
    .map((r: { content: string }) => ({ content: cleanRetrievedChunk(r.content) }))
    .filter((r: SourceItem) => r.content.length >= 80)
    .filter(
      (r: SourceItem) => !isLikelyFragmentStart(r.content) || r.content.includes("Члан "),
    )
    .slice(0, 10);

  const context = cleanedSources.map((r: SourceItem) => r.content).join("\n\n---\n\n");
  const answer = await askAI(question, context);

  await db.query(
    `
INSERT INTO qa_history(question, answer, document_id, category)
VALUES ($1, $2, $3, $4)
`,
    [question, answer, topDocumentId ?? null, topDocumentName],
  );

  return { answer, sources: cleanedSources };
}

export async function listDocuments(): Promise<DocumentListItem[]> {
  const result = await db.query(
    `
SELECT id, name
FROM documents
ORDER BY id DESC
LIMIT 100
`,
  );

  return result.rows as DocumentListItem[];
}

export async function listQaHistory(query: QaHistoryQuery): Promise<QaHistoryResponse> {
  const { page, pageSize, category } = query;
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 10));
  const offset = (safePage - 1) * safePageSize;
  const hasCategoryFilter = Boolean(category && category !== "Sve");

  const whereClause = hasCategoryFilter ? "WHERE category = $1" : "";
  const params = hasCategoryFilter ? [category, safePageSize, offset] : [safePageSize, offset];

  const result = await db.query(
    `
SELECT
  id,
  question,
  answer,
  category,
  created_at AS "createdAt"
FROM qa_history
${
      whereClause
    }
ORDER BY created_at DESC
LIMIT $${hasCategoryFilter ? "2" : "1"}
OFFSET $${hasCategoryFilter ? "3" : "2"}
`,
    params,
  );

  const countResult = await db.query(
    `
SELECT COUNT(*)::int AS total
FROM qa_history
${whereClause}
`,
    hasCategoryFilter ? [category] : [],
  );

  const categoriesResult = await db.query(
    `
SELECT DISTINCT category
FROM qa_history
ORDER BY category ASC
`,
  );

  const totalItems: number = countResult.rows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const categories = ["Sve", ...categoriesResult.rows.map((row: { category: string }) => row.category)];

  return {
    items: result.rows as QaHistoryListItem[],
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      totalItems,
      totalPages,
    },
    categories,
  };
}
