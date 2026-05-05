import fs from "fs";
import path from "path";

import PDFDocument from "pdfkit";

function resolveFontPath(): string {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "fonts", "NotoSans-Regular.ttf"),
    path.join(cwd, "backend", "fonts", "NotoSans-Regular.ttf"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return candidates[0];
}

function normalizeParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split(/\n\s*\n/)
    .map((part) => part.replace(/[ \t]+\n/g, "\n").trim())
    .filter(Boolean);
}

function isArticleHeading(text: string): boolean {
  return /^(Član|Clan|Члан)\s+\d+\.?$/iu.test(text.trim());
}

function isSectionHeading(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isArticleHeading(t)) return false;
  if (t.length > 85) return false;
  if (/[.!?]$/.test(t)) return false;
  return /(^[A-ZČĆŽŠĐ0-9 ,\-]+$)|(^[A-ZČĆŽŠĐ][\p{L}\s\-]+:$)/u.test(t);
}

function splitTitleForDisplay(title: string): string[] {
  const cleaned = title.trim().replace(/\s+/g, " ");
  if (!cleaned) return ["UGOVOR"];

  const upper = cleaned.toUpperCase();
  if (!upper.startsWith("UGOVOR")) return [upper];

  const after = cleaned.slice("ugovor".length).trim();
  if (!after) return ["UGOVOR"];
  return ["UGOVOR", after.toUpperCase()];
}

