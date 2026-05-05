"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  FileUp,
  FilePenLine,
  FileSearch,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  Loader2,
  Download,
  Menu,
  MessageCircleQuestion,
  Rocket,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type AskResponse = {
  answer: string;
  sources: Array<{ content: string }>;
};

type QaHistoryItem = {
  id: number;
  question: string;
  answer: string;
  category: string;
  createdAt: string;
};

type DocumentItem = {
  id: number;
  name: string;
  kind?: string;
};

type ContractAnalysisResponse = {
  analysis: string;
  lawExcerpts: string;
};

type ContractGenerateResponse = {
  draft: string;
  lawExcerpts: string;
};

type DraftDiffLine = {
  type: "added" | "removed" | "unchanged";
  text: string;
};

type SectionKey =
  | "pregled"
  | "dokumenta"
  | "pitanja"
  | "analizaUgovora"
  | "generisanjeUgovora";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const LOGO_PRIMARY = "#2753ff";
const LOGO_DARK = "#1b2f76";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace("#", "");
  const int = Number.parseInt(value, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function formatDraftForEditor(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const divider = "______________________________";
  const pad = "                              ";

  const isDivider = (line: string): boolean => /^[_\-]{8,}$/.test(line.trim());
  const isSigner = (line: string): boolean =>
    /^\[?\s*(Potpis|POTPIS)\s+/u.test(line.trim()) ||
    /^(Naručilac|Narucilac|Izvršilac|Izvrsilac|Zakupodavac|Zakupac)\s*:/iu.test(
      line.trim(),
    ) ||
    /\((Prodavac|Kupac|Zakupodavac|Zakupac|Naručilac|Narucilac|Izvršilac|Izvrsilac)\)/iu.test(
      line.trim(),
    );

  for (let i = 0; i < lines.length; i += 1) {
    const l1 = lines[i]?.trim() ?? "";
    const l2 = lines[i + 1]?.trim() ?? "";
    const l3 = lines[i + 2]?.trim() ?? "";
    const l4 = lines[i + 3]?.trim() ?? "";

    if (isDivider(l1) && isSigner(l2) && isDivider(l3) && isSigner(l4)) {
      out.push(`${divider}${pad}${divider}`);
      out.push(`${l2}${pad}${l4}`);
      i += 3;
      continue;
    }

    if (isSigner(l1) && isSigner(l2)) {
      out.push(`${divider}${pad}${divider}`);
      out.push(`${l1}${pad}${l2}`);
      i += 1;
      continue;
    }

    out.push(lines[i]);
  }

  return out.join("\n");
}

function buildDraftDiff(
  previousText: string,
  nextText: string,
): DraftDiffLine[] {
  const prev = previousText.replace(/\r\n/g, "\n").split("\n");
  const next = nextText.replace(/\r\n/g, "\n").split("\n");
  const normalizeForDiff = (line: string): string =>
    line
      .normalize("NFC")
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const prevCmp = prev.map(normalizeForDiff);
  const nextCmp = next.map(normalizeForDiff);
  const m = prev.length;
  const n = next.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (prevCmp[i] === nextCmp[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const diff: DraftDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (prevCmp[i] === nextCmp[j]) {
      diff.push({ type: "unchanged", text: next[j] });
      i += 1;
      j += 1;
      continue;
    }
    if (dp[i + 1][j] >= dp[i][j + 1]) {
      diff.push({ type: "removed", text: prev[i] });
      i += 1;
    } else {
      diff.push({ type: "added", text: next[j] });
      j += 1;
    }
  }
  while (i < m) {
    diff.push({ type: "removed", text: prev[i] });
    i += 1;
  }
  while (j < n) {
    diff.push({ type: "added", text: next[j] });
    j += 1;
  }

  return diff;
}

export function DashboardPage({
  initialSection = "pitanja",
}: {
  initialSection?: SectionKey;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const v =
      window.localStorage.getItem("pravko.sidebarOpen") ??
      window.localStorage.getItem("lawyer.sidebarOpen");
    return v !== "false";
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] =
    useState<SectionKey>(initialSection);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [history, setHistory] = useState<QaHistoryItem[]>([]);
  const [historyCategories, setHistoryCategories] = useState<string[]>(["Sve"]);
  const [historyCategory, setHistoryCategory] = useState("Sve");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize] = useState(5);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotalItems, setHistoryTotalItems] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [contractAnalyzing, setContractAnalyzing] = useState(false);
  const [contractAnalysis, setContractAnalysis] =
    useState<ContractAnalysisResponse | null>(null);
  const [generateContractType, setGenerateContractType] = useState("");
  const [generateDetails, setGenerateDetails] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] =
    useState<ContractGenerateResponse | null>(null);
  const [contractDraftEdit, setContractDraftEdit] = useState("");
  const [draftDiffLines, setDraftDiffLines] = useState<DraftDiffLine[] | null>(
    null,
  );
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refining, setRefining] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  const canUpload = useMemo(
    () => Boolean(file) && !uploading,
    [file, uploading],
  );
  const canAnalyzeContract = useMemo(
    () => Boolean(contractFile) && !contractAnalyzing,
    [contractFile, contractAnalyzing],
  );
  const canGenerateContract = useMemo(
    () =>
      generateContractType.trim().length > 0 &&
      generateDetails.trim().length > 0 &&
      !generating,
    [generateContractType, generateDetails, generating],
  );
  const canAsk = useMemo(
    () => question.trim().length > 0 && !asking,
    [question, asking],
  );
  const canRefineDraft = useMemo(
    () =>
      Boolean(generateResult) &&
      contractDraftEdit.trim().length > 0 &&
      refineInstruction.trim().length > 0 &&
      !refining,
    [generateResult, contractDraftEdit, refineInstruction, refining],
  );
  const canExportContractPdf = useMemo(
    () => contractDraftEdit.trim().length > 0 && !pdfDownloading,
    [contractDraftEdit, pdfDownloading],
  );
  const primaryRgb = useMemo(() => hexToRgb(LOGO_PRIMARY), []);
  const darkRgb = useMemo(() => hexToRgb(LOGO_DARK), []);

  const brandStyles = useMemo(
    () =>
      ({
        "--brand": LOGO_PRIMARY,
        "--brand-strong": `rgba(${darkRgb.r}, ${darkRgb.g}, ${darkRgb.b}, 0.44)`,
        "--brand-soft": `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.24)`,
        "--brand-softer": `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.16)`,
        "--brand-border": `rgba(${darkRgb.r}, ${darkRgb.g}, ${darkRgb.b}, 0.55)`,
      }) as React.CSSProperties,
    [darkRgb, primaryRgb],
  );

  useEffect(() => {
    window.localStorage.setItem("pravko.sidebarOpen", String(sidebarOpen));
  }, [sidebarOpen]);

  async function fetchHistory(
    page = historyPage,
    category = historyCategory,
  ): Promise<void> {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(historyPageSize),
      });
      if (category && category !== "Sve") {
        params.set("category", category);
      }

      const response = await fetch(
        `${API_URL}/qa-history?${params.toString()}`,
      );
      if (!response.ok) throw new Error("Failed");
      const data = (await response.json()) as {
        items: QaHistoryItem[];
        categories: string[];
        pagination: { page: number; totalPages: number; totalItems: number };
      };

      setHistory(data.items ?? []);
      setHistoryCategories(data.categories ?? ["Sve"]);
      setHistoryPage(data.pagination?.page ?? page);
      setHistoryTotalPages(data.pagination?.totalPages ?? 1);
      setHistoryTotalItems(data.pagination?.totalItems ?? 0);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    async function fetchInitialData(): Promise<void> {
      try {
        const [documentsResponse, historyResponse] = await Promise.all([
          fetch(`${API_URL}/documents`),
          fetch(`${API_URL}/qa-history?page=1&pageSize=${historyPageSize}`),
        ]);

        if (!documentsResponse.ok || !historyResponse.ok) {
          throw new Error("Failed");
        }

        const documentsData = (await documentsResponse.json()) as {
          documents: DocumentItem[];
        };
        const historyData = (await historyResponse.json()) as {
          items: QaHistoryItem[];
          categories: string[];
          pagination: { page: number; totalPages: number; totalItems: number };
        };

        setDocuments(documentsData.documents ?? []);
        setHistory(historyData.items ?? []);
        setHistoryCategories(historyData.categories ?? ["Sve"]);
        setHistoryPage(historyData.pagination?.page ?? 1);
        setHistoryTotalPages(historyData.pagination?.totalPages ?? 1);
        setHistoryTotalItems(historyData.pagination?.totalItems ?? 0);
      } catch {
        setStatus({
          type: "error",
          text: "Ne mogu da učitam početne podatke.",
        });
      } finally {
        setLoadingDocuments(false);
        setLoadingHistory(false);
      }
    }

    void fetchInitialData();
  }, [historyPageSize]);

  function gotoSection(section: SectionKey): void {
    const sectionRoute: Record<SectionKey, string> = {
      pitanja: "/",
      analizaUgovora: "/analiza-ugovora",
      generisanjeUgovora: "/generisanje-ugovora",
      dokumenta: "/dokumenta",
      pregled: "/istorija",
    };
    router.push(sectionRoute[section]);
    setActiveSection(section);
    setMobileSidebarOpen(false);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    setFile(event.target.files?.[0] ?? null);
    setStatus(null);
  }

  async function onUpload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setStatus(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", "zakon");

    try {
      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload nije uspeo.");

      setStatus({
        type: "success",
        text: `Dokument "${file.name}" je uspešno indeksiran.`,
      });
      setFile(null);

      const docsResponse = await fetch(`${API_URL}/documents`);
      if (docsResponse.ok) {
        const data = (await docsResponse.json()) as {
          documents: DocumentItem[];
        };
        setDocuments(data.documents ?? []);
      }
    } catch {
      setStatus({ type: "error", text: "Upload nije uspeo. Proveri backend." });
    } finally {
      setUploading(false);
    }
  }

  async function onAsk(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    setStatus(null);

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!response.ok) throw new Error("Upit nije uspeo.");
      const data = (await response.json()) as AskResponse;
      setResult(data);
      await fetchHistory(1, historyCategory);
    } catch {
      setStatus({ type: "error", text: "Ne mogu da dobijem odgovor." });
    } finally {
      setAsking(false);
    }
  }

  function onContractFileChange(event: ChangeEvent<HTMLInputElement>): void {
    setContractFile(event.target.files?.[0] ?? null);
    setContractAnalysis(null);
    setStatus(null);
  }

  async function onAnalyzeContract(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!contractFile) return;
    setContractAnalyzing(true);
    setStatus(null);
    setContractAnalysis(null);

    const formData = new FormData();
    formData.append("file", contractFile);

    try {
      const response = await fetch(`${API_URL}/contracts/analyze`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(err?.error ?? "Analiza nije uspela.");
      }
      const data = (await response.json()) as ContractAnalysisResponse;
      setContractAnalysis(data);
      setStatus({
        type: "success",
        text: "Analiza je završena. Pregledaj rezultat ispod.",
      });
    } catch (e) {
      setStatus({
        type: "error",
        text:
          e instanceof Error
            ? e.message
            : "Analiza nije uspela. Proveri PDF i backend.",
      });
    } finally {
      setContractAnalyzing(false);
    }
  }

  async function onGenerateContract(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!generateContractType.trim() || !generateDetails.trim()) return;
    setGenerating(true);
    setStatus(null);
    setGenerateResult(null);
    setContractDraftEdit("");
    setRefineInstruction("");

    try {
      const response = await fetch(`${API_URL}/contracts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractType: generateContractType.trim(),
          details: generateDetails.trim(),
        }),
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(err?.error ?? "Generisanje nije uspelo.");
      }
      const data = (await response.json()) as ContractGenerateResponse;
      setGenerateResult(data);
      setContractDraftEdit(formatDraftForEditor(data.draft));
      setDraftDiffLines(null);
      setStatus({
        type: "success",
        text: "Nacrt ugovora je generisan.",
      });
    } catch (e) {
      setStatus({
        type: "error",
        text:
          e instanceof Error
            ? e.message
            : "Generisanje nije uspelo. Proveri backend.",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function onRefineContract(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!canRefineDraft) return;
    const previousDraft = contractDraftEdit;
    setRefining(true);
    setStatus(null);

    try {
      const response = await fetch(`${API_URL}/contracts/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: contractDraftEdit,
          instruction: refineInstruction.trim(),
          contractType: generateContractType.trim() || "Ugovor",
        }),
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(err?.error ?? "Dorada nije uspela.");
      }
      const data = (await response.json()) as ContractGenerateResponse;
      const formattedDraft = formatDraftForEditor(data.draft);
      setGenerateResult(data);
      setContractDraftEdit(formattedDraft);
      setDraftDiffLines(buildDraftDiff(previousDraft, formattedDraft));
      setRefineInstruction("");
      setStatus({ type: "success", text: "Nacrt je ažuriran." });
    } catch (e) {
      setStatus({
        type: "error",
        text:
          e instanceof Error
            ? e.message
            : "Dorada nije uspela. Proveri backend.",
      });
    } finally {
      setRefining(false);
    }
  }

  async function downloadContractPdf(): Promise<void> {
    if (!contractDraftEdit.trim()) return;
    setPdfDownloading(true);
    setStatus(null);

    try {
      const response = await fetch(`${API_URL}/contracts/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: contractDraftEdit,
          title: generateContractType.trim() || "Nacrt ugovora",
        }),
      });

      if (!response.ok) {
        const ct = response.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          const err = (await response.json()) as { error?: string };
          throw new Error(err.error ?? "PDF nije dostupan.");
        }
        throw new Error("PDF nije dostupan.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "pravko-nacrt-ugovora.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus({ type: "success", text: "PDF je preuzet." });
    } catch (e) {
      setStatus({
        type: "error",
        text:
          e instanceof Error
            ? e.message
            : "Preuzimanje PDF-a nije uspelo. Proveri da li backend ima font za PDF.",
      });
    } finally {
      setPdfDownloading(false);
    }
  }

  return (
    <div
      style={brandStyles}
      className="h-screen w-screen bg-background text-foreground"
    >
      <main className="relative grid h-full w-full grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)]">
        {mobileSidebarOpen && (
          <button
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        <aside
          className={[
            "fixed inset-y-0 left-0 z-40 flex min-h-0 flex-col border-r border-border bg-card p-4 transition-all duration-300 md:static",
            mobileSidebarOpen
              ? "translate-x-0"
              : "-translate-x-full md:translate-x-0",
            sidebarOpen ? "w-[285px]" : "w-[84px]",
          ].join(" ")}
        >
          <div
            className={[
              "mb-4 flex items-start gap-2",
              sidebarOpen ? "justify-between" : "flex-col items-center",
            ].join(" ")}
          >
            <div
              className={[
                "flex min-w-0 items-center gap-2.5",
                sidebarOpen ? "" : "flex-col",
              ].join(" ")}
            >
              <Image
                src="/logo-tr.png"
                alt="Pravko"
                width={40}
                height={40}
                className={[
                  "shrink-0 rounded-xl  object-contain",
                  sidebarOpen ? "size-10" : "size-9",
                ].join(" ")}
                priority
              />
              <div className={sidebarOpen ? "min-w-0" : "hidden"}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Pravko
                </p>
                <h2 className="text-xl font-bold leading-tight text-foreground">
                  Kontrolna tabla
                </h2>
              </div>
            </div>
            <button
              type="button"
              className={[
                "shrink-0 rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted",
                sidebarOpen ? "" : "self-end",
              ].join(" ")}
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label={sidebarOpen ? "Skupi meni" : "Proširi meni"}
            >
              {sidebarOpen ? (
                <ChevronLeft className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
          </div>

          <div className="mb-4 space-y-1">
            {[
              {
                key: "pitanja" as const,
                icon: MessageCircleQuestion,
                label: "Pitaj me",
              },

              {
                key: "generisanjeUgovora" as const,
                icon: FilePenLine,
                label: "Generisanje ugovora",
              },
              {
                key: "analizaUgovora" as const,
                icon: FileSearch,
                label: "Analiza ugovora",
              },
              {
                key: "dokumenta" as const,
                icon: FolderOpen,
                label: "Dokumenta",
              },
              {
                key: "pregled" as const,
                icon: LayoutDashboard,
                label: "Istorija",
              },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  className={[
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition",
                    isActive
                      ? "text-[var(--brand)]"
                      : "text-muted-foreground hover:bg-muted",
                  ].join(" ")}
                  style={
                    isActive
                      ? { backgroundColor: "var(--brand-soft)" }
                      : undefined
                  }
                  onClick={() => gotoSection(item.key)}
                >
                  <Icon className="size-4" />
                  {sidebarOpen && item.label}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1" />
        </aside>

        <section className="flex min-h-0 flex-col bg-background">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="rounded-lg border border-border p-2 md:hidden"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Otvori meni"
              >
                <Menu className="size-4" />
              </button>

              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">
                  Zakoni u bazi, analiza ugovora i automatski nacrti po pravu
                  RS.
                </p>
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-auto px-4 py-3">
            <div className="flex w-full max-w-6xl flex-col gap-3">
              {activeSection === "pregled" && (
                <Card className="border-border shadow-sm">
                  <CardHeader className="px-4 py-3">
                    <CardTitle>Istorija pitanja i odgovora</CardTitle>
                    <CardDescription>
                      Pregled prethodnih razgovora sa asistentom (
                      {historyTotalItems} ukupno).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Label
                        htmlFor="history-category"
                        className="text-xs text-muted-foreground"
                      >
                        Kategorija
                      </Label>
                      <select
                        id="history-category"
                        className="h-8 rounded-md border border-border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={loadingHistory}
                        value={historyCategory}
                        onChange={async (event) => {
                          const nextCategory = event.target.value;
                          setHistoryCategory(nextCategory);
                          await fetchHistory(1, nextCategory);
                        }}
                      >
                        {historyCategories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </div>

                    {loadingHistory ? (
                      <div
                        className="flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 py-10"
                        role="status"
                        aria-live="polite"
                        aria-busy="true"
                      >
                        <Loader2
                          className="size-9 animate-spin text-[var(--brand)]"
                          aria-hidden
                        />
                        <p className="text-sm font-medium text-foreground">
                          Učitavanje istorije…
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Sačekaj trenutak dok se primeni filter.
                        </p>
                      </div>
                    ) : history.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Još nema istorije pitanja.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {history.map((item) => (
                          <Card
                            key={item.id}
                            className="border-border bg-muted/40"
                          >
                            <CardContent className="space-y-1.5 px-3 py-3">
                              <p className="text-xs text-muted-foreground">
                                {new Date(item.createdAt).toLocaleString(
                                  "sr-RS",
                                )}
                              </p>
                              <p className="text-xs text-[var(--brand)]">
                                Dokument: {item.category}
                              </p>
                              <p className="text-sm font-semibold text-foreground">
                                Pitanje: {item.question}
                              </p>
                              <p className="whitespace-pre-wrap text-sm text-foreground">
                                {item.answer}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <Button
                        variant="outline"
                        disabled={historyPage <= 1 || loadingHistory}
                        onClick={async () => {
                          const next = historyPage - 1;
                          await fetchHistory(next, historyCategory);
                        }}
                      >
                        Prethodna
                      </Button>
                      <p className="text-sm text-muted-foreground">
                        Strana {historyPage} / {historyTotalPages}
                      </p>
                      <Button
                        variant="outline"
                        disabled={
                          historyPage >= historyTotalPages || loadingHistory
                        }
                        onClick={async () => {
                          const next = historyPage + 1;
                          await fetchHistory(next, historyCategory);
                        }}
                      >
                        Sledeća
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeSection === "dokumenta" && (
                <Card className="border-border shadow-sm">
                  <CardHeader className="px-4 py-3">
                    <CardTitle>Dokumenta u sistemu</CardTitle>
                    <CardDescription>
                      Pregled svih dokumenata i otpremanje novih dokumenata bez
                      šifre.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 px-4 pb-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        setLoadingDocuments(true);
                        try {
                          const response = await fetch(`${API_URL}/documents`);
                          if (!response.ok) throw new Error("Failed");
                          const data = (await response.json()) as {
                            documents: DocumentItem[];
                          };
                          setDocuments(data.documents ?? []);
                        } catch {
                          setStatus({
                            type: "error",
                            text: "Ne mogu da osvežim dokumenta.",
                          });
                        } finally {
                          setLoadingDocuments(false);
                        }
                      }}
                    >
                      Osveži dokumenta
                    </Button>
                    {loadingDocuments ? (
                      <p className="text-sm text-muted-foreground">
                        Učitavanje...
                      </p>
                    ) : documents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nema dokumenata u sistemu.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {documents.map((doc) => (
                          <div
                            key={doc.id}
                            className="rounded-lg border border-border bg-muted/40 px-3 py-1.5"
                          >
                            <p className="font-medium text-foreground">
                              {doc.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              ID #{doc.id} ·{" "}
                              {doc.kind === "ugovor"
                                ? "Ugovor"
                                : "Zakon / propis"}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    <Separator />

                    <form className="space-y-3" onSubmit={onUpload}>
                      <div className="space-y-2">
                        <Label htmlFor="document">Novi PDF dokument</Label>
                        <Input
                          id="document"
                          type="file"
                          accept="application/pdf"
                          onChange={onFileChange}
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={!canUpload}
                        className="h-9 w-full text-white"
                        style={{ backgroundColor: "var(--brand)" }}
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Otpremanje u toku...
                          </>
                        ) : (
                          <>
                            <FileUp className="mr-2 size-4" />
                            Otpremi i indeksiraj
                          </>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}

              {activeSection === "analizaUgovora" && (
                <Card className="border-border shadow-sm">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileSearch className="size-4 text-[var(--brand)]" />
                      Analiza ugovora
                    </CardTitle>
                    <CardDescription>
                      Otpremi PDF ugovora. Sistem povezuje tekst sa zakonima iz
                      baze (RAG) i daje strukturisanu analizu prema pravu
                      Republike Srbije.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <form className="space-y-3" onSubmit={onAnalyzeContract}>
                      <div className="space-y-2">
                        <Label htmlFor="contract-pdf">PDF ugovora</Label>
                        <Input
                          id="contract-pdf"
                          type="file"
                          accept="application/pdf"
                          onChange={onContractFileChange}
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={!canAnalyzeContract}
                        className="h-9 w-full text-white"
                        style={{ backgroundColor: "var(--brand)" }}
                      >
                        {contractAnalyzing ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Analiza u toku…
                          </>
                        ) : (
                          <>
                            <FileSearch className="mr-2 size-4" />
                            Analiziraj ugovor
                          </>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}

              {activeSection === "generisanjeUgovora" && (
                <Card className="border-border shadow-sm">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FilePenLine className="size-4 text-[var(--brand)]" />
                      Generisanje ugovora
                    </CardTitle>
                    <CardDescription>
                      Navedi vrstu ugovora i okolnosti. Nacrt se pravi uz
                      odgovarajuće izvode iz propisa u bazi — namenjeno je
                      pravnoj proveri pre potpisivanja.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <form className="space-y-3" onSubmit={onGenerateContract}>
                      <div className="space-y-2">
                        <Label htmlFor="contract-type">Vrsta ugovora</Label>
                        <Input
                          id="contract-type"
                          value={generateContractType}
                          onChange={(event) =>
                            setGenerateContractType(event.target.value)
                          }
                          placeholder="Npr. Ugovor o zakupu stana, Ugovor o radu…"
                          list="contract-type-suggestions"
                        />
                        <datalist id="contract-type-suggestions">
                          <option value="Ugovor o radu" />
                          <option value="Ugovor o zakupu stana" />
                          <option value="Ugovor o kupoprodaji nepokretnosti" />
                          <option value="Ugovor o pozajmici" />
                          <option value="Ugovor o delu" />
                          <option value="Predugovor" />
                        </datalist>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contract-details">
                          Strane, predmet, cena, rokovi i posebni uslovi
                        </Label>
                        <Textarea
                          id="contract-details"
                          value={generateDetails}
                          onChange={(event) =>
                            setGenerateDetails(event.target.value)
                          }
                          placeholder="Npr. prodavac / kupac, adresa, cena u RSD, rok isporuke, kaznene klauzule…"
                          className="min-h-32"
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={!canGenerateContract}
                        className="h-9 w-full text-white"
                        style={{ backgroundColor: "var(--brand)" }}
                      >
                        {generating ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Generisanje…
                          </>
                        ) : (
                          <>
                            <FilePenLine className="mr-2 size-4" />
                            Generiši nacrt
                          </>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}

              {activeSection === "pitanja" && (
                <Card className="border-border shadow-sm">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <HelpCircle className="size-4 text-[var(--brand)]" />
                      Pitaj me
                    </CardTitle>
                    <CardDescription>
                      Postavi pitanje na osnovu dostupnih dokumenata.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <form className="space-y-3" onSubmit={onAsk}>
                      <div className="space-y-2">
                        <Label htmlFor="question">Pitanje</Label>
                        <Textarea
                          id="question"
                          value={question}
                          onChange={(event) => setQuestion(event.target.value)}
                          placeholder="Npr. Kada se primenjuje Ustav Republike Srbije?"
                          className="min-h-16"
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={!canAsk}
                        className="h-9 w-full text-white"
                        style={{ backgroundColor: "var(--brand)" }}
                      >
                        {asking ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Obrada pitanja...
                          </>
                        ) : (
                          "Pošalji pitanje"
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}

              {status && activeSection !== "pregled" && (
                <Alert
                  variant={status.type === "error" ? "destructive" : "default"}
                >
                  <Sparkles className="size-4" />
                  <AlertTitle>
                    {status.type === "error" ? "Greška" : "Uspeh"}
                  </AlertTitle>
                  <AlertDescription>{status.text}</AlertDescription>
                </Alert>
              )}

              {activeSection === "pitanja" && result && (
                <Card className="border-border shadow-sm">
                  <CardHeader className="px-4 py-3">
                    <CardTitle>Odgovor</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 px-4 pb-4">
                    <div
                      className="rounded-xl border p-4"
                      style={{
                        borderColor: "var(--brand-border)",
                        backgroundColor: "var(--brand-softer)",
                      }}
                    >
                      <p className="whitespace-pre-wrap leading-7 text-foreground">
                        {result.answer}
                      </p>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Izvori
                      </h3>
                      <div className="grid gap-3">
                        {result.sources.map((source, index) => (
                          <Card
                            key={`${index}-${source.content.slice(0, 20)}`}
                            className="border-border bg-muted/40"
                          >
                            <CardContent className="pt-5">
                              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                                {source.content}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeSection === "analizaUgovora" && contractAnalysis && (
                <Card className="border-border shadow-sm">
                  <CardHeader className="px-4 py-3">
                    <CardTitle>Rezultat analize</CardTitle>
                    <CardDescription>
                      Na osnovu teksta ugovora i pronađenih izvatka iz zakona u
                      bazi.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 px-4 pb-4">
                    <div
                      className="rounded-xl border p-4"
                      style={{
                        borderColor: "var(--brand-border)",
                        backgroundColor: "var(--brand-softer)",
                      }}
                    >
                      <p className="whitespace-pre-wrap leading-7 text-foreground">
                        {contractAnalysis.analysis}
                      </p>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Izvodi iz baze propisa (kontekst)
                      </h3>
                      <Card className="border-border bg-muted/40">
                        <CardContent className="pt-5">
                          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                            {contractAnalysis.lawExcerpts}
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeSection === "generisanjeUgovora" && generateResult && (
                <Card className="border-border shadow-sm">
                  <CardHeader className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>Nacrt ugovora</CardTitle>
                      <CardDescription>
                        Izmeni tekst ručno ili koristi doradu ispod. Preuzmi PDF
                        kada si završio.
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 gap-2"
                      disabled={!canExportContractPdf}
                      onClick={() => void downloadContractPdf()}
                    >
                      {pdfDownloading ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Priprema PDF…
                        </>
                      ) : (
                        <>
                          <Download className="size-4" />
                          Preuzmi kao PDF
                        </>
                      )}
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4 px-4 pb-4">
                    <div className="space-y-2">
                      <Label htmlFor="contract-draft-edit">Tekst nacrta</Label>
                      <Textarea
                        id="contract-draft-edit"
                        value={contractDraftEdit}
                        onChange={(event) =>
                          setContractDraftEdit(event.target.value)
                        }
                        className="min-h-[min(32rem,65vh)] font-serif text-[15px] leading-relaxed text-center"
                        spellCheck={false}
                      />
                    </div>

                    <form className="space-y-3" onSubmit={onRefineContract}>
                      <div className="space-y-2">
                        <Label htmlFor="refine-instruction">
                          Dorada AI — šta da izmenim ili dopunim
                        </Label>
                        <Textarea
                          id="refine-instruction"
                          value={refineInstruction}
                          onChange={(event) =>
                            setRefineInstruction(event.target.value)
                          }
                          placeholder="Npr. Dodaj klauzulu o garanciji… Skrati rok plaćanja na 15 dana…"
                          className="min-h-24"
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={!canRefineDraft}
                        className="h-9 w-full text-white sm:w-auto"
                        style={{ backgroundColor: "var(--brand)" }}
                      >
                        {refining ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Dorada u toku…
                          </>
                        ) : (
                          <>
                            <FilePenLine className="mr-2 size-4" />
                            Primeni doradu (AI)
                          </>
                        )}
                      </Button>
                    </form>

                    {draftDiffLines && (
                      <div className="space-y-2">
                        <Label>Izmene nakon AI dorade</Label>
                        <Card className="border-border bg-muted/20">
                          <CardContent className="max-h-[28rem] space-y-1 overflow-auto px-4 py-4 font-mono text-xs leading-5">
                            {draftDiffLines.map((line, index) => {
                              if (line.type === "added") {
                                return (
                                  <p
                                    key={`diff-${index}`}
                                    className="whitespace-pre-wrap rounded-sm bg-emerald-500/15 px-2 py-0.5 text-emerald-800 dark:text-emerald-300"
                                  >
                                    + {line.text || " "}
                                  </p>
                                );
                              }

                              if (line.type === "removed") {
                                return (
                                  <p
                                    key={`diff-${index}`}
                                    className="whitespace-pre-wrap rounded-sm bg-red-500/15 px-2 py-0.5 text-red-800 dark:text-red-300"
                                  >
                                    - {line.text || " "}
                                  </p>
                                );
                              }

                              return (
                                <p
                                  key={`diff-${index}`}
                                  className="whitespace-pre-wrap px-2 py-0.5 text-muted-foreground"
                                >
                                  {line.text || " "}
                                </p>
                              );
                            })}
                          </CardContent>
                        </Card>
                      </div>
                    )}

                    <Separator />

                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Korišćeni kontekst propisa
                      </h3>
                      <Card className="border-border bg-muted/40">
                        <CardContent className="pt-5">
                          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                            {generateResult.lawExcerpts}
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function LandingPage({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
      </div>

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-14 px-6 pb-16 pt-8 md:px-10">
        <header className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <Image
              src="/logo-tr.png"
              alt="Pravko"
              width={38}
              height={38}
              className="rounded-xl object-contain"
              priority
            />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-indigo-200">
                PRAVKO AI
              </p>
              <p className="text-sm font-semibold text-white">Pravni turbo alat</p>
            </div>
          </div>
          <Button
            type="button"
            onClick={onEnter}
            className="group bg-indigo-500 text-white hover:bg-indigo-400"
          >
            Udji
            <ArrowRight className="ml-2 size-4 transition group-hover:translate-x-1" />
          </Button>
        </header>

        <section className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-indigo-300/30 bg-indigo-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-100">
              <Rocket className="size-3.5" />
              MODERNO. BRZO. NADBUDŽENO.
            </p>
            <h1 className="text-4xl font-black leading-tight text-white md:text-6xl">
              Lawyer app koja izgleda{" "}
              <span className="bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
                brutalno dobro
              </span>{" "}
              i radi još bolje.
            </h1>
            <p className="max-w-2xl text-base text-slate-300 md:text-lg">
              Upload dokumenata, pravna pitanja, analiza i generisanje ugovora u
              jednom workflow-u. Sve na jednom mestu, sa UI-em koji izgleda kao
              premium SaaS.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={onEnter}
                className="h-11 bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-6 text-white hover:from-indigo-400 hover:to-fuchsia-400"
              >
                Udji u aplikaciju
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const section = document.getElementById("kako-radi");
                  section?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="h-11 border-white/30 bg-white/5 px-6 text-slate-100 hover:bg-white/10"
              >
                Pogledaj kako radi
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-4 shadow-2xl shadow-indigo-900/40 backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2">
                <p className="text-xs font-semibold text-slate-300">
                  Dashboard Preview
                </p>
                <p className="text-xs text-emerald-300">LIVE</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  "Q&A nad zakonima",
                  "Analiza ugovora",
                  "AI dorada nacrta",
                  "PDF export jednim klikom",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-white/10 bg-slate-900/70 p-3"
                  >
                    <p className="text-sm text-white">{item}</p>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800">
                      <div className="h-1.5 w-4/5 rounded-full bg-gradient-to-r from-indigo-400 to-cyan-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="kako-radi" className="space-y-4">
          <h2 className="text-2xl font-bold text-white md:text-3xl">
            Kako aplikacija funkcionise
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: WandSparkles,
                title: "1. Ubacis dokumente",
                text: "Otpremis PDF i odmah ulaze u bazu za pretragu i razumevanje konteksta.",
              },
              {
                icon: ShieldCheck,
                title: "2. AI uradi analizu",
                text: "Dobijas pravnu procenu, rizike i relevantne izvode iz propisa.",
              },
              {
                icon: BadgeCheck,
                title: "3. Zavrsis posao brze",
                text: "Generises nacrt ugovora, doradis i skines PDF bez gubljenja vremena.",
              },
            ].map((step) => (
              <article
                key={step.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur"
              >
                <step.icon className="mb-3 size-5 text-indigo-300" />
                <h3 className="mb-2 text-lg font-semibold text-white">{step.title}</h3>
                <p className="text-sm text-slate-300">{step.text}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-4 pt-2 lg:grid-cols-3">
            {[
              {
                title: "Analiza ugovora",
                src: "/landing-analiza-ugovora.svg",
                alt: "Prikaz analize ugovora u aplikaciji",
              },
              {
                title: "AI diff dorada",
                src: "/landing-diff-prikaz.svg",
                alt: "Prikaz izmena nakon AI dorade ugovora",
              },
              {
                title: "Kako radi flow",
                src: "/landing-kako-radi-flow.svg",
                alt: "Prikaz koraka rada aplikacije",
              },
            ].map((preview) => (
              <article
                key={preview.title}
                className="overflow-hidden rounded-2xl border border-white/15 bg-white/5"
              >
                <div className="border-b border-white/10 px-4 py-2">
                  <p className="text-sm font-semibold text-slate-100">{preview.title}</p>
                </div>
                <div className="relative aspect-[16/9]">
                  <Image
                    src={preview.src}
                    alt={preview.alt}
                    fill
                    className="object-cover"
                  />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-indigo-300/20 bg-indigo-400/10 p-5">
            <p className="text-sm font-semibold uppercase tracking-wider text-indigo-200">
              Why people click
            </p>
            <p className="mt-2 text-2xl font-black text-white">
              Brzina, stil i rezultat u jednoj platformi.
            </p>
          </div>
          <div className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/10 p-5">
            <p className="text-sm font-semibold uppercase tracking-wider text-fuchsia-200">
              Finalni korak
            </p>
            <Button
              type="button"
              onClick={onEnter}
              className="mt-2 h-11 bg-white text-slate-950 hover:bg-slate-100"
            >
              Udji i pokreni celu app
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function Home() {
  const [enteredApp, setEnteredApp] = useState(false);

  if (enteredApp) {
    return <DashboardPage initialSection="pitanja" />;
  }

  return <LandingPage onEnter={() => setEnteredApp(true)} />;
}
