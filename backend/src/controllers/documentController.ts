import { Request, Response } from "express";

import {
  answerQuestion,
  DocumentKind,
  listDocuments,
  listQaHistory,
  uploadDocument,
} from "../services/documentService";

function parseDocumentKind(raw: unknown): DocumentKind {
  if (raw === "ugovor") {
    return "ugovor";
  }

  return "zakon";
}

export async function uploadDocumentController(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).send("No file");
      return;
    }

    const kind = parseDocumentKind(req.body?.kind);
    await uploadDocument(req.file.path, req.file.originalname, kind);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).send("error");
  }
}

export async function askQuestionController(req: Request, res: Response): Promise<void> {
  try {
    const { question } = req.body as { question?: string };

    if (!question || !question.trim()) {
      res.status(400).send("Question is required");
      return;
    }

    const result = await answerQuestion(question);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).send("error");
  }
}

export async function listDocumentsController(_req: Request, res: Response): Promise<void> {
  try {
    const documents = await listDocuments();
    res.json({ documents });
  } catch (error) {
    console.error(error);
    res.status(500).send("error");
  }
}

export async function listQaHistoryController(req: Request, res: Response): Promise<void> {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 10);
    const category =
      typeof req.query.category === "string" ? req.query.category : undefined;

    const history = await listQaHistory({ page, pageSize, category });
    res.json(history);
  } catch (error) {
    console.error(error);
    res.status(500).send("error");
  }
}