function isSignatureLine(text: string): boolean {
  const t = text.trim();
  return /^\[?\s*(Potpis|POTPIS)\s+/u.test(t);
}

function isSignatureDivider(text: string): boolean {
  const t = text.trim();
  return /^[_\-]{8,}(?:\s+[_\-]{8,})?$/.test(t);
}

function isPartySignatureLine(text: string): boolean {
  const t = text.trim();
  return /^(Naručilac|Narucilac|Izvršilac|Izvrsilac|Zakupodavac|Zakupac)\s*:/iu.test(t);
}

function isNamedSignerLine(text: string): boolean {
  const t = text.trim();
  return /\((Prodavac|Kupac|Zakupodavac|Zakupac|Naručilac|Narucilac|Izvršilac|Izvrsilac)\)/iu.test(
    t,
  );
}

function isSignatureCandidateLine(text: string): boolean {
  return isSignatureLine(text) || isPartySignatureLine(text) || isNamedSignerLine(text);
}

function collectSignatureLines(block: string): string[] {
  return block
    .split("\n")
    .flatMap((line) =>
      line
        .trim()
        .split(/\s{3,}/)
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .filter((line) => isSignatureCandidateLine(line));
}

function extractSignatureBlockLines(block: string): string[] | null {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.some((line) => isSignatureDivider(line))) return null;

  const content = lines.filter(
    (line) => !isSignatureDivider(line) && !/^potpisni blok:?$/iu.test(line),
  );

  return content.length > 0 ? content : null;
}

function extractTwoSignatureBlocksFromParagraph(
  paragraph: string,
): { left: string[]; right: string[] } | null {
  const lines = paragraph
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const dividerIdxs = lines
    .map((line, idx) => (isSignatureDivider(line) ? idx : -1))
    .filter((idx) => idx >= 0);

  if (dividerIdxs.length < 2) return null;

  const leftRaw = lines.slice(dividerIdxs[0] + 1, dividerIdxs[1]);
  const rightRaw = lines.slice(dividerIdxs[1] + 1);

  const left = leftRaw.filter((line) => !/^potpisni blok:?$/iu.test(line));
  const right = rightRaw.filter((line) => !/^potpisni blok:?$/iu.test(line));

  if (left.length === 0 || right.length === 0) return null;
  return { left, right };
}

function drawTwoColumnSignatureBlocks(
  doc: PDFKit.PDFDocument,
  leftLines: string[],
  rightLines: string[],
): void {
  const leftX = doc.page.margins.left;
  const printableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const gutter = 24;
  const colWidth = (printableWidth - gutter) / 2;
  const rightX = leftX + colWidth + gutter;
  const y = doc.y;

  doc.fontSize(12).text("______________________________", leftX, y, {
    width: colWidth,
    align: "left",
  });
  doc.text("______________________________", rightX, y, {
    width: colWidth,
    align: "right",
  });

  const leftText = leftLines.join("\n");
  const rightText = rightLines.join("\n");
  const leftHeight = doc.heightOfString(leftText, { width: colWidth, align: "left", lineGap: 2 });
  const rightHeight = doc.heightOfString(rightText, { width: colWidth, align: "right", lineGap: 2 });

  doc.text(leftText, leftX, y + 20, {
    width: colWidth,
    align: "left",
    lineGap: 2,
  });
  doc.text(rightText, rightX, y + 20, {
    width: colWidth,
    align: "right",
    lineGap: 2,
  });

  doc.y = y + 20 + Math.max(leftHeight, rightHeight) + 18;
}

function parseSignatureBlock(block: string): { label: string; name?: string } | null {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const hasDivider = lines.some((line) => isSignatureDivider(line));
  const label = lines.find((line) => isSignatureCandidateLine(line));
  if (!hasDivider || !label) return null;

  const name = lines.find(
    (line) =>
      !isSignatureDivider(line) &&
      !isSignatureCandidateLine(line) &&
      !/^potpisni blok:?$/iu.test(line),
  );
  return { label, name };
}

function expandArticleParagraphs(paragraphs: string[]): string[] {
  const expanded: string[] = [];
  for (const paragraph of paragraphs) {
    const match = paragraph.match(/^(Član|Clan|Члан)\s+\d+\.?/iu);
    if (!match) {
      expanded.push(paragraph);
      continue;
    }

    const heading = match[0].trim();
    const rest = paragraph.slice(match[0].length).trim();
    expanded.push(heading);
    if (rest) expanded.push(rest);
  }
  return expanded;
}

export async function buildContractPdfBuffer(
  bodyText: string,
  title: string,
): Promise<Buffer> {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    throw new Error("Prazan tekst za PDF.");
  }

  const fontPath = resolveFontPath();
  if (!fs.existsSync(fontPath)) {
    throw new Error(
      "Nedostaje font za PDF (NotoSans-Regular.ttf). Stavite fajl u folder fonts/ u korenu backend projekta.",
    );
  }

  const safeTitle = (title.trim() || "Nacrt ugovora").slice(0, 200);

  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      margin: 56,
      size: "A4",
      bufferPages: true,
      info: {
        Title: safeTitle,
        Author: "Pravko",
      },
    });

    doc.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on("error", reject);
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    doc.registerFont("Legal", fontPath);
    doc.font("Legal").fillColor("#111827");

    const paragraphs = expandArticleParagraphs(normalizeParagraphs(trimmed));
    const firstLines = paragraphs
      .slice(0, 2)
      .flatMap((p) => p.split("\n").map((line) => line.trim().toUpperCase()))
      .filter(Boolean);
    const alreadyHasTitle =
      firstLines[0] === "UGOVOR" &&
      (firstLines.length < 2 || firstLines[1].startsWith("O "));

    if (!alreadyHasTitle) {
      const titleLines = splitTitleForDisplay(safeTitle);
      doc.fontSize(18).text(titleLines[0], { align: "center" });
      if (titleLines[1]) {
        doc.moveDown(0.15);
        doc.fontSize(16).text(titleLines[1], { align: "center" });
      }
      doc.moveDown(1.3);
    }

    for (let i = 0; i < paragraphs.length; i += 1) {
      const paragraph = paragraphs[i];
      const nextParagraph = paragraphs[i + 1];
      const currentSignatureLines = collectSignatureLines(paragraph);
      const nextSignatureLines = nextParagraph ? collectSignatureLines(nextParagraph) : [];
      const currentSignatureBlock = parseSignatureBlock(paragraph);
      const nextSignatureBlock = nextParagraph ? parseSignatureBlock(nextParagraph) : null;
      const inlineBlocks = extractTwoSignatureBlocksFromParagraph(paragraph);
      const currentBlockLines = extractSignatureBlockLines(paragraph);
      const nextBlockLines = nextParagraph ? extractSignatureBlockLines(nextParagraph) : null;

      if (inlineBlocks) {
        drawTwoColumnSignatureBlocks(doc, inlineBlocks.left, inlineBlocks.right);
        continue;
      }

      if (currentBlockLines && nextBlockLines) {
        drawTwoColumnSignatureBlocks(doc, currentBlockLines, nextBlockLines);
        i += 1;
        continue;
      }

      if (currentSignatureBlock && nextSignatureBlock) {
        const leftX = doc.page.margins.left;
        const printableWidth =
          doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const gutter = 24;
        const colWidth = (printableWidth - gutter) / 2;
        const rightX = leftX + colWidth + gutter;
        const y = doc.y;

        doc.fontSize(12).text("______________________________", leftX, y, {
          width: colWidth,
          align: "left",
        });
        doc.text("______________________________", rightX, y, {
          width: colWidth,
          align: "right",
        });
        doc.moveDown(0.7);
        doc.text(currentSignatureBlock.label, leftX, doc.y, {
          width: colWidth,
          align: "left",
          lineGap: 2,
        });
        doc.text(nextSignatureBlock.label, rightX, doc.y, {
          width: colWidth,
          align: "right",
          lineGap: 2,
        });
        if (currentSignatureBlock.name || nextSignatureBlock.name) {
          doc.moveDown(0.45);
          doc.text(currentSignatureBlock.name ?? "", leftX, doc.y, {
            width: colWidth,
            align: "left",
            lineGap: 2,
          });
          doc.text(nextSignatureBlock.name ?? "", rightX, doc.y, {
            width: colWidth,
            align: "right",
            lineGap: 2,
          });
        }
        doc.moveDown(1.5);
        i += 1;
        continue;
      }

      if (
        isSignatureDivider(paragraph) &&
        nextParagraph &&
        isSignatureCandidateLine(nextParagraph) &&
        paragraphs[i + 2] &&
        isSignatureDivider(paragraphs[i + 2]) &&
        paragraphs[i + 3] &&
        isSignatureCandidateLine(paragraphs[i + 3])
      ) {
        const leftSignature = nextParagraph;
        const rightSignature = paragraphs[i + 3];
        const leftX = doc.page.margins.left;
        const printableWidth =
          doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const gutter = 24;
        const colWidth = (printableWidth - gutter) / 2;
        const rightX = leftX + colWidth + gutter;
        const y = doc.y;

        doc.fontSize(12).text("______________________________", leftX, y, {
          width: colWidth,
          align: "left",
        });
        doc.text("______________________________", rightX, y, {
          width: colWidth,
          align: "right",
        });
        doc.moveDown(0.7);
        doc.text(leftSignature, leftX, doc.y, {
          width: colWidth,
          align: "left",
          lineGap: 2,
        });
        doc.text(rightSignature, rightX, doc.y, {
          width: colWidth,
          align: "right",
          lineGap: 2,
        });
        doc.moveDown(1.8);
        i += 3;
        continue;
      }

      if (isSignatureLine(paragraph) && nextParagraph && isSignatureLine(nextParagraph)) {
        const leftX = doc.page.margins.left;
        const printableWidth =
          doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const gutter = 20;
        const colWidth = (printableWidth - gutter) / 2;
        const rightX = leftX + colWidth + gutter;
        const y = doc.y;

        doc.fontSize(12).text(paragraph, leftX, y, {
          width: colWidth,
          align: "left",
          lineGap: 2,
        });
        doc.text(nextParagraph, rightX, y, {
          width: colWidth,
          align: "right",
          lineGap: 2,
        });
        doc.moveDown(2.2);
        i += 1;
        continue;
      }

      if (currentSignatureLines.length >= 2) {
        const leftSignature = currentSignatureLines[0];
        const rightSignature = currentSignatureLines[1];
        const leftX = doc.page.margins.left;
        const printableWidth =
          doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const gutter = 24;
        const colWidth = (printableWidth - gutter) / 2;
        const rightX = leftX + colWidth + gutter;
        const y = doc.y;

        doc.fontSize(12).text("______________________________", leftX, y, {
          width: colWidth,
          align: "left",
        });
        doc.text("______________________________", rightX, y, {
          width: colWidth,
          align: "right",
        });
        doc.moveDown(0.7);
        doc.text(leftSignature, leftX, doc.y, {
          width: colWidth,
          align: "left",
          lineGap: 2,
        });
        doc.text(rightSignature, rightX, doc.y, {
          width: colWidth,
          align: "right",
          lineGap: 2,
        });
        doc.moveDown(1.8);
        continue;
      }

      if (currentSignatureLines.length === 1 && nextSignatureLines.length >= 1) {
        const leftSignature = currentSignatureLines[0];
        const rightSignature = nextSignatureLines[0];
        const leftX = doc.page.margins.left;
        const printableWidth =
          doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const gutter = 24;
        const colWidth = (printableWidth - gutter) / 2;
        const rightX = leftX + colWidth + gutter;
        const y = doc.y;

        doc.fontSize(12).text("______________________________", leftX, y, {
          width: colWidth,
          align: "left",
        });
        doc.text("______________________________", rightX, y, {
          width: colWidth,
          align: "right",
        });
        doc.moveDown(0.7);
        doc.text(leftSignature, leftX, doc.y, {
          width: colWidth,
          align: "left",
          lineGap: 2,
        });
        doc.text(rightSignature, rightX, doc.y, {
          width: colWidth,
          align: "right",
          lineGap: 2,
        });
        doc.moveDown(1.8);
        i += 1;
        continue;
      }

      if (isArticleHeading(paragraph)) {
        doc.moveDown(0.65);
        doc.fontSize(14).text(paragraph, { align: "center" });
        doc.moveDown(0.45);
        continue;
      }

      if (isSectionHeading(paragraph)) {
        doc.fontSize(12).text(paragraph, { align: "center" });
        doc.moveDown(0.5);
        continue;
      }

      doc.fontSize(11).text(paragraph, {
        align: "center",
        lineGap: 4,
      });
      doc.moveDown(0.55);
    }

    doc.end();
  });
}
