"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Moon,
  FileUp,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  Menu,
  MessageCircleQuestion,
  Sun,
  Sparkles,
  Upload,
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
import { useTheme } from "@/lib/theme-context";

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
};

type SectionKey = "pregled" | "dokumenta" | "pitanja" | "otpremanje";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const UPLOAD_PASSWORD = "Petrovaradin1!";
const DEFAULT_PRIMARY = "#16a34a";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace("#", "");
  const int = Number.parseInt(value, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [uploadPassword, setUploadPassword] = useState("");
  const [primaryColor] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_PRIMARY;
    return (
      window.localStorage.getItem("lawyer.primaryColor") ?? DEFAULT_PRIMARY
    );
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("lawyer.sidebarOpen") !== "false";
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey>("pregled");
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

  const uploadUnlocked = useMemo(
    () => uploadPassword === UPLOAD_PASSWORD,
    [uploadPassword],
  );
  const canUpload = useMemo(
    () => Boolean(file) && uploadUnlocked && !uploading,
    [file, uploadUnlocked, uploading],
  );
  const canAsk = useMemo(
    () => question.trim().length > 0 && !asking,
    [question, asking],
  );
  const { r, g, b } = useMemo(() => hexToRgb(primaryColor), [primaryColor]);

  const brandStyles = useMemo(
    () =>
      ({
        "--brand": primaryColor,
        "--brand-strong": `rgba(${r}, ${g}, ${b}, 0.3)`,
        "--brand-soft": `rgba(${r}, ${g}, ${b}, 0.24)`,
        "--brand-softer": `rgba(${r}, ${g}, ${b}, 0.16)`,
        "--brand-border": `rgba(${r}, ${g}, ${b}, 0.55)`,
      }) as React.CSSProperties,
    [primaryColor, r, g, b],
  );

  useEffect(() => {
    window.localStorage.setItem("lawyer.primaryColor", primaryColor);
  }, [primaryColor]);

  useEffect(() => {
    window.localStorage.setItem("lawyer.sidebarOpen", String(sidebarOpen));
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

      const response = await fetch(`${API_URL}/qa-history?${params.toString()}`);
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
      setUploadPassword("");

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
          <div className="mb-4 flex items-center justify-between">
            <div className={sidebarOpen ? "block" : "hidden"}>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                LAWYER SUITE
              </p>
              <h2 className="text-xl font-bold text-foreground">
                Kontrolna tabla
              </h2>
            </div>
            <button
              className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted"
              onClick={() => setSidebarOpen((prev) => !prev)}
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
                key: "pregled" as const,
                icon: LayoutDashboard,
                label: "Pregled",
              },
              {
                key: "dokumenta" as const,
                icon: FolderOpen,
                label: "Dokumenta",
              },
              {
                key: "pitanja" as const,
                icon: MessageCircleQuestion,
                label: "Pitaj me",
              },
              { key: "otpremanje" as const, icon: Upload, label: "Otpremanje" },
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

          <div className="mt-3 rounded-lg border border-border p-2">
            <p
              className={`mb-2 text-xs font-medium text-muted-foreground ${sidebarOpen ? "block" : "hidden"}`}
            >
              Tema
            </p>
            <div className="grid grid-cols-2 gap-1">
              <button
                className={[
                  "flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs transition",
                  theme === "light"
                    ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                    : "bg-muted text-muted-foreground",
                ].join(" ")}
                onClick={() => setTheme("light")}
              >
                <Sun className="size-3.5" />
                {sidebarOpen && "Light"}
              </button>
              <button
                className={[
                  "flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs transition",
                  theme === "dark"
                    ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                    : "bg-muted text-muted-foreground",
                ].join(" ")}
                onClick={() => setTheme("dark")}
              >
                <Moon className="size-3.5" />
                {sidebarOpen && "Dark"}
              </button>
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col bg-background">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                className="rounded-lg border border-border p-2 md:hidden"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu className="size-4" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-foreground md:text-2xl">
                  Lawyer AI Workspace
                </h1>
                <p className="text-sm text-muted-foreground">
                  Upload PDF, postavi pitanje i dobiješ odgovor sa izvorima.
                </p>
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-auto px-4 py-3">
            <div className="flex w-full max-w-4xl flex-col gap-3">
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
                      Pregled svih dokumenata sa mogućnošću osvežavanja liste.
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
                              ID #{doc.id}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {activeSection === "otpremanje" && (
                <Card className="border-border shadow-sm">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <LockKeyhole className="size-4 text-[var(--brand)]" />
                      Otpremanje dokumenta (zaštićeno)
                    </CardTitle>
                    <CardDescription>
                      Unesi šifru pa izaberi PDF fajl za indeksiranje.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <form className="space-y-3" onSubmit={onUpload}>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="upload-password">Šifra</Label>
                          <Input
                            id="upload-password"
                            type="password"
                            value={uploadPassword}
                            onChange={(event) =>
                              setUploadPassword(event.target.value)
                            }
                            placeholder="Unesi šifru"
                          />
                          {!uploadUnlocked && uploadPassword.length > 0 && (
                            <p className="text-xs text-rose-600">
                              Pogrešna šifra.
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="document">PDF fajl</Label>
                          <Input
                            id="document"
                            type="file"
                            accept="application/pdf"
                            onChange={onFileChange}
                            disabled={!uploadUnlocked}
                          />
                        </div>
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
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
