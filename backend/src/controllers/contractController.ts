import fs from "fs";

import { Request, Response } from "express";

import { buildContractPdfBuffer } from "../services/contractPdfService";
import {
  analyzeContractFromPdf,
  generateContractFromDetails,
  refineContractFromInstruction,
} from "../services/contractService";

export async function analyzeContractController(req: Request, res: Response): Promise<void> {
  const tempPath = req.file?.path;

  try {
    if (!req.file) {
      res.status(400).json({ error: "Nedostaje PDF fajl." });
      return;
    }

    const result = await analyzeContractFromPdf(req.file.path, req.file.originalname);
    res.json(result);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Greška pri analizi.";
    if (message.includes("Prazan PDF")) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: "Greška pri analizi ugovora." });
  } finally {
    if (tempPath) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // ignore
      }
    }
  }
}

export async function generateContractController(req: Request, res: Response): Promise<void> {
  try {
    const { contractType, details } = req.body as { contractType?: string; details?: string };
    const result = await generateContractFromDetails(contractType ?? "", details ?? "");
    res.json(result);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Nedostaju")) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: "Greška pri generisanju ugovora." });
  }
}

export async function refineContractController(req: Request, res: Response): Promise<void> {
  try {
    const { draft, instruction, contractType } = req.body as {
      draft?: string;
      instruction?: string;
      contractType?: string;
    };

    const result = await refineContractFromInstruction(
      draft ?? "",
      instruction ?? "",
      contractType ?? "",
    );
    res.json(result);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Nedostaje")) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: "Greška pri doradi ugovora." });
  }
}

export async function contractPdfController(req: Request, res: Response): Promise<void> {
  try {
    const { text, title } = req.body as { text?: string; title?: string };
    const buffer = await buildContractPdfBuffer(text ?? "", title ?? "Nacrt ugovora");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="nacrt-ugovora.pdf"',
    );
    res.send(buffer);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Prazan tekst") || message.includes("Nedostaje font")) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: "Greška pri izradi PDF-a." });
  }
}
